const db = require('../../db');
const logger = require('../../utils/logger');
const { queueClient } = require('../../utils/queue');

const UPSERT_PAYMENT_INTENT = `
    WITH existing AS (
        SELECT *, false AS created
        FROM payments
        WHERE order_id = $1 AND idempotency_key = $2
    ),
    inserted AS (
        INSERT INTO payments (order_id, idempotency_key, amount, currency)
        SELECT $1, $2, $3, $4
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING *, true AS created
    )
    SELECT * FROM inserted
    UNION ALL
    SELECT * FROM existing
    LIMIT 1;
`;

class IdempotencyConflictError extends Error {
    constructor(message = 'Idempotent payload mismatch') {
        super(message);
        this.name = 'IdempotencyConflictError';
        this.statusCode = 409;
    }
}

const assertPayload = ({ orderId, idempotencyKey, amount, currency }) => {
    if (!orderId) throw new Error('orderId is required');
    if (!idempotencyKey) throw new Error('idempotencyKey is required');
    if (amount === undefined || amount === null) throw new Error('amount is required');
    if (!currency) throw new Error('currency is required');
};

const normalizePayment = (row = {}) => ({
    ...row,
    amount: row.amount !== undefined ? Number(row.amount) : row.amount
});

const enqueueChargeJob = async (paymentId) => {
    if (!paymentId) return;
    if (!queueClient || typeof queueClient.add !== 'function') {
        throw new Error('queueClient is not configured');
    }
    await queueClient.add('payment_charge', 'payment.charge', { paymentId }, {
        removeOnComplete: true,
        attempts: 5,
        backoff: { type: 'exponential', delay: 250 }
    });
};

class IdempotencyService {
    static async createOrRetrieve({ orderId, idempotencyKey, amount, currency }) {
        assertPayload({ orderId, idempotencyKey, amount, currency });

        logger.debug({ orderId, idempotencyKey }, 'idempotency.createOrRetrieve.start');

        const { payment, created } = await db.tx(async (t) => {
            const row = await t.oneOrNone(UPSERT_PAYMENT_INTENT, [
                orderId,
                idempotencyKey,
                amount,
                currency
            ]);

            if (!row) {
                throw new Error('Unable to persist payment intent');
            }

            const { created: wasInserted, ...rest } = row;
            const normalized = normalizePayment(rest);

            if (!wasInserted) {
                if (Number(normalized.amount) !== Number(amount) || normalized.currency !== currency) {
                    logger.debug({ paymentId: normalized.id }, 'idempotency.createOrRetrieve.mismatch');
                    throw new IdempotencyConflictError();
                }
                return { payment: normalized, created: false };
            }

            return { payment: normalized, created: true };
        });

        if (created) {
            logger.debug({ paymentId: payment.id }, 'idempotency.createOrRetrieve.enqueue');
            await enqueueChargeJob(payment.id);
        }

        logger.debug({ paymentId: payment.id, created }, 'idempotency.createOrRetrieve.success');
        return payment;
    }
}

const idempotencyService = {
    createOrRetrieve: (params) => IdempotencyService.createOrRetrieve(params),
    resolve: (orderId, idempotencyKey, amount, currency) =>
        IdempotencyService.createOrRetrieve({ orderId, idempotencyKey, amount, currency }),
    IdempotencyConflictError,
    IdempotencyMismatchError: IdempotencyConflictError
};

module.exports = idempotencyService;