module.exports = {
    createTable: `
        CREATE TABLE IF NOT EXISTS payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id UUID NOT NULL,
            idempotency_key UUID NOT NULL,
            amount BIGINT NOT NULL,
            currency VARCHAR(3) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'processing',
            gateway_charge_id TEXT UNIQUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `,
    indexes: [
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_idempotency ON payments (order_id, idempotency_key)`
    ],
    selectById: `
        SELECT * FROM payments WHERE id = $1
    `,
    selectByOrderIdAndKey: `
        SELECT * FROM payments WHERE order_id = $1 AND idempotency_key = $2
    `,
    insertPayment: `
        INSERT INTO payments (
            order_id, 
            idempotency_key, 
            amount, 
            currency
        ) VALUES (
            ${'order_id'}, 
            ${'idempotency_key'}, 
            ${'amount'}, 
            ${'currency'}
        ) 
        ON CONFLICT (order_id, idempotency_key) DO NOTHING 
        RETURNING *
    `,
    updateStatus: `
        UPDATE payments 
        SET status = ${'status'}, updated_at = NOW() 
        WHERE id = ${'id'} 
        RETURNING *
    `,
    updateGatewayFields: `
        UPDATE payments 
        SET gateway_charge_id = ${'gateway_charge_id'}, status = ${'status'}, updated_at = NOW() 
        WHERE id = ${'id'} 
        RETURNING *
    `
};