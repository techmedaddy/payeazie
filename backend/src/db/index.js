const pgPromise = require('pg-promise');

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is missing');
}

const initOptions = {
    capSQL: true,
    error: (err, e) => {
        if (e.cn) {
            console.error('Database connection error:', err);
        }
    }
};

const pgp = pgPromise(initOptions);

const parseTimestamp = (val) => new Date(val);
pgp.pg.types.setTypeParser(1114, parseTimestamp);
pgp.pg.types.setTypeParser(1184, parseTimestamp);

const db = pgp(process.env.DATABASE_URL);

module.exports = db;