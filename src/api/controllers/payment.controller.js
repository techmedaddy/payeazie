const idempotencyService = require('../../core/idempotency/idempotency.service');
const paymentOrchestrator = require('../../core/orchestrator/payment.orchestrator');

const formatIntentResponse = (payment) => ({
    id: payment.id,
    orderId: payment.order_id ?? payment.orderId,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency
});

const formatStatusResponse = (payment) => ({
    id: payment.id,
    status: payment.status,
    gatewayChargeId: payment.gateway_charge_id ?? payment.gatewayChargeId,
    updatedAt: payment.updated_at ?? payment.updatedAt
});

const createPaymentIntent = async (req, reply) => {
    const logger = req.log;
    const idempotencyKey = req.headers['idempotency-key'];
    const { orderId, amount, currency } = req.body || {};

    if (!idempotencyKey) {
        logger.warn('Missing Idempotency-Key header');
        return reply.code(400).send({ error: 'Idempotency-Key header is required' });
    }

    if (!orderId || amount === undefined || amount === null || !currency) {
        logger.warn({ orderId, amount, currency }, 'Missing required fields for createPaymentIntent');
        return reply.code(400).send({ error: 'orderId, amount, and currency are required' });
    }

    try {
        const payment = await idempotencyService.resolve(orderId, idempotencyKey, amount, currency);
        return reply.code(200).send(formatIntentResponse(payment));
    } catch (err) {
        logger.error({ err }, 'createPaymentIntent failed');
        return reply.code(500).send({ error: 'Unable to create payment intent' });
    }
};

const getPaymentStatus = async (req, reply) => {
    const logger = req.log;
    const { paymentId } = req.params || {};

    if (!paymentId) {
        logger.warn('Missing paymentId param');
        return reply.code(400).send({ error: 'paymentId is required' });
    }

    try {
        const payment = await paymentOrchestrator.fetchStatus(paymentId);

        if (!payment) {
            return reply.code(404).send({ error: 'Payment not found' });
        }

        return reply.code(200).send(formatStatusResponse(payment));
    } catch (err) {
        logger.error({ err, paymentId }, 'getPaymentStatus failed');
        return reply.code(500).send({ error: 'Unable to fetch payment status' });
    }
};

module.exports = {
    createPaymentIntent,
    getPaymentStatus
};