require('dotenv').config();

const idempotencyService = require('../../core/idempotency/idempotency.service');
const paymentOrchestrator = require('../../core/orchestrator/payment.orchestrator');
const metrics = require('../../utils/metrics');

const sendResponse = (reply, statusCode, payload) => reply.code(statusCode).send(payload);

const transformPaymentResponse = (payment) => {
    if (!payment) return payment;
    return {
        id: payment.id,
        orderId: payment.order_id,
        idempotencyKey: payment.idempotency_key,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        gatewayChargeId: payment.gateway_charge_id,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at
    };
};

const validateIntentFields = ({ orderId, amount, currency, idempotencyKey }) => {
    const missing = [];
    if (!orderId) missing.push('orderId');
    if (amount === undefined || amount === null) missing.push('amount');
    if (!currency) missing.push('currency');
    if (!idempotencyKey) missing.push('Idempotency-Key');
    return missing;
};

const createPaymentIntent = async (req, reply) => {
    // Log incoming request details
    const logger = require('../../utils/logger');
    logger.info({
        body: req.body,
        headers: {
            'idempotency-key': req.headers['idempotency-key'],
            'content-type': req.headers['content-type']
        }
    }, 'createPaymentIntent: incoming request');

    const { orderId, amount, currency } = req.body || {};
    const idempotencyKey = req.headers['idempotency-key'];
    
    logger.debug({
        orderId,
        amount,
        currency,
        idempotencyKey,
        amountType: typeof amount
    }, 'createPaymentIntent: extracted fields');

    const missing = validateIntentFields({ orderId, amount, currency, idempotencyKey });

    if (missing.length) {
        logger.warn({ missing }, 'createPaymentIntent: missing fields');
        return sendResponse(reply, 400, { error: `Missing required fields: ${missing.join(', ')}` });
    }

    try {
        logger.debug({ orderId, idempotencyKey }, 'createPaymentIntent: calling idempotency.resolve');
        const record = await idempotencyService.resolve(orderId, idempotencyKey, amount, currency);
        
        // Record metrics
        metrics.recordPaymentCreated();
        metrics.recordPaymentStatus(record.status);
        
        logger.info({ paymentId: record.id, status: record.status }, 'createPaymentIntent: success');
        const statusCode = record.status === 'processing' ? 202 : 200;
        const response = transformPaymentResponse(record);
        return sendResponse(reply, statusCode, response);
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            name: err.name,
            statusCode: err.statusCode,
            orderId,
            idempotencyKey
        }, 'createPaymentIntent: error caught');
        
        // Return specific error for idempotency conflicts
        if (err.name === 'IdempotencyConflictError') {
            return sendResponse(reply, 409, { error: err.message });
        }
        
        return sendResponse(reply, 500, { error: 'Unable to create payment intent', details: err.message });
    }
};

const getPaymentStatus = async (req, reply) => {
    const logger = require('../../utils/logger');
    const { paymentId } = req.params || {};

    logger.info({ paymentId }, 'getPaymentStatus: incoming request');

    if (!paymentId) {
        logger.warn('getPaymentStatus: missing paymentId');
        return sendResponse(reply, 400, { error: 'paymentId is required' });
    }

    try {
        logger.debug({ paymentId }, 'getPaymentStatus: calling orchestrator.fetchStatus');
        const payment = await paymentOrchestrator.fetchStatus(paymentId);
        
        if (!payment) {
            logger.warn({ paymentId }, 'getPaymentStatus: payment not found');
            return sendResponse(reply, 404, { error: 'Payment not found' });
        }
        
        logger.info({ paymentId, status: payment.status }, 'getPaymentStatus: success');
        const response = transformPaymentResponse(payment);
        return sendResponse(reply, 200, response);
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            paymentId
        }, 'getPaymentStatus: error caught');
        return sendResponse(reply, 500, { error: 'Unable to fetch payment status' });
    }
};

const getPaymentAuditLog = async (req, reply) => {
    const logger = require('../../utils/logger');
    const statusTransition = require('../../core/status-transition/status-transition.service');
    const { paymentId } = req.params || {};

    logger.info({ paymentId }, 'getPaymentAuditLog: incoming request');

    if (!paymentId) {
        logger.warn('getPaymentAuditLog: missing paymentId');
        return sendResponse(reply, 400, { error: 'paymentId is required' });
    }

    try {
        const auditLog = await statusTransition.getAuditLog(paymentId);
        logger.info({ paymentId, count: auditLog.length }, 'getPaymentAuditLog: success');
        return sendResponse(reply, 200, { paymentId, auditLog });
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            paymentId
        }, 'getPaymentAuditLog: error caught');
        return sendResponse(reply, 500, { error: 'Unable to fetch audit log' });
    }
};

module.exports = {
    createPaymentIntent,
    getPaymentStatus,
    getPaymentAuditLog
};