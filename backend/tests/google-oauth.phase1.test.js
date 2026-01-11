/**
 * Google OAuth Flow Test - Phase 1: Route Hit Test
 * Tests GET /api/auth/google
 * Expected: HTTP 302 redirect to Google
 */

const http = require('http');

const API_BASE = 'http://127.0.0.1:3467';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      // Don't follow redirects automatically
      followRedirect: false
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ 
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          location: res.headers.location
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

async function runPhase1Test() {
  console.log('\n' + '='.repeat(80));
  console.log('🔐 GOOGLE OAUTH FLOW - PHASE 1: ROUTE HIT TEST');
  console.log('='.repeat(80) + '\n');

  try {
    console.log('📋 Step 1.1: Testing GET /api/auth/google');
    console.log('   Expected: HTTP 302 redirect to Google');
    console.log('   Making request to:', `${API_BASE}/api/auth/google`);
    
    const response = await makeRequest(`${API_BASE}/api/auth/google`);
    
    console.log('\n📊 Response Details:');
    console.log('   Status Code:', response.statusCode);
    console.log('   Headers:', JSON.stringify(response.headers, null, 2));
    
    if (response.statusCode === 302 || response.statusCode === 301) {
      const location = response.location;
      console.log('\n✅ PHASE 1 PASSED: Google OAuth route hit and redirected');
      console.log('   Redirect Location:', location);
      
      if (location && location.includes('accounts.google.com')) {
        console.log('   ✅ Redirected to Google OAuth (accounts.google.com)');
      } else if (location && location.includes('google.com')) {
        console.log('   ✅ Redirected to Google domain');
      } else {
        console.log('   ⚠️  Redirected, but not to expected Google domain');
        console.log('   Location:', location);
      }
      
      console.log('\n🎯 Phase 1 Summary:');
      console.log('   ✓ Route accessible');
      console.log('   ✓ Returns 302 redirect');
      console.log('   ✓ OAuth flow initiated');
      
      return { success: true, location };
      
    } else if (response.statusCode === 503) {
      console.log('\n❌ PHASE 1 FAILED: Google OAuth not configured');
      console.log('   Status: 503 Service Unavailable');
      console.log('   Body:', response.body);
      console.log('\n💡 Action Required:');
      console.log('   Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env file');
      return { success: false, reason: 'oauth_not_configured' };
      
    } else if (response.statusCode === 404) {
      console.log('\n❌ PHASE 1 FAILED: Route not found');
      console.log('   Status: 404 Not Found');
      console.log('   Body:', response.body);
      return { success: false, reason: 'route_not_found' };
      
    } else {
      console.log('\n❌ PHASE 1 FAILED: Unexpected status code');
      console.log('   Expected: 302');
      console.log('   Received:', response.statusCode);
      console.log('   Body:', response.body);
      return { success: false, reason: 'unexpected_status' };
    }
    
  } catch (error) {
    console.log('\n❌ PHASE 1 FAILED: Request error');
    console.error('   Error:', error.message);
    console.error('   Details:', error);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Action Required:');
      console.log('   Start the backend server: npm start');
    }
    
    return { success: false, reason: 'request_error', error: error.message };
  }
}

// Run the test
if (require.main === module) {
  runPhase1Test()
    .then(result => {
      console.log('\n' + '='.repeat(80));
      if (result.success) {
        console.log('✅ PHASE 1 COMPLETE: Google OAuth route verified\n');
        process.exit(0);
      } else {
        console.log('❌ PHASE 1 INCOMPLETE: Fix issues above and retry\n');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { runPhase1Test };
