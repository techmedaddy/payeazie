const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const UserModel = require('../db/models/user.model');
const logger = require('./logger');

/**
 * Passport Configuration for OAuth
 * Handles Google OAuth 2.0 authentication
 */

/**
 * Serialize user for session storage
 * In our case, we use JWT, so this is minimal
 */
passport.serializeUser((user, done) => {
  done(null, user.id);
});

/**
 * Deserialize user from session
 */
passport.deserializeUser(async (id, done) => {
  try {
    const user = await UserModel.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

/**
 * Initialize Google OAuth Strategy
 */
function initializeGoogleStrategy() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3467/api/auth/google/callback';

  // Check for both existence and placeholder values
  if (!clientID || !clientSecret || 
      clientSecret === 'YOUR_GOOGLE_CLIENT_SECRET_HERE' || 
      clientSecret === 'YOUR_SECRET_HERE') {
    logger.warn('Google OAuth credentials not configured. Google login will be disabled.');
    return false;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        passReqToCallback: false,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName;

          if (!email) {
            logger.error({ googleId }, 'Google profile has no email');
            return done(new Error('No email provided by Google'), false);
          }

          logger.info({ googleId, email }, '✅ Google OAuth callback received');

          // Check if user exists with this Google ID
          let user = await UserModel.findByGoogleId(googleId);

          if (user) {
            logger.info({ userId: user.id, email }, '✅ Existing Google user found');
            return done(null, user);
          }

          // Check if user exists with this email (password-based account)
          user = await UserModel.findByEmail(email);

          if (user) {
            // Link Google ID to existing account
            logger.info({ userId: user.id, email }, '✅ Linking Google ID to existing account');
            
            // Update user with Google ID
            const updatedUser = await UserModel.update(user.id, { googleId });
            
            logger.info({ userId: updatedUser.id, email }, '✅ Google ID linked to existing account');
            return done(null, updatedUser);
          }

          // Create new user with Google account
          logger.info({ email, googleId }, '✅ Creating new user from Google account');
          
          const newUser = await UserModel.create({
            email,
            name,
            googleId,
            role: 'user',
          });

          logger.info({ userId: newUser.id, email }, '✅ New user created from Google account');
          return done(null, newUser);
        } catch (error) {
          logger.error({ error: error.message, profile: profile.id }, '❌ Google OAuth error');
          return done(error, false);
        }
      }
    )
  );

  logger.info({ callbackURL }, '✅ Google OAuth strategy initialized');
  return true;
}

/**
 * Check if Google OAuth is configured
 */
function isGoogleOAuthConfigured() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  // Check if both values exist and are not placeholders
  return !!(
    clientID && 
    clientSecret && 
    clientSecret !== 'YOUR_GOOGLE_CLIENT_SECRET_HERE' &&
    clientSecret !== 'YOUR_SECRET_HERE'
  );
}

module.exports = {
  passport,
  initializeGoogleStrategy,
  isGoogleOAuthConfigured,
};
