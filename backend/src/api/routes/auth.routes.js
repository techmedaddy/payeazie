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
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
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
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
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
  fastify.get('/google', {
    schema: {
      description: 'Initiate Google OAuth 2.0 authentication',
      tags: ['auth'],
      response: {
        302: {
          description: 'Redirect to Google OAuth',
          type: 'object'
        },
        503: {
          description: 'Google OAuth not configured',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    preHandler: async (req, reply) => {
      if (!isGoogleOAuthConfigured()) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Google OAuth is not configured on this server'
        });
      }

      // Use passport to initiate OAuth flow
      return new Promise((resolve, reject) => {
        passport.authenticate('google', {
          scope: ['profile', 'email'],
          session: false
        })(req, reply, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    handler: authController.googleAuth
  });

  // GET /auth/google/callback - Google OAuth callback
  fastify.get('/google/callback', {
    schema: {
      description: 'Google OAuth 2.0 callback handler',
      tags: ['auth'],
      querystring: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'OAuth authorization code' },
          state: { type: 'string', description: 'OAuth state parameter' },
          error: { type: 'string', description: 'OAuth error if any' }
        }
      },
      response: {
        302: {
          description: 'Redirect to frontend with token or error',
          type: 'object'
        }
      }
    },
    preHandler: async (req, reply) => {
      if (!isGoogleOAuthConfigured()) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
        return reply.redirect(`${frontendUrl}/#/login?error=oauth_not_configured`);
      }

      // Check for OAuth errors
      if (req.query.error) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
        return reply.redirect(`${frontendUrl}/#/login?error=${req.query.error}`);
      }

      // Use passport to handle callback
      try {
        await authController.createPassportAuthenticator('google', {
          session: false,
          failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3002'}/#/login?error=oauth_failed`
        })(req, reply);
      } catch (err) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
        return reply.redirect(`${frontendUrl}/#/login?error=oauth_error`);
      }
    },
    handler: authController.googleAuthCallback
  });
}

module.exports = authRoutes;
