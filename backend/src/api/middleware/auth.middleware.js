const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger');
const UserModel = require('../../db/models/user.model');
const { canAccessAnyPayment } = require('../../utils/roles');

/**
 * JWT Authentication Middleware
 * Extracts and verifies JWT token from Authorization header
 * Attaches user info to req.user
 */
async function authMiddleware(req, reply) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      logger.warn({ path: req.url, method: req.method }, '❌ Unauthorized access attempt - No authorization header');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authorization header missing'
      });
    }

    // Check Bearer format
    if (!authHeader.startsWith('Bearer ')) {
      logger.warn({ path: req.url, method: req.method }, '❌ Unauthorized access attempt - Invalid format');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid authorization format. Use: Bearer <token>'
      });
    }

    // Extract token
    const token = authHeader.substring(7);

    if (!token) {
      logger.warn({ path: req.url, method: req.method }, '❌ Unauthorized access attempt - Token missing');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Token missing'
      });
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Authentication not properly configured'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        logger.warn({ path: req.url, method: req.method }, '❌ Unauthorized access attempt - Token expired');
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Token expired'
        });
      }
      if (err.name === 'JsonWebTokenError') {
        logger.warn({ path: req.url, method: req.method }, '❌ Unauthorized access attempt - Invalid token');
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid token'
        });
      }
      throw err;
    }

    // Verify user still exists
    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      logger.warn({ path: req.url, method: req.method, userId: decoded.userId }, '❌ Unauthorized access attempt - User not found');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user'
    };

    logger.info({ 
      userId: user.id, 
      email: user.email, 
      role: user.role,
      path: req.url,
      method: req.method 
    }, '✅ JWT verified - User authenticated');
  } catch (error) {
    logger.error({ error, path: req.url, method: req.method }, '❌ Unauthorized access attempt - Authentication error');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Optional auth middleware - doesn't fail if no token provided
 * Useful for endpoints that work differently for authenticated users
 */
async function optionalAuthMiddleware(req, reply) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return;
    }

    const token = authHeader.substring(7);
    if (!token) {
      req.user = null;
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      req.user = null;
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret);
      const user = await UserModel.findById(decoded.userId);
      
      req.user = user ? {
        id: user.id,
        email: user.email,
        name: user.name
      } : null;
    } catch (err) {
      req.user = null;
    }
  } catch (error) {
    logger.error({ error }, 'Optional auth error');
    req.user = null;
  }
}

async function requireInternalOperator(req, reply) {
  if (!req.user || !canAccessAnyPayment(req.user)) {
    logger.warn({
      userId: req.user?.id || null,
      role: req.user?.role || null,
      path: req.url,
      method: req.method,
    }, '❌ Forbidden - Internal operator access required');

    return reply.code(403).send({
      error: 'Forbidden',
      message: 'This action is only available to internal admin or ops users'
    });
  }
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  requireInternalOperator
};
