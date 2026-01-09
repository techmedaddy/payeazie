const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// Base options common to all environments
const baseOptions = {
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
      node: process.version,
    }),
  },
};

// Development: pretty print for human readability
let devOptions = {};
if (isDevelopment) {
  try {
    require.resolve('pino-pretty');
    devOptions = {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
          levelFirst: true,
          messageFormat: '{levelLabel} - {msg}',
        },
      },
    };
  } catch (err) {
    // Fallback: structured but readable format without pino-pretty
    console.warn('⚠️  pino-pretty not installed, using plain structured logs');
    console.warn('   Install with: npm install --save-dev pino-pretty');
  }
}

// Production: ISO timestamp, JSON logs, optimized for log aggregation
const prodOptions = isProduction
  ? {
      timestamp: pino.stdTimeFunctions.isoTime,
      messageKey: 'message',
      errorKey: 'error',
      base: {
        env: process.env.NODE_ENV,
        app: 'payeazie-backend',
      },
    }
  : {};

const logger = pino({
  ...baseOptions,
  ...devOptions,
  ...prodOptions,
});

/**
 * Create child logger with correlation ID for request tracking
 */
function createRequestLogger(requestId = null) {
  return logger.child({
    requestId: requestId || uuidv4(),
    type: 'request',
  });
}

/**
 * Create child logger for worker context
 */
function createWorkerLogger(workerName, jobId = null) {
  return logger.child({
    worker: workerName,
    jobId: jobId || uuidv4(),
    type: 'worker',
  });
}

/**
 * Create child logger for database operations
 */
function createDbLogger(operation, table = null) {
  return logger.child({
    operation,
    table,
    type: 'database',
  });
}

/**
 * Log error with full stack trace
 */
function logError(err, context = {}) {
  logger.error(
    {
      ...context,
      err: {
        message: err.message,
        stack: err.stack,
        code: err.code,
        type: err.constructor?.name,
      },
    },
    'Error occurred'
  );
}

module.exports = logger;
module.exports.createRequestLogger = createRequestLogger;
module.exports.createWorkerLogger = createWorkerLogger;
module.exports.createDbLogger = createDbLogger;
module.exports.logError = logError;
