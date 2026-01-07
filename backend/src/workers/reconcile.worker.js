require('dotenv').config();

const { createWorker } = require('../utils/queue');
const db = require('../db');
const logger = require('../utils/logger');
const gatewayClient = require('../utils/gateway-client');
const metrics = require('../utils/metrics');

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
 */
const reconcilePayment = async (payment) => {
    try {
        logger.debug({ paymentId: payment.id, currentStatus: payment.status }, 'reconcile.worker reconciling payment');

        const remote = await gatewayClient.lookup(payment.gateway_charge_id);

        if (!remote || !remote.status) {
            logger.warn({ paymentId: payment.id, chargeId: payment.gateway_charge_id }, 'reconcile.worker missing gateway record');
            return;
        }

        // Skip if status hasn't changed
        if (remote.status === payment.status) {
            logger.debug({ paymentId: payment.id, status: payment.status }, 'reconcile.worker status unchanged');
            return;
        }

        // Validate transition is allowed
        if (!canTransition(payment.status, remote.status)) {
            logger.warn({
                paymentId: payment.id,
                currentStatus: payment.status,
                attemptedStatus: remote.status
            }, 'reconcile.worker invalid status transition blocked');
            return;
        }

        // Skip if both are in final states (edge case)
        if (FINAL_STATUSES.has(payment.status) && FINAL_STATUSES.has(remote.status)) {
            logger.debug({ paymentId: payment.id }, 'reconcile.worker both in final state');
            return;
        }

        // Update payment status
        await db.tx(async t => {
            await t.none(
                `UPDATE payments
                 SET status = $2,
                     updated_at = NOW()
                 WHERE id = $1`,
                [payment.id, remote.status]
            );
        });

        logger.info({
            paymentId: payment.id,
            oldStatus: payment.status,
            newStatus: remote.status
        }, 'reconcile.worker updated status');
        
        // Record the reconciliation update
        metrics.recordReconciliationUpdate();
        metrics.recordPaymentStatus(remote.status);
    } catch (err) {
        logger.error({
            paymentId: payment.id,
            error: err.message,
            stack: err.stack
        }, 'reconcile.worker payment reconciliation failed');
        // Don't throw - continue with other payments
    }
};

const worker = createWorker('payment_reconcile', async (job) => {
    const startTime = Date.now();
    logger.info({ jobId: job?.id }, 'reconcile.worker job started');

    try {
        const candidates = await fetchNonFinalPayments();

        if (!candidates.length) {
            logger.info('reconcile.worker no candidates for reconciliation');
            metrics.recordWorkerJob('reconcile', true, Date.now() - startTime);
            return;
        }

        logger.info({ count: candidates.length }, 'reconcile.worker found candidates');

        // Process each payment
        for (const payment of candidates) {
            await reconcilePayment(payment);
        }

        logger.info({ processed: candidates.length }, 'reconcile.worker job completed');
        metrics.recordWorkerJob('reconcile', true, Date.now() - startTime);
    } catch (err) {
        logger.error({ error: err.message, stack: err.stack, jobId: job?.id }, 'reconcile.worker job failed');
        metrics.recordWorkerJob('reconcile', false, Date.now() - startTime);
        throw err;
    }
});

worker.on('error', (err) => {
    logger.error({ err }, 'reconcile.worker.redisError');
});

module.exports = worker;