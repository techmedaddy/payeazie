const paymentController = require('../controllers/payment.controller');
const webhookController = require('../controllers/webhook.controller');
const sseController = require('../controllers/sse.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

const isDevelopment = process.env.NODE_ENV !== 'production';
const createPaymentRateLimit = isDevelopment
  ? { max: 60, timeWindow: '1 minute' }
  : { max: 10, timeWindow: '1 minute' };

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
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      demo: {
        type: 'object',
        properties: {
          outcome: {
            type: 'string',
            enum: ['auto', 'success', 'failure']
          },
          processingSpeed: {
            type: 'string',
            enum: ['normal', 'slow']
          }
        },
        additionalProperties: false
      }
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
 * Payment list query schema
 */
const listPaymentsSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      status: { 
        type: 'string', 
        enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded'] 
      }
    }
  }
};

/**
 * Create payment schema (simplified, idempotency key optional)
 */
const createPaymentSchema = {
  body: {
    type: 'object',
    required: ['orderId', 'amount', 'currency'],
    properties: {
      orderId: { type: 'string', minLength: 1 },
      amount: { type: 'number', minimum: 0.01 },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      demo: {
        type: 'object',
        properties: {
          outcome: {
            type: 'string',
            enum: ['auto', 'success', 'failure']
          },
          processingSpeed: {
            type: 'string',
            enum: ['normal', 'slow']
          }
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  }
};

/**
 * Routes
 * NOTE: `/api` prefix is applied in server.js
 */
module.exports = async function paymentRoutes(fastify) {
  const { queueClient } = require('../../utils/queue');

  // ============================================
  // REST API Endpoints
  // ============================================
  
  // List all payments with pagination and filtering
  fastify.get(
    '/payments',
    { 
      schema: listPaymentsSchema,
      preHandler: [authMiddleware],
      config: { rateLimit: { max: 100, timeWindow: '1 hour' } }
    },
    paymentController.listPayments
  );
  
  // Get single payment by ID
  fastify.get(
    '/payments/:paymentId',
    { 
      schema: getPaymentSchema,
      preHandler: [authMiddleware],
      config: { rateLimit: { max: 50, timeWindow: '1 hour' } }
    },
    paymentController.getPaymentStatus
  );
  
  // Create new payment (simplified)
  fastify.post(
    '/payments',
    { 
      schema: createPaymentSchema,
      preHandler: [authMiddleware],
      config: { rateLimit: createPaymentRateLimit }
    },
    paymentController.createPayment
  );
  
  // ============================================
  // Legacy/Additional Endpoints
  // ============================================

  // Create payment intent (with required idempotency key)
  fastify.post(
    '/payments/intents',
    { 
      schema: createIntentSchema,
      preHandler: [authMiddleware],
      config: { rateLimit: createPaymentRateLimit }
    },
    paymentController.createIntent
  );

  // Get payment audit log
  fastify.get(
    '/payments/:paymentId/audit',
    { preHandler: authMiddleware },
    paymentController.getPaymentAuditLog
  );

  // SSE endpoint for real-time payment status updates
  fastify.get(
    '/payments/:paymentId/stream',
    { preHandler: authMiddleware },
    sseController.streamPaymentStatus
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
