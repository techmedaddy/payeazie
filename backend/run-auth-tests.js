#!/usr/bin/env node

/**
 * Test Runner - Runs all authentication phases sequentially
 * Generates a comprehensive summary report
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PHASES = [
  { file: 'auth.phase1.test.js', name: 'Manual Login' },
  { file: 'auth.phase2.test.js', name: 'Google OAuth' },
  { file: 'auth.phase3.test.js', name: 'Route Protection' },
  { file: 'auth.phase4.test.js', name: 'Logout' },
  { file: 'auth.phase5.test.js', name: 'Token Expiry' },
  { file: 'auth.phase6.test.js', name: 'Password Reset' }
];

const results = [];
let currentPhase = 0;

console.log('\n' + '='.repeat(80));
console.log('🚀 PAYEAZIE AUTHENTICATION TEST SUITE');
console.log('='.repeat(80));
console.log(`\nRunning ${PHASES.length} test phases...\n`);

function runPhase(phase) {
  return new Promise((resolve) => {
    console.log(`\n${'▶'.repeat(40)}`);
    console.log(`▶ PHASE ${currentPhase + 1}/${PHASES.length}: ${phase.name}`);
    console.log(`${'▶'.repeat(40)}\n`);

    const startTime = Date.now();
    const testPath = path.join(__dirname, 'tests', phase.file);

    // Check if test file exists
    if (!fs.existsSync(testPath)) {
      console.error(`❌ Test file not found: ${testPath}`);
      results.push({
        phase: currentPhase + 1,
        name: phase.name,
        status: 'ERROR',
        duration: 0,
        error: 'Test file not found'
      });
      resolve();
      return;
    }

    const test = spawn('node', [testPath], {
      cwd: path.join(__dirname),
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let output = '';
    let errorOutput = '';

    test.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      output += text;
    });

    test.stderr.on('data', (data) => {
      const text = data.toString();
      process.stderr.write(text);
      errorOutput += text;
    });

    test.on('close', (code) => {
      const duration = Date.now() - startTime;
      const status = code === 0 ? 'PASS' : 'FAIL';

      results.push({
        phase: currentPhase + 1,
        name: phase.name,
        status: status,
        duration: duration,
        exitCode: code,
        output: output,
        error: errorOutput || null
      });

      console.log(`\n${'═'.repeat(40)}`);
      if (code === 0) {
        console.log(`✅ Phase ${currentPhase + 1} PASSED (${duration}ms)`);
      } else {
        console.log(`❌ Phase ${currentPhase + 1} FAILED (${duration}ms)`);
      }
      console.log(`${'═'.repeat(40)}\n`);

      currentPhase++;
      resolve();
    });

    test.on('error', (error) => {
      results.push({
        phase: currentPhase + 1,
        name: phase.name,
        status: 'ERROR',
        duration: Date.now() - startTime,
        error: error.message
      });
      currentPhase++;
      resolve();
    });
  });
}

async function runAllPhases() {
  for (const phase of PHASES) {
    await runPhase(phase);
    // Small delay between phases
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

function generateReport() {
  console.log('\n\n');
  console.log('═'.repeat(80));
  console.log('📊 TEST SUMMARY REPORT');
  console.log('═'.repeat(80));
  console.log();

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;
  const total = results.length;

  // Individual phase results
  console.log('Phase Results:');
  console.log('─'.repeat(80));
  results.forEach(result => {
    const statusIcon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️ ';
    const duration = `${result.duration}ms`.padEnd(10);
    console.log(`${statusIcon} Phase ${result.phase}: ${result.name.padEnd(25)} ${duration} ${result.status}`);
  });

  // Overall statistics
  console.log();
  console.log('─'.repeat(80));
  console.log('Overall Statistics:');
  console.log(`  Total Phases:  ${total}`);
  console.log(`  ✅ Passed:      ${passed}`);
  console.log(`  ❌ Failed:      ${failed}`);
  console.log(`  ⚠️  Errors:      ${errors}`);
  console.log(`  Success Rate:  ${((passed / total) * 100).toFixed(1)}%`);
  console.log('─'.repeat(80));

  // Detailed failures
  const failedTests = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR');
  if (failedTests.length > 0) {
    console.log();
    console.log('❌ Failed/Error Details:');
    console.log('─'.repeat(80));
    failedTests.forEach(result => {
      console.log(`\nPhase ${result.phase}: ${result.name}`);
      console.log(`Status: ${result.status}`);
      if (result.exitCode !== undefined) {
        console.log(`Exit Code: ${result.exitCode}`);
      }
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
    });
  }

  // Save report to file
  const reportPath = path.join(__dirname, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total, passed, failed, errors },
    results: results
  }, null, 2));

  console.log();
  console.log('─'.repeat(80));
  console.log(`📄 Detailed report saved to: ${reportPath}`);
  console.log('═'.repeat(80));
  console.log();

  // Exit code
  const exitCode = failed > 0 || errors > 0 ? 1 : 0;
  if (exitCode === 0) {
    console.log('🎉 All tests passed!\n');
  } else {
    console.log('⚠️  Some tests failed. Review the report above.\n');
  }

  process.exit(exitCode);
}

// Run all phases
runAllPhases().then(generateReport).catch(error => {
  console.error('\n❌ Test runner error:', error);
  process.exit(1);
});
