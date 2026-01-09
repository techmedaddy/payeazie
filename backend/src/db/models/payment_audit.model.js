module.exports = {
    createTable: `
        CREATE TABLE IF NOT EXISTS payment_audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
            from_status VARCHAR(20),
            to_status VARCHAR(20) NOT NULL,
            metadata JSONB,
            user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
            triggered_by VARCHAR(20) DEFAULT 'system',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `,
    indexes: [
        `CREATE INDEX IF NOT EXISTS idx_payment_audit_payment_id ON payment_audit_log (payment_id)`,
        `CREATE INDEX IF NOT EXISTS idx_payment_audit_created_at ON payment_audit_log (created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_payment_audit_user_id ON payment_audit_log (user_id)`
    ],
    insertAuditLog: `
        INSERT INTO payment_audit_log (
            payment_id,
            from_status,
            to_status,
            metadata,
            user_id,
            triggered_by
        ) VALUES (
            $1, $2, $3, $4, $5, $6
        )
        RETURNING *
    `,
    getAuditLog: `
        SELECT 
            pal.*,
            u.email as user_email,
            u.name as user_name
        FROM payment_audit_log pal
        LEFT JOIN users u ON pal.user_id = u.id
        WHERE pal.payment_id = $1 
        ORDER BY pal.created_at DESC
    `,
    getAuditLogsByUser: `
        SELECT 
            pal.*,
            p.order_id,
            p.amount,
            p.currency,
            u.email as user_email,
            u.name as user_name
        FROM payment_audit_log pal
        LEFT JOIN payments p ON pal.payment_id = p.id
        LEFT JOIN users u ON pal.user_id = u.id
        WHERE pal.user_id = $1
        ORDER BY pal.created_at DESC
        LIMIT $2 OFFSET $3
    `,
    getAllAuditLogs: `
        SELECT 
            pal.*,
            p.order_id,
            p.amount,
            p.currency,
            u.email as user_email,
            u.name as user_name
        FROM payment_audit_log pal
        LEFT JOIN payments p ON pal.payment_id = p.id
        LEFT JOIN users u ON pal.user_id = u.id
        ORDER BY pal.created_at DESC
        LIMIT $1 OFFSET $2
    `,
    countAuditLogsByUser: `
        SELECT COUNT(*) as total
        FROM payment_audit_log
        WHERE user_id = $1
    `,
    countAllAuditLogs: `
        SELECT COUNT(*) as total
        FROM payment_audit_log
    `
};
