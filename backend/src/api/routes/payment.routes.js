const paymentController = require('../controllers/payment.controller');
const webhookController = require('../controllers/webhook.controller');

/**
 * Backward compatibility for legacy controller method names
 */
if (
  typeof paymentController.createIntent !== 'function' &&
  typeof paymentController.createPaymentIntent === 'function'
) {
  paymentController.createIntent = paymentController.createPaymentIntent;
}

if (
  typeof webhookController.handle !== 'function' &&
  typeof webhookController.handleWebhook === 'function'
) {
  const legacyWebhookHandler = webhookController.handleWebhook;

  webhookController.handle = async function webhookRoute(request, reply) {
    const result = await legacyWebhookHandler(request.body);
    return reply.send(result);
  };
}

/**
 * Schemas
 */
const createIntentSchema = {
  body: {
    type: 'object',
    required: ['orderId', 'amount', 'currency'],
    properties: {
      orderId: { type: 'string', minLength: 1 },
      amount: { type: 'number', minimum: 1 },
      currency: { type: 'string', minLength: 3, maxLength: 3 }
    },
    additionalProperties: true
  },
  headers: {
    type: 'object',
    required: ['idempotency-key'],
    properties: {
      'idempotency-key': { type: 'string', minLength: 1 }
    },
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
        additionalProperties: true
      }
    },
    additionalProperties: true
  }
};

/**
 * Payment ID parameter schema
 */
const getPaymentSchema = {
  params: {
    type: 'object',
    required: ['paymentId'],
    properties: {
      paymentId: { type: 'string', minLength: 1 }
    }
  }
};

/**
 * Routes
 * NOTE: `/api` prefix is applied in server.js
 */
module.exports = async function paymentRoutes(fastify) {
  const { queueClient } = require('../../utils/queue');

  fastify.post(
    '/payments/intents',
    { schema: createIntentSchema },
    paymentController.createIntent
  );

  fastify.get(
    '/payments/:paymentId',
    { schema: getPaymentSchema },
    paymentController.getPaymentStatus
  );

  // Manual reconciliation trigger endpoint (useful for testing/debugging)
  fastify.post('/payments/reconcile', async (request, reply) => {
    try {
      await queueClient.add('payment_reconcile', 'reconcile.manual', {}, {
        removeOnComplete: true,
        priority: 1  // High priority
      });
      return reply.send({ message: 'Reconciliation job queued' });
    } catch (err) {
      fastify.log.error({ err }, 'Failed to queue reconciliation job');
      return reply.code(500).send({ error: 'Failed to queue reconciliation job' });
    }
  });

  fastify.post(
    '/payments/webhook',
    { schema: webhookSchema },
    webhookController.handle
  );
};
