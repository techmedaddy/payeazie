# Payment Status Transition - Test Strategy

## Overview
This document outlines the test strategy for verifying that payment status transitions work correctly with the refactored backend system. The frontend should now see the full sequence: `pending` → `processing` → `succeeded/failed`.

## Architecture Changes

### Before
- Payment created with status = `'processing'`
- Worker immediately processes it
- Frontend often misses the `'pending'` state

### After
- Payment created with status = `'pending'`
- Worker transitions to `'processing'` when it acquires the job
- Worker transitions to `'succeeded'` or `'failed'` when complete
- Redis pub/sub events emitted for each transition
- Audit log records every status change

## Components Modified

1. **Database Model** (`src/db/models/payment.model.js`)
   - Default status changed from `'processing'` to `'pending'`

2. **Status Transition Service** (`src/core/status-transition/status-transition.service.js`)
   - New service that manages all status transitions
   - Validates transitions using ALLOWED_TRANSITIONS map
   - Creates audit log entries
   - Emits Redis pub/sub events

3. **Charge Worker** (`src/workers/charge.worker.js`)
   - Step 1: Transitions `pending` → `processing` when starting
   - Step 2: Transitions `processing` → `succeeded` after gateway success
   - Step 3: Transitions `processing` → `failed` on error

4. **SSE Controller** (`src/api/controllers/sse.controller.js`)
   - New endpoint: `GET /api/payments/:paymentId/stream`
   - Streams real-time status updates via Server-Sent Events

5. **Audit Log API** (`src/api/controllers/payment.controller.js`)
   - New endpoint: `GET /api/payments/:paymentId/audit`
   - Returns full history of status transitions

## Test Strategy

### 1. Unit Tests

#### Status Transition Service
```javascript
// File: tests/unit/status-transition.service.test.js

describe('Status Transition Service', () => {
  test('should allow pending → processing transition', async () => {
    const payment = await createTestPayment({ status: 'pending' });
    const updated = await statusTransitionService.transitionStatus(
      payment.id, 
      'processing'
    );
    expect(updated.status).toBe('processing');
  });

  test('should allow processing → succeeded transition', async () => {
    const payment = await createTestPayment({ status: 'processing' });
    const updated = await statusTransitionService.transitionStatus(
      payment.id, 
      'succeeded'
    );
    expect(updated.status).toBe('succeeded');
  });

  test('should reject invalid transition', async () => {
    const payment = await createTestPayment({ status: 'succeeded' });
    await expect(
      statusTransitionService.transitionStatus(payment.id, 'processing')
    ).rejects.toThrow('Invalid transition');
  });

  test('should create audit log entry', async () => {
    const payment = await createTestPayment({ status: 'pending' });
    await statusTransitionService.transitionStatus(payment.id, 'processing');
    
    const auditLog = await statusTransitionService.getAuditLog(payment.id);
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].from_status).toBe('pending');
    expect(auditLog[0].to_status).toBe('processing');
  });

  test('should emit Redis event', async () => {
    const mockSubscriber = createMockRedisSubscriber();
    const payment = await createTestPayment({ status: 'pending' });
    
    await statusTransitionService.transitionStatus(payment.id, 'processing');
    
    await waitForEvent(mockSubscriber, `payment:${payment.id}:status`);
    expect(mockSubscriber.receivedEvents).toHaveLength(1);
    expect(mockSubscriber.receivedEvents[0].toStatus).toBe('processing');
  });
});
```

#### Charge Worker
```javascript
// File: tests/unit/charge.worker.test.js

describe('Charge Worker', () => {
  test('should transition to processing when job starts', async () => {
    const payment = await createTestPayment({ status: 'pending' });
    const job = createMockJob({ paymentId: payment.id });
    
    // Mock gateway to delay response
    mockGateway.charge = jest.fn(() => delay(100).then(() => ({ 
      id: 'ch_123', 
      status: 'succeeded' 
    })));
    
    const workerPromise = processJob(job);
    
    // Check status immediately after worker starts
    await delay(10);
    const updated = await getPayment(payment.id);
    expect(updated.status).toBe('processing');
    
    await workerPromise;
  });

  test('should transition to succeeded on gateway success', async () => {
    const payment = await createTestPayment({ status: 'pending' });
    mockGateway.charge = jest.fn().mockResolvedValue({ 
      id: 'ch_123', 
      status: 'succeeded' 
    });
    
    await processJob({ paymentId: payment.id });
    
    const updated = await getPayment(payment.id);
    expect(updated.status).toBe('succeeded');
  });

  test('should transition to failed on gateway error', async () => {
    const payment = await createTestPayment({ status: 'pending' });
    mockGateway.charge = jest.fn().mockRejectedValue(
      new Error('Insufficient funds')
    );
    
    await expect(processJob({ paymentId: payment.id })).rejects.toThrow();
    
    const updated = await getPayment(payment.id);
    expect(updated.status).toBe('failed');
  });
});
```

### 2. Integration Tests

#### API + Worker + Events
```javascript
// File: tests/integration/payment-flow.test.js

describe('Payment Flow Integration', () => {
  test('should see full status sequence: pending → processing → succeeded', async () => {
    const statuses = [];
    
    // Subscribe to status events
    const subscriber = createRedisSubscriber();
    let paymentId;
    
    // Create payment
    const response = await request(app)
      .post('/api/payments/intents')
      .set('Idempotency-Key', uuid())
      .send({ orderId: 'ORD-123', amount: 1000, currency: 'USD' });
    
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('pending');
    paymentId = response.body.id;
    statuses.push('pending');
    
    // Subscribe to events
    await subscriber.subscribe(`payment:${paymentId}:status`);
    
    subscriber.on('message', (channel, message) => {
      const event = JSON.parse(message);
      statuses.push(event.toStatus);
    });
    
    // Wait for worker to complete (with timeout)
    await waitForCondition(() => statuses.includes('succeeded'), 5000);
    
    // Verify sequence
    expect(statuses).toEqual(['pending', 'processing', 'succeeded']);
    
    // Verify audit log
    const auditResponse = await request(app)
      .get(`/api/payments/${paymentId}/audit`);
    
    expect(auditResponse.body.auditLog).toHaveLength(2);
    expect(auditResponse.body.auditLog[0].from_status).toBe('pending');
    expect(auditResponse.body.auditLog[0].to_status).toBe('processing');
    expect(auditResponse.body.auditLog[1].from_status).toBe('processing');
    expect(auditResponse.body.auditLog[1].to_status).toBe('succeeded');
  });

  test('should handle failed payment correctly', async () => {
    mockGateway.charge = jest.fn().mockRejectedValue(
      new Error('Card declined')
    );
    
    const response = await request(app)
      .post('/api/payments/intents')
      .set('Idempotency-Key', uuid())
      .send({ orderId: 'ORD-456', amount: 1000, currency: 'USD' });
    
    const paymentId = response.body.id;
    
    // Wait for worker to complete
    await waitForCondition(async () => {
      const payment = await getPayment(paymentId);
      return payment.status === 'failed';
    }, 5000);
    
    const payment = await getPayment(paymentId);
    expect(payment.status).toBe('failed');
    
    // Verify audit log
    const auditResponse = await request(app)
      .get(`/api/payments/${paymentId}/audit`);
    
    const logs = auditResponse.body.auditLog;
    expect(logs[logs.length - 1].to_status).toBe('failed');
  });
});
```

### 3. Frontend Integration Tests

#### SSE Streaming
```javascript
// File: tests/integration/sse.test.js

describe('SSE Status Streaming', () => {
  test('should receive real-time status updates', async () => {
    const payment = await createTestPayment({ status: 'pending' });
    const receivedEvents = [];
    
    // Connect to SSE endpoint
    const eventSource = new EventSource(
      `http://localhost:3000/api/payments/${payment.id}/stream`
    );
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      receivedEvents.push(data);
    };
    
    // Trigger status transitions
    await statusTransitionService.transitionStatus(payment.id, 'processing');
    await delay(100);
    await statusTransitionService.transitionStatus(payment.id, 'succeeded');
    await delay(100);
    
    eventSource.close();
    
    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].toStatus).toBe('processing');
    expect(receivedEvents[1].toStatus).toBe('succeeded');
  });

  test('should close connection after final status', async () => {
    const payment = await createTestPayment({ status: 'pending' });
    let connectionClosed = false;
    
    const eventSource = new EventSource(
      `http://localhost:3000/api/payments/${payment.id}/stream`
    );
    
    eventSource.onerror = () => {
      connectionClosed = true;
    };
    
    await statusTransitionService.transitionStatus(payment.id, 'processing');
    await statusTransitionService.transitionStatus(payment.id, 'succeeded');
    
    await waitForCondition(() => connectionClosed, 2000);
    expect(connectionClosed).toBe(true);
  });
});
```

### 4. Manual Testing Checklist

#### Test 1: Basic Payment Flow
```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Create payment and watch status
PAYMENT_ID=$(curl -X POST http://localhost:3000/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"orderId":"ORD-TEST-1","amount":1000,"currency":"USD"}' \
  | jq -r '.id')

echo "Payment ID: $PAYMENT_ID"

# Check status immediately
curl http://localhost:3000/api/payments/$PAYMENT_ID | jq '.status'
# Expected: "pending"

# Wait 1 second
sleep 1

# Check status again
curl http://localhost:3000/api/payments/$PAYMENT_ID | jq '.status'
# Expected: "succeeded" (or "processing" if still running)

# Check audit log
curl http://localhost:3000/api/payments/$PAYMENT_ID/audit | jq '.auditLog'
# Expected: Array with transitions
```

#### Test 2: SSE Real-time Updates
```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Listen to SSE stream
curl -N http://localhost:3000/api/payments/PAYMENT_ID/stream

# Terminal 3: Create payment
curl -X POST http://localhost:3000/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"orderId":"ORD-TEST-2","amount":1000,"currency":"USD"}'

# Terminal 2 should show:
# data: {"type":"payment.status.changed","paymentId":"...","fromStatus":"pending","toStatus":"processing",...}
# data: {"type":"payment.status.changed","paymentId":"...","fromStatus":"processing","toStatus":"succeeded",...}
```

#### Test 3: Frontend Dashboard
```javascript
// In frontend app, update Dashboard.tsx to use SSE

useEffect(() => {
  if (!paymentId) return;
  
  const eventSource = new EventSource(
    `http://localhost:3000/api/payments/${paymentId}/stream`
  );
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Status update:', data);
    
    // Update payment in state
    setPayments(prev => prev.map(p => 
      p.id === data.paymentId 
        ? { ...p, status: data.toStatus }
        : p
    ));
  };
  
  return () => eventSource.close();
}, [paymentId]);
```

### 5. Performance Tests

```javascript
// File: tests/performance/concurrent-payments.test.js

describe('Concurrent Payment Processing', () => {
  test('should handle 100 concurrent payments correctly', async () => {
    const paymentIds = [];
    
    // Create 100 payments concurrently
    const createPromises = Array.from({ length: 100 }, (_, i) => 
      request(app)
        .post('/api/payments/intents')
        .set('Idempotency-Key', uuid())
        .send({ 
          orderId: `ORD-PERF-${i}`, 
          amount: 1000, 
          currency: 'USD' 
        })
        .then(res => {
          paymentIds.push(res.body.id);
          expect(res.body.status).toBe('pending');
        })
    );
    
    await Promise.all(createPromises);
    
    // Wait for all to complete
    await waitForCondition(async () => {
      const payments = await Promise.all(
        paymentIds.map(id => getPayment(id))
      );
      return payments.every(p => 
        p.status === 'succeeded' || p.status === 'failed'
      );
    }, 30000);
    
    // Verify all have audit logs
    for (const id of paymentIds) {
      const auditLog = await statusTransitionService.getAuditLog(id);
      expect(auditLog.length).toBeGreaterThanOrEqual(2);
    }
  });
});
```

## Running Tests

### Setup
```bash
# Install test dependencies
cd backend
npm install --save-dev jest supertest

# Set up test database
createdb payeazie_test
DATABASE_URL=postgresql://user:pass@localhost/payeazie_test npm run migrate
```

### Run Tests
```bash
# Run all tests
npm test

# Run specific test suite
npm test -- tests/unit/status-transition.service.test.js

# Run with coverage
npm test -- --coverage

# Run integration tests only
npm test -- tests/integration

# Run in watch mode
npm test -- --watch
```

## Success Criteria

✅ **Unit Tests**: All status transition validations pass  
✅ **Integration Tests**: Full payment flow shows pending → processing → succeeded  
✅ **Audit Logs**: Every status change is recorded  
✅ **Events**: Redis pub/sub events emitted for each transition  
✅ **SSE**: Frontend receives real-time updates  
✅ **API**: Audit log endpoint returns complete history  
✅ **Performance**: System handles concurrent payments without race conditions  

## Monitoring in Production

1. **Metrics to Track**:
   - Average time in `pending` state
   - Average time in `processing` state
   - Percentage of payments stuck in non-final states
   - Failed transition attempts

2. **Alerts**:
   - Payment in `pending` > 30 seconds
   - Payment in `processing` > 60 seconds
   - Invalid transition attempted
   - Event emission failure

3. **Dashboards**:
   - Payment status distribution
   - Status transition timeline
   - Failed payment reasons
   - Worker queue depth

## Troubleshooting

### Frontend not seeing "pending" status
- Check if worker is processing too fast (add delay in test)
- Verify SSE connection is established before payment creation
- Check audit log to confirm timing

### Status transitions failing
- Check ALLOWED_TRANSITIONS map in status-transition.service.js
- Verify database constraints
- Check audit log for error details

### Events not reaching frontend
- Verify Redis pub/sub is working (`redis-cli SUBSCRIBE payment:status:all`)
- Check SSE connection in browser DevTools
- Verify firewall/proxy settings for SSE

## Next Steps

1. Implement the unit tests described above
2. Run integration tests locally
3. Deploy to staging environment
4. Run manual tests with frontend
5. Set up monitoring and alerts
6. Deploy to production with feature flag
