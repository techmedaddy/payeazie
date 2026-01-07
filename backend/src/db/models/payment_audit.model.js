module.exports = {
    createTable: `
        CREATE TABLE IF NOT EXISTS payment_audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
            from_status VARCHAR(20),
            to_status VARCHAR(20) NOT NULL,
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `,
    indexes: [
        `CREATE INDEX IF NOT EXISTS idx_payment_audit_payment_id ON payment_audit_log (payment_id)`,
        `CREATE INDEX IF NOT EXISTS idx_payment_audit_created_at ON payment_audit_log (created_at)`
    ],
    insertAuditLog: `
        INSERT INTO payment_audit_log (
            payment_id,
            from_status,
            to_status,
            metadata
        ) VALUES (
            $1, $2, $3, $4
        )
        RETURNING *
    `,
    getAuditLog: `
        SELECT * FROM payment_audit_log 
        WHERE payment_id = $1 
        ORDER BY created_at DESC
    `
};
