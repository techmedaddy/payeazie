require('dotenv').config();

const idempotencyService = require('../../core/idempotency/idempotency.service');
const paymentOrchestrator = require('../../core/orchestrator/payment.orchestrator');

const sendResponse = (reply, statusCode, payload) => reply.code(statusCode).send(payload);

const validateIntentFields = ({ orderId, amount, currency, idempotencyKey }) => {
    const missing = [];
    if (!orderId) missing.push('orderId');
    if (amount === undefined || amount === null) missing.push('amount');
    if (!currency) missing.push('currency');
    if (!idempotencyKey) missing.push('Idempotency-Key');
    return missing;
};

const createPaymentIntent = async (req, reply) => {
    const { orderId, amount, currency } = req.body || {};
    const idempotencyKey = req.headers['idempotency-key'];
    const missing = validateIntentFields({ orderId, amount, currency, idempotencyKey });

    if (missing.length) {
        return sendResponse(reply, 400, { error: `Missing required fields: ${missing.join(', ')}` });
    }

    try {
        const record = await idempotencyService.resolve(orderId, idempotencyKey, amount, currency);
        const statusCode = record.status === 'processing' ? 202 : 200;
        return sendResponse(reply, statusCode, record);
    } catch (err) {
        return sendResponse(reply, 500, { error: 'Unable to create payment intent' });
    }
};

const getPaymentStatus = async (req, reply) => {
    const { paymentId } = req.params || {};

    if (!paymentId) {
        return sendResponse(reply, 400, { error: 'paymentId is required' });
    }

    try {
        const payment = await paymentOrchestrator.fetchStatus(paymentId);
        if (!payment) {
            return sendResponse(reply, 404, { error: 'Payment not found' });
        }
        return sendResponse(reply, 200, payment);
    } catch (err) {
        return sendResponse(reply, 500, { error: 'Unable to fetch payment status' });
    }
};

module.exports = {
    createPaymentIntent,
    getPaymentStatus
};