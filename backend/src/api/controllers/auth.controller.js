const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../../db/models/user.model');
const PasswordResetModel = require('../../db/models/password-reset.model');
const emailService = require('../../utils/email.service');
const { passport, isGoogleOAuthConfigured } = require('../../utils/passport.config');
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

    logger.info({ userId: user.id, email: user.email }, '✅ Manual login successful');

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

/**
 * POST /auth/forgot-password
 * Request a password reset token
 */
async function forgotPassword(req, reply) {
  try {
    const { email } = req.body;

    // Validate required field
    if (!email) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Email is required'
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Invalid email format'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await UserModel.findByEmail(normalizedEmail);

    // Security: Don't reveal if email exists or not
    // Always return success to prevent email enumeration
    if (!user) {
      logger.warn({ email: normalizedEmail }, 'Password reset requested for non-existent email');
      // Still return success to avoid revealing account existence
      return reply.code(200).send({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    }

    // Create password reset token (expires in 15 minutes)
    const resetRecord = await PasswordResetModel.create(user.id, 15);

    // Send email with reset token
    try {
      await emailService.sendPasswordResetEmail(
        user.email,
        resetRecord.token,
        user.name
      );

      logger.info({ 
        userId: user.id, 
        email: user.email,
        resetId: resetRecord.id,
        token: resetRecord.token 
      }, '✅ Reset request accepted - Password reset email sent successfully');
    } catch (emailError) {
      logger.error({ 
        error: emailError.message,
        userId: user.id,
        email: user.email 
      }, 'Failed to send password reset email');

      // If email fails, delete the token
      await PasswordResetModel.deleteByUserId(user.id);

      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to send password reset email. Please try again later.'
      });
    }

    return reply.code(200).send({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    });
  } catch (error) {
    logger.error({ error, body: req.body }, 'Forgot password error');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to process password reset request'
    });
  }
}

/**
 * POST /auth/reset-password
 * Reset password using token
 */
async function resetPassword(req, reply) {
  try {
    const { token, newPassword } = req.body;

    // Validate required fields
    if (!token || !newPassword) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Token and new password are required'
      });
    }

    // Validate password strength
    if (!isValidPassword(newPassword)) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Password must be at least 8 characters long'
      });
    }

    // Validate token
    const validation = await PasswordResetModel.validateToken(token);

    if (!validation.valid) {
      logger.warn({ error: validation.error }, '❌ Invalid or expired reset link');
      return reply.code(400).send({
        error: 'Invalid Token',
        message: validation.error || 'Invalid or expired token'
      });
    }
    logger.info({ userId: validation.userId }, '✅ Reset token validated');
    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update user's password
    await UserModel.update(validation.userId, { passwordHash });

    // Mark token as used
    await PasswordResetModel.markAsUsed(token);

    // Delete all other unused tokens for this user (security measure)
    await PasswordResetModel.deleteByUserId(validation.userId);

    // Get user info for confirmation email
    const user = await UserModel.findById(validation.userId);

    // Send confirmation email (non-blocking, don't fail if it doesn't send)
    if (user) {
      emailService.sendPasswordResetConfirmation(user.email, user.name)
        .catch(err => {
          logger.warn({ 
            error: err.message,
            userId: user.id 
          }, 'Failed to send password reset confirmation email');
        });
    }

    logger.info({ 
      userId: validation.userId,
      resetId: validation.resetId 
    }, '✅ Password updated successfully');

    return reply.code(200).send({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    logger.error({ error }, 'Reset password error');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to reset password'
    });
  }
}

/**
 * GET /auth/google
 * Initiate Google OAuth flow
 */
async function googleAuth(req, reply) {
  if (!isGoogleOAuthConfigured()) {
    return reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Google OAuth is not configured on this server',
      details: 'Please set GOOGLE_CLIENT_SECRET in your .env file. See GOOGLE_OAUTH_SETUP.md for instructions.'
    });
  }

  // This will be handled by passport middleware
  // Just return a message if called directly
  return reply.code(200).send({
    message: 'Redirecting to Google OAuth...'
  });
}

/**
 * GET /auth/google/callback
 * Handle Google OAuth callback (Fastify-compatible)
 */
async function googleAuthCallback(request, reply) {
  try {
    console.log('✅ googleAuthCallback() called');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // User should be attached by passport
    const user = request.user;

    if (!user) {
      console.log('❌ No user in request.user');
      logger.error('❌ Google OAuth callback: No user attached');
      return reply.redirect(`${frontendUrl}/#/login?error=oauth_failed`);
    }

    console.log('✅ User verified in controller:', {
      id: user.id,
      email: user.email,
      name: user.name
    });

    // Generate JWT token
    const token = generateToken(user.id);
    console.log('✅ JWT issued:', token.substring(0, 20) + '...');
    console.log('   Token length:', token.length);
    logger.info({ userId: user.id, email: user.email }, '✅ JWT issued for Google OAuth user');

    // Redirect to frontend with token in URL hash
    const redirectUrl = `${frontendUrl}/#/dashboard?token=${token}`;
    console.log('✅ Redirecting to:', redirectUrl.substring(0, 80) + '...');
    
    logger.info({ 
      userId: user.id, 
      email: user.email, 
      frontendUrl 
    }, '✅ Google OAuth callback completed');
    
    // Redirect to dashboard with token
    return reply.redirect(redirectUrl);
  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    logger.error({ error: error.message }, '❌ Google OAuth callback error');
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return reply.redirect(`${frontendUrl}/#/login?error=oauth_error`);
  }
}

module.exports = {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
  googleAuth,
  googleAuthCallback,
  generateToken,
};
