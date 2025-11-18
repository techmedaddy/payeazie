const db = require('../../db');
const gatewayClient = require('../../utils/gateway-client');
const PaymentModel = require('../../db/models/payment.model');

const ALLOWED_TRANSITIONS = {
    'processing': ['authorized', 'failed'],
    'authorized': ['captured'],
    'captured': ['succeeded'],
    'succeeded': ['refunded'],
    'failed': [],
    'refunded': []
};

const validateTransition = (currentStatus, newStatus) => {
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
        throw new Error(`Illegal state transition: ${currentStatus} -> ${newStatus}`);
    }
};

const createProcessingRecord = async (paymentId) => {
    return db.one(PaymentModel.selectById, [paymentId]);
};

const executeCharge = async (payment) => {
    if (payment.gateway_charge_id) {
        return payment;
    }

    const gatewayResult = await gatewayClient.charge(payment);
    
    // Determine status based on gateway success
    const newStatus = gatewayResult.success ? 'authorized' : 'failed';

    return applyGatewayResult(payment.id, {
        id: gatewayResult.id,
        status: newStatus
    });
};

const applyGatewayResult = async (paymentId, gatewayResult) => {
    return db.tx(async t => {
        const payment = await t.one(PaymentModel.selectById, [paymentId]);
        
        validateTransition(payment.status, gatewayResult.status);

        return t.one(PaymentModel.updateGatewayFields, {
            id: paymentId,
            gateway_charge_id: gatewayResult.id,
            status: gatewayResult.status
        });
    });
};

const applyWebhookUpdate = async (gatewayChargeId, newStatus) => {
    return db.tx(async t => {
        const payment = await t.oneOrNone('SELECT * FROM payments WHERE gateway_charge_id = $1', [gatewayChargeId]);
        
        if (!payment) {
            return null; // Ignore if not found
        }

        // Idempotency check for webhooks: ignore if same status
        if (payment.status === newStatus) {
            return payment;
        }

        // Ignore if status is "older" (simplistic check via transition validity)
        // If the transition is not allowed, we assume it's an out-of-order or redundant event
        try {
            validateTransition(payment.status, newStatus);
        } catch (e) {
            // If transition is illegal, we ignore the webhook update rather than throwing
            // to prevent webhook retry loops for stale events
            return payment;
        }

        return t.one(PaymentModel.updateStatus, {
            id: payment.id,
            status: newStatus
        });
    });
};

module.exports = {
    createProcessingRecord,
    executeCharge,
    applyGatewayResult,
    applyWebhookUpdate
};