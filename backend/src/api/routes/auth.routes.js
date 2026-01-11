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
    logger.info('✅ Initiating Google OAuth flow');

    // Manually construct Google OAuth URL
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3467/api/auth/google/callback';
    const scope = 'profile email';
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(callbackURL)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `prompt=consent`;
    
    console.log('✅ Redirecting to Google OAuth:', authUrl.substring(0, 100) + '...');
    return reply.redirect(authUrl);
  });

  // GET /auth/google/callback - Google OAuth callback
  fastify.get('/google/callback', async (request, reply) => {
    try {
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

      // Get the authorization code
      const code = request.query.code;
      if (!code) {
        console.log('❌ No authorization code in callback');
        logger.error('Google OAuth callback missing authorization code');
        return reply.redirect(`${frontendUrl}/#/login?error=missing_code`);
      }

      console.log('✅ Authorization code received:', code.substring(0, 20) + '...');

      // Exchange code for tokens
      const axios = require('axios');
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3467/api/auth/google/callback';

      console.log('✅ Exchanging code for tokens...');
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackURL,
        grant_type: 'authorization_code'
      });

      const { access_token } = tokenResponse.data;
      console.log('✅ Access token received');

      // Get user profile from Google
      console.log('✅ Fetching user profile from Google...');
      const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` }
      });

      const profile = profileResponse.data;
      console.log('✅ Google profile received:', {
        id: profile.id,
        email: profile.email,
        name: profile.name
      });

      // Find or create user
      const UserModel = require('../../db/models/user.model');
      const googleId = profile.id;
      const email = profile.email;
      const name = profile.name;

      if (!email) {
        console.log('❌ No email in Google profile');
        logger.error({ googleId }, 'Google profile has no email');
        return reply.redirect(`${frontendUrl}/#/login?error=no_email`);
      }

      console.log('✅ Processing user with email:', email);

      // Check if user exists with this Google ID
      let user = await UserModel.findByGoogleId(googleId);

      if (user) {
        console.log('✅ Found existing user by Google ID:', user.id);
        logger.info({ userId: user.id, email }, '✅ Existing Google user found');
      } else {
        // Check if user exists with this email
        user = await UserModel.findByEmail(email);

        if (user) {
          console.log('✅ Found existing user by email, linking Google ID');
          logger.info({ userId: user.id, email }, '✅ Linking Google ID to existing account');
          user = await UserModel.update(user.id, { googleId });
          console.log('✅ Google ID linked to user:', user.id);
        } else {
          // Create new user
          console.log('✅ Creating new user from Google account');
          logger.info({ email, googleId }, '✅ Creating new user from Google account');
          
          user = await UserModel.create({
            email,
            name,
            googleId,
            role: 'user',
          });

          console.log('✅ New user created:', user.id);
          logger.info({ userId: user.id, email }, '✅ New user created from Google account');
        }
      }

      // Generate JWT token
      const { generateToken } = require('../controllers/auth.controller');
      const token = generateToken(user.id);
      console.log('✅ JWT issued:', token.substring(0, 20) + '...');
      logger.info({ userId: user.id, email: user.email }, '✅ JWT issued for Google OAuth user');

      // Redirect to frontend with token
      const redirectUrl = `${frontendUrl}/#/dashboard?token=${token}`;
      console.log('✅ Redirecting to:', redirectUrl.substring(0, 80) + '...');
      
      logger.info({ 
        userId: user.id, 
        email: user.email, 
        frontendUrl 
      }, '✅ Google OAuth callback completed');
      
      return reply.redirect(redirectUrl);
      
    } catch (error) {
      console.error('❌ Google OAuth callback error:', error);
      const logger = require('../../utils/logger');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      logger.error({ error: error.message, stack: error.stack }, '❌ Google OAuth callback error');
      return reply.redirect(`${frontendUrl}/#/login?error=oauth_error`);
    }
  });
}

module.exports = authRoutes;
