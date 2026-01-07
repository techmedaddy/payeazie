#!/usr/bin/env node

/**
 * Database initialization script
 * Creates tables and indexes if they don't exist
 * Run with: node scripts/init-db.js
 */

require('dotenv').config();
const db = require('../src/db');
const paymentModel = require('../src/db/models/payment.model');
const eventModel = require('../src/db/models/event.model');
const paymentAuditModel = require('../src/db/models/payment_audit.model');

async function initDatabase() {
  try {
    console.log('Initializing database...\n');

    // Create payments table
    console.log('Creating payments table...');
    await db.none(paymentModel.createTable);
    console.log('✓ Payments table ready');

    // Create indexes for payments
    if (paymentModel.indexes && paymentModel.indexes.length > 0) {
      console.log('Creating payments indexes...');
      for (const indexSql of paymentModel.indexes) {
        await db.none(indexSql);
      }
      console.log('✓ Payments indexes ready');
    }

    // Create events table
    console.log('\nCreating events table...');
    await db.none(eventModel.createTable);
    console.log('✓ Events table ready');

    // Create indexes for events
    if (eventModel.indexes && eventModel.indexes.length > 0) {
      console.log('Creating events indexes...');
      for (const indexSql of eventModel.indexes) {
        await db.none(indexSql);
      }
      console.log('✓ Events indexes ready');
    }

    // Create payment_audit_log table
    console.log('\nCreating payment audit log table...');
    await db.none(paymentAuditModel.createTable);
    console.log('✓ Payment audit log table ready');

    // Create indexes for payment_audit_log
    if (paymentAuditModel.indexes && paymentAuditModel.indexes.length > 0) {
      console.log('Creating payment audit log indexes...');
      for (const indexSql of paymentAuditModel.indexes) {
        await db.none(indexSql);
      }
      console.log('✓ Payment audit log indexes ready');
    }

    console.log('\n✓ Database initialization completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Database initialization failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

initDatabase();
