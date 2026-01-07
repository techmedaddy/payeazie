# Payment Status Transition Refactoring - Implementation Summary

## Problem
Payment status transitions were too fast: payments went from `'pending'` to `'processing'` instantly, so the frontend never saw the `'pending'` state.

## Solution Overview
Refactored the backend to model status transitions as explicit business logic with proper sequencing, audit logging, and real-time event emission.

---

## Changes Implemented

### 1. Database Changes

#### Payment Model ([src/db/models/payment.model.js](src/db/models/payment.model.js))
- **Changed**: Default status from `'processing'` to `'pending'`
- **Impact**: All new payments start in pending state

#### New Audit Log Model ([src/db/models/payment_audit.model.js](src/db/models/payment_audit.model.js))
- **Added**: `payment_audit_log` table
- **Fields**: 
  - `id` - UUID primary key
  - `payment_id` - Foreign key to payments
  - `from_status` - Previous status
  - `to_status` - New status
  - `metadata` - JSONB for additional context
  - `created_at` - Timestamp
- **Purpose**: Track every status transition with full audit trail

#### Migration ([migrations/002_add_audit_log_and_pending_status.sql](migrations/002_add_audit_log_and_pending_status.sql))
- Creates audit log table
- Updates default status to 'pending'
- Adds necessary indexes

### 2. Core Services

#### Status Transition Service ([src/core/status-transition/status-transition.service.js](src/core/status-transition/status-transition.service.js))
- **New centralized service** for all status transitions
- **Features**:
  - Validates transitions using ALLOWED_TRANSITIONS map
  - Creates audit log entries in transaction
  - Emits Redis pub/sub events after commit
  - Prevents invalid state transitions
  
- **Allowed Transitions**:
  ```
  pending     → processing, failed
  processing  → succeeded, failed
  succeeded   → (final state)
  failed      → (final state)
  ```

- **Key Functions**:
  - `transitionStatus(paymentId, toStatus, metadata)` - Main transition function
  - `getAuditLog(paymentId)` - Retrieve transition history
  - `isValidTransition(from, to)` - Validation helper
  - `emitStatusEvent(paymentId, from, to, metadata)` - Event emission

#### Updated Orchestrator ([src/core/orchestrator/payment.orchestrator.js](src/core/orchestrator/payment.orchestrator.js))
- **Changed**: Delegates to status transition service
- **Updated**: ALLOWED_TRANSITIONS map to match new flow
- **Simplified**: `applyStatus()` now calls `statusTransitionService.transitionStatus()`

### 3. Worker Changes

#### Charge Worker ([src/workers/charge.worker.js](src/workers/charge.worker.js))
- **Step 1**: Transitions `pending` → `processing` when worker starts (job lock acquired)
- **Step 2**: After gateway success, transitions `processing` → `succeeded`
- **Step 3**: On error, transitions to `failed`
- **Added**: Status transition calls with metadata (worker name, job ID, reason)

**Flow**:
```
1. Worker picks up job from queue
2. Immediately: pending → processing (with metadata)
3. Call gateway API
4. Success: processing → succeeded
   OR
   Failure: processing → failed
```

### 4. API Endpoints

#### SSE Controller ([src/api/controllers/sse.controller.js](src/api/controllers/sse.controller.js))
- **New endpoint**: `GET /api/payments/:paymentId/stream`
- **Protocol**: Server-Sent Events (SSE)
- **Purpose**: Real-time status updates to frontend
- **Features**:
  - Subscribes to Redis channel `payment:{paymentId}:status`
  - Streams events as they occur
  - Auto-closes after final status (succeeded/failed)
  - Keep-alive pings every 30 seconds
  - Proper cleanup on disconnect

#### Payment Controller Updates ([src/api/controllers/payment.controller.js](src/api/controllers/payment.controller.js))
- **New function**: `getPaymentAuditLog()`
- **New endpoint**: `GET /api/payments/:paymentId/audit`
- **Returns**: Complete history of status transitions

#### Routes ([src/api/routes/payment.routes.js](src/api/routes/payment.routes.js))
- Added SSE route: `GET /api/payments/:paymentId/stream`
- Added audit route: `GET /api/payments/:paymentId/audit`

### 5. Event System

#### Redis Pub/Sub
- **Publisher**: Created in status-transition.service.js
- **Channels**:
  - `payment:{paymentId}:status` - Payment-specific events
  - `payment:status:all` - Global monitoring channel

- **Event Structure**:
  ```json
  {
    "type": "payment.status.changed",
    "paymentId": "uuid",
    "fromStatus": "pending",
    "toStatus": "processing",
    "timestamp": "2026-01-07T10:00:00.000Z",
    "metadata": {
      "worker": "charge.worker",
      "jobId": "123",
      "reason": "Worker acquired job lock"
    }
  }
  ```

---

## API Documentation

### New Endpoints

#### Stream Payment Status Updates (SSE)
```http
GET /api/payments/:paymentId/stream
```

**Response** (text/event-stream):
```
data: {"type":"payment.status.changed","paymentId":"...","fromStatus":"pending","toStatus":"processing",...}

data: {"type":"payment.status.changed","paymentId":"...","fromStatus":"processing","toStatus":"succeeded",...}
```

**Client Example**:
```javascript
const eventSource = new EventSource(
  `http://localhost:3000/api/payments/${paymentId}/stream`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Status changed:', data.fromStatus, '→', data.toStatus);
  updateUI(data);
};

eventSource.onerror = () => {
  console.log('Connection closed');
};
```

#### Get Payment Audit Log
```http
GET /api/payments/:paymentId/audit
```

**Response**:
```json
{
  "paymentId": "uuid",
  "auditLog": [
    {
      "id": "uuid",
      "payment_id": "uuid",
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
      "id": "uuid",
      "payment_id": "uuid",
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

---

## Testing

See [TEST_STRATEGY.md](TEST_STRATEGY.md) for comprehensive testing guide.

### Quick Test

```bash
# Start backend
cd backend
npm run migrate  # Run migrations first
npm run dev

# In another terminal, create a payment
PAYMENT_ID=$(curl -X POST http://localhost:3000/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"orderId":"ORD-TEST","amount":1000,"currency":"USD"}' \
  | jq -r '.id')

echo "Payment ID: $PAYMENT_ID"

# Check initial status (should be "pending")
curl http://localhost:3000/api/payments/$PAYMENT_ID | jq '.status'

# Stream real-time updates
curl -N http://localhost:3000/api/payments/$PAYMENT_ID/stream

# Check audit log after completion
curl http://localhost:3000/api/payments/$PAYMENT_ID/audit | jq
```

---

## Frontend Integration

### Using SSE for Real-Time Updates

```typescript
// Example: PaymentDetails.tsx or Dashboard.tsx

import { useEffect, useState } from 'react';

function usePaymentStatusStream(paymentId: string) {
  const [status, setStatus] = useState<PaymentStatus>();
  const [history, setHistory] = useState<StatusChange[]>([]);

  useEffect(() => {
    if (!paymentId) return;

    const eventSource = new EventSource(
      `${API_BASE_URL}/payments/${paymentId}/stream`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      setStatus(data.toStatus);
      setHistory(prev => [...prev, {
        from: data.fromStatus,
        to: data.toStatus,
        timestamp: data.timestamp
      }]);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [paymentId]);

  return { status, history };
}

// Usage in component
function PaymentDetails({ paymentId }: { paymentId: string }) {
  const { status, history } = usePaymentStatusStream(paymentId);

  return (
    <div>
      <StatusBadge status={status} />
      
      <h3>Status History</h3>
      <ul>
        {history.map((change, i) => (
          <li key={i}>
            {change.from} → {change.to} at {change.timestamp}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Polling Alternative (if SSE not available)

```typescript
function usePaymentStatusPolling(paymentId: string, interval = 2000) {
  const [status, setStatus] = useState<PaymentStatus>();

  useEffect(() => {
    if (!paymentId) return;

    const poll = async () => {
      const payment = await PaymentService.getPaymentById(paymentId);
      setStatus(payment.status);
      
      // Stop polling if final status reached
      if (payment.status === 'succeeded' || payment.status === 'failed') {
        clearInterval(timer);
      }
    };

    poll(); // Initial poll
    const timer = setInterval(poll, interval);

    return () => clearInterval(timer);
  }, [paymentId, interval]);

  return status;
}
```

---

## Migration Guide

### Running the Migration

```bash
cd backend

# Run database migrations
npm run migrate

# Or manually
node scripts/migrate.js
```

### Rollback Plan

If issues occur, you can rollback by:

1. Reverting the default status:
```sql
ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'processing';
```

2. Dropping the audit log table:
```sql
DROP TABLE IF EXISTS payment_audit_log;
```

### Gradual Rollout

For production, consider a gradual rollout:

1. Deploy code with feature flag
2. Monitor audit logs for any issues
3. Gradually enable for more traffic
4. Monitor metrics (time in each status)

---

## Monitoring

### Key Metrics

1. **Average Time in Pending**: Should be < 1 second
2. **Average Time in Processing**: Should be < 5 seconds
3. **Failed Transitions**: Should be 0 (except business logic failures)
4. **Stuck Payments**: Payments in non-final state > 60 seconds

### Redis Monitoring

Subscribe to global events channel:
```bash
redis-cli SUBSCRIBE payment:status:all
```

### Database Queries

```sql
-- Count payments by status
SELECT status, COUNT(*) 
FROM payments 
GROUP BY status;

-- Find stuck payments
SELECT id, order_id, status, created_at, updated_at
FROM payments
WHERE status IN ('pending', 'processing')
  AND updated_at < NOW() - INTERVAL '60 seconds'
ORDER BY created_at DESC;

-- Audit log statistics
SELECT 
  to_status,
  COUNT(*) as transitions,
  AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY payment_id ORDER BY created_at)))) as avg_seconds
FROM payment_audit_log
GROUP BY to_status;
```

---

## Troubleshooting

### Payment stuck in "pending"
- **Cause**: Worker not processing queue
- **Check**: BullMQ worker is running (`npm run worker:charge`)
- **Check**: Redis connection is healthy
- **Fix**: Restart worker

### Payment stuck in "processing"
- **Cause**: Worker crashed mid-processing
- **Check**: Worker logs for errors
- **Check**: Gateway API availability
- **Fix**: Job will retry automatically (max 5 attempts)

### Events not reaching frontend
- **Cause**: Redis pub/sub connection issue
- **Check**: Redis logs
- **Check**: SSE connection in browser DevTools (Network tab)
- **Fix**: Reconnect SSE stream

### Invalid transition errors
- **Cause**: Race condition or manual status update
- **Check**: Audit log for sequence
- **Fix**: Adjust ALLOWED_TRANSITIONS if business logic changed

---

## Benefits

✅ **Explicit Business Logic**: Status transitions are clearly defined  
✅ **Full Audit Trail**: Every transition is logged  
✅ **Real-Time Updates**: Frontend sees changes immediately via SSE  
✅ **Better UX**: Users see the full payment flow  
✅ **Debugging**: Audit logs make troubleshooting easier  
✅ **Monitoring**: Can track time spent in each status  
✅ **Compliance**: Complete audit trail for financial operations  

---

## Files Changed

### New Files
- `src/core/status-transition/status-transition.service.js`
- `src/api/controllers/sse.controller.js`
- `src/db/models/payment_audit.model.js`
- `migrations/002_add_audit_log_and_pending_status.sql`
- `TEST_STRATEGY.md`
- `IMPLEMENTATION_SUMMARY.md` (this file)

### Modified Files
- `src/db/models/payment.model.js` - Changed default status
- `src/workers/charge.worker.js` - Added status transitions at key points
- `src/core/orchestrator/payment.orchestrator.js` - Updated to use status transition service
- `src/api/controllers/payment.controller.js` - Added audit log endpoint
- `src/api/routes/payment.routes.js` - Added SSE and audit routes

### Total Changes
- 6 new files
- 5 modified files
- ~800 lines of new code
- 0 breaking changes to existing API

---

## Next Steps

1. ✅ Run database migrations
2. ✅ Test locally with manual curl commands
3. ⏳ Integrate SSE in frontend
4. ⏳ Write unit tests (see TEST_STRATEGY.md)
5. ⏳ Deploy to staging
6. ⏳ Set up monitoring alerts
7. ⏳ Deploy to production
