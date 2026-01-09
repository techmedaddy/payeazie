const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger');
const UserModel = require('../../db/models/user.model');

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
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authorization header missing'
      });
    }

    // Check Bearer format
    if (!authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid authorization format. Use: Bearer <token>'
      });
    }

    // Extract token
    const token = authHeader.substring(7);

    if (!token) {
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
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Token expired'
        });
      }
      if (err.name === 'JsonWebTokenError') {
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
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name
    };

    logger.debug({ userId: user.id, email: user.email }, 'User authenticated');
  } catch (error) {
    logger.error({ error }, 'Authentication error');
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

module.exports = {
  authMiddleware,
  optionalAuthMiddleware
};
