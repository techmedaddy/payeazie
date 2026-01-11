#!/usr/bin/env node

/**
 * Phase 1: Manual Login Test
 * Tests basic email/password authentication
 */

const http = require('http');

const API_BASE = 'http://127.0.0.1:3467';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ 
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runPhase1() {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  try {
    console.log('\n' + '='.repeat(70));
    console.log('📋 PHASE 1: MANUAL LOGIN AUTHENTICATION');
    console.log('='.repeat(70) + '\n');

    const testEmail = 'testuser@payeazie.com';
    const testPassword = 'Test@1234';
    const wrongPassword = 'WrongPassword123';

    // Test 1: Login with correct credentials
    console.log('🔍 Test 1.1: Login with correct credentials');
    try {
      const loginResponse = await makeRequest(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPassword })
      });

      console.log(`   Status: ${loginResponse.statusCode}`);
      const loginData = JSON.parse(loginResponse.body);
      
      if (loginResponse.statusCode === 200 && loginData.data?.token) {
        console.log('   ✅ PASS: Login successful');
        console.log(`   Token: ${loginData.data.token.substring(0, 20)}...`);
        passed++;
      } else if (loginResponse.statusCode === 429) {
        console.log('   ⊘ SKIP: Rate limit hit');
        skipped++;
      } else {
        console.log(`   ❌ FAIL: Expected 200 with token, got ${loginResponse.statusCode}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: ${error.message}`);
      failed++;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Login with wrong password
    console.log('\n🔍 Test 1.2: Login with incorrect password');
    try {
      const wrongLoginResponse = await makeRequest(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: wrongPassword })
      });

      console.log(`   Status: ${wrongLoginResponse.statusCode}`);
      
      if (wrongLoginResponse.statusCode === 401) {
        console.log('   ✅ PASS: Wrong password correctly rejected');
        passed++;
      } else if (wrongLoginResponse.statusCode === 429) {
        console.log('   ⊘ SKIP: Rate limit hit');
        skipped++;
      } else {
        console.log(`   ❌ FAIL: Expected 401, got ${wrongLoginResponse.statusCode}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: ${error.message}`);
      failed++;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Login with non-existent email
    console.log('\n🔍 Test 1.3: Login with non-existent email');
    try {
      const noUserResponse = await makeRequest(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@example.com', password: testPassword })
      });

      console.log(`   Status: ${noUserResponse.statusCode}`);
      
      if (noUserResponse.statusCode === 401) {
        console.log('   ✅ PASS: Non-existent user correctly rejected');
        passed++;
      } else if (noUserResponse.statusCode === 429) {
        console.log('   ⊘ SKIP: Rate limit hit');
        skipped++;
      } else {
        console.log(`   ❌ FAIL: Expected 401, got ${noUserResponse.statusCode}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: ${error.message}`);
      failed++;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 4: Login with missing fields
    console.log('\n🔍 Test 1.4: Login with missing fields');
    try {
      const missingFieldsResponse = await makeRequest(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail })
      });

      console.log(`   Status: ${missingFieldsResponse.statusCode}`);
      
      if (missingFieldsResponse.statusCode === 400) {
        console.log('   ✅ PASS: Missing fields validation working');
        passed++;
      } else if (missingFieldsResponse.statusCode === 429) {
        console.log('   ⊘ SKIP: Rate limit hit');
        skipped++;
      } else {
        console.log(`   ❌ FAIL: Expected 400, got ${missingFieldsResponse.statusCode}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: ${error.message}`);
      failed++;
    }

    console.log('\n' + '='.repeat(70));
    console.log(`📊 PHASE 1 RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    if (failed === 0) {
      console.log('✅ PHASE 1: COMPLETED SUCCESSFULLY');
    } else {
      console.log('❌ PHASE 1: COMPLETED WITH FAILURES');
    }
    console.log('='.repeat(70) + '\n');

    return { passed, failed, skipped, total: passed + failed + skipped };

  } catch (error) {
    console.error('\n❌ PHASE 1: CRITICAL ERROR');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return { passed, failed: failed + 1, skipped, total: passed + failed + skipped + 1, error: error.message };
  }
}

// Run if called directly
if (require.main === module) {
  runPhase1().then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  });
}

module.exports = runPhase1;
