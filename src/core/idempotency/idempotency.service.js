const db = require('../../db');
const { insertPayment, selectByOrderIdAndKey } = require('../../db/models/payment.model');

const resolve = async (orderId, idempotencyKey, amount, currency) => {
    if (!orderId || !idempotencyKey || !amount || !currency) {
        throw new Error('Missing or invalid payment fields');
    }

    const newPayment = await db.oneOrNone(insertPayment, {
        order_id: orderId,
        idempotency_key: idempotencyKey,
        amount,
        currency
    });

    if (newPayment) {
        return newPayment;
    }

    return db.one(selectByOrderIdAndKey, [orderId, idempotencyKey]);
};

module.exports = { resolve };