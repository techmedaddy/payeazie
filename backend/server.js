/**
 * Load environment variables FIRST
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Fastify = require('fastify');
const cors = require('@fastify/cors');

/**
 * DB bootstrap (must execute once on startup)
 * This file should create the pg Pool and test connectivity
 */
const db = require('./src/db');

const paymentRoutes = require('./src/api/routes/payment.routes');
const authRoutes = require('./src/api/routes/auth.routes');
const auditRoutes = require('./src/api/routes/audit.routes');
const { queueClient } = require('./src/utils/queue');

/**
 * Start background workers
 * These listen for jobs from the BullMQ queues
 * Workers are loaded AFTER migrations to ensure DB is ready
 */
function startWorkers() {
  try {
    require('./src/workers/charge.worker');
    require('./src/workers/reconcile.worker');
    console.log('✓ Background workers started (charge, reconcile)\n');
  } catch (err) {
    console.error('⚠️  Failed to start workers:', err.message);
    // Non-fatal: server can still run without workers
  }
}

/**
 * Run database migrations on startup
 */
async function runMigrations() {
  const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('⚠️  No migrations directory found, skipping migrations');
    return;
  }
  
  try {
    console.log('\n📦 Running database migrations...');
    
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('   No migration files found');
      return;
    }

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      try {
        await db.none(sql);
        console.log(`   ✓ ${file}`);
      } catch (err) {
        // Ignore errors if objects already exist
        if (err.message.includes('already exists')) {
          console.log(`   ⊙ ${file} (already exists)`);
        } else {
          console.error(`   ✗ ${file}: ${err.message}`);
          throw err;
        }
      }
    }

    console.log('✓ Migrations completed\n');
  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    throw err;
  }
}

/**
 * Environment validation
 */
function ensureEnv() {
  const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'];
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

  // Rate limiting
  const rateLimitPlugin = require('@fastify/rate-limit');
  const { rateLimitOptions } = require('./src/api/middleware/rate-limit.middleware');
  app.register(rateLimitPlugin, rateLimitOptions);

  // Initialize Passport for OAuth
  const { initializeGoogleStrategy } = require('./src/utils/passport.config');
  initializeGoogleStrategy();

  // Request logging middleware (applied globally)
  const { requestLogger } = require('./src/api/middleware/request-logger.middleware');
  app.addHook('preHandler', requestLogger);

  // Root route
  app.get('/', async (request, reply) => {
    return { 
      message: 'Backend is running',
      service: 'Payeazie Payment API',
      version: '1.0.0',
      status: 'ok'
    };
  });

  // Basic health check (fast, non-blocking)
  app.get('/health', async (request, reply) => {
    return { 
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development'
    };
  });
  
  // Detailed health check (includes DB and Redis)
  app.get('/health/detailed', async (request, reply) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: 'unknown',
      redis: 'unknown'
    };

    // Check database
    try {
      await db.one('SELECT 1 as ok');
      health.database = 'connected';
    } catch (err) {
      health.database = 'disconnected';
      health.status = 'degraded';
    }

    // Check Redis
    try {
      const redis = require('ioredis');
      const redisClient = new redis(process.env.REDIS_URL, { 
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true
      });
      await redisClient.connect();
      await redisClient.ping();
      await redisClient.quit();
      health.redis = 'connected';
    } catch (err) {
      health.redis = 'disconnected';
      health.status = 'degraded';
    }

    if (health.status === 'degraded') {
      reply.code(503);
    }

    return health;
  });

  /**
   * API routes
   */
  app.register(paymentRoutes, { prefix: '/api' });
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(auditRoutes, { prefix: '/api' });

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
    // Run migrations first
    await runMigrations();
    
    // Validate Redis connection
    console.log('🔍 Validating Redis connection...');
    try {
      const redis = require('ioredis');
      const testClient = new redis(process.env.REDIS_URL, { 
        maxRetriesPerRequest: 3,
        lazyConnect: true 
      });
      await testClient.connect();
      await testClient.ping();
      await testClient.quit();
      console.log('✓ Redis connected\n');
    } catch (err) {
      console.error('✗ Redis connection failed:', err.message);
      console.error('  Redis URL:', process.env.REDIS_URL);
      throw new Error('Redis connection required for startup');
    }
    
    // Start background workers after DB/Redis are validated
    startWorkers();
    
    app = buildServer();
    const port = Number(process.env.PORT) || 3467;

    const address = await app.listen({
      port,
      host: '0.0.0.0',
    });

    console.log('\n┌─────────────────────────────────────────────');
    console.log('│ 🚀 Payeazie Backend Server Started');
    console.log('├─────────────────────────────────────────────');
    console.log(`│ Environment:  ${process.env.NODE_ENV || 'development'}`);
    console.log(`│ Port:         ${port}`);
    console.log(`│ Address:      ${address}`);
    console.log(`│ Health:       http://localhost:${port}/health`);
    console.log(`│ API:          http://localhost:${port}/api`);
    console.log('└─────────────────────────────────────────────\n');
    
    app.log.debug('Environment variables loaded:', {
      DATABASE_URL: process.env.DATABASE_URL ? '✓ set' : '✗ missing',
      REDIS_URL: process.env.REDIS_URL ? '✓ set' : '✗ missing',
      PORT: process.env.PORT || '3467 (default)'
    });

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
