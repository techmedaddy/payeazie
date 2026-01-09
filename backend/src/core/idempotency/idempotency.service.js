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
        INSERT INTO payments (order_id, idempotency_key, amount, currency, user_id)
        SELECT $1, $2, $3, $4, $5
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
    if (!paymentId) {
        logger.warn('enqueueChargeJob: no paymentId provided');
        return;
    }
    
    if (!queueClient || typeof queueClient.add !== 'function') {
        logger.error('enqueueChargeJob: queueClient is not configured');
        throw new Error('queueClient is not configured');
    }
    
    try {
        await queueClient.add('payment_charge', 'payment.charge', { paymentId }, {
            removeOnComplete: true,
            attempts: 5,
            backoff: { type: 'exponential', delay: 250 }
        });
        logger.debug({ paymentId }, 'enqueueChargeJob: job added successfully');
    } catch (err) {
        logger.error({ error: err.message, paymentId }, 'enqueueChargeJob: failed to add job');
        throw err;
    }
};

class IdempotencyService {
    static async createOrRetrieve({ orderId, idempotencyKey, amount, currency, userId = null }) {
        try {
            assertPayload({ orderId, idempotencyKey, amount, currency });

            logger.debug({ orderId, idempotencyKey, amount, currency, userId }, 'idempotency.createOrRetrieve.start');

            const { payment, created } = await db.tx(async (t) => {
                logger.debug('idempotency.createOrRetrieve.db.transaction.start');
                
                const row = await t.oneOrNone(UPSERT_PAYMENT_INTENT, [
                    orderId,
                    idempotencyKey,
                    amount,
                    currency,
                    userId
                ]);

                logger.debug({ row }, 'idempotency.createOrRetrieve.db.upsert.result');

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
                try {
                    await enqueueChargeJob(payment.id);
                } catch (queueErr) {
                    logger.error({ error: queueErr.message, paymentId: payment.id }, 'idempotency.createOrRetrieve.queue.error');
                    // Don't fail the request if queue fails, payment is already created
                }
            }

            logger.debug({ paymentId: payment.id, created }, 'idempotency.createOrRetrieve.success');
            return payment;
        } catch (err) {
            logger.error({
                error: err.message,
                stack: err.stack,
                name: err.name,
                orderId,
                idempotencyKey,
                amount,
                currency
            }, 'idempotency.createOrRetrieve.error');
            throw err;
        }
    }
}

const idempotencyService = {
    createOrRetrieve: (params) => IdempotencyService.createOrRetrieve(params),
    resolve: (orderId, idempotencyKey, amount, currency, userId = null) =>
        IdempotencyService.createOrRetrieve({ orderId, idempotencyKey, amount, currency, userId }),
    IdempotencyConflictError,
    IdempotencyMismatchError: IdempotencyConflictError
};

module.exports = idempotencyService;