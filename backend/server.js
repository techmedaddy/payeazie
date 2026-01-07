/**
 * Load environment variables FIRST
 */
require('dotenv').config();

const Fastify = require('fastify');
const cors = require('@fastify/cors');

/**
 * DB bootstrap (must execute once on startup)
 * This file should create the pg Pool and test connectivity
 */
require('./src/db');

const paymentRoutes = require('./src/api/routes/payment.routes');
const { queueClient } = require('./src/utils/queue');

/**
 * Start background workers
 * These listen for jobs from the BullMQ queues
 */
require('./src/workers/charge.worker');
require('./src/workers/reconcile.worker');

/**
 * Environment validation
 */
function ensureEnv() {
  const required = ['DATABASE_URL', 'REDIS_URL'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Build Fastify server
 */
function buildServer() {
  ensureEnv();

  const app = Fastify({
    logger: true,
  });

  // CORS
  app.register(cors, {
    origin: true,
  });

  // Health check with actual system status
  app.get('/health', async (request, reply) => {
    const db = require('./src/db');
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    try {
      // Check database connection
      await db.one('SELECT 1 as ok');
      health.database = 'connected';
    } catch (err) {
      health.database = 'disconnected';
      health.status = 'degraded';
      reply.code(503);
    }

    try {
      // Check Redis connection
      const redis = require('ioredis');
      const redisClient = new redis(process.env.REDIS_URL, { 
        maxRetriesPerRequest: 1,
        connectTimeout: 1000 
      });
      await redisClient.ping();
      await redisClient.quit();
      health.redis = 'connected';
    } catch (err) {
      health.redis = 'disconnected';
      health.status = 'degraded';
      reply.code(503);
    }

    return health;
  });

  /**
   * API routes
   */
  app.register(paymentRoutes, { prefix: '/api' });

  /**
   * Metrics endpoint for monitoring
   */
  app.get('/metrics', async (request, reply) => {
    const metrics = require('./src/utils/metrics');
    return metrics.getMetrics();
  });

  /**
   * Metrics summary endpoint (simplified view)
   */
  app.get('/metrics/summary', async (request, reply) => {
    const metrics = require('./src/utils/metrics');
    return metrics.getSummary();
  });

  return app;
}

/**
 * Start server
 */
async function start() {
  let app;
  
  try {
    app = buildServer();
    const port = Number(process.env.PORT) || 3467;

    const address = await app.listen({
      port,
      host: '0.0.0.0',
    });

    app.log.info({ address, port, nodeEnv: process.env.NODE_ENV }, 'Fastify server started');
    app.log.info('Env OK: DATABASE_URL and REDIS_URL present');
    app.log.info('Workers: charge.worker and reconcile.worker started');
    app.log.info('\n' + app.printRoutes());

    // Schedule periodic reconciliation job (every 5 minutes)
    const scheduleReconciliation = async () => {
      try {
        const pattern = process.env.RECONCILE_CRON || '*/5 * * * *';
        await queueClient.add('payment_reconcile', 'reconcile.periodic', {}, {
          repeat: { pattern },
          removeOnComplete: true
        });
        app.log.info({ pattern }, 'Reconciliation job scheduled');
      } catch (err) {
        app.log.error({ err }, 'Failed to schedule reconciliation job');
      }
    };

    await scheduleReconciliation();

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      app.log.info({ signal }, 'Shutdown signal received');
      
      try {
        // Stop accepting new requests
        await app.close();
        app.log.info('HTTP server closed');
        
        // Workers will finish current jobs (BullMQ handles this)
        app.log.info('Allowing workers to finish current jobs...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5s grace period
        
        app.log.info('Graceful shutdown completed');
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught errors
    process.on('uncaughtException', (err) => {
      app.log.fatal({ err }, 'Uncaught exception');
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      app.log.fatal({ reason, promise }, 'Unhandled rejection');
      gracefulShutdown('unhandledRejection');
    });

  } catch (err) {
    console.error('Startup failure:', err.message);
    if (app) await app.close();
    process.exit(1);
  }
}

start();
