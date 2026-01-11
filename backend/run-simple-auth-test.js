#!/usr/bin/env node

/**
 * Simple Test Runner - Runs authentication phase tests
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(80));
console.log('🚀 PAYEAZIE AUTHENTICATION TEST SUITE');
console.log('='.repeat(80) + '\n');

// Check if backend is running
const http = require('http');
http.get('http://127.0.0.1:3467/health', (res) => {
  console.log('✅ Backend is running\n');
  runTests();
}).on('error', (e) => {
  console.error('❌ Backend not running on port 3467');
  console.error('   Start backend first: cd backend && node server.js\n');
  process.exit(1);
});

function runTests() {
  const testsDir = path.join(__dirname, 'tests');
  
  // Check if standalone test exists
  const phase1Test = path.join(testsDir, 'auth.phase1.standalone.js');
  
  if (!fs.existsSync(phase1Test)) {
    console.error('❌ Test files not found in:', testsDir);
    process.exit(1);
  }

  console.log('Running Phase 1: Manual Login...\n');
  
  exec(`node "${phase1Test}"`, (error, stdout, stderr) => {
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    if (error) {
      console.error(`\n❌ Tests failed with exit code ${error.code}`);
      process.exit(1);
    } else {
      console.log('\n✅ All tests completed!');
      process.exit(0);
    }
  });
}
