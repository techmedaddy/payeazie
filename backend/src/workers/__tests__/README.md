# Worker Tests

## Overview

Comprehensive test suites for payment system workers that validate the complete payment lifecycle and reconciliation process.

## Test Files

### 1. [charge.worker.test.js](charge.worker.test.js)
Tests for the charge worker that processes new payments.

**Coverage**: 17 tests covering `pending → processing → succeeded/failed`

**Key Scenarios**:
- ✅ Successful charge (succeeded)
- ✅ Failed charge (failed)
- ✅ Gateway returns processing
- ✅ Error handling
- ✅ Fallback behavior
- ✅ Database transactions
- ✅ Logging & metrics

[📖 Detailed Documentation](charge.worker.test.js)

### 2. [reconcile.worker.test.js](reconcile.worker.test.js) 
Tests for the reconcile worker that fixes stuck payments.

**Coverage**: 26 tests covering reconciliation of `processing` payments

**Key Scenarios**:
- ✅ Gateway returns succeeded → update payment
- ✅ Gateway returns failed → update payment
- ✅ Gateway still processing → leave unchanged
- ✅ Invalid transition blocking
- ✅ Error handling (graceful)
- ✅ Multiple payments
- ✅ Edge cases

[📖 Detailed Documentation](RECONCILE_TESTS.md)

## Quick Start

### Run All Worker Tests
```bash
cd backend
npm test -- src/workers/__tests__/
```

### Run Specific Test File
```bash
# Charge worker tests
npm test -- src/workers/__tests__/charge.worker.test.js

# Reconcile worker tests
npm test -- src/workers/__tests__/reconcile.worker.test.js
```

### Watch Mode
```bash
npm run test:watch -- src/workers/__tests__/
```

### Coverage Report
```bash
npm run test:coverage -- src/workers/__tests__/
```

## Test Summary

| Worker | Tests | Coverage | Duration |
|--------|-------|----------|----------|
| **Charge** | 17 | 95%+ | ~2.5s |
| **Reconcile** | 26 | 95%+ | ~2.0s |
| **Total** | **43** | **95%+** | **~4.5s** |

## Worker Responsibilities

### Charge Worker
**Purpose**: Process new payment charges
**Lifecycle**: `pending → processing → succeeded/failed`

```javascript
// Job payload
{ paymentId: 'pay-123' }

// Process:
1. Transition to 'processing'
2. Call gateway.charge()
3. Update gateway_charge_id
4. Transition to final status (succeeded/failed)
```

### Reconcile Worker  
**Purpose**: Fix payments stuck in processing
**Lifecycle**: `processing → succeeded/failed` (delayed)

```javascript
// No specific job payload - queries database

// Process:
1. Query payments in 'processing' status
2. For each payment:
   - Call gateway.lookup(charge_id)
   - Compare statuses
   - Update if status changed
```

## Test Coverage

### Charge Worker (17 tests)
- ✅ `pending → processing → succeeded` when gateway succeeds
- ✅ `pending → processing → failed` when gateway fails  
- ✅ Gateway returns `processing` (non-terminal)
- ✅ Error handling (missing data, gateway errors)
- ✅ Fallback to `failed` when status missing
- ✅ Database transaction handling
- ✅ Logging and metrics recording

### Reconcile Worker (26 tests)
- ✅ `processing → succeeded` when gateway confirms
- ✅ `processing → failed` when gateway confirms
- ✅ Leave unchanged when still `processing`
- ✅ Handle multiple payments with mixed statuses
- ✅ Block invalid transitions
- ✅ Graceful error handling
- ✅ Edge cases (null values, final states)

## Running the Tests

### Run all worker tests
```bash
cd backend
npm test -- src/workers/__tests__/
```

### Run only charge.worker tests
```bash
npm test -- src/workers/__tests__/charge.worker.test.js
```

### Run with coverage
```bash
npm test -- --coverage src/workers/__tests__/charge.worker.test.js
```

### Run in watch mode (during development)
```bash
npm test -- --watch src/workers/__tests__/charge.worker.test.js
```

### Run specific test suite
```bash
npm test -- src/workers/__tests__/charge.worker.test.js -t "Payment Lifecycle"
```

### Run specific test case
```bash
npm test -- src/workers/__tests__/charge.worker.test.js -t "should transition pending → processing → succeeded"
```

## Test Structure

### Mocking Strategy
All external dependencies are mocked:
- `statusTransition.transitionStatus()` - Mock status transitions
- `gatewayClient.charge()` - Mock gateway responses
- `db.tx()` - Mock database transactions
- `logger` - Mock logging (no console output)
- `metrics` - Mock metrics recording
- `queue.createWorker()` - Mock worker creation, capture processor function

### Test Data
```javascript
const mockPayment = {
    id: 'pay-123',
    order_id: 'ORD-001',
    idempotency_key: 'idem-key-123',
    amount: 10000,
    currency: 'USD',
    status: 'pending',
    gateway_charge_id: null
};

const mockJob = {
    id: 'job-456',
    data: { paymentId: 'pay-123' }
};
```

### Gateway Response Mocks
```javascript
// Success
mockGatewayClient.charge.mockResolvedValue({
    id: 'ch_success_123',
    amount: 10000,
    currency: 'USD',
    status: 'succeeded'
});

// Failure
mockGatewayClient.charge.mockResolvedValue({
    id: 'ch_failed_123',
    status: 'failed'
});

// Processing (needs reconciliation)
mockGatewayClient.charge.mockResolvedValue({
    id: 'ch_processing_123',
    status: 'processing'
});

// Error
mockGatewayClient.charge.mockRejectedValue(
    new Error('Gateway timeout')
);
```

## Key Assertions

### Status Transitions
```javascript
// First transition: pending → processing
expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
    1,
    paymentId,
    'processing',
    expect.objectContaining({
        worker: 'charge.worker',
        jobId: mockJobId,
        reason: 'Worker acquired job lock'
    })
);

// Second transition: processing → succeeded/failed
expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
    2,
    paymentId,
    'succeeded',
    expect.objectContaining({
        chargeId: 'ch_123',
        reason: 'Gateway charge completed with status: succeeded'
    })
);
```

### Gateway Calls
```javascript
expect(mockGatewayClient.charge).toHaveBeenCalledWith({
    amount: 10000,
    currency: 'USD',
    idempotencyKey: 'idem-key-123'
});
```

### Logging
```javascript
// Should log gateway response with full details
expect(mockLogger.info).toHaveBeenCalledWith(
    expect.objectContaining({
        paymentId: 'pay-123',
        gatewayStatus: 'succeeded',
        fullResponse: expect.any(Object)
    }),
    expect.stringContaining('gateway responded')
);
```

## Bugs Tested

### Bug #1: Variable Scope Issue
**Problem**: `chargeResult` declared inside transaction was undefined outside.

**Test**: Verifies that `chargeResult.status` is properly used for final transition.

```javascript
it('should transition to succeeded when gateway returns success', async () => {
    // Gateway returns succeeded
    mockGatewayClient.charge.mockResolvedValue({
        id: 'ch_123',
        status: 'succeeded'
    });
    
    await workerProcessor(job);
    
    // Should transition to 'succeeded' (not undefined)
    expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
        2,
        paymentId,
        'succeeded',  // ✓ Uses actual gateway status
        expect.any(Object)
    );
});
```

### Bug #2: Gateway Returning Non-Terminal Status
**Problem**: Gateway returned `'processing'` 15% of the time, causing stuck payments.

**Test**: Verifies handling when gateway returns `'processing'`.

```javascript
it('should transition to processing when gateway returns processing status', async () => {
    mockGatewayClient.charge.mockResolvedValue({
        id: 'ch_123',
        status: 'processing'
    });
    
    await workerProcessor(job);
    
    // Should set status to 'processing', not stuck
    expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
        2,
        paymentId,
        'processing',
        expect.objectContaining({
            reason: 'Gateway charge completed with status: processing'
        })
    );
});
```

### Bug #3: Status Transition Failures Not Caught
**Problem**: No try/catch around final status transition.

**Test**: Verifies critical errors are logged when transition fails.

```javascript
it('should log critical error when status transition fails', async () => {
    mockStatusTransition.transitionStatus
        .mockResolvedValueOnce({})  // processing succeeds
        .mockRejectedValueOnce(new Error('Invalid transition'));  // final fails
    
    await expect(workerProcessor(job)).rejects.toThrow();
    
    // Should log CRITICAL error
    expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
            error: 'Invalid transition'
        }),
        expect.stringContaining('CRITICAL')
    );
});
```

## Expected Test Output

```
 PASS  src/workers/__tests__/charge.worker.test.js
  charge.worker
    Payment Lifecycle - Happy Path
      ✓ should transition pending → processing → succeeded when gateway returns success (45ms)
      ✓ should transition pending → processing → failed when gateway returns failure (12ms)
    Gateway Returns Processing Status
      ✓ should transition to processing when gateway returns processing status (10ms)
    Error Handling
      ✓ should handle missing paymentId in job data (8ms)
      ✓ should transition to failed when gateway throws error (15ms)
      ✓ should handle payment not found in database (9ms)
      ✓ should skip processing if payment already has gateway_charge_id (11ms)
      ✓ should log critical error when status transition fails (13ms)
    Fallback Behavior
      ✓ should default to failed when chargeResult is null/undefined (10ms)
      ✓ should default to failed when gateway response missing status (9ms)
    Database Transaction Handling
      ✓ should update payment with gateway_charge_id within transaction (12ms)
      ✓ should use FOR UPDATE SKIP LOCKED for payment selection (10ms)
    Logging and Observability
      ✓ should log complete payment lifecycle (14ms)
      ✓ should log gateway request details for debugging (8ms)
    Metrics Recording
      ✓ should record processing time for successful jobs (11ms)
      ✓ should record processing time for failed jobs (10ms)
      ✓ should record payment status for each outcome (9ms)

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Time:        2.456s
```

## Integration with CI/CD

Add to `.github/workflows/test.yml`:
```yaml
- name: Run Worker Tests
  run: npm test -- src/workers/__tests__/ --coverage
  
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
    flags: workers
```

## Troubleshooting

### Tests fail with "Cannot find module"
```bash
# Ensure all dependencies are installed
cd backend
npm install
```

### Mock not working correctly
```bash
# Clear Jest/Vitest cache
npm test -- --clearCache
```

### Tests timeout
```bash
# Increase timeout for slow machines
npm test -- --testTimeout=10000
```

## Related Files

- [charge.worker.js](../charge.worker.js) - Worker implementation
- [gateway-client.js](../../utils/gateway-client.js) - Gateway client (mocked in tests)
- [status-transition.service.js](../../core/status-transition/status-transition.service.js) - Status transitions (mocked)
- [FIX_SUMMARY.md](../../FIX_SUMMARY.md) - Details about bugs fixed
- [PAYMENT_LIFECYCLE_TEST.md](../../PAYMENT_LIFECYCLE_TEST.md) - Manual testing guide

## Contributing

When adding new features to `charge.worker.js`:

1. **Write tests first** (TDD approach)
2. **Mock all external dependencies**
3. **Test happy path and error cases**
4. **Verify logging and metrics**
5. **Run tests before committing**:
   ```bash
   npm test -- src/workers/__tests__/charge.worker.test.js
   ```

## Coverage Goals

Target: **95%+ coverage** for charge.worker.js

Check current coverage:
```bash
npm test -- --coverage src/workers/__tests__/charge.worker.test.js --coverageReporters=text-summary
```

View detailed HTML report:
```bash
npm test -- --coverage src/workers/__tests__/charge.worker.test.js
open coverage/lcov-report/index.html
```
