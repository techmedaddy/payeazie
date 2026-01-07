# Quick Start Guide - Payment Status Transitions

## Prerequisites
- Node.js installed
- PostgreSQL running
- Redis running
- Backend environment configured

## Step 1: Run Database Migration

```bash
cd backend

# Run migrations to create audit_log table and update default status
npm run migrate

# Or manually:
node scripts/migrate.js
```

Expected output:
```
Starting database migrations...

Running migration: 001_alter_order_id_to_text.sql
✓ 001_alter_order_id_to_text.sql completed successfully

Running migration: 002_add_audit_log_and_pending_status.sql
✓ 002_add_audit_log_and_pending_status.sql completed successfully

✓ All migrations completed successfully
```

## Step 2: Install Dependencies (if needed)

```bash
# Make sure ioredis is installed for Redis pub/sub
npm install ioredis

# For testing (optional)
npm install --save-dev jest supertest
```

## Step 3: Start the Backend

```bash
# Start the API server
npm run dev

# In another terminal, start the charge worker
npm run worker:charge
```

## Step 4: Test the Flow

### Create a Payment
```bash
# Create a payment and capture the ID
PAYMENT_ID=$(curl -X POST http://localhost:3000/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "orderId": "ORD-QUICKSTART-1",
    "amount": 1000,
    "currency": "USD"
  }' | jq -r '.id')

echo "Created Payment ID: $PAYMENT_ID"
```

### Check Status Immediately
```bash
# Should show "pending"
curl http://localhost:3000/api/payments/$PAYMENT_ID | jq '.status'
```

### Stream Real-Time Updates
```bash
# Open SSE stream (will show status changes in real-time)
curl -N http://localhost:3000/api/payments/$PAYMENT_ID/stream
```

You should see output like:
```
data: {"type":"payment.status.changed","paymentId":"...","fromStatus":"pending","toStatus":"processing","timestamp":"..."}

data: {"type":"payment.status.changed","paymentId":"...","fromStatus":"processing","toStatus":"succeeded","timestamp":"..."}
```

### Check Final Status
```bash
# After a few seconds, should show "succeeded"
curl http://localhost:3000/api/payments/$PAYMENT_ID | jq '.status'
```

### View Audit Log
```bash
# See complete transition history
curl http://localhost:3000/api/payments/$PAYMENT_ID/audit | jq
```

Expected output:
```json
{
  "paymentId": "...",
  "auditLog": [
    {
      "id": "...",
      "payment_id": "...",
      "from_status": "pending",
      "to_status": "processing",
      "metadata": {
        "worker": "charge.worker",
        "jobId": "123",
        "reason": "Worker acquired job lock"
      },
      "created_at": "2026-01-07T10:00:00.000Z"
    },
    {
      "id": "...",
      "payment_id": "...",
      "from_status": "processing",
      "to_status": "succeeded",
      "metadata": {
        "worker": "charge.worker",
        "jobId": "123",
        "reason": "Gateway charge completed successfully"
      },
      "created_at": "2026-01-07T10:00:05.000Z"
    }
  ]
}
```

## Step 5: Monitor Redis Events (Optional)

In a separate terminal, monitor all status change events:

```bash
redis-cli SUBSCRIBE payment:status:all
```

Then create a payment in another terminal. You'll see events like:
```
1) "message"
2) "payment:status:all"
3) "{\"type\":\"payment.status.changed\",\"paymentId\":\"...\",\"fromStatus\":\"pending\",\"toStatus\":\"processing\",...}"
```

## Step 6: Run Tests

```bash
# Install test dependencies
npm install --save-dev jest supertest

# Run unit tests
npm test tests/unit/status-transition.service.test.js

# Run all tests
npm test
```

## Verification Checklist

✅ Payment created with status `"pending"`  
✅ Status transitions to `"processing"` when worker starts  
✅ Status transitions to `"succeeded"` when complete  
✅ SSE stream shows real-time updates  
✅ Audit log records all transitions  
✅ Redis events are emitted  

## Troubleshooting

### Payment stuck in "pending"
**Cause**: Worker not running  
**Fix**: 
```bash
npm run worker:charge
```

### "REDIS_URL is required" error
**Cause**: Environment variable not set  
**Fix**: 
```bash
export REDIS_URL=redis://localhost:6379
# Or add to .env file
echo "REDIS_URL=redis://localhost:6379" >> .env
```

### "DATABASE_URL is required" error
**Cause**: Database connection not configured  
**Fix**: 
```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/payeazie
# Or add to .env file
echo "DATABASE_URL=postgresql://user:password@localhost:5432/payeazie" >> .env
```

### Migration fails with "relation already exists"
**Cause**: Tables already exist  
**Solution**: This is usually safe to ignore. The migration uses `CREATE TABLE IF NOT EXISTS`.

### SSE connection closes immediately
**Cause**: Payment already in final status  
**Solution**: Create a new payment or connect before the payment completes

## Next Steps

1. ✅ Verify the flow works locally
2. **Integrate SSE in Frontend**: Update React components to use SSE
3. **Write More Tests**: Add integration and E2E tests
4. **Set Up Monitoring**: Add metrics for transition times
5. **Deploy to Staging**: Test in staging environment
6. **Production Rollout**: Deploy with feature flag

## Frontend Integration Example

```typescript
// PaymentDetails.tsx
import { useEffect, useState } from 'react';

function PaymentDetails({ paymentId }: { paymentId: string }) {
  const [status, setStatus] = useState<string>('pending');
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const eventSource = new EventSource(
      `http://localhost:3000/api/payments/${paymentId}/stream`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Status update:', data);
      
      setStatus(data.toStatus);
      setHistory(prev => [...prev, data]);
    };

    eventSource.onerror = () => {
      console.log('SSE connection closed');
      eventSource.close();
    };

    return () => eventSource.close();
  }, [paymentId]);

  return (
    <div>
      <h2>Payment Status: {status}</h2>
      <StatusBadge status={status} />
      
      <h3>History</h3>
      <ul>
        {history.map((event, i) => (
          <li key={i}>
            {event.fromStatus} → {event.toStatus}
            <br />
            <small>{new Date(event.timestamp).toLocaleString()}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Support

- **Documentation**: See [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **Test Strategy**: See [TEST_STRATEGY.md](TEST_STRATEGY.md)
- **Issues**: Check worker logs and Redis connection
