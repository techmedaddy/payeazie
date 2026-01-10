#!/usr/bin/env node
/**
 * Google OAuth End-to-End Test Script
 * Tests the complete OAuth flow from frontend to backend and back
 */

require('dotenv').config();
const fs = require('fs');

console.log('\n🧪 Google OAuth End-to-End Test\n');
console.log('=' .repeat(60));

// Test Configuration
const BACKEND_URL = process.env.APP_URL || 'http://localhost:3467';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;

console.log('\n📋 Configuration:');
console.log(`   Backend URL: ${BACKEND_URL}`);
console.log(`   Frontend URL: ${FRONTEND_URL}`);
console.log(`   OAuth Client ID: ${GOOGLE_CLIENT_ID ? '✅ SET' : '❌ MISSING'}`);
console.log(`   OAuth Secret: ${GOOGLE_CLIENT_SECRET && GOOGLE_CLIENT_SECRET !== 'YOUR_GOOGLE_CLIENT_SECRET_HERE' ? '✅ SET' : '❌ MISSING'}`);
console.log(`   Callback URL: ${GOOGLE_CALLBACK_URL}`);

// Test checklist
const tests = {
  config: false,
  frontend: false,
  backend: false,
  routes: false,
  logging: false,
  tokenStorage: false,
  apiAuth: false,
};

console.log('\n' + '='.repeat(60));
console.log('\n🧪 Phase 1: Configuration Validation\n');

// 1. Validate configuration
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CLIENT_SECRET !== 'YOUR_GOOGLE_CLIENT_SECRET_HERE') {
  console.log('✅ OAuth credentials configured');
  tests.config = true;
} else {
  console.log('❌ OAuth credentials missing or invalid');
}

// 2. Check frontend files
console.log('\n🧪 Phase 2: Frontend Components Check\n');

const frontendFiles = [
  'frontend/pages/Login.tsx',
  'frontend/pages/GoogleCallback.tsx',
  'frontend/hooks/useAuth.ts',
  'frontend/services/api.ts',
];

let allFrontendFilesExist = true;
frontendFiles.forEach(file => {
  const path = `../${file}`;
  if (fs.existsSync(path)) {
    console.log(`✅ ${file} exists`);
  } else {
    console.log(`❌ ${file} missing`);
    allFrontendFilesExist = false;
  }
});

if (allFrontendFilesExist) {
  // Check for logging in GoogleCallback
  const callbackFile = fs.readFileSync('../frontend/pages/GoogleCallback.tsx', 'utf8');
  if (callbackFile.includes('Callback received') && 
      callbackFile.includes('Token stored')) {
    console.log('✅ GoogleCallback has detailed logging');
  } else {
    console.log('⚠️  GoogleCallback missing detailed logging');
  }
  
  // Check for OAuth button in Login
  const loginFile = fs.readFileSync('../frontend/pages/Login.tsx', 'utf8');
  if (loginFile.includes('handleGoogleLogin') && 
      loginFile.includes('/api/auth/google')) {
    console.log('✅ Login page has Google OAuth button');
    tests.frontend = true;
  } else {
    console.log('❌ Login page missing Google OAuth button');
  }
}

// 3. Check backend routes
console.log('\n🧪 Phase 3: Backend Routes Check\n');

const authRoutesFile = fs.readFileSync('./src/api/routes/auth.routes.js', 'utf8');
const authControllerFile = fs.readFileSync('./src/api/controllers/auth.controller.js', 'utf8');

if (authRoutesFile.includes("fastify.get('/google'")) {
  console.log('✅ GET /api/auth/google route defined');
} else {
  console.log('❌ GET /api/auth/google route missing');
}

if (authRoutesFile.includes("fastify.get('/google/callback'")) {
  console.log('✅ GET /api/auth/google/callback route defined');
} else {
  console.log('❌ GET /api/auth/google/callback route missing');
}

if (authControllerFile.includes('generateToken') && 
    authControllerFile.includes('googleAuthCallback')) {
  console.log('✅ JWT generation in OAuth callback');
  tests.backend = true;
} else {
  console.log('❌ JWT generation missing');
}

// Check redirect URL
if (authControllerFile.includes(`${FRONTEND_URL}/#/auth/google/callback?token=`)) {
  console.log(`✅ Correct redirect URL: ${FRONTEND_URL}/#/auth/google/callback?token=...`);
  tests.routes = true;
} else {
  console.log(`⚠️  Redirect URL might be incorrect`);
}

// 4. Check logging
console.log('\n🧪 Phase 4: Logging Validation\n');

const checks = [
  { file: authRoutesFile, pattern: 'Initiating Google OAuth flow', message: '✅ OAuth initiation logging' },
  { file: authControllerFile, pattern: 'JWT issued', message: '✅ JWT issuance logging' },
  { file: authControllerFile, pattern: 'Redirect complete', message: '✅ Redirect completion logging' },
];

let allLoggingPresent = true;
checks.forEach(check => {
  if (check.file.includes(check.pattern)) {
    console.log(check.message);
  } else {
    console.log(check.message.replace('✅', '⚠️ '));
    allLoggingPresent = false;
  }
});

tests.logging = allLoggingPresent;

// 5. Check token storage
console.log('\n🧪 Phase 5: Token Storage Mechanism\n');

const apiFile = fs.readFileSync('../frontend/services/api.ts', 'utf8');

if (apiFile.includes('setAuthToken') && 
    apiFile.includes("localStorage.setItem('authToken'")) {
  console.log('✅ setAuthToken stores token in localStorage');
  tests.tokenStorage = true;
} else {
  console.log('❌ Token storage not configured');
}

if (apiFile.includes('getAuthToken') && 
    apiFile.includes("localStorage.getItem('authToken'")) {
  console.log('✅ getAuthToken retrieves token from localStorage');
} else {
  console.log('❌ Token retrieval not configured');
}

if (apiFile.includes('Authorization') && 
    apiFile.includes('Bearer')) {
  console.log('✅ Bearer token attached to API requests');
  tests.apiAuth = true;
} else {
  console.log('❌ Authorization header not configured');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('\n📊 TEST SUMMARY\n');

const passed = Object.values(tests).filter(Boolean).length;
const total = Object.keys(tests).length;

console.log(`Tests Passed: ${passed}/${total}\n`);

Object.entries(tests).forEach(([name, result]) => {
  const label = name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1');
  console.log(`${result ? '✅' : '❌'} ${label}`);
});

console.log('\n' + '='.repeat(60));
console.log('\n🔄 OAUTH FLOW (Manual Test Instructions)\n');

console.log('Step 1: Start Backend Server');
console.log('   cd backend && node server.js');
console.log('   Expected: "✅ Passport middleware initialized"');
console.log('   Expected: "✅ Google login route wired"');
console.log('');

console.log('Step 2: Start Frontend Server');
console.log('   cd frontend && npm run dev');
console.log('   Open: http://localhost:3002/#/login');
console.log('');

console.log('Step 3: Click "Sign in with Google"');
console.log('   ✅ Expected Console Log: "🔵 Initiating Google OAuth flow"');
console.log('   ✅ Expected: Redirect to http://localhost:3467/api/auth/google');
console.log('   Backend Log: "✅ Initiating Google OAuth flow - redirecting to Google login"');
console.log('');

console.log('Step 4: Google Login Page');
console.log('   ✅ Expected: Google login page appears');
console.log('   ✅ Expected: Shows your Google account options');
console.log('   Action: Select account and authenticate');
console.log('');

console.log('Step 5: OAuth Callback');
console.log(`   ✅ Expected: Redirect to ${GOOGLE_CALLBACK_URL}`);
console.log('   Backend Logs:');
console.log('      INFO: Google OAuth callback received');
console.log('      INFO: ✅ JWT issued for Google OAuth user');
console.log('      INFO: ✅ Redirect complete: OAuth callback to frontend');
console.log('');

console.log('Step 6: Frontend Callback Handler');
console.log(`   ✅ Expected: Redirect to ${FRONTEND_URL}/#/auth/google/callback?token=<JWT>`);
console.log('   Frontend Console Logs:');
console.log('      ✅ Callback received from Google OAuth');
console.log('      ✅ JWT received from backend');
console.log('      ✅ Token stored in localStorage');
console.log('      ✅ User profile refreshed');
console.log('      ✅ Navigating to dashboard');
console.log('');

console.log('Step 7: Authenticated API Call');
console.log('   ✅ Expected: GET /api/auth/me with Bearer token');
console.log('   Frontend Console Logs:');
console.log('      🔵 Making authenticated API call to /api/auth/me');
console.log('      ✅ Authenticated API call succeeded');
console.log('   Backend Log: User authenticated and profile returned');
console.log('');

console.log('Step 8: Dashboard');
console.log(`   ✅ Expected: Redirect to ${FRONTEND_URL}/#/dashboard`);
console.log('   ✅ Expected: User name displayed in topbar');
console.log('   ✅ Expected: Protected content visible');
console.log('');

console.log('='.repeat(60));
console.log('\n🐛 Troubleshooting\n');

console.log('If Step 3 fails:');
console.log('   - Check backend is running on port 3467');
console.log('   - Check GOOGLE_CLIENT_SECRET in backend/.env');
console.log('   - Check browser console for errors');
console.log('');

console.log('If Step 4 fails (Google page doesn\'t appear):');
console.log('   - Verify Google OAuth credentials in .env');
console.log('   - Check Google Cloud Console authorized redirect URI');
console.log('   - Must be: ' + GOOGLE_CALLBACK_URL);
console.log('');

console.log('If Step 5 fails:');
console.log('   - Check backend logs for Passport errors');
console.log('   - Verify database connection (users table)');
console.log('   - Check JWT_SECRET is configured');
console.log('');

console.log('If Step 6-7 fails:');
console.log('   - Check frontend console for token storage');
console.log('   - Verify token is in localStorage (DevTools → Application)');
console.log('   - Check Authorization header in Network tab');
console.log('');

console.log('='.repeat(60));
console.log('\n✅ Test script completed\n');

if (passed === total) {
  console.log('🎉 All automated checks passed! Ready for manual OAuth test.');
  process.exit(0);
} else {
  console.log('⚠️  Some checks failed. Review above for details.');
  process.exit(1);
}
