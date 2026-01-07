# Backend Error Fix Summary

## Issues Identified & Fixed

### Issue 1: 500 Internal Server Error on Payment Creation

**Root Cause**: Database schema mismatch
- **Database Schema**: The `payments` table had `order_id` column defined as `UUID` type
- **Frontend Payload**: Sending `order_id` as a string like `"ORD-1234"`
- **Result**: PostgreSQL couldn't cast `"ORD-1234"` to UUID, causing the insert to fail

### Issue 2: GET /api/payments/:id Returns 404 "Payment Not Found"

**Root Cause**: Multiple issues
1. **Missing Route**: The GET endpoint wasn't registered in the route definitions
2. **Field Name Mismatch**: Backend returns snake_case (`order_id`, `created_at`) but frontend expects camelCase (`orderId`, `createdAt`)

## Changes Made

### 1. Enhanced Error Logging

Added comprehensive logging to track the full error flow:

#### [src/api/controllers/payment.controller.js](src/api/controllers/payment.controller.js)
- Log incoming request body and headers
- Log extracted field values and types
- Log full error stack traces with context
- Return more detailed error messages in development

#### [src/core/idempotency/idempotency.service.js](src/core/idempotency/idempotency.service.js)
- Log database transaction start/end
- Log SQL query results
- Catch and log queue errors separately (don't fail the request if queue fails)
- Wrap entire flow in try/catch with detailed error logging

### 2. Fixed Database Schema

#### [src/db/models/payment.model.js](src/db/models/payment.model.js)
Changed `order_id` column type from `UUID` to `TEXT` to support custom order ID formats:
```sql
-- Before
order_id UUID NOT NULL

-- After
order_id TEXT NOT NULL
```

### 4. Added Missing GET Route

#### [src/api/routes/payment.routes.js](src/api/routes/payment.routes.js)
Added the GET endpoint for fetching payments by ID:
```javascript
fastify.get(
  '/payments/:paymentId',
  { schema: getPaymentSchema },
  paymentController.getPaymentStatus
);
```

This registers the route at `GET /api/payments/:paymentId` (with `/api` prefix from server.js).

### 5. Added Response Transformation

#### [src/api/controllers/payment.controller.js](src/api/controllers/payment.controller.js)
Added `transformPaymentResponse()` to convert snake_case to camelCase:
```javascript
const transformPaymentResponse = (payment) => {
    if (!payment) return payment;
    return {
        id: payment.id,
        orderId: payment.order_id,
        idempotencyKey: payment.idempotency_key,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        gatewayChargeId: payment.gateway_charge_id,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at
    };
};
```

Applied to both POST and GET responses to ensure consistency.

### 6. Enhanced Orchestrator Logging

#### [src/core/orchestrator/payment.orchestrator.js](src/core/orchestrator/payment.orchestrator.js)
- Added logger import
- Added logging to `fetchStatus()` to track database queries
- Made function async for better error handling

### 7. Added Database Migration

#### [migrations/001_alter_order_id_to_text.sql](migrations/001_alter_order_id_to_text.sql)
SQL migration to alter existing tables:
```sql
ALTER TABLE payments 
ALTER COLUMN order_id TYPE TEXT USING order_id::TEXT;
```

### 8. Created Helper Scripts

#### [scripts/migrate.js](scripts/migrate.js)
Migration runner script that executes all `.sql` files in the migrations folder.

#### [scripts/init-db.js](scripts/init-db.js)
Database initialization script that creates all tables and indexes if they don't exist.

### 9. Updated NPM Scripts

Added convenience scripts to `package.json`:
```json
{
  "db:init": "node scripts/init-db.js",
  "db:migrate": "node scripts/migrate.js",
  "db:setup": "npm run db:init && npm run db:migrate"
}
```

## How to Fix Your Database

### Option 1: Run Migration (Recommended if table exists with data)
```bash
cd backend
npm run db:migrate
```

### Option 2: Recreate Tables (If starting fresh)
```bash
cd backend
# Drop existing tables
psql $DATABASE_URL -c "DROP TABLE IF EXISTS payments CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS gateway_events CASCADE;"

# Recreate with correct schema
npm run db:init
```

### Option 3: Manual SQL (If you prefer)
```bash
psql $DATABASE_URL -f migrations/001_alter_order_id_to_text.sql
```

## Payload Structure Confirmed

✅ **Frontend sends:**
```json
{
  "orderId": "ORD-1234",
  "amount": 100.50,
  "currency": "USD"
}
```

✅ **Backend expects:**
```javascript
const { orderId, amount, currency } = req.body;
const idempotencyKey = req.headers['idempotency-key'];
```

✅ **Headers:**
```
Idempotency-Key: <uuid-v4>
Content-Type: application/json
```

## Testing the Fix

1. Start the backend server:
```bash
cd backend
npm start
```

2. Watch the logs for detailed debugging output:
```
createPaymentIntent: incoming request
createPaymentIntent: extracted fields
idempotency.createOrRetrieve.start
idempotency.createOrRetrieve.db.transaction.start
idempotency.createOrRetrieve.db.upsert.result
idempotency.createOrRetrieve.enqueue
createPaymentIntent: success
```

3. Test from the frontend:
   - Go to Create Payment page
   - Fill in amount and submit
   - Should see 202/200 response with payment details

## Error Handling Improvements

### Before:
```javascript
catch (err) {
  return sendResponse(reply, 500, { error: 'Unable to create payment intent' });
}
```

### After:
```javascript
catch (err) {
  logger.error({
    error: err.message,
    stack: err.stack,
    name: err.name,
    statusCode: err.statusCode,
    orderId,
    idempotencyKey
  }, 'createPaymentIntent: error caught');
  
  // Return specific error for idempotency conflicts
  if (err.name === 'IdempotencyConflictError') {
    return sendResponse(reply, 409, { error: err.message });
  }
  
  return sendResponse(reply, 500, { 
    error: 'Unable to create payment intent', 
    details: err.message 
  });
}
```

## Monitoring Checklist

After deploying the fix:

- [ ] Run database migration
- [ ] Restart backend server
- [ ] Check logs for `Postgres connected (pg-promise)`
- [ ] Test payment creation from frontend
- [ ] Verify logs show successful flow
- [ ] Check database for new payment record: `SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;`

## Next Steps

If you still encounter 500 errors after this fix, check:

1. **Redis Connection**: Verify `REDIS_URL` is correct and Redis is running
2. **Queue Worker**: Check BullMQ queue is configured properly
3. **Database Connection**: Verify `DATABASE_URL` is correct
4. **Environment Variables**: Ensure `.env` file has all required variables
