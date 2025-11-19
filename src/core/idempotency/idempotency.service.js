const db = require('../../db');
const logger = require('../../utils/logger');
const { insertPayment, selectByOrderIdAndKey } = require('../../db/models/payment.model');

class IdempotencyMismatchError extends Error {
    constructor(message) {
        super(message);
        this.name = 'IdempotencyMismatchError';
    }
}

class IdempotencyService {
    static async createOrRetrieve({ orderId, idempotencyKey, amount, currency }) {
        if (!orderId || !idempotencyKey || amount === undefined || amount === null || !currency) {
            throw new Error('orderId, idempotencyKey, amount, and currency are required');
        }

        logger.debug({ orderId, idempotencyKey }, 'idempotency.createOrRetrieve.start');

        return db.tx(async t => {
            const inserted = await t.oneOrNone(insertPayment, {
                order_id: orderId,
                idempotency_key: idempotencyKey,
                amount,
                currency
            });

            if (inserted) {
                logger.debug({ paymentId: inserted.id }, 'idempotency.createOrRetrieve.inserted');
                return { created: true, record: inserted };
            }

            const existing = await t.oneOrNone(selectByOrderIdAndKey, [orderId, idempotencyKey]);

            if (!existing) {
                throw new Error('Unable to load existing payment intent');
            }

            if (Number(existing.amount) !== Number(amount) || existing.currency !== currency) {
                logger.debug({ paymentId: existing.id }, 'idempotency.createOrRetrieve.mismatch');
                throw new IdempotencyMismatchError('Idempotent payload mismatch');
            }

            logger.debug({ paymentId: existing.id }, 'idempotency.createOrRetrieve.retrieved');
            return { created: false, record: existing };
        });
    }
}

const serviceInstance = new IdempotencyService();
serviceInstance.createOrRetrieve = IdempotencyService.createOrRetrieve;
serviceInstance.IdempotencyMismatchError = IdempotencyMismatchError;

module.exports = serviceInstance;