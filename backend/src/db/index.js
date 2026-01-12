const pgPromise = require('pg-promise');

/**
 * Validate env early (fail fast)
 */
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is missing');
}

/**
 * pg-promise init options
 */
const initOptions = {
  capSQL: true,

  error(err, e) {
    // Connection-level errors
    if (e.cn) {
      console.error('Database connection error:', err.message);
      return;
    }

    // Query-level errors
    if (e.query) {
      console.error('Query error:', err.message);
      return;
    }

    // Generic fallback
    console.error('Unexpected DB error:', err);
  },
};

/**
 * Initialize pg-promise
 */
const pgp = pgPromise(initOptions);

/**
 * Timestamp parsing (Postgres -> JS Date)
 */
const parseTimestamp = (val) => (val === null ? null : new Date(val));

pgp.pg.types.setTypeParser(1114, parseTimestamp); // timestamp
pgp.pg.types.setTypeParser(1184, parseTimestamp); // timestamptz

/**
 * Connection options
 * SSL enabled only if explicitly requested
 */
const connectionOptions = {
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  // Force IPv4 to avoid IPv6 connection issues
  connectionTimeoutMillis: 10000,
  // Additional pg connection options
  options: '--client_encoding=UTF8'
};

/**
 * Create DB instance
 */
const db = pgp(connectionOptions);

/**
 * Verify connection with retry logic
 */
async function connectWithRetry(maxRetries = 5, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await db.one('SELECT 1 as connected');
      console.log('✓ Postgres connected (pg-promise)');
      return true;
    } catch (err) {
      console.error(`✗ Postgres connection attempt ${attempt}/${maxRetries} failed:`, err.message);
      
      if (attempt === maxRetries) {
        console.error('\n✗ FATAL: Could not connect to Postgres after', maxRetries, 'attempts');
        console.error('  Database URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));
        process.exit(1);
      }
      
      console.log(`  Retrying in ${delayMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// Test connection on module load
connectWithRetry().catch(err => {
  console.error('Database initialization failed:', err.message);
  process.exit(1);
});

module.exports = db;
module.exports.connectWithRetry = connectWithRetry;
