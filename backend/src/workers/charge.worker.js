require('dotenv').config();

const { createWorker } = require('../utils/queue');
const db = require('../db');
const logger = require('../utils/logger');
const gatewayClient = require('../utils/gateway-client');
const metrics = require('../utils/metrics');

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
                logger.info({ paymentId, existingChargeId: payment.gateway_charge_id }, 'charge.worker already processed');
                return;
            }

            logger.debug({ paymentId, amount: payment.amount, currency: payment.currency }, 'charge.worker calling gateway');

            let chargeResult;
            try {
                chargeResult = await gatewayClient.charge({
                    amount: payment.amount,
                    currency: payment.currency,
                    idempotencyKey: payment.idempotency_key
                });
                logger.info({ paymentId, chargeId: chargeResult.id, status: chargeResult.status }, 'charge.worker gateway responded');
            } catch (gatewayErr) {
                logger.error({ paymentId, error: gatewayErr.message }, 'charge.worker gateway failed');
                // Mark payment as failed
                await t.none(
                    `UPDATE payments
                     SET status = 'failed',
                         updated_at = NOW()
                     WHERE id = $1`,
                    [payment.id]
                );
                throw gatewayErr;
            }

            // Update payment with gateway charge ID and status
            await t.none(
                `UPDATE payments
                 SET gateway_charge_id = $2,
                     status = $3,
                     updated_at = NOW()
                 WHERE id = $1`,
                [payment.id, chargeResult.id, chargeResult.status]
            );

            logger.info({
                paymentId,
                gatewayChargeId: chargeResult.id,
                status: chargeResult.status
            }, 'charge.worker job succeeded');
            
            // Record successful processing
            metrics.recordPaymentStatus(chargeResult.status);
        });
        
        // Record successful job completion with processing time
        const processingTime = Date.now() - startTime;
        metrics.recordWorkerJob('charge', true, processingTime);
    } catch (err) {
        logger.error({ paymentId, error: err.message, stack: err.stack }, 'charge.worker job failed');
        metrics.recordWorkerJob('charge', false, Date.now() - startTime);
        throw err;
    }
});

worker.on('error', (err) => {
    logger.error({ err }, 'charge.worker Redis error');
});

module.exports = worker;
