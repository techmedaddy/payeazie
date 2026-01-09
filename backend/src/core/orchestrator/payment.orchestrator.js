const db = require('../../db');
const logger = require('../../utils/logger');
const statusTransitionService = require('../status-transition/status-transition.service');

const ALLOWED_TRANSITIONS = {
    pending: new Set(['processing', 'failed']),
    processing: new Set(['succeeded', 'failed']),
    succeeded: new Set([]),
    failed: new Set([])
};

class InvalidTransitionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidTransitionError';
    }
}

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
    }
}

const canTransition = (current, next) => {
    if (!current || !next) {
        return false;
    }
    if (current === next) {
        return true;
    }
    const allowed = ALLOWED_TRANSITIONS[current];
    return allowed ? allowed.has(next) : false;
};

const fetchPaymentForUpdate = (t, paymentId) =>
    t.oneOrNone('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);

const applyStatus = async (paymentId, status, metadata = {}, userId = null, triggeredBy = 'system') => {
    if (!paymentId) {
        throw new Error('paymentId is required');
    }
    if (!status) {
        throw new Error('status is required');
    }

    // Delegate to status transition service which handles audit logs and events
    return statusTransitionService.transitionStatus(paymentId, status, metadata, userId, triggeredBy);
};

const attachGatewayCharge = async (paymentId, chargeId, status) => {
    if (!paymentId) {
        throw new Error('paymentId is required');
    }
    if (!chargeId) {
        throw new Error('chargeId is required');
    }

    return db.tx(async (t) => {
        const current = await fetchPaymentForUpdate(t, paymentId);

        if (!current) {
            throw new NotFoundError(`Payment ${paymentId} not found`);
        }

        if (status && !canTransition(current.status, status)) {
            throw new InvalidTransitionError(`${current.status} -> ${status}`);
        }

        const nextStatus = status && status !== current.status ? status : current.status;

        return t.one(
            `UPDATE payments
             SET gateway_charge_id = $2,
                 status = $3,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [paymentId, chargeId, nextStatus]
        );
    });
};

const fetchStatus = async (paymentId) => {
    if (!paymentId) {
        throw new Error('paymentId is required');
    }
    logger.debug({ paymentId }, 'orchestrator.fetchStatus: querying database');
    const payment = await db.oneOrNone('SELECT * FROM payments WHERE id = $1', [paymentId]);
    logger.debug({ paymentId, found: !!payment }, 'orchestrator.fetchStatus: result');
    return payment;
};

const transitionStatus = (paymentId, newStatus, metadata = {}, userId = null, triggeredBy = 'user') => 
    applyStatus(paymentId, newStatus, metadata, userId, triggeredBy);

const applyGatewayResult = (paymentId, gatewayResult = {}) => {
    if (!gatewayResult.status && !gatewayResult.id) {
        throw new Error('gatewayResult requires status or id');
    }
    if (gatewayResult.id) {
        return attachGatewayCharge(paymentId, gatewayResult.id, gatewayResult.status);
    }
    return applyStatus(paymentId, gatewayResult.status);
};

module.exports = {
    applyStatus,
    attachGatewayCharge,
    fetchStatus,
    transitionStatus,
    applyGatewayResult,
    InvalidTransitionError,
    NotFoundError
};