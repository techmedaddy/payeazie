module.exports = {
    createTable: `
        CREATE TABLE IF NOT EXISTS gateway_events (
            event_id TEXT PRIMARY KEY,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `,
    indexes: [
        `CREATE INDEX IF NOT EXISTS idx_gateway_events_created_at ON gateway_events (created_at)`
    ],
    recordEvent: (db, eventId, payload) => {
        return db.oneOrNone(
            'INSERT INTO gateway_events(event_id, payload) VALUES($1, $2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id',
            [eventId, payload]
        );
    },

    getEvent: (db, eventId) => {
        return db.oneOrNone(
            'SELECT * FROM gateway_events WHERE event_id=$1',
            [eventId]
        );
    },

    deleteOldEvents: (db, ttlDays) => {
        return db.none(
            "DELETE FROM gateway_events WHERE created_at < NOW() - ($1 || ' days')::interval",
            [ttlDays]
        );
    }
};