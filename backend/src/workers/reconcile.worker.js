require('dotenv').config();

const { createWorker } = require('../utils/queue');
const db = require('../db');
const logger = require('../utils/logger');
const gatewayClient = require('../utils/gateway-client');
const metrics = require('../utils/metrics');
const statusTransition = require('../core/status-transition/status-transition.service');

/**
 * Sleep helper for demo purposes
 * Adds artificial delay to show status transitions in action
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_WINDOW_MINUTES = 30;
const FINAL_STATUSES = new Set(['succeeded', 'failed', 'refunded']);

/**
 * Valid status transitions
 * Prevents invalid state changes
 */
const VALID_TRANSITIONS = {
    'processing': ['succeeded', 'failed', 'processing'],
    'succeeded': ['refunded'],
    'failed': ['refunded'],
    'refunded': []
};

const canTransition = (currentStatus, newStatus) => {
    if (currentStatus === newStatus) return false; // No change needed
    const allowed = VALID_TRANSITIONS[currentStatus];
    return allowed && allowed.includes(newStatus);
};

/**
 * Fetch payments that are not in a final status and have a gateway charge ID
 * These are candidates for reconciliation
 */
const fetchNonFinalPayments = () => {
    return db.any(
        `SELECT id, status, gateway_charge_id, updated_at
         FROM payments
         WHERE status NOT IN ('succeeded', 'failed', 'refunded')
           AND gateway_charge_id IS NOT NULL
           AND updated_at >= NOW() - ($1 || ' minutes')::interval
         ORDER BY updated_at ASC`,
        [DEFAULT_WINDOW_MINUTES]
    );
};

/**
 * Reconcile a single payment by checking its status with the gateway
 * This catches payments that got stuck in 'processing' state
 */
const reconcilePayment = async (payment, jobId = null) => {
    try {
        logger.debug({ 
            paymentId: payment.id, 
            currentStatus: payment.status,
            gatewayChargeId: payment.gateway_charge_id
        }, '🔍 reconcile.worker: checking payment');

        // Query the gateway for the latest status
        const remote = await gatewayClient.lookup(payment.gateway_charge_id);

        if (!remote || !remote.status) {
            logger.warn({ 
                paymentId: payment.id, 
                chargeId: payment.gateway_charge_id 
            }, '⚠️ reconcile.worker: gateway returned no status');
            return;
        }

        logger.debug({
            paymentId: payment.id,
            localStatus: payment.status,
            gatewayStatus: remote.status
        }, 'reconcile.worker: gateway status retrieved');

        // Skip if status hasn't changed
        if (remote.status === payment.status) {
            logger.debug({ 
                paymentId: payment.id, 
                status: payment.status 
            }, 'reconcile.worker: status unchanged, skipping');
            return;
        }

        // Validate transition is allowed
        if (!canTransition(payment.status, remote.status)) {
            logger.warn({
                paymentId: payment.id,
                currentStatus: payment.status,
                attemptedStatus: remote.status
            }, '⚠️ reconcile.worker: invalid transition blocked');
            return;
        }

        // Skip if both are in final states (edge case)
        if (FINAL_STATUSES.has(payment.status) && FINAL_STATUSES.has(remote.status)) {
            logger.debug({ 
                paymentId: payment.id,
                currentStatus: payment.status,
                newStatus: remote.status
            }, 'reconcile.worker: both statuses are final, skipping');
            return;
        }

        // Use statusTransition service to update (writes to audit log)
        try {
            // DEMO: Add 30-second delay when transitioning from processing to final status
            if (payment.status === 'processing' && (remote.status === 'succeeded' || remote.status === 'failed')) {
                logger.info({ 
                    paymentId: payment.id, 
                    currentStatus: payment.status,
                    newStatus: remote.status 
                }, '⏳ Waiting 30 seconds before final transition (demo mode)');
                await sleep(30000);
                logger.info({ paymentId: payment.id, newStatus: remote.status }, '✓ Delay complete, proceeding with reconciliation');
            }
            
            await statusTransition.transitionStatus(payment.id, remote.status, {
                worker: 'reconcile.worker',
                jobId: jobId,
                chargeId: payment.gateway_charge_id,
                reason: `Reconciliation: gateway status is ${remote.status}`,
                previousStatus: payment.status
            });
            
            logger.info({
                paymentId: payment.id,
                oldStatus: payment.status,
                newStatus: remote.status,
                auditLogWritten: true
            }, '✅ reconcile.worker: status updated via gateway lookup');
            
            metrics.recordReconciliationUpdate();
            metrics.recordPaymentStatus(remote.status);
        } catch (transitionErr) {
            logger.error({
                paymentId: payment.id,
                error: transitionErr.message,
                stack: transitionErr.stack
            }, '❌ reconcile.worker: status transition failed');
            throw transitionErr;
        }
    } catch (err) {
        logger.error({
            paymentId: payment.id,
            error: err.message,
            stack: err.stack
        }, '❌ reconcile.worker: payment reconciliation failed');
        // Don't throw - continue with other payments
    }
};

const worker = createWorker('payment_reconcile', async (job) => {
    const startTime = Date.now();
    const jobId = job?.id || 'manual';
    logger.info({ jobId }, '🔄 reconcile.worker: job started');

    try {
        const candidates = await fetchNonFinalPayments();

        if (!candidates.length) {
            logger.info('reconcile.worker: no stuck payments found');
            metrics.recordWorkerJob('reconcile', true, Date.now() - startTime);
            return;
        }

        logger.info({ 
            count: candidates.length,
            statuses: candidates.map(p => p.status)
        }, '🔍 reconcile.worker: found stuck payments');

        // Process each payment
        let successCount = 0;
        for (const payment of candidates) {
            await reconcilePayment(payment, jobId);
            successCount++;
        }

        logger.info({ 
            processed: successCount,
            total: candidates.length 
        }, '✅ reconcile.worker: job completed');
        metrics.recordWorkerJob('reconcile', true, Date.now() - startTime);
    } catch (err) {
        logger.error({ 
            error: err.message, 
            stack: err.stack, 
            jobId 
        }, '❌ reconcile.worker: job failed');
        metrics.recordWorkerJob('reconcile', false, Date.now() - startTime);
        throw err;
    }
});

worker.on('error', (err) => {
    logger.error({ err }, 'reconcile.worker.redisError');
});

module.exports = worker;