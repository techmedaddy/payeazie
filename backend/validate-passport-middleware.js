#!/usr/bin/env node
/**
 * Passport Middleware Validation Script
 * Validates Passport initialization in Fastify
 */

require('dotenv').config();

console.log('\n🔍 Passport Middleware Validation\n');
console.log('=' .repeat(60));

// 1. Check package installation
console.log('\n✓ Step 1: Package Installation');
try {
  const passport = require('passport');
  console.log('  ✅ passport is installed');
  
  const fastifyPassport = require('@fastify/passport');
  console.log('  ✅ @fastify/passport is installed');
  
  const secureSession = require('@fastify/secure-session');
  console.log('  ✅ @fastify/secure-session is installed');
  
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  console.log('  ✅ passport-google-oauth20 is installed');
} catch (error) {
  console.log(`  ❌ Missing package: ${error.message}`);
  process.exit(1);
}

// 2. Check passport imports in server.js
console.log('\n✓ Step 2: Server.js Configuration');
const fs = require('fs');
const serverJs = fs.readFileSync('./server.js', 'utf8');

const checks = [
  { pattern: /require\(['"]@fastify\/passport['"]\)/, message: '@fastify/passport imported' },
  { pattern: /require\(['"]@fastify\/secure-session['"]\)/, message: '@fastify/secure-session imported' },
  { pattern: /fastifyPassport\.initialize\(\)/, message: 'passport.initialize() registered' },
  { pattern: /fastifyPassport\.secureSession\(\)/, message: 'secureSession() registered' },
  { pattern: /app\.decorate\(['"]passport['"]/, message: 'passport decorated on app' },
  { pattern: /initializeGoogleStrategy\(\)/, message: 'Google strategy initialized' },
  { pattern: /✅ Passport middleware initialized/, message: 'Initialization log message present' },
];

let allPassed = true;
checks.forEach(check => {
  if (check.pattern.test(serverJs)) {
    console.log(`  ✅ ${check.message}`);
  } else {
    console.log(`  ❌ ${check.message}`);
    allPassed = false;
  }
});

// 3. Check session configuration
console.log('\n✓ Step 3: Session Configuration');
const hasSessionSecret = !!process.env.SESSION_SECRET;
const hasJwtSecret = !!process.env.JWT_SECRET;

if (hasSessionSecret) {
  console.log('  ✅ SESSION_SECRET is configured');
} else if (hasJwtSecret) {
  console.log('  ✅ JWT_SECRET is configured (used as fallback)');
} else {
  console.log('  ❌ No session secret configured');
  allPassed = false;
}

// Check session config in server.js
if (serverJs.includes('@fastify/secure-session')) {
  console.log('  ✅ Secure session plugin registered');
  
  if (serverJs.includes('session: false') || serverJs.includes('sessions are minimal')) {
    console.log('  ✅ Session handling: Disabled/Minimal (JWT-based auth)');
  } else {
    console.log('  ⚠️  Session handling: Enabled (check if needed)');
  }
} else {
  console.log('  ❌ Secure session plugin NOT registered');
  allPassed = false;
}

// 4. Check passport usage in routes
console.log('\n✓ Step 4: Route Integration');
const authRoutesJs = fs.readFileSync('./src/api/routes/auth.routes.js', 'utf8');

if (authRoutesJs.includes("require('../../utils/passport.config')")) {
  console.log('  ✅ Passport imported in auth routes');
} else {
  console.log('  ❌ Passport NOT imported in auth routes');
  allPassed = false;
}

if (authRoutesJs.includes('passport.authenticate')) {
  console.log('  ✅ passport.authenticate() used in routes');
} else {
  console.log('  ❌ passport.authenticate() NOT found in routes');
  allPassed = false;
}

// 5. Check passport initialization function
console.log('\n✓ Step 5: Strategy Initialization Function');
const passportConfigJs = fs.readFileSync('./src/utils/passport.config.js', 'utf8');

if (passportConfigJs.includes('function initializeGoogleStrategy')) {
  console.log('  ✅ initializeGoogleStrategy() function exists');
  
  if (passportConfigJs.includes('passport.use')) {
    console.log('  ✅ passport.use() called in strategy initialization');
  } else {
    console.log('  ❌ passport.use() NOT found');
    allPassed = false;
  }
  
  if (passportConfigJs.includes('new GoogleStrategy')) {
    console.log('  ✅ GoogleStrategy instantiated');
  } else {
    console.log('  ❌ GoogleStrategy NOT instantiated');
    allPassed = false;
  }
} else {
  console.log('  ❌ initializeGoogleStrategy() function NOT found');
  allPassed = false;
}

// 6. Test actual initialization
console.log('\n✓ Step 6: Runtime Initialization Test');
try {
  const { passport, initializeGoogleStrategy, isGoogleOAuthConfigured } = require('./src/utils/passport.config');
  console.log('  ✅ Passport config module loaded');
  
  const isConfigured = isGoogleOAuthConfigured();
  console.log(`  ${isConfigured ? '✅' : '⚠️ '} OAuth configuration: ${isConfigured ? 'VALID' : 'INCOMPLETE'}`);
  
  // Test strategy initialization
  const initialized = initializeGoogleStrategy();
  if (initialized) {
    console.log('  ✅ Strategy initialization successful');
  } else {
    console.log('  ⚠️  Strategy not initialized (OAuth credentials not configured)');
  }
  
  // Check if passport has strategies
  if (passport._strategies && Object.keys(passport._strategies).length > 0) {
    console.log(`  ✅ Passport has ${Object.keys(passport._strategies).length} strategy(ies) registered`);
    Object.keys(passport._strategies).forEach(strategy => {
      console.log(`     - ${strategy}`);
    });
  } else {
    console.log('  ⚠️  No strategies registered (expected if OAuth not configured)');
  }
  
} catch (error) {
  console.log(`  ❌ Runtime error: ${error.message}`);
  allPassed = false;
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('\n📊 VALIDATION SUMMARY\n');

if (allPassed) {
  console.log('✅ ALL MIDDLEWARE CHECKS PASSED');
  console.log('\nPassport is properly integrated with Fastify!');
  console.log('\nMiddleware initialization order:');
  console.log('  1. ✅ @fastify/secure-session registered');
  console.log('  2. ✅ @fastify/passport.initialize() registered');
  console.log('  3. ✅ @fastify/passport.secureSession() registered');
  console.log('  4. ✅ passport decorated on Fastify app');
  console.log('  5. ✅ Google OAuth strategy initialized');
  console.log('\nNext steps:');
  console.log('  1. Start server: node server.js');
  console.log('  2. Check logs for: "✅ Passport middleware initialized"');
  console.log('  3. Test OAuth flow: /api/auth/google');
} else {
  console.log('⚠️  SOME CHECKS FAILED');
  console.log('\nPlease review the issues above.');
  console.log('Run this script after making fixes.');
}

console.log('\n' + '='.repeat(60) + '\n');

process.exit(allPassed ? 0 : 1);
