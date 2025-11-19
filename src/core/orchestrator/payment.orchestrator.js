const db = require('../../db');
const gatewayClient = require('../../utils/gateway-client');
const queue = require('../../utils/queue');

const ALLOWED_TRANSITIONS = {
    processing: new Set(['authorized', 'failed']),
    authorized: new Set(['captured', 'failed']),
    captured: new Set(['succeeded', 'failed']),
    succeeded: new Set(['refunded']),
    failed: new Set(['refunded']),
    refunded: new Set()
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

const chargeGateway = typeof gatewayClient.charge === 'function'
    ? gatewayClient.charge.bind(gatewayClient)
    : gatewayClient.createCharge.bind(gatewayClient);

const enqueueOutboxEvent = async (payload) => {
    if (queue && typeof queue.enqueue === 'function') {
        await queue.enqueue('outbox', payload);
        return;
    }
    // TODO: enqueue payload into outbox once queue.enqueue helper exists.
};

const canTransition = (current, next) => {
    if (next === 'refunded') {
        return current !== 'refunded';
    }
    const allowed = ALLOWED_TRANSITIONS[current] || new Set();
    return allowed.has(next);
};

const initiateCharge = async (payment) => {
    if (!payment || !payment.id || !payment.idempotency_key) {
        throw new Error('payment.id and payment.idempotency_key are required');
    }

    const updated = await db.tx(async t => {
        const locked = await t.oneOrNone(
            'SELECT * FROM payments WHERE id = $1 FOR UPDATE SKIP LOCKED',
            [payment.id]
        );

        if (!locked) {
            throw new NotFoundError(`Payment ${payment.id} not found`);
        }

        if (locked.gateway_charge_id) {
            return locked;
        }

        const gatewayResult = await chargeGateway({
            amount: locked.amount,
            currency: locked.currency,
            idempotencyKey: locked.idempotency_key
        });

        if (!gatewayResult || !gatewayResult.status) {
            throw new Error('Gateway result missing status');
        }

        if (!canTransition(locked.status, gatewayResult.status)) {
            throw new InvalidTransitionError(`${locked.status} -> ${gatewayResult.status}`);
        }

        return t.one(
            `UPDATE payments
             SET gateway_charge_id = $2,
                 status = $3,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [locked.id, gatewayResult.id || locked.gateway_charge_id, gatewayResult.status]
        );
    });

    await enqueueOutboxEvent({
        type: 'payment.status.changed',
        paymentId: updated.id,
        status: updated.status,
        gatewayChargeId: updated.gateway_charge_id
    });

    return updated;
};

const applyGatewayResult = async (paymentId, gatewayResult) => {
    if (!paymentId || !gatewayResult || !gatewayResult.status) {
        throw new Error('paymentId and gatewayResult.status are required');
    }

    return db.tx(async t => {
        const current = await t.oneOrNone('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);

        if (!current) {
            throw new NotFoundError(`Payment ${paymentId} not found`);
        }

        if (
            current.status === gatewayResult.status &&
            (!gatewayResult.id || current.gateway_charge_id === gatewayResult.id)
        ) {
            return current;
        }

        const transitioned = await transitionStatus(paymentId, gatewayResult.status, {
            transaction: t,
            currentRow: current
        });

        return t.one(
            `UPDATE payments
             SET gateway_charge_id = COALESCE($2, gateway_charge_id),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [paymentId, gatewayResult.id || transitioned.gateway_charge_id]
        );
    });
};

const transitionStatus = async (paymentId, newStatus, opts = {}) => {
    if (!paymentId || !newStatus) {
        throw new Error('paymentId and newStatus are required');
    }

    const run = async (t) => {
        const current = opts.currentRow || await t.oneOrNone('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);

        if (!current) {
            throw new NotFoundError(`Payment ${paymentId} not found`);
        }

        if (current.status === newStatus) {
            return current;
        }

        if (!canTransition(current.status, newStatus)) {
            throw new InvalidTransitionError(`${current.status} -> ${newStatus}`);
        }

        return t.one(
            `UPDATE payments
             SET status = $2,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [paymentId, newStatus]
        );
    };

    if (opts.transaction) {
        return run(opts.transaction);
    }

    return db.tx(run);
};

module.exports = {
    initiateCharge,
    applyGatewayResult,
    transitionStatus,
    InvalidTransitionError,
    NotFoundError
};