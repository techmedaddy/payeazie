const paymentController = require('../controllers/payment.controller');
const webhookController = require('../controllers/webhook.controller');

if (typeof paymentController.createIntent !== 'function' && typeof paymentController.createPaymentIntent === 'function') {
    paymentController.createIntent = paymentController.createPaymentIntent;
}

if (typeof webhookController.handle !== 'function' && typeof webhookController.handleWebhook === 'function') {
    const legacyWebhookHandler = webhookController.handleWebhook;
    webhookController.handle = async function paymentWebhookRoute(request, reply) {
        const result = await legacyWebhookHandler(request.body);
        return reply.send(result);
    };
}

const createIntentSchema = {
    body: {
        type: 'object',
        required: ['orderId', 'amount', 'currency'],
        properties: {
            orderId: { type: 'string', minLength: 1 },
            amount: { type: 'number' },
            currency: { type: 'string', minLength: 3, maxLength: 3 }
        },
        additionalProperties: true
    },
    headers: {
        type: 'object',
        properties: {
            'idempotency-key': { type: 'string', minLength: 1 }
        },
        required: ['idempotency-key'],
        additionalProperties: true
    }
};

const webhookSchema = {
    body: {
        type: 'object',
        required: ['id', 'type', 'data'],
        properties: {
            id: { type: 'string', minLength: 1 },
            type: { type: 'string', minLength: 1 },
            data: {
                type: 'object',
                properties: {
                    object: { type: 'object' }
                },
                additionalProperties: true
            }
        },
        additionalProperties: true
    }
};

module.exports = async function paymentRoutes(fastify) {
    fastify.post('/payments/intents', { schema: createIntentSchema }, paymentController.createIntent);
    fastify.post('/payments/webhook', { schema: webhookSchema }, webhookController.handle);
};