const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../../db/models/user.model');
const logger = require('../../utils/logger');

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Validate password requirements
 */
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

/**
 * Generate JWT token
 */
function generateToken(userId) {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
  
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(
    { userId },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

/**
 * POST /auth/register
 * Register a new user
 */
async function register(req, reply) {
  try {
    const { email, password, name } = req.body;

    // Validate required fields
    if (!email || !password) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Email and password are required'
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Invalid email format'
      });
    }

    // Validate password strength
    if (!isValidPassword(password)) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Password must be at least 8 characters long'
      });
    }

    // Validate name if provided
    if (name && typeof name !== 'string') {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Name must be a string'
      });
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await UserModel.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name ? name.trim() : null
    });

    // Generate JWT token
    const token = generateToken(user.id);

    logger.info({ userId: user.id, email: user.email }, 'User registered successfully');

    return reply.code(201).send({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.created_at
        },
        token
      }
    });
  } catch (error) {
    // Handle duplicate email error
    if (error.statusCode === 409) {
      return reply.code(409).send({
        error: 'Conflict',
        message: error.message
      });
    }

    logger.error({ error, body: req.body }, 'Registration error');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to register user'
    });
  }
}

/**
 * POST /auth/login
 * Authenticate user and return JWT token
 */
async function login(req, reply) {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await UserModel.findByEmail(email.toLowerCase().trim());

    if (!user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid credentials'
      });
    }

    // Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      logger.warn({ email }, 'Failed login attempt - invalid password');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    logger.info({ userId: user.id, email: user.email }, 'User logged in successfully');

    return reply.code(200).send({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.created_at
        },
        token
      }
    });
  } catch (error) {
    logger.error({ error, body: req.body }, 'Login error');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to login'
    });
  }
}

/**
 * GET /auth/me
 * Get current authenticated user info
 * Requires JWT authentication
 */
async function me(req, reply) {
  try {
    // User is already attached by authMiddleware
    const userId = req.user.id;

    // Fetch fresh user data
    const user = await UserModel.findById(userId);

    if (!user) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    return reply.code(200).send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        }
      }
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error fetching user info');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to fetch user info'
    });
  }
}

module.exports = {
  register,
  login,
  me
};
