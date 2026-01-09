#!/usr/bin/env node

/**
 * Find stuck payments in processing state
 * Queries the database for payments that are stuck and may need manual intervention
 * Run with: node scripts/find-stuck.js
 */

require('dotenv').config();
const db = require('../src/db');

const STUCK_THRESHOLD_MINUTES = 5; // Consider payments stuck if processing for > 5 minutes

async function findStuckPayments() {
  try {
    console.log('🔍 Searching for stuck payments...\n');
    console.log(`   Threshold: ${STUCK_THRESHOLD_MINUTES} minutes in processing state\n`);

    // Query for stuck payments
    const stuckPayments = await db.any(
      `SELECT 
        id,
        order_id,
        amount,
        currency,
        status,
        gateway_charge_id,
        created_at,
        updated_at,
        EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 AS minutes_stuck
       FROM payments 
       WHERE status = 'processing'
         AND updated_at < NOW() - INTERVAL '${STUCK_THRESHOLD_MINUTES} minutes'
       ORDER BY updated_at ASC`
    );

    if (stuckPayments.length === 0) {
      console.log('✅ No stuck payments found!\n');
      
      // Show all processing payments (even if not "stuck" yet)
      const recentProcessing = await db.any(
        `SELECT 
          id,
          order_id,
          amount,
          currency,
          status,
          gateway_charge_id,
          created_at,
          updated_at,
          EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 AS minutes_in_processing
         FROM payments 
         WHERE status = 'processing'
         ORDER BY updated_at DESC`
      );

      if (recentProcessing.length > 0) {
        console.log(`ℹ️  Found ${recentProcessing.length} payment(s) currently in processing:\n`);
        recentProcessing.forEach((payment, index) => {
          console.log(`${index + 1}. Payment ID: ${payment.id}`);
          console.log(`   Order ID: ${payment.order_id}`);
          console.log(`   Amount: $${(payment.amount / 100).toFixed(2)} ${payment.currency}`);
          console.log(`   Gateway ID: ${payment.gateway_charge_id || 'N/A'}`);
          console.log(`   Updated: ${payment.updated_at.toISOString()}`);
          console.log(`   Time in processing: ${Math.floor(payment.minutes_in_processing)} minutes`);
          console.log('');
        });
      } else {
        console.log('ℹ️  No payments currently in processing state.\n');
      }

      // Show overall status summary
      console.log('📊 Overall payment status summary:');
      const statusSummary = await db.any(
        `SELECT 
          status,
          COUNT(*) as count,
          SUM(amount) as total_amount
         FROM payments
         GROUP BY status
         ORDER BY status`
      );

      statusSummary.forEach(row => {
        console.log(`   ${row.status.padEnd(12)}: ${row.count.toString().padStart(3)} payments ($${(row.total_amount / 100).toFixed(2)})`);
      });

    } else {
      console.log(`⚠️  Found ${stuckPayments.length} stuck payment(s):\n`);
      console.log('━'.repeat(80));

      stuckPayments.forEach((payment, index) => {
        console.log(`\n${index + 1}. STUCK PAYMENT`);
        console.log(`   Payment ID:       ${payment.id}`);
        console.log(`   Order ID:         ${payment.order_id}`);
        console.log(`   Amount:           $${(payment.amount / 100).toFixed(2)} ${payment.currency}`);
        console.log(`   Status:           ${payment.status}`);
        console.log(`   Gateway ID:       ${payment.gateway_charge_id || 'N/A'}`);
        console.log(`   Created:          ${payment.created_at.toISOString()}`);
        console.log(`   Last Updated:     ${payment.updated_at.toISOString()}`);
        console.log(`   ⏱️  Stuck for:      ${Math.floor(payment.minutes_stuck)} minutes`);
        console.log('   ─'.repeat(78));
      });

      console.log('\n━'.repeat(80));
      console.log('\n💡 Recommended actions:\n');
      console.log('1. Check if workers are running:');
      console.log('   ps aux | grep "charge.worker\\|reconcile.worker"\n');
      console.log('2. Check Redis connection:');
      console.log('   redis-cli ping\n');
      console.log('3. Trigger manual reconciliation:');
      console.log('   curl -X POST http://localhost:3000/api/payments/reconcile\n');
      console.log('4. View recent logs:');
      console.log('   tail -100 /tmp/backend-*.log | grep -E "processing|worker"\n');
      console.log('5. Fix stuck payments manually:');
      console.log('   node scripts/fix-stuck-payments.js\n');
    }

    console.log('');

  } catch (error) {
    console.error('❌ Error finding stuck payments:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Database connection failed. Make sure PostgreSQL is running and DATABASE_URL is correct.');
    }
    process.exit(1);
  } finally {
    db.$pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  findStuckPayments();
}

module.exports = { findStuckPayments };
