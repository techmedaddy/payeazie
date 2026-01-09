#!/usr/bin/env node
/**
 * Fix Stuck Payments Script
 * 
 * This script fixes payments that are stuck in 'processing' status
 * without a gateway_charge_id. These were created with the old buggy code.
 * 
 * The script will:
 * 1. Find all payments with status='processing' and gateway_charge_id=NULL
 * 2. Transition them to 'failed' since they never completed the charge
 * 3. Create audit log entries
 */

require('dotenv').config();
const db = require('../src/db');
const logger = require('../src/utils/logger');

async function fixStuckPayments() {
    console.log('\n🔧 Starting stuck payment fix...\n');
    
    try {
        // Find all stuck payments without gateway charge ID
        const stuckPayments = await db.any(`
            SELECT 
                id, 
                order_id,
                status, 
                gateway_charge_id,
                amount,
                currency,
                created_at,
                updated_at
            FROM payments 
            WHERE status = 'processing'
              AND gateway_charge_id IS NULL
            ORDER BY created_at DESC
        `);
        
        if (stuckPayments.length === 0) {
            console.log('✅ No stuck payments found!\n');
            return;
        }
        
        console.log(`📊 Found ${stuckPayments.length} stuck payments to fix:\n`);
        
        // Fix each payment
        let fixed = 0;
        let errors = 0;
        
        for (const payment of stuckPayments) {
            try {
                await db.tx(async t => {
                    // Update payment status to failed
                    await t.none(
                        `UPDATE payments 
                         SET status = $2, 
                             updated_at = NOW() 
                         WHERE id = $1`,
                        [payment.id, 'failed']
                    );
                    
                    // Try to create audit log entry (skip if table doesn't exist)
                    try {
                        await t.none(
                            `INSERT INTO payment_audit_log 
                             (payment_id, from_status, to_status, metadata)
                             VALUES ($1, $2, $3, $4)`,
                            [
                                payment.id,
                                'processing',
                                'failed',
                                {
                                    reason: 'Fixed stuck payment - no gateway_charge_id',
                                    fixed_by: 'fix-stuck-payments.js',
                                    fixed_at: new Date().toISOString(),
                                    original_created: payment.created_at,
                                    original_updated: payment.updated_at
                                }
                            ]
                        );
                    } catch (auditErr) {
                        // Audit log table might not exist - that's okay
                        console.log(`    ⚠️  Could not create audit log (table may not exist)`);
                    }
                });
                
                console.log(`  ✅ Fixed ${payment.order_id} (${payment.id})`);
                fixed++;
                
            } catch (err) {
                console.error(`  ❌ Error fixing ${payment.order_id}:`, err.message);
                errors++;
            }
        }
        
        console.log(`\n📈 Summary:`);
        console.log(`   Fixed: ${fixed}`);
        console.log(`   Errors: ${errors}`);
        console.log(`   Total: ${stuckPayments.length}\n`);
        
        if (fixed > 0) {
            console.log('✅ Stuck payments have been fixed!\n');
            console.log('💡 New payments will now complete correctly with the fixed code.\n');
        }
        
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    }
}

// Run the fix
fixStuckPayments()
    .then(() => {
        console.log('🎉 Done!\n');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Unexpected error:', err);
        process.exit(1);
    });
