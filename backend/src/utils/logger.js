const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

const isProduction = process.env.NODE_ENV === 'production';

// Base options common to all environments
const baseOptions = {
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
      node: process.version,
    }),
  },
};

// Development: pretty print if pino-pretty is installed
let devOptions = {};
if (!isProduction) {
  try {
    require.resolve('pino-pretty');
    devOptions = {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    };
  } catch (err) {
    // Fallback to plain logs if pino-pretty is missing
    console.warn('⚠️ pino-pretty not installed, using plain logs');
  }
}

// Production: ISO timestamp, JSON logs
const prodOptions = isProduction
  ? { timestamp: pino.stdTimeFunctions.isoTime }
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
