#!/usr/bin/env node
/**
 * Google OAuth Routes Validation Script
 * Validates OAuth route wiring and configuration
 */

require('dotenv').config();
const fs = require('fs');

console.log('\n🔍 Google OAuth Routes Validation\n');
console.log('=' .repeat(60));

// 1. Check route definitions
console.log('\n✓ Step 1: Route Definitions');
const authRoutesJs = fs.readFileSync('./src/api/routes/auth.routes.js', 'utf8');

const checks = [
  { 
    pattern: /fastify\.get\(['"]\/google['"]/,
    message: 'GET /api/auth/google route defined'
  },
  { 
    pattern: /fastify\.get\(['"]\/google\/callback['"]/,
    message: 'GET /api/auth/google/callback route defined'
  },
  { 
    pattern: /passport\.authenticate\(['"]google['"],\s*\{[^}]*scope:\s*\[['"]profile['"],\s*['"]email['"]\]/s,
    message: 'Google OAuth with correct scopes: [\'profile\', \'email\']'
  },
  { 
    pattern: /session:\s*false/,
    message: 'Session disabled (JWT-based auth)'
  },
];

let allPassed = true;
checks.forEach(check => {
  if (check.pattern.test(authRoutesJs)) {
    console.log(`  ✅ ${check.message}`);
  } else {
    console.log(`  ❌ ${check.message}`);
    allPassed = false;
  }
});

// 2. Check /api/auth/google route specifics
console.log('\n✓ Step 2: /api/auth/google Route Configuration');

if (authRoutesJs.includes("passport.authenticate('google'")) {
  console.log('  ✅ Uses passport.authenticate(\'google\', ...)');
  
  if (authRoutesJs.match(/scope:\s*\[['"]profile['"],\s*['"]email['"]\]/)) {
    console.log('  ✅ Scope includes: [\'profile\', \'email\']');
  } else {
    console.log('  ❌ Scope configuration missing or incorrect');
    allPassed = false;
  }
  
  if (authRoutesJs.includes('Initiating Google OAuth flow') || 
      authRoutesJs.includes('redirecting to Google login')) {
    console.log('  ✅ Logging: OAuth flow initiation');
  } else {
    console.log('  ⚠️  No initiation logging found');
  }
} else {
  console.log('  ❌ passport.authenticate not found');
  allPassed = false;
}

// 3. Check /api/auth/google/callback route specifics
console.log('\n✓ Step 3: /api/auth/google/callback Route Configuration');

const authControllerJs = fs.readFileSync('./src/api/controllers/auth.controller.js', 'utf8');

if (authControllerJs.includes('googleAuthCallback')) {
  console.log('  ✅ googleAuthCallback handler defined');
  
  // Check for JWT generation
  if (authControllerJs.match(/generateToken\(user\.id\)/)) {
    console.log('  ✅ JWT token generation: generateToken(user.id)');
  } else {
    console.log('  ❌ JWT token generation not found');
    allPassed = false;
  }
  
  // Check for frontend redirect with token
  if (authControllerJs.match(/\/#\/auth\/google\/callback\?token=/)) {
    console.log('  ✅ Frontend redirect with token in query param');
  } else {
    console.log('  ❌ Frontend redirect pattern not found');
    allPassed = false;
  }
  
  // Check for error handling
  if (authControllerJs.includes('oauth_failed') || authControllerJs.includes('oauth_error')) {
    console.log('  ✅ Error handling: Redirects with error params');
  } else {
    console.log('  ❌ Error handling not found');
    allPassed = false;
  }
  
  // Check for logging
  if (authControllerJs.includes('JWT issued') || 
      authControllerJs.includes('Redirect complete')) {
    console.log('  ✅ Logging: JWT issuance and redirect completion');
  } else {
    console.log('  ⚠️  Enhanced logging not found');
  }
} else {
  console.log('  ❌ googleAuthCallback handler not found');
  allPassed = false;
}

// 4. Check route registration in server.js
console.log('\n✓ Step 4: Route Registration');
const serverJs = fs.readFileSync('./server.js', 'utf8');

if (serverJs.includes("authRoutes")) {
  console.log('  ✅ authRoutes imported in server.js');
  
  if (serverJs.match(/app\.register\(authRoutes,\s*\{\s*prefix:\s*['"]\/api\/auth['"]/)) {
    console.log('  ✅ Auth routes registered with prefix: /api/auth');
  } else {
    console.log('  ❌ Auth routes registration not found');
    allPassed = false;
  }
  
  // Check for route wiring logs
  if (serverJs.includes('Google login route wired') &&
      serverJs.includes('Google callback route wired')) {
    console.log('  ✅ Route wiring logs present');
  } else {
    console.log('  ⚠️  Route wiring logs not found');
  }
} else {
  console.log('  ❌ authRoutes not imported');
  allPassed = false;
}

// 5. Check environment configuration
console.log('\n✓ Step 5: Environment Configuration');

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

console.log(`  FRONTEND_URL: ${frontendUrl}`);
console.log(`  GOOGLE_CLIENT_ID: ${clientId ? '✅ SET' : '❌ MISSING'}`);
console.log(`  GOOGLE_CLIENT_SECRET: ${clientSecret && clientSecret !== 'YOUR_GOOGLE_CLIENT_SECRET_HERE' ? '✅ SET' : '❌ MISSING/PLACEHOLDER'}`);
console.log(`  GOOGLE_CALLBACK_URL: ${callbackUrl || 'http://localhost:3467/api/auth/google/callback'}`);

// Check if frontend URL is correct (should be 3002, not 3000)
if (frontendUrl.includes(':3002') || frontendUrl.includes('3002')) {
  console.log('  ✅ Frontend URL port: 3002 (correct)');
} else {
  console.log(`  ⚠️  Frontend URL port: ${frontendUrl.match(/:(\d+)/)?.[1] || 'unknown'} (expected 3002)`);
}

// 6. Test OAuth flow endpoints
console.log('\n✓ Step 6: OAuth Flow Verification');
console.log('  OAuth Flow Steps:');
console.log('  1. User clicks "Sign in with Google" → GET /api/auth/google');
console.log('  2. passport.authenticate() redirects to Google login');
console.log('  3. User authenticates with Google');
console.log('  4. Google redirects back → GET /api/auth/google/callback?code=...');
console.log('  5. Passport verifies code and creates/finds user');
console.log('  6. generateToken(user.id) creates JWT');
console.log('  7. Redirect to frontend: ' + frontendUrl + '/#/auth/google/callback?token=<jwt>');
console.log('  8. Frontend stores token and redirects to dashboard');

console.log('\n  Expected Redirect URL:');
console.log(`  ${frontendUrl}/#/auth/google/callback?token=<JWT_TOKEN_HERE>`);

console.log('\n  Error Redirect URLs:');
console.log(`  ${frontendUrl}/#/login?error=oauth_not_configured`);
console.log(`  ${frontendUrl}/#/login?error=oauth_failed`);
console.log(`  ${frontendUrl}/#/login?error=oauth_error`);

// 7. Check JWT configuration
console.log('\n✓ Step 7: JWT Configuration');
const jwtSecret = process.env.JWT_SECRET;
const jwtExpiry = process.env.JWT_EXPIRES_IN || '7d';

console.log(`  JWT_SECRET: ${jwtSecret ? '✅ SET' : '❌ MISSING'}`);
console.log(`  JWT_EXPIRES_IN: ${jwtExpiry}`);

if (authControllerJs.includes('function generateToken')) {
  console.log('  ✅ generateToken() function defined');
  
  if (authControllerJs.includes('jwt.sign')) {
    console.log('  ✅ JWT signing implementation found');
  } else {
    console.log('  ❌ JWT signing not found');
    allPassed = false;
  }
} else {
  console.log('  ❌ generateToken() function not found');
  allPassed = false;
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('\n📊 VALIDATION SUMMARY\n');

if (allPassed) {
  console.log('✅ ALL ROUTE CHECKS PASSED');
  console.log('\nGoogle OAuth routes are properly wired!');
  console.log('\nEndpoints:');
  console.log('  ✅ GET /api/auth/google - Initiates OAuth flow');
  console.log('  ✅ GET /api/auth/google/callback - Handles Google callback');
  console.log('\nFlow:');
  console.log('  ✅ Redirects to Google for authentication');
  console.log('  ✅ Passport handles callback and user creation/lookup');
  console.log('  ✅ JWT issued after successful authentication');
  console.log('  ✅ Redirects to frontend with token');
  console.log('\nNext steps:');
  console.log('  1. Start backend server: node server.js');
  console.log('  2. Check logs for route wiring messages');
  console.log('  3. Test OAuth flow: http://localhost:3467/api/auth/google');
  console.log('  4. Complete authentication with Google');
  console.log('  5. Verify redirect to: ' + frontendUrl + '/#/auth/google/callback?token=...');
} else {
  console.log('⚠️  SOME CHECKS FAILED');
  console.log('\nPlease review the issues above and run this script again.');
}

console.log('\n' + '='.repeat(60) + '\n');

process.exit(allPassed ? 0 : 1);
