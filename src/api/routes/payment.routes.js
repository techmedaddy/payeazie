const paymentController = require('../controllers/payment.controller');

const requireIdempotencyKey = async (request, reply) => {
    if (!request.headers['idempotency-key']) {
        return reply.code(400).send({ error: 'Idempotency-Key header is required' });
    }
};

module.exports = async function paymentRoutes(fastify, opts = {}) {
    const resolvePath = (path) => (opts && opts.prefix ? path : `/payments${path}`);

    fastify.route({
        method: 'POST',
        url: resolvePath('/intents'),
        schema: {
            body: {
                type: 'object',
                required: ['orderId', 'amount', 'currency'],
                properties: {
                    orderId: { type: 'string', minLength: 1 },
                    amount: { type: 'number' },
                    currency: { type: 'string', minLength: 1 }
                },
                additionalProperties: true
            }
        },
        preHandler: requireIdempotencyKey,
        handler: paymentController.createPaymentIntent
    });
};