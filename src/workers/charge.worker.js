const { createWorker } = require('../utils/queue');
const db = require('../db');
const logger = require('../utils/logger');
const gatewayClient = require('../utils/gateway-client');

const worker = createWorker('payment-charge', async (job) => {
    const { paymentId } = job.data;

    try {
        await db.tx(async t => {
            const payment = await t.oneOrNone(
                'SELECT * FROM payments WHERE id = $1 FOR UPDATE SKIP LOCKED',
                [paymentId]
            );

            if (!payment) {
                logger.error({ paymentId }, 'Payment record not found');
                return;
            }

            if (payment.gateway_charge_id) {
                logger.info({ paymentId }, 'Payment already charged, skipping');
                return;
            }

            const result = await gatewayClient.createCharge({
                amount: payment.amount,
                currency: payment.currency,
                idempotencyKey: payment.idempotency_key
            });

            await t.none(
                'UPDATE payments SET gateway_charge_id = $1, status = $2, updated_at = NOW() WHERE id = $3',
                [result.id, result.status, paymentId]
            );

            logger.info({ 
                paymentId, 
                gatewayChargeId: result.id, 
                status: result.status 
            }, 'Charge executed successfully');
        });
    } catch (err) {
        logger.error({ err, paymentId }, 'Charge execution failed');
        throw err;
    }
});

module.exports = worker;