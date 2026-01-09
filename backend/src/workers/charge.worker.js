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

if (!process.env.REDIS_URL) {
    logger.error('charge.worker missing REDIS_URL');
    process.exit(1);
}

const worker = createWorker('payment_charge', async (job) => {
    const startTime = Date.now();
    const { paymentId } = job.data || {};

    if (!paymentId) {
        logger.error({ jobId: job.id }, 'charge.worker missing paymentId');
        metrics.recordWorkerJob('charge', false);
        throw new Error('paymentId is required');
    }

    logger.info({ jobId: job.id, paymentId }, 'charge.worker job started');

    try {
        // Step 1: Transition from 'pending' to 'processing' when worker starts
        await statusTransition.transitionStatus(paymentId, 'processing', {
            worker: 'charge.worker',
            jobId: job.id,
            reason: 'Worker acquired job lock'
        }, null, 'worker');
        logger.info({ paymentId }, 'charge.worker: transitioned to processing');

        // Declare chargeResult outside transaction so it's accessible later
        let chargeResult = null;

        await db.tx(async (t) => {
            const payment = await t.oneOrNone(
                'SELECT * FROM payments WHERE id = $1 FOR UPDATE SKIP LOCKED',
                [paymentId]
            );

            if (!payment) {
                logger.warn({ paymentId }, 'charge.worker payment not found');
                throw new Error('Payment not found');
            }

            if (payment.gateway_charge_id) {
                logger.info({ paymentId, existingChargeId: payment.gateway_charge_id }, 'charge.worker already processed - skipping');
                // Mark chargeResult so we can skip final transition
                chargeResult = { alreadyProcessed: true };
                return;
            }

            logger.debug({ paymentId, amount: payment.amount, currency: payment.currency }, 'charge.worker calling gateway');

            try {
                chargeResult = await gatewayClient.charge({
                    amount: payment.amount,
                    currency: payment.currency,
                    idempotencyKey: payment.idempotency_key
                });
                
                // Log detailed gateway response for debugging
                logger.info({ 
                    paymentId, 
                    chargeId: chargeResult?.id, 
                    gatewayStatus: chargeResult?.status,
                    hasId: !!chargeResult?.id,
                    hasStatus: !!chargeResult?.status,
                    responseType: typeof chargeResult,
                    fullResponse: JSON.stringify(chargeResult)
                }, '✅ charge.worker: gateway responded');
                
                // Validate response structure
                if (!chargeResult || typeof chargeResult !== 'object') {
                    throw new Error('Gateway returned invalid response (not an object)');
                }
                if (!chargeResult.id) {
                    throw new Error('Gateway response missing charge ID');
                }
                if (!chargeResult.status) {
                    logger.warn({ paymentId, chargeResult }, '⚠️ Gateway response missing status, defaulting to failed');
                    chargeResult.status = 'failed';
                }
            } catch (gatewayErr) {
                logger.error({ paymentId, error: gatewayErr.message }, 'charge.worker gateway failed');

                if (gatewayErr.chargeId) {
                    await t.none(
                        `UPDATE payments
                         SET gateway_charge_id = $2,
                             updated_at = NOW()
                         WHERE id = $1`,
                        [payment.id, gatewayErr.chargeId]
                    );
                }

                throw gatewayErr;
            }

            // Update payment with gateway charge ID
            await t.none(
                `UPDATE payments
                 SET gateway_charge_id = $2,
                     updated_at = NOW()
                 WHERE id = $1`,
                [payment.id, chargeResult.id]
            );
        });

        // Step 2: Transition to the actual gateway status
        // Skip if already processed (idempotency check returned early)
        if (chargeResult?.alreadyProcessed) {
            logger.info({ paymentId }, 'charge.worker: skipping final transition (already processed)');
            metrics.recordWorkerJob('charge', true);
            return;
        }
        
        // Ensure we have a valid chargeResult with status
        if (!chargeResult) {
            logger.error({ paymentId }, '❌ charge.worker: chargeResult is null/undefined - this should not happen');
            throw new Error('chargeResult is missing after gateway call');
        }
        
        // Extract status with explicit fallback to 'failed'
        let finalStatus = chargeResult.status;
        if (!finalStatus || (finalStatus !== 'succeeded' && finalStatus !== 'failed')) {
            logger.warn({ 
                paymentId, 
                receivedStatus: chargeResult.status,
                chargeId: chargeResult.id
            }, '⚠️ Invalid/missing status from gateway, defaulting to failed');
            finalStatus = 'failed';
        }
        
        logger.info({ 
            paymentId, 
            chargeId: chargeResult.id,
            gatewayStatus: chargeResult.status,
            finalStatus,
            willTransitionTo: finalStatus
        }, '🔄 charge.worker: using gateway status for final transition');

        // DEMO: Add 30-second delay to showcase status transitions
        logger.info({ paymentId, finalStatus }, '⏳ Waiting 30 seconds before final transition (demo mode)');
        await sleep(30000);
        logger.info({ paymentId, finalStatus }, '✓ Delay complete, proceeding with final transition');

        try {
            await statusTransition.transitionStatus(paymentId, finalStatus, {
                worker: 'charge.worker',
                jobId: job.id,
                chargeId: chargeResult?.id,
                reason: `Gateway charge completed with status: ${finalStatus}`
            }, null, 'worker');
            logger.info({ 
                paymentId, 
                finalStatus,
                chargeId: chargeResult.id,
                auditLogWritten: true
            }, `✅ charge.worker: transitioned to ${finalStatus}`);
            metrics.recordPaymentStatus(finalStatus);
        } catch (transitionErr) {
            logger.error({ 
                paymentId, 
                finalStatus, 
                error: transitionErr.message, 
                stack: transitionErr.stack,
                errorCode: transitionErr.code,
                chargeId: chargeResult?.id
            }, '❌ charge.worker: CRITICAL - failed to transition to final status');
            
            // Check if it's an audit log table issue
            if (transitionErr.message?.includes('payment_audit_log')) {
                logger.error({ paymentId }, '❌ payment_audit_log table missing or inaccessible');
            }
            
            throw transitionErr;
        }

        const processingTime = Date.now() - startTime;
        metrics.recordWorkerJob('charge', true, processingTime);
    } catch (err) {
        logger.error({ paymentId, error: err.message, stack: err.stack }, '❌ charge.worker job failed');

        try {
            await statusTransition.transitionStatus(paymentId, 'failed', {
                worker: 'charge.worker',
                jobId: job.id,
                reason: 'Gateway charge failed',
                error: err.message
            }, null, 'worker');
            logger.info({ paymentId, auditLogWritten: true }, '✅ charge.worker: transitioned to failed (error handler)');
            metrics.recordPaymentStatus('failed');
        } catch (transitionErr) {
            logger.error({ 
                paymentId, 
                error: transitionErr.message,
                originalError: err.message
            }, '❌ charge.worker: failed to transition to failed status');
        }

        metrics.recordWorkerJob('charge', false, Date.now() - startTime);
        throw err;
    }
});

worker.on('error', (err) => {
    logger.error({ err }, 'charge.worker Redis error');
});

module.exports = worker;
