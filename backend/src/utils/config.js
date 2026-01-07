/**
 * Centralized configuration management
 * All environment variables and configuration in one place
 */

const logger = require('./logger');

/**
 * Configuration schema with defaults and validation
 */
const config = {
  // Server
  server: {
    port: parseInt(process.env.PORT || '3467', 10),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  // Database
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true',
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10)
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10)
  },

  // Queue/Workers
  queue: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    chargeJobAttempts: parseInt(process.env.CHARGE_JOB_ATTEMPTS || '5', 10),
    chargeJobBackoffDelay: parseInt(process.env.CHARGE_JOB_BACKOFF_DELAY || '250', 10),
    reconcileJobAttempts: parseInt(process.env.RECONCILE_JOB_ATTEMPTS || '3', 10),
    reconcileCron: process.env.RECONCILE_CRON || '*/5 * * * *',
    removeCompletedJobs: process.env.REMOVE_COMPLETED_JOBS !== 'false'
  },

  // Reconciliation
  reconciliation: {
    windowMinutes: parseInt(process.env.RECONCILE_WINDOW_MINUTES || '30', 10),
    batchSize: parseInt(process.env.RECONCILE_BATCH_SIZE || '100', 10)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.LOG_PRETTY === 'true'
  },

  // API
  api: {
    corsOrigin: process.env.CORS_ORIGIN || true,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10)
  },

  // Gateway (for production, add real gateway configs)
  gateway: {
    provider: process.env.GATEWAY_PROVIDER || 'mock',
    apiKey: process.env.GATEWAY_API_KEY,
    apiSecret: process.env.GATEWAY_API_SECRET,
    webhookSecret: process.env.GATEWAY_WEBHOOK_SECRET,
    timeout: parseInt(process.env.GATEWAY_TIMEOUT || '30000', 10)
  },

  // Feature flags
  features: {
    enableReconciliation: process.env.ENABLE_RECONCILIATION !== 'false',
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    enableDetailedLogging: process.env.ENABLE_DETAILED_LOGGING === 'true'
  }
};

/**
 * Validate required configuration
 */
function validateConfig() {
  const errors = [];

  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (!config.redis.url) {
    errors.push('REDIS_URL is required');
  }

  // In production, require gateway credentials
  if (config.server.nodeEnv === 'production' && config.gateway.provider !== 'mock') {
    if (!config.gateway.apiKey) {
      errors.push('GATEWAY_API_KEY is required in production');
    }
    if (!config.gateway.apiSecret) {
      errors.push('GATEWAY_API_SECRET is required in production');
    }
  }

  if (errors.length > 0) {
    logger.fatal({ errors }, 'Configuration validation failed');
    throw new Error(`Configuration errors: ${errors.join(', ')}`);
  }

  logger.info({ 
    nodeEnv: config.server.nodeEnv,
    port: config.server.port,
    workerConcurrency: config.queue.concurrency,
    reconcileCron: config.queue.reconcileCron
  }, 'Configuration loaded successfully');
}

/**
 * Get configuration value by path
 * @param {string} path - Dot-separated path (e.g., 'server.port')
 * @returns {*} Configuration value
 */
function get(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], config);
}

/**
 * Check if running in production
 */
function isProduction() {
  return config.server.nodeEnv === 'production';
}

/**
 * Check if running in development
 */
function isDevelopment() {
  return config.server.nodeEnv === 'development';
}

/**
 * Check if running in test
 */
function isTest() {
  return config.server.nodeEnv === 'test';
}

module.exports = {
  config,
  validateConfig,
  get,
  isProduction,
  isDevelopment,
  isTest
};
