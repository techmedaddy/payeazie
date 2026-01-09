const rateLimit = require('@fastify/rate-limit');
const logger = require('../../utils/logger');

/**
 * Rate Limiting Middleware Configuration
 * 
 * Limits authenticated users to 5 requests per hour based on user ID
 * Falls back to IP address for unauthenticated requests
 */

/**
 * Custom key generator function
 * Uses req.user.id if authenticated, otherwise falls back to IP
 */
function keyGenerator(req) {
  // If user is authenticated (set by authMiddleware), use user ID
  if (req.user && req.user.id) {
    logger.debug({ userId: req.user.id }, 'Rate limit key: user ID');
    return `user:${req.user.id}`;
  }
  
  // Fall back to IP address for unauthenticated requests
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  logger.debug({ ip }, 'Rate limit key: IP address');
  return `ip:${ip}`;
}

/**
 * Custom error handler for rate limit exceeded
 */
function onExceeding(req, key) {
  logger.warn({ key, ip: req.ip }, 'Rate limit threshold approaching');
}

function onExceeded(req, key) {
  logger.warn({ key, ip: req.ip }, 'Rate limit exceeded');
}

/**
 * Rate limiter options for sensitive routes
 * Limits: 5 requests per hour
 */
const rateLimitOptions = {
  max: 5,                    // Maximum 5 requests
  timeWindow: '1 hour',      // Per hour
  cache: 10000,              // Keep 10k entries in cache
  allowList: [],             // No IP whitelist
  skipOnError: false,        // Don't skip on error
  keyGenerator,              // Use custom key generator
  onExceeding,               // Log when approaching limit
  onExceeded,                // Log when exceeded
  errorResponseBuilder: (req, context) => {
    return {
      error: 'Too many requests',
      message: 'You have exceeded the limit of 5 requests per hour.',
      retryAfter: context.after
    };
  }
};

/**
 * Rate limiter plugin for Fastify
 * This needs to be registered with the Fastify instance
 * 
 * Usage in server.js:
 * await fastify.register(require('@fastify/rate-limit'), rateLimitOptions);
 * 
 * Then apply to specific routes using:
 * { preHandler: fastify.rateLimit() }
 */

module.exports = {
  rateLimitOptions,
  keyGenerator
};
