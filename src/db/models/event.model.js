module.exports = {
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