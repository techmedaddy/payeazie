const logger = require('../../utils/logger');

/**
 * Request logging middleware for Fastify
 * Logs all incoming requests with user context (if authenticated)
 * 
 * This is a Fastify preHandler hook that logs:
 * - HTTP method and path
 * - User ID (if authenticated)
 * - IP address
 * - Timestamp
 * - Request ID (for correlation)
 * 
 * Security: Does not log sensitive data (passwords, tokens, etc.)
 */
const requestLogger = async (request, reply) => {
    const startTime = Date.now();
    
    // Extract relevant request information
    const logData = {
        requestId: request.id,
        method: request.method,
        path: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        userId: request.user?.id || null,
        userEmail: request.user?.email || null,
        timestamp: new Date().toISOString()
    };

    // Log the incoming request
    logger.info(logData, 'request: incoming');

    // Hook into response to log completion
    reply.addHook('onResponse', async (request, reply) => {
        const duration = Date.now() - startTime;
        
        logger.info({
            requestId: request.id,
            method: request.method,
            path: request.url,
            statusCode: reply.statusCode,
            duration,
            userId: request.user?.id || null
        }, 'request: completed');
    });

    // Continue to the next handler
};

/**
 * Middleware to sanitize sensitive data from logs
 * Prevents logging of passwords, tokens, API keys, etc.
 */
const sanitizeLogData = (data) => {
    const sensitive = ['password', 'token', 'authorization', 'api_key', 'secret'];
    const sanitized = { ...data };
    
    for (const key in sanitized) {
        if (sensitive.some(s => key.toLowerCase().includes(s))) {
            sanitized[key] = '[REDACTED]';
        }
    }
    
    return sanitized;
};

/**
 * Enhanced request logger with body sanitization (for debugging)
 * Only use in development - logs sanitized request body
 */
const detailedRequestLogger = async (request, reply) => {
    const startTime = Date.now();
    
    const logData = {
        requestId: request.id,
        method: request.method,
        path: request.url,
        ip: request.ip,
        userId: request.user?.id || null,
        query: request.query,
        body: sanitizeLogData(request.body || {}),
        timestamp: new Date().toISOString()
    };

    logger.debug(logData, 'request: detailed');

    reply.addHook('onResponse', async (request, reply) => {
        const duration = Date.now() - startTime;
        
        logger.debug({
            requestId: request.id,
            statusCode: reply.statusCode,
            duration
        }, 'request: response');
    });
};

module.exports = {
    requestLogger,
    detailedRequestLogger,
    sanitizeLogData
};
