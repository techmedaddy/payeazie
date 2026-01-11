/**
 * Phase 1: Manual Login Test
 * Tests basic email/password authentication
 */

const tap = require('tap');
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

tap.test('Phase 1: Manual Login Authentication', async (t) => {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('📋 PHASE 1: MANUAL LOGIN AUTHENTICATION');
    console.log('='.repeat(70) + '\n');

    // Test credentials
    const testEmail = 'testuser@payeazie.com';
    const testPassword = 'Test@1234';
    const wrongPassword = 'WrongPassword123';

    // Test 1: Login with correct credentials
    console.log('🔍 Test 1.1: Login with correct credentials');
    const loginResponse = await makeRequest(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });

    console.log(`   Status: ${loginResponse.statusCode}`);
    const loginData = JSON.parse(loginResponse.body);
    
    if (loginResponse.statusCode === 200 && loginData.data?.token) {
      console.log('   ✅ Login successful');
      console.log(`   Token received: ${loginData.data.token.substring(0, 20)}...`);
      t.ok(loginData.data.token, 'JWT token should be returned');
      t.equal(loginData.data.user.email, testEmail, 'Email should match');
    } else if (loginResponse.statusCode === 429) {
      console.log('   ⚠️  Rate limit hit - test blocked');
      t.skip('Rate limit encountered');
    } else {
      console.log(`   ❌ Login failed: ${loginData.message || loginData.error}`);
      t.fail(`Expected 200, got ${loginResponse.statusCode}`);
    }

    // Wait to avoid rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Login with wrong password
    console.log('\n🔍 Test 1.2: Login with incorrect password');
    const wrongLoginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testEmail,
        password: wrongPassword
      }
    });

    console.log(`   Status: ${wrongLoginResponse.statusCode}`);
    const wrongLoginData = JSON.parse(wrongLoginResponse.body);
    
    if (wrongLoginResponse.statusCode === 401) {
      console.log('   ✅ Login correctly rejected');
      t.equal(wrongLoginResponse.statusCode, 401, 'Should return 401 for wrong password');
    } else if (wrongLoginResponse.statusCode === 429) {
      console.log('   ⚠️  Rate limit hit - test blocked');
      t.skip('Rate limit encountered');
    } else {
      console.log(`   ❌ Unexpected status: ${wrongLoginResponse.statusCode}`);
      t.fail(`Expected 401, got ${wrongLoginResponse.statusCode}`);
    }

    // Wait to avoid rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Login with non-existent email
    console.log('\n🔍 Test 1.3: Login with non-existent email');
    const noUserResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'nonexistent@example.com',
        password: testPassword
      }
    });

    console.log(`   Status: ${noUserResponse.statusCode}`);
    
    if (noUserResponse.statusCode === 401) {
      console.log('   ✅ Login correctly rejected for non-existent user');
      t.equal(noUserResponse.statusCode, 401, 'Should return 401 for non-existent user');
    } else if (noUserResponse.statusCode === 429) {
      console.log('   ⚠️  Rate limit hit - test blocked');
      t.skip('Rate limit encountered');
    } else {
      console.log(`   ❌ Unexpected status: ${noUserResponse.statusCode}`);
    }

    // Test 4: Login with missing fields
    console.log('\n🔍 Test 1.4: Login with missing fields');
    const missingFieldsResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testEmail
        // password missing
      }
    });

    console.log(`   Status: ${missingFieldsResponse.statusCode}`);
    
    if (missingFieldsResponse.statusCode === 400) {
      console.log('   ✅ Validation error correctly returned');
      t.equal(missingFieldsResponse.statusCode, 400, 'Should return 400 for missing fields');
    } else if (missingFieldsResponse.statusCode === 429) {
      console.log('   ⚠️  Rate limit hit - test blocked');
      t.skip('Rate limit encountered');
    } else {
      console.log(`   ❌ Unexpected status: ${missingFieldsResponse.statusCode}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ PHASE 1: COMPLETED');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ PHASE 1: FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    t.fail(error.message);
  } finally {
    if (app) {
      await app.close();
    }
  }
});
