require('dotenv').config();

const { createWorker } = require('../utils/queue');
const db = require('../db');
const logger = require('../utils/logger');
const gatewayClient = require('../utils/gateway-client');

if (!process.env.REDIS_URL) {
    logger.error('charge.worker missing REDIS_URL');
    process.exit(1);
}

const worker = createWorker('payment_charge', async (job) => {
    const { paymentId } = job.data || {};

    if (!paymentId) {
        logger.error({ jobId: job.id }, 'charge.worker missing paymentId');
        return;
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
                return;
            }

            if (payment.gateway_charge_id) {
                logger.info({ paymentId }, 'charge.worker already processed');
                return;
            }

            const chargeResult = await gatewayClient.charge({
                amount: payment.amount,
                currency: payment.currency,
                idempotencyKey: payment.idempotency_key
            });

            await t.none(
                `UPDATE payments
                 SET gateway_charge_id = $2,
                     status = $3,
                     updated_at = NOW()
                 WHERE id = $1`,
                [payment.id, chargeResult.id, chargeResult.status]
            );

            logger.info({ paymentId, gatewayChargeId: chargeResult.id, status: chargeResult.status }, 'charge.worker job succeeded');
        });
    } catch (err) {
        logger.error({ paymentId, err }, 'charge.worker job failed');
        throw err;
    }
});

worker.on('error', (err) => {
    logger.error({ err }, 'charge.worker Redis error');
});

module.exports = worker;