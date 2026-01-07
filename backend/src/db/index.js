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
};

/**
 * Create DB instance
 */
const db = pgp(connectionOptions);

/**
 * Verify connection immediately on boot
 */
(async () => {
  try {
    await db.one('select 1');
    console.log('Postgres connected (pg-promise)');
  } catch (err) {
    console.error('Postgres startup connection failed:', err.message);
    process.exit(1);
  }
})();

module.exports = db;
