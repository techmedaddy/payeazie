# Quick Start Guide: Testing Payment Status Transitions

This guide will help you quickly test the refactored payment status transition system.

## Prerequisites

- Node.js installed
- PostgreSQL running
- Redis running
- Backend and frontend dependencies installed

## Step 1: Database Setup

```bash
cd backend

# Run migration to create audit_log table
node scripts/init-db.js

# Verify tables exist
psql $DATABASE_URL -c "\dt"
# Should show: payments, gateway_events, payment_audit_log
```

## Step 2: Start Backend Services

```bash
# Terminal 1: Start API server
cd backend
npm start

# Terminal 2: Start charge worker
cd backend
node src/workers/charge.worker.js

# Terminal 3: Start reconcile worker (optional)
cd backend
node src/workers/reconcile.worker.js
```

## Step 3: Start Frontend

```bash
cd frontend
npm run dev
# Opens at http://localhost:5173
```

## Step 4: Create a Test Payment

### Option A: Using Frontend UI

1. Open http://localhost:5173
2. Fill in the payment form:
   - Order ID: `TEST-001`
   - Amount: `100.00`
   - Currency: `USD`
3. Click "Create Payment Intent"
4. Watch the status badge update in real-time!

### Option B: Using curl

```bash
# Create payment
curl -X POST http://localhost:3000/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "orderId": "TEST-001",
    "amount": 10000,
    "currency": "USD"
  }'

# Should return status: "pending"
```

## Step 5: Watch Status Transitions

### Option A: Frontend Real-Time View

1. After creating payment, click on it in the dashboard
2. Watch the "Live" indicator (green badge with WiFi icon)
3. Observe status changing: `pending` → `processing` → `succeeded`

### Option B: Using curl to Check Status

```bash
# Get payment status (replace PAYMENT_ID)
curl http://localhost:3000/api/payments/PAYMENT_ID

# Get audit log (see all transitions)
curl http://localhost:3000/api/payments/PAYMENT_ID/audit
```

### Option C: Using curl with SSE

```bash
# Stream real-time updates (replace PAYMENT_ID)
curl -N http://localhost:3000/api/payments/PAYMENT_ID/stream

# You'll see:
# data: {"type":"payment.status.changed","paymentId":"...","fromStatus":"pending","toStatus":"processing",...}
# data: {"type":"payment.status.changed","paymentId":"...","fromStatus":"processing","toStatus":"succeeded",...}
```

## Step 6: Verify Audit Log

```bash
# Get complete transition history
curl http://localhost:3000/api/payments/PAYMENT_ID/audit | json_pp

# Expected output:
# {
#   "paymentId": "...",
#   "auditLog": [
#     {
#       "id": "...",
#       "payment_id": "...",
#       "from_status": "pending",
#       "to_status": "processing",
#       "metadata": {
#         "worker": "charge.worker",
#         "jobId": "...",
#         "reason": "Worker acquired job lock"
#       },
#       "created_at": "2026-01-07T..."
#     },
#     {
#       "id": "...",
#       "payment_id": "...",
#       "from_status": "processing",
#       "to_status": "succeeded",
#       "metadata": {
#         "worker": "charge.worker",
#         "jobId": "...",
#         "reason": "Gateway charge completed with status: succeeded"
#       },
#       "created_at": "2026-01-07T..."
#     }
#   ]
# }
```

## Step 7: Test Failed Payment

To test failure scenarios, create a payment with a special amount that triggers failure in the mock gateway:

```bash
# Create payment that will fail
curl -X POST http://localhost:3000/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "orderId": "TEST-FAIL-001",
    "amount": 666,
    "currency": "USD"
  }'

# Watch it transition: pending → processing → failed
```

## Step 8: Run Tests

### Backend Tests

```bash
cd backend

# Run worker tests
npm test -- charge.worker.test.js

# Run integration tests (requires services running)
npm test -- payment-lifecycle.test.js
```

### Frontend Tests

```bash
cd frontend

# Run all tests
npm test

# Run specific test suites
npm test -- StatusBadge.test.tsx
npm test -- payments.test.ts
npm test -- Dashboard.test.tsx
```

## Debugging Tips

### Check Worker Logs

```bash
# Worker should log:
# - "charge.worker: transitioned to processing"
# - "charge.worker: transitioned to succeeded"
```

### Monitor Redis Events

```bash
# Subscribe to all status change events
redis-cli
> SUBSCRIBE payment:status:all

# You'll see events as payments transition
```

### Check Database

```bash
psql $DATABASE_URL

-- See recent payments
SELECT id, order_id, status, created_at 
FROM payments 
ORDER BY created_at DESC 
LIMIT 10;

-- See audit log for a payment
SELECT from_status, to_status, metadata, created_at 
FROM payment_audit_log 
WHERE payment_id = 'PAYMENT_ID' 
ORDER BY created_at;
```

### Browser DevTools

1. Open DevTools → Network tab
2. Create a payment and navigate to details page
3. Look for `stream` request (EventStream type)
4. Messages tab shows real-time events

## Common Issues

### Issue: Frontend shows "Offline" instead of "Live"

**Solution**: Check that:
- Backend is running
- SSE endpoint is accessible: `curl -N http://localhost:3000/api/payments/:id/stream`
- CORS is configured correctly
- Browser supports EventSource

### Issue: Status stuck in "pending"

**Solution**: Check that:
- Charge worker is running
- Redis is accessible
- Queue is processing jobs: Check worker logs

### Issue: No audit log entries

**Solution**: Check that:
- `payment_audit_log` table exists
- `node scripts/init-db.js` was run
- Worker is using `statusTransitionService.transitionStatus()`

### Issue: SSE not working

**Solution**:
- Check browser console for errors
- Verify VITE_API_URL is set correctly
- Test SSE endpoint with curl first
- Check that Redis is running (required for pub/sub)

## Performance Testing

Create multiple payments quickly:

```bash
# Create 10 payments
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/payments/intents \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $(uuidgen)" \
    -d "{
      \"orderId\": \"TEST-$i\",
      \"amount\": $((RANDOM % 10000 + 1000)),
      \"currency\": \"USD\"
    }" &
done
wait

# Watch dashboard update in real-time!
```

## Next Steps

1. Review [PAYMENT_STATUS_REFACTORING.md](./PAYMENT_STATUS_REFACTORING.md) for architecture details
2. Check test files for usage examples
3. Explore audit logs for debugging
4. Customize worker transitions for your gateway
5. Add custom events and webhooks

## Support

For issues or questions:
1. Check logs (backend and worker)
2. Review audit log for specific payment
3. Test SSE endpoint independently
4. Verify database state

Happy testing! 🎉
