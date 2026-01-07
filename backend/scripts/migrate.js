#!/usr/bin/env node

/**
 * Database migration runner
 * Run with: node scripts/migrate.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

async function runMigrations() {
  try {
    console.log('Starting database migrations...');
    
    // Get all .sql files from migrations directory
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Run in alphabetical order

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    for (const file of files) {
      console.log(`\nRunning migration: ${file}`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      try {
        await db.none(sql);
        console.log(`✓ ${file} completed successfully`);
      } catch (err) {
        console.error(`✗ ${file} failed:`, err.message);
        throw err;
      }
    }

    console.log('\n✓ All migrations completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigrations();
