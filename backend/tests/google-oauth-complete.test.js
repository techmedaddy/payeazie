/**
 * Google OAuth Flow - Complete Test Suite
 * Runs all 5 phases of OAuth testing
 */

const { runPhase1Test } = require('./google-oauth.phase1.test');
const { runPhase2Test } = require('./google-oauth.phase2.test');
const { runPhase345Test } = require('./google-oauth.phase345.test');

async function runAllTests() {
  console.log('\n' + '█'.repeat(80));
  console.log('█' + ' '.repeat(78) + '█');
  console.log('█' + '  🚀 GOOGLE OAUTH FLOW - COMPLETE TEST SUITE'.padEnd(78) + '█');
  console.log('█' + ' '.repeat(78) + '█');
  console.log('█'.repeat(80) + '\n');

  const results = {
    phase1: { passed: false },
    phase2: { passed: false },
    phase3to5: { passed: false }
  };

  try {
    // Run Phase 1
    console.log('\n🔵 Running Phase 1: OAuth Route Hit Test...\n');
    const phase1Result = await runPhase1Test();
    results.phase1 = phase1Result;
    
    if (!phase1Result.success) {
      console.log('\n⚠️  Phase 1 failed. Stopping tests.');
      return results;
    }

    // Wait between phases
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run Phase 2
    console.log('\n🔵 Running Phase 2: Callback Route Test...\n');
    const phase2Result = await runPhase2Test();
    results.phase2 = phase2Result;

    if (!phase2Result.success) {
      console.log('\n⚠️  Phase 2 failed. Stopping tests.');
      return results;
    }

    // Wait between phases
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run Phases 3-5
    console.log('\n🔵 Running Phases 3-5: JWT Issuance and Verification...\n');
    const phase345Result = await runPhase345Test();
    results.phase3to5 = phase345Result;

    return results;

  } catch (error) {
    console.error('\n❌ Error running test suite:', error);
    return results;
  }
}

// Main execution
if (require.main === module) {
  runAllTests()
    .then(results => {
      console.log('\n\n' + '█'.repeat(80));
      console.log('█' + ' '.repeat(78) + '█');
      console.log('█' + '  📊 TEST RESULTS SUMMARY'.padEnd(78) + '█');
      console.log('█' + ' '.repeat(78) + '█');
      console.log('█'.repeat(80) + '\n');

      const allPassed = results.phase1.success && 
                       results.phase2.success && 
                       results.phase3to5.success;

      console.log('Phase 1 - OAuth Route Hit:          ', results.phase1.success ? '✅ PASSED' : '❌ FAILED');
      console.log('Phase 2 - Callback Route:           ', results.phase2.success ? '✅ PASSED' : '❌ FAILED');
      console.log('Phases 3-5 - JWT & Verification:    ', results.phase3to5.success ? '✅ PASSED' : '❌ FAILED');

      console.log('\n' + (allPassed ? '✅' : '❌') + ' Overall Status: ' + (allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'));

      if (allPassed) {
        console.log('\n' + '█'.repeat(80));
        console.log('█' + ' '.repeat(78) + '█');
        console.log('█' + '  ✅ GOOGLE OAUTH FLOW VERIFIED'.padEnd(78) + '█');
        console.log('█' + ' '.repeat(78) + '█');
        console.log('█' + '  All components of the Google OAuth login flow are working correctly.'.padEnd(78) + '█');
        console.log('█' + '  The backend can handle OAuth redirects, process callbacks, issue JWTs,'.padEnd(78) + '█');
        console.log('█' + '  and verify tokens on protected routes.'.padEnd(78) + '█');
        console.log('█' + ' '.repeat(78) + '█');
        console.log('█'.repeat(80) + '\n');
      } else {
        console.log('\n⚠️  Some tests failed. Review the output above for details.\n');
      }

      process.exit(allPassed ? 0 : 1);
    })
    .catch(error => {
      console.error('\n💥 Unexpected error in test suite:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests };
