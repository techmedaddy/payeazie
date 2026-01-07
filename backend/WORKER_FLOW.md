# Payment Status Flow - Complete Guide

## Overview

This document explains how payments move through different statuses from creation to completion, including the worker processes that handle gateway communication and reconciliation.

## Payment Lifecycle

```
User Creates Payment
        ↓
   [processing] ────────→ (charge.worker) ────────→ Gateway API
        ↓                                                 ↓
        ↓                                    [succeeded/failed/processing]
        ↓                                                 ↓
        ↓                                      Update DB with gateway_charge_id
        ↓                                                 ↓
        ↓←────────────────────────────────────────────────┘
        ↓
   [processing] (if gateway returned "processing")
        ↓
        ↓ (periodically checked by reconcile.worker)
        ↓
   [succeeded/failed] (final status from gateway)
```

## Components

### 1. Payment Creation (Immediate)

**File**: `src/core/idempotency/idempotency.service.js`

When a payment intent is created:
1. Insert payment record with `status='processing'`
2. Enqueue job to `payment_charge` queue
3. Return payment details to client immediately (202 Accepted)

```javascript
// After DB insert:
await queueClient.add('payment_charge', 'payment.charge', { paymentId }, {
    removeOnComplete: true,
    attempts: 5,
    backoff: { type: 'exponential', delay: 250 }
});
```

### 2. Charge Worker (Background)

**File**: `src/workers/charge.worker.js`

**Trigger**: Jobs from `payment_charge` queue

**Process**:
1. Fetch payment from DB with `FOR UPDATE SKIP LOCKED`
2. Skip if already has `gateway_charge_id`
3. Call `gatewayClient.charge({ amount, currency, idempotencyKey })`
4. Update DB with:
   - `gateway_charge_id` = response.id
   - `status` = response.status (succeeded/failed/processing)
5. If gateway call fails, mark payment as `failed`

**Retry Logic**: 
- BullMQ automatically retries failed jobs
- Default: 3 attempts with exponential backoff (2s, 4s, 8s)

**Example Log Flow**:
```
charge.worker job started (paymentId: abc123)
charge.worker calling gateway (amount: 100, currency: USD)
gatewayClient.charge simulated (chargeId: ch_xyz, status: succeeded)
charge.worker job succeeded (gatewayChargeId: ch_xyz, status: succeeded)
```

### 3. Reconcile Worker (Scheduled)

**File**: `src/workers/reconcile.worker.js`

**Trigger**: 
- Scheduled every 5 minutes (cron: `*/5 * * * *`)
- Manual via `POST /api/payments/reconcile`

**Process**:
1. Find all payments where:
   - Status is NOT final (`succeeded`, `failed`, `refunded`)
   - Has `gateway_charge_id`
   - Updated in last 30 minutes
2. For each payment:
   - Call `gatewayClient.lookup(gateway_charge_id)`
   - If status changed, update DB
3. Continue even if individual payments fail

**Query**:
```sql
SELECT id, status, gateway_charge_id, updated_at
FROM payments
WHERE status NOT IN ('succeeded', 'failed', 'refunded')
  AND gateway_charge_id IS NOT NULL
  AND updated_at >= NOW() - '30 minutes'::interval
ORDER BY updated_at ASC
```

**Example Log Flow**:
```
reconcile.worker job started
reconcile.worker found candidates (count: 3)
reconcile.worker reconciling payment (paymentId: abc123, currentStatus: processing)
gatewayClient.lookup simulated (chargeId: ch_xyz, status: succeeded)
reconcile.worker updated status (oldStatus: processing, newStatus: succeeded)
reconcile.worker job completed (processed: 3)
```

### 4. Gateway Client (Simulated)

**File**: `src/utils/gateway-client.js`

**Methods**:

#### `charge({ amount, currency, idempotencyKey })`
- Simulates creating a charge with payment gateway
- Returns: `{ id, amount, currency, status }`
- Status distribution: 80% succeeded, 15% processing, 5% failed

#### `lookup(chargeId)`
- Simulates fetching charge status from gateway
- Returns: `{ id, status }`
- Status distribution: 85% succeeded, 15% failed

**Production**: Replace with actual gateway API calls (Stripe, Adyen, etc.)

## Status Transitions

### Valid Statuses
- `processing` - Initial state, payment submitted to gateway
- `succeeded` - Payment completed successfully
- `failed` - Payment failed (decline, error, etc.)
- `refunded` - Payment was refunded (not implemented yet)

### Transition Flow
```
processing → succeeded (via charge.worker or reconcile.worker)
processing → failed (via charge.worker or reconcile.worker)
processing → processing (gateway still processing, reconcile.worker checks later)
succeeded → refunded (future: refund endpoint)
failed → refunded (future: partial refund)
```

## Frontend Integration

### Payment Details Page

**File**: `frontend/pages/PaymentDetails.tsx`

**Polling**:
- Fetches payment status every 3 seconds
- Stops polling when status is `succeeded` or `failed`
- Updates UI in real-time

```typescript
useEffect(() => {
  fetchPayment();
  
  // Poll every 3 seconds
  const interval = setInterval(() => {
    fetchPayment(true);
  }, 3000);
  
  return () => clearInterval(interval);
}, [id]);
```

### Dashboard

**File**: `frontend/pages/Dashboard.tsx`

**Auto-refresh**:
- Refreshes payment list every 10 seconds
- Shows latest status for recent payments

## Testing the Flow

### 1. Create a Payment
```bash
curl -X POST http://localhost:3467/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "orderId": "ORD-TEST-123",
    "amount": 100,
    "currency": "USD"
  }'
```

Expected response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "orderId": "ORD-TEST-123",
  "status": "processing",
  ...
}
```

### 2. Check Worker Logs

Watch the backend logs for:
```
charge.worker job started
gatewayClient.charge simulated (status: succeeded)
charge.worker job succeeded
```

### 3. Verify Status Update

```bash
curl http://localhost:3467/api/payments/550e8400-e29b-41d4-a716-446655440000
```

Status should now be `succeeded` or `failed` (based on gateway simulation).

### 4. Test Reconciliation

If payment is stuck in `processing`, manually trigger reconciliation:

```bash
curl -X POST http://localhost:3467/api/payments/reconcile
```

Watch logs:
```
reconcile.worker job started
reconcile.worker found candidates
reconcile.worker updated status (processing → succeeded)
```

## Monitoring & Debugging

### Key Logs to Watch

**Payment Creation**:
```
createPaymentIntent: incoming request
idempotency.createOrRetrieve.start
idempotency.createOrRetrieve.enqueue
```

**Charge Worker**:
```
charge.worker job started
charge.worker calling gateway
charge.worker job succeeded
```

**Reconcile Worker**:
```
reconcile.worker job started
reconcile.worker found candidates
reconcile.worker updated status
```

### Common Issues

#### Payment Stuck in "processing"
- **Cause**: Charge worker failed or gateway returned "processing"
- **Solution**: Check worker logs, manually trigger reconciliation
- **Command**: `curl -X POST http://localhost:3467/api/payments/reconcile`

#### Worker Not Running
- **Cause**: Workers not started in server.js
- **Check**: Look for "Workers: charge.worker and reconcile.worker started" in logs
- **Solution**: Ensure `require('./src/workers/charge.worker')` is in server.js

#### Jobs Not Being Processed
- **Cause**: Redis connection issue or queue configuration error
- **Check**: Verify `REDIS_URL` in .env
- **Solution**: Test Redis connection with `redis-cli ping`

#### No Reconciliation Jobs
- **Cause**: Scheduled job not created
- **Check**: Look for "Reconciliation job scheduled" in logs
- **Solution**: Restart server or manually trigger: `POST /api/payments/reconcile`

## Performance Tuning

### Worker Concurrency

Edit `src/utils/queue.js`:
```javascript
const worker = new Worker(name, processor, {
    ...connectionOptions,
    concurrency: 10  // Process 10 jobs simultaneously (default: 5)
});
```

### Reconciliation Frequency

Edit `server.js`:
```javascript
pattern: '*/2 * * * *'  // Every 2 minutes (default: 5)
```

### Reconciliation Window

Edit `src/workers/reconcile.worker.js`:
```javascript
const DEFAULT_WINDOW_MINUTES = 60;  // Check last 60 minutes (default: 30)
```

## Production Recommendations

1. **Replace Gateway Simulation**:
   - Implement real gateway API calls in `gateway-client.js`
   - Add proper error handling and timeout logic
   - Store webhook signatures for verification

2. **Add Monitoring**:
   - Track worker job success/failure rates
   - Alert on payments stuck in processing > 10 minutes
   - Monitor queue depth and processing time

3. **Optimize Reconciliation**:
   - Use exponential backoff for reconciliation checks
   - Reduce frequency for older payments
   - Add separate queue for urgent reconciliation

4. **Error Handling**:
   - Implement dead letter queue for failed jobs
   - Add manual retry mechanism
   - Log all gateway errors with full context

5. **Security**:
   - Validate webhook signatures
   - Rate limit reconciliation endpoint
   - Encrypt sensitive payment data

## Queue Management

### View Queues (Redis CLI)
```bash
redis-cli
> KEYS bull:payment_charge:*
> KEYS bull:payment_reconcile:*
```

### Clear Failed Jobs
```bash
# In Node.js or backend console
const { queueClient } = require('./src/utils/queue');
await queueClient.payment_charge.clean(0, 1000, 'failed');
```

### Pause/Resume Queue
```javascript
await queueClient.payment_charge.pause();
await queueClient.payment_charge.resume();
```

## Summary

The payment status flow is designed to:
- ✅ Process payments asynchronously (no blocking)
- ✅ Handle gateway failures gracefully
- ✅ Reconcile stuck payments automatically
- ✅ Update frontend in real-time via polling
- ✅ Support idempotent retries
- ✅ Scale horizontally (multiple workers)

Key files:
- `server.js` - Starts workers and schedules reconciliation
- `charge.worker.js` - Processes new payments with gateway
- `reconcile.worker.js` - Updates status of pending payments
- `gateway-client.js` - Simulates gateway API calls
- `PaymentDetails.tsx` - Polls for status updates
