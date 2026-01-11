const authController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { passport, isGoogleOAuthConfigured } = require('../../utils/passport.config');

/**
 * Register auth routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} options - Route options
 */
async function authRoutes(fastify, options) {
  // POST /auth/register - Register new user
  fastify.post('/register', {
    config: { rateLimit: { max: 100, timeWindow: '1 hour' } },
    schema: {
      description: 'Register a new user account',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { 
            type: 'string', 
            format: 'email',
            description: 'User email address'
          },
          password: { 
            type: 'string', 
            minLength: 8,
            description: 'User password (min 8 characters)'
          },
          name: { 
            type: 'string',
            description: 'User display name (optional)'
          }
        }
      },
      response: {
        201: {
          description: 'User registered successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    createdAt: { type: 'string' }
                  }
                },
                token: { type: 'string' }
              }
            }
          }
        },
        400: {
          description: 'Validation error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        409: {
          description: 'Email already exists',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: authController.register
  });

  // POST /auth/login - Login user
  fastify.post('/login', {
    config: { rateLimit: { max: 100, timeWindow: '1 hour' } },
    schema: {
      description: 'Login with email and password',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { 
            type: 'string', 
            format: 'email',
            description: 'User email address'
          },
          password: { 
            type: 'string',
            description: 'User password'
          }
        }
      },
      response: {
        200: {
          description: 'Login successful',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    createdAt: { type: 'string' }
                  }
                },
                token: { type: 'string' }
              }
            }
          }
        },
        401: {
          description: 'Invalid credentials',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: authController.login
  });

  // GET /auth/me - Get current user (requires authentication)
  fastify.get('/me', {
    preHandler: authMiddleware,
    schema: {
      description: 'Get current authenticated user info',
      tags: ['auth'],
      headers: {
        type: 'object',
        required: ['authorization'],
        properties: {
          authorization: {
            type: 'string',
            description: 'Bearer token'
          }
        }
      },
      response: {
        200: {
          description: 'User info retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: authController.me
  });

  // POST /auth/forgot-password - Request password reset
  fastify.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    schema: {
      description: 'Request a password reset token',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { 
            type: 'string', 
            format: 'email',
            description: 'User email address'
          }
        }
      },
      response: {
        200: {
          description: 'Password reset email sent (or user not found)',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: {
          description: 'Validation error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          description: 'Server error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: authController.forgotPassword
  });

  // POST /auth/reset-password - Reset password with token
  fastify.post('/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    schema: {
      description: 'Reset password using reset token',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { 
            type: 'string',
            minLength: 1,
            description: 'Password reset token from email'
          },
          newPassword: { 
            type: 'string', 
            minLength: 8,
            description: 'New password (min 8 characters)'
          }
        }
      },
      response: {
        200: {
          description: 'Password reset successful',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: {
          description: 'Validation error or invalid token',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          description: 'Server error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: authController.resetPassword
  });

  // GET /auth/google - Initiate Google OAuth
  fastify.get('/google', async (request, reply) => {
    console.log('✅ /api/auth/google route hit');
    console.log('   Request URL:', request.url);
    console.log('   Request headers:', JSON.stringify(request.headers, null, 2));
    
    // Check if OAuth is configured
    if (!isGoogleOAuthConfigured()) {
      console.log('❌ Google OAuth not configured');
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Google OAuth is not configured on this server',
        details: 'Please set GOOGLE_CLIENT_SECRET in your .env file.'
      });
    }

    const logger = require('../../utils/logger');
    logger.info('✅ Initiating Google OAuth flow - redirecting to Google login');
    console.log('✅ Calling passport.authenticate for Google OAuth...');

    // Trigger passport authentication
    return request.fastifyPassport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false
    })(request, reply);
  });

  // GET /auth/google/callback - Google OAuth callback
  fastify.get('/google/callback', async (request, reply) => {
    console.log('✅ /api/auth/google/callback route hit');
    console.log('   Query params:', JSON.stringify(request.query, null, 2));
    
    const logger = require('../../utils/logger');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Check if OAuth is configured
    if (!isGoogleOAuthConfigured()) {
      console.log('❌ OAuth not configured in callback');
      logger.error('Google OAuth callback called but OAuth not configured');
      return reply.redirect(`${frontendUrl}/#/login?error=oauth_not_configured`);
    }

    // Check for OAuth errors from Google
    if (request.query.error) {
      console.log('❌ Google returned error:', request.query.error);
      logger.error({ error: request.query.error }, 'Google OAuth returned error');
      return reply.redirect(`${frontendUrl}/#/login?error=${request.query.error}`);
    }

    console.log('✅ Authenticating with passport...');
    
    // Authenticate with passport
    return request.fastifyPassport.authenticate('google', {
      session: false
    }, (err, user, info) => {
      if (err) {
        console.error('❌ Google OAuth error:', err);
        console.error('   Error stack:', err.stack);
        logger.error({ error: err.message }, '❌ Google OAuth authentication error');
        return reply.redirect(`${frontendUrl}/#/login?error=oauth_error`);
      }

      if (!user) {
        console.log('❌ No user returned from passport');
        console.log('   Info:', info);
        logger.warn({ info }, '❌ Google OAuth authentication failed - no user');
        return reply.redirect(`${frontendUrl}/#/login?error=oauth_failed`);
      }

      // Attach user to request
      request.user = user;
      console.log('✅ request.user:', JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        googleId: user.google_id || user.googleId
      }, null, 2));
      logger.info({ userId: user.id, email: user.email }, '✅ Google OAuth user authenticated');

      console.log('✅ Calling googleAuthCallback controller...');
      // Call the callback handler
      return authController.googleAuthCallback(request, reply);
    })(request, reply);
  });
}

module.exports = authRoutes;
