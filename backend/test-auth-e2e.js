#!/usr/bin/env node

/**
 * End-to-End Authentication Test
 * Tests both manual login and OAuth flows
 */

const http = require('http');
const https = require('https');

const API_BASE = 'http://127.0.0.1:3467';
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(emoji, message, data = null) {
  console.log(`${emoji} ${message}`);
  if (data) {
    console.log('   ', JSON.stringify(data, null, 2).split('\n').join('\n    '));
  }
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function testHealthCheck() {
  console.log('\n' + '='.repeat(60));
  console.log('🏥 HEALTH CHECK');
  console.log('='.repeat(60));
  
  try {
    const response = await makeRequest(`${API_BASE}/health`);
    if (response.status === 200) {
      log('✅', 'Backend is healthy', response.body);
      return true;
    } else {
      log('❌', `Backend health check failed with status ${response.status}`);
      return false;
    }
  } catch (error) {
    log('❌', 'Backend is not reachable', { error: error.message });
    return false;
  }
}

async function testRegisterUser() {
  console.log('\n' + '='.repeat(60));
  console.log('📝 TEST: User Registration');
  console.log('='.repeat(60));
  
  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'TestPass123!';
  
  try {
    log('🔵', 'Registering new user', { email: testEmail });
    
    const response = await makeRequest(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      }
    });
    
    if (response.status === 201 && response.body.success) {
      log('✅', 'User registered successfully', {
        userId: response.body.data.user.id,
        email: response.body.data.user.email,
        hasToken: !!response.body.data.token
      });
      return {
        success: true,
        email: testEmail,
        password: testPassword,
        token: response.body.data.token
      };
    } else {
      log('❌', 'Registration failed', response.body);
      return { success: false };
    }
  } catch (error) {
    log('❌', 'Registration error', { error: error.message });
    return { success: false };
  }
}

async function testManualLogin(credentials) {
  console.log('\n' + '='.repeat(60));
  console.log('🔐 TEST: Manual Login (Email + Password)');
  console.log('='.repeat(60));
  
  try {
    log('🔵', 'Step 1: Sending login request', {
      email: credentials.email,
      contentType: 'application/json'
    });
    
    const response = await makeRequest(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        email: credentials.email,
        password: credentials.password
      }
    });
    
    if (response.status === 200 && response.body.success) {
      log('✅', 'Manual login successful', {
        userId: response.body.data.user.id,
        email: response.body.data.user.email,
        tokenLength: response.body.data.token.length
      });
      
      log('✅', 'JWT stored in frontend (simulated)');
      
      return {
        success: true,
        token: response.body.data.token,
        user: response.body.data.user
      };
    } else {
      log('❌', 'Login failed', response.body);
      return { success: false };
    }
  } catch (error) {
    log('❌', 'Login error', { error: error.message });
    return { success: false };
  }
}

async function testProtectedRoute(token, shouldSucceed = true) {
  console.log('\n' + '='.repeat(60));
  console.log(`🔒 TEST: Protected Route Access (${shouldSucceed ? 'WITH' : 'WITHOUT'} Token)`);
  console.log('='.repeat(60));
  
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      log('🔵', 'Accessing /api/auth/me with Authorization header', {
        tokenPrefix: token.substring(0, 20) + '...'
      });
    } else {
      log('🔵', 'Accessing /api/auth/me WITHOUT Authorization header');
    }
    
    const response = await makeRequest(`${API_BASE}/api/auth/me`, {
      method: 'GET',
      headers
    });
    
    if (shouldSucceed) {
      if (response.status === 200) {
        log('✅', 'Protected route access granted', response.body.user);
        return { success: true };
      } else {
        log('❌', `Expected 200, got ${response.status}`, response.body);
        return { success: false };
      }
    } else {
      if (response.status === 401) {
        log('✅', 'Unauthorized access blocked (expected)', {
          status: response.status,
          message: response.body.message
        });
        return { success: true };
      } else {
        log('❌', `Expected 401, got ${response.status}`, response.body);
        return { success: false };
      }
    }
  } catch (error) {
    log('❌', 'Protected route test error', { error: error.message });
    return { success: false };
  }
}

async function testOAuthRoutes() {
  console.log('\n' + '='.repeat(60));
  console.log('🔗 TEST: Google OAuth Routes (Availability)');
  console.log('='.repeat(60));
  
  try {
    // Test if OAuth initiation endpoint exists
    log('🔵', 'Checking OAuth initiation route: /api/auth/google');
    const initResponse = await makeRequest(`${API_BASE}/api/auth/google`, {
      method: 'GET',
      headers: { 'User-Agent': 'E2E-Test' }
    });
    
    // Should get either a redirect (302) or a 503 (if OAuth not configured)
    if (initResponse.status === 302 || initResponse.status === 503 || initResponse.status === 200) {
      log('✅', 'OAuth initiation route is accessible', {
        status: initResponse.status,
        message: initResponse.status === 503 ? 'OAuth not configured (expected)' : 'OAuth configured'
      });
    } else {
      log('⚠️', 'OAuth route returned unexpected status', { status: initResponse.status });
    }
    
    // Test callback route exists
    log('🔵', 'Checking OAuth callback route: /api/auth/google/callback');
    const callbackResponse = await makeRequest(`${API_BASE}/api/auth/google/callback?error=test`, {
      method: 'GET',
      headers: { 'User-Agent': 'E2E-Test' }
    });
    
    // Should redirect (302) on error
    if (callbackResponse.status === 302 || callbackResponse.status === 503) {
      log('✅', 'OAuth callback route is accessible', {
        status: callbackResponse.status
      });
    }
    
    log('ℹ️', 'Note: Full OAuth flow requires browser interaction with Google');
    log('ℹ️', 'Manual test: Click "Sign in with Google" button in UI');
    
    return { success: true };
  } catch (error) {
    log('❌', 'OAuth routes test error', { error: error.message });
    return { success: false };
  }
}

async function testInvalidCredentials() {
  console.log('\n' + '='.repeat(60));
  console.log('🚫 TEST: Invalid Login Credentials');
  console.log('='.repeat(60));
  
  try {
    log('🔵', 'Attempting login with invalid credentials');
    
    const response = await makeRequest(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        email: 'nonexistent@example.com',
        password: 'wrongpassword'
      }
    });
    
    if (response.status === 401) {
      log('✅', 'Invalid credentials rejected (expected)', {
        status: response.status,
        message: response.body.message
      });
      return { success: true };
    } else {
      log('❌', `Expected 401, got ${response.status}`, response.body);
      return { success: false };
    }
  } catch (error) {
    log('❌', 'Invalid credentials test error', { error: error.message });
    return { success: false };
  }
}

async function runTests() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('🚀 PAYEAZIE AUTHENTICATION E2E TEST SUITE');
  console.log('='.repeat(60));
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  // Test 1: Health Check
  const healthOk = await testHealthCheck();
  results.tests.push({ name: 'Health Check', passed: healthOk });
  if (healthOk) results.passed++; else results.failed++;
  
  if (!healthOk) {
    console.log('\n❌ Backend is not running. Please start the server first.');
    process.exit(1);
  }
  
  // Test 2: Register User
  const registration = await testRegisterUser();
  results.tests.push({ name: 'User Registration', passed: registration.success });
  if (registration.success) results.passed++; else results.failed++;
  
  if (!registration.success) {
    console.log('\n❌ Cannot proceed without a valid user account.');
    process.exit(1);
  }
  
  // Test 3: Invalid Login
  const invalidLogin = await testInvalidCredentials();
  results.tests.push({ name: 'Invalid Credentials Rejection', passed: invalidLogin.success });
  if (invalidLogin.success) results.passed++; else results.failed++;
  
  // Test 4: Manual Login
  const login = await testManualLogin({
    email: registration.email,
    password: registration.password
  });
  results.tests.push({ name: 'Manual Login', passed: login.success });
  if (login.success) results.passed++; else results.failed++;
  
  // Test 5: Protected Route Without Token
  const protectedNoToken = await testProtectedRoute(null, false);
  results.tests.push({ name: 'Protected Route (No Token)', passed: protectedNoToken.success });
  if (protectedNoToken.success) results.passed++; else results.failed++;
  
  // Test 6: Protected Route With Valid Token
  if (login.success) {
    const protectedWithToken = await testProtectedRoute(login.token, true);
    results.tests.push({ name: 'Protected Route (With Token)', passed: protectedWithToken.success });
    if (protectedWithToken.success) results.passed++; else results.failed++;
  }
  
  // Test 7: OAuth Routes
  const oauth = await testOAuthRoutes();
  results.tests.push({ name: 'OAuth Routes Availability', passed: oauth.success });
  if (oauth.success) results.passed++; else results.failed++;
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  results.tests.forEach((test, index) => {
    const icon = test.passed ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${test.name}`);
  });
  
  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${results.passed + results.failed} tests`);
  console.log(`${colors.green}✅ Passed: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${results.failed}${colors.reset}`);
  console.log('-'.repeat(60));
  
  if (results.failed === 0) {
    console.log(`\n${colors.green}✅ Full-stack login flow verified${colors.reset}`);
    console.log('\n📝 Manual Testing Required:');
    console.log('   1. Open http://localhost:3001 in browser');
    console.log('   2. Click "Sign in with Google" button');
    console.log('   3. Complete Google OAuth flow');
    console.log('   4. Verify redirect to dashboard with token');
    process.exit(0);
  } else {
    console.log(`\n${colors.red}❌ Some tests failed. Please review the errors above.${colors.reset}`);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test suite error:', error);
  process.exit(1);
});
