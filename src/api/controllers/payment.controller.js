const idempotencyService = require('../../core/idempotency/idempotency.service');
const db = require('../../db');
const { selectById } = require('../../db/models/payment.model');

module.exports = {
    createIntent: async (req, reply) => {
        const idempotencyKey = req.headers['idempotency-key'];
        const { orderId, amount, currency } = req.body;

        const payment = await idempotencyService.resolve(
            orderId, 
            idempotencyKey, 
            amount, 
            currency
        );

        return payment;
    },

    getStatus: async (req, reply) => {
        const { paymentId } = req.params;

        const payment = await db.oneOrNone(selectById, [paymentId]);

        if (!payment) {
            return reply.code(404).send({ error: 'Payment not found' });
        }

        return payment;
    }
};