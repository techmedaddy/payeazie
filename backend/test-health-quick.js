#!/usr/bin/env node
const http = require('http');

console.log('\n🧪 Quick Health Check Test\n');

http.get('http://127.0.0.1:3467/health', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Backend health check: PASSED');
      console.log('   Response:', JSON.parse(data));
    } else {
      console.log(`❌ Backend health check: FAILED (${res.statusCode})`);
    }
  });
}).on('error', (e) => {
  console.log('❌ Backend health check: ERROR');
  console.log('   Error:', e.message);
});

// Test root endpoint
setTimeout(() => {
  http.get('http://127.0.0.1:3467/', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('\n✅ Backend root endpoint: PASSED');
        console.log('   Response:', JSON.parse(data));
      } else {
        console.log(`\n❌ Backend root endpoint: FAILED (${res.statusCode})`);
      }
      console.log('\n✅ Test infrastructure is working!\n');
    });
  }).on('error', (e) => {
    console.log('\n❌ Backend root endpoint: ERROR');
    console.log('   Error:', e.message);
  });
}, 100);
