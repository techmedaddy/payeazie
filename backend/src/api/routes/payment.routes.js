const paymentController = require('../controllers/payment.controller');
const webhookController = require('../controllers/webhook.controller');
const sseController = require('../controllers/sse.controller');
const { authMiddleware, requireInternalOperator } = require('../middleware/auth.middleware');
const { ALL_STATUSES } = require('../../utils/payment-status');

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

const refundPaymentSchema = {
  params: {
    type: 'object',
    required: ['paymentId'],
    properties: {
      paymentId: { type: 'string', minLength: 1 }
    }
  },
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string', minLength: 5, maxLength: 280 }
    },
    additionalProperties: false
  }
};

const retryPaymentSchema = {
  params: {
    type: 'object',
    required: ['paymentId'],
    properties: {
      paymentId: { type: 'string', minLength: 1 }
    }
  }
};

const reconcilePaymentSchema = {
  params: {
    type: 'object',
    required: ['paymentId'],
    properties: {
      paymentId: { type: 'string', minLength: 1 }
    }
  }
};

const restartProcessingSchema = {
  params: {
    type: 'object',
    required: ['paymentId'],
    properties: {
      paymentId: { type: 'string', minLength: 1 }
    }
  }
};

const simulateGatewayStatusSchema = {
  params: {
    type: 'object',
    required: ['paymentId'],
    properties: {
      paymentId: { type: 'string', minLength: 1 }
    }
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: {
        type: 'string',
        enum: ['processing', 'succeeded', 'failed', 'refunded']
      },
      note: { type: 'string', maxLength: 280 }
    },
    additionalProperties: false
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
        enum: ALL_STATUSES
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

  fastify.post(
    '/payments/:paymentId/refund',
    {
      schema: refundPaymentSchema,
      preHandler: [authMiddleware],
      config: { rateLimit: createPaymentRateLimit }
    },
    paymentController.refundPayment
  );

  fastify.post(
    '/payments/:paymentId/retry',
    {
      schema: retryPaymentSchema,
      preHandler: [authMiddleware],
      config: { rateLimit: createPaymentRateLimit }
    },
    paymentController.retryPayment
  );

  fastify.post(
    '/payments/:paymentId/reconcile',
    {
      schema: reconcilePaymentSchema,
      preHandler: [authMiddleware],
      config: { rateLimit: createPaymentRateLimit }
    },
    paymentController.reconcileProcessingPayment
  );

  fastify.post(
    '/payments/:paymentId/restart',
    {
      schema: restartProcessingSchema,
      preHandler: [authMiddleware],
      config: { rateLimit: createPaymentRateLimit }
    },
    paymentController.restartProcessingPayment
  );

  fastify.post(
    '/payments/:paymentId/simulate-gateway',
    {
      schema: simulateGatewayStatusSchema,
      preHandler: [authMiddleware, requireInternalOperator],
      config: { rateLimit: createPaymentRateLimit }
    },
    paymentController.simulateGatewayStatus
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
  fastify.post('/payments/reconcile', {
    preHandler: [authMiddleware, requireInternalOperator]
  }, async (request, reply) => {
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
