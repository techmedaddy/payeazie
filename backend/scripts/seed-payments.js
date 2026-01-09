#!/usr/bin/env node

/**
 * Seed demo payments into the database
 * Creates sample payments with different statuses for demo purposes
 * Run with: node scripts/seed-payments.js
 */

require('dotenv').config();
const db = require('../src/db');
const { v4: uuidv4 } = require('uuid');

const DEMO_PAYMENTS = [
  {
    order_id: 'ORDER-DEMO-001',
    idempotency_key: uuidv4(),
    amount: 9999, // $99.99
    currency: 'USD',
    status: 'succeeded',
    gateway_charge_id: `ch_demo_${Date.now()}_001`
  },
  {
    order_id: 'ORDER-DEMO-002',
    idempotency_key: uuidv4(),
    amount: 4999, // $49.99
    currency: 'USD',
    status: 'succeeded',
    gateway_charge_id: `ch_demo_${Date.now()}_002`
  },
  {
    order_id: 'ORDER-DEMO-003',
    idempotency_key: uuidv4(),
    amount: 2499, // $24.99
    currency: 'USD',
    status: 'failed',
    gateway_charge_id: null
  },
  {
    order_id: 'ORDER-DEMO-004',
    idempotency_key: uuidv4(),
    amount: 7999, // $79.99
    currency: 'USD',
    status: 'processing',
    gateway_charge_id: `ch_demo_${Date.now()}_004`
  },
  {
    order_id: 'ORDER-DEMO-005',
    idempotency_key: uuidv4(),
    amount: 15999, // $159.99
    currency: 'USD',
    status: 'processing',
    gateway_charge_id: null
  },
  {
    order_id: 'ORDER-DEMO-006',
    idempotency_key: uuidv4(),
    amount: 3999, // $39.99
    currency: 'USD',
    status: 'pending',
    gateway_charge_id: null
  },
  {
    order_id: 'ORDER-DEMO-007',
    idempotency_key: uuidv4(),
    amount: 12999, // $129.99
    currency: 'USD',
    status: 'succeeded',
    gateway_charge_id: `ch_demo_${Date.now()}_007`
  },
  {
    order_id: 'ORDER-DEMO-008',
    idempotency_key: uuidv4(),
    amount: 5999, // $59.99
    currency: 'USD',
    status: 'failed',
    gateway_charge_id: null
  }
];

async function seedPayments() {
  try {
    console.log('🌱 Seeding demo payments...\n');

    let insertedCount = 0;
    let skippedCount = 0;

    for (const payment of DEMO_PAYMENTS) {
      try {
        const result = await db.one(
          `INSERT INTO payments (
            order_id, 
            idempotency_key, 
            amount, 
            currency,
            status,
            gateway_charge_id,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, NOW(), NOW()
          ) 
          ON CONFLICT (order_id, idempotency_key) DO NOTHING 
          RETURNING id, order_id, status, amount`,
          [
            payment.order_id,
            payment.idempotency_key,
            payment.amount,
            payment.currency,
            payment.status,
            payment.gateway_charge_id
          ]
        );

        console.log(`✓ Created: ${result.order_id} - ${result.status} - $${(result.amount / 100).toFixed(2)}`);
        insertedCount++;
      } catch (err) {
        if (err.code === '23505') {
          // Unique constraint violation - payment already exists
          console.log(`⊘ Skipped: ${payment.order_id} (already exists)`);
          skippedCount++;
        } else {
          throw err;
        }
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✓ Inserted: ${insertedCount}`);
    console.log(`   ⊘ Skipped:  ${skippedCount}`);
    console.log(`   ━ Total:    ${DEMO_PAYMENTS.length}`);

    // Show status breakdown
    console.log('\n📈 Status breakdown:');
    const statusCounts = await db.any(
      `SELECT status, COUNT(*) as count 
       FROM payments 
       WHERE order_id LIKE 'ORDER-DEMO-%'
       GROUP BY status 
       ORDER BY status`
    );

    statusCounts.forEach(row => {
      console.log(`   ${row.status.padEnd(12)}: ${row.count}`);
    });

    console.log('\n✅ Seeding complete!');

  } catch (error) {
    console.error('❌ Error seeding payments:', error.message);
    process.exit(1);
  } finally {
    db.$pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedPayments();
}

module.exports = { seedPayments, DEMO_PAYMENTS };
