# Testing Guide

## Overview

Comprehensive testing strategy for the PayEazie payment processing system, covering unit tests, integration tests, and end-to-end testing.

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Setup](#test-setup)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [End-to-End Tests](#end-to-end-tests)
6. [Load Testing](#load-testing)
7. [Manual Testing](#manual-testing)
8. [CI/CD Integration](#cicd-integration)

---

## Testing Philosophy

### Test Pyramid

```
        ╱───────╲
       ╱   E2E   ╲      10% - Full system tests
      ╱───────────╲
     ╱ Integration ╲    30% - Component integration
    ╱───────────────╲
   ╱   Unit Tests    ╲  60% - Individual functions
  ╱───────────────────╲
```

### Key Principles

1. **Fast Feedback**: Unit tests run in < 1s
2. **Isolation**: Tests don't depend on each other
3. **Repeatability**: Same input = same output
4. **Coverage**: Critical paths have 100% coverage
5. **Real Scenarios**: Integration tests use real DB/Redis

---

## Test Setup

### Install Dependencies

```bash
cd backend
npm install --save-dev \
  jest \
  supertest \
  @jest/globals \
  jest-mock-extended
```

### Jest Configuration

Create `backend/jest.config.js`:

```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/__mocks__/**'
  ],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
```

### Test Environment Setup

Create `backend/tests/setup.js`:

```javascript
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.REDIS_URL = process.env.TEST_REDIS_URL;

// Global test timeout
jest.setTimeout(10000);

// Cleanup after all tests
afterAll(async () => {
  // Close database connections
  const db = require('../src/db');
  await db.$pool.end();
  
  // Close Redis connections
  // Add cleanup as needed
});
```

### Test Environment Variables

Create `backend/.env.test`:

```bash
NODE_ENV=test
DATABASE_URL=postgresql://localhost:5432/payeazie_test
REDIS_URL=redis://localhost:6379/1
LOG_LEVEL=error
ENABLE_WORKERS=false
ENABLE_METRICS=false
```

---

## Unit Tests

### Payment Controller Tests

Create `backend/src/api/controllers/__tests__/payment.controller.test.js`:

```javascript
const { createPaymentIntent, getPaymentStatus } = require('../payment.controller');
const idempotencyService = require('../../../core/idempotency/idempotency.service');
const paymentOrchestrator = require('../../../core/orchestrator/payment.orchestrator');

jest.mock('../../../core/idempotency/idempotency.service');
jest.mock('../../../core/orchestrator/payment.orchestrator');

describe('Payment Controller', () => {
  let req, reply;

  beforeEach(() => {
    req = {
      body: {},
      headers: {},
      params: {}
    };
    
    reply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should create payment successfully', async () => {
      req.body = { orderId: 'ORD-123', amount: 1000, currency: 'USD' };
      req.headers['idempotency-key'] = 'key-123';

      const mockPayment = {
        id: 'pay-123',
        order_id: 'ORD-123',
        amount: 1000,
        currency: 'USD',
        status: 'processing'
      };

      idempotencyService.resolve.mockResolvedValue(mockPayment);

      await createPaymentIntent(req, reply);

      expect(reply.code).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pay-123',
          orderId: 'ORD-123',
          status: 'processing'
        })
      );
    });

    it('should return 400 for missing orderId', async () => {
      req.body = { amount: 1000, currency: 'USD' };
      req.headers['idempotency-key'] = 'key-123';

      await createPaymentIntent(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('orderId') })
      );
    });

    it('should return 400 for missing idempotency key', async () => {
      req.body = { orderId: 'ORD-123', amount: 1000, currency: 'USD' };
      // No idempotency-key header

      await createPaymentIntent(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Idempotency-Key') })
      );
    });

    it('should handle service errors', async () => {
      req.body = { orderId: 'ORD-123', amount: 1000, currency: 'USD' };
      req.headers['idempotency-key'] = 'key-123';

      idempotencyService.resolve.mockRejectedValue(new Error('Database error'));

      await createPaymentIntent(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });
  });

  describe('getPaymentStatus', () => {
    it('should fetch payment status successfully', async () => {
      req.params.paymentId = 'pay-123';

      const mockPayment = {
        id: 'pay-123',
        order_id: 'ORD-123',
        status: 'succeeded'
      };

      paymentOrchestrator.fetchStatus.mockResolvedValue(mockPayment);

      await getPaymentStatus(req, reply);

      expect(reply.code).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pay-123',
          status: 'succeeded'
        })
      );
    });

    it('should return 404 for non-existent payment', async () => {
      req.params.paymentId = 'pay-999';

      paymentOrchestrator.fetchStatus.mockResolvedValue(null);

      await getPaymentStatus(req, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Payment not found' })
      );
    });
  });
});
```

### Idempotency Service Tests

Create `backend/src/core/idempotency/__tests__/idempotency.service.test.js`:

```javascript
const db = require('../../../db');
const idempotencyService = require('../idempotency.service');

jest.mock('../../../db');

describe('Idempotency Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolve', () => {
    it('should create new payment for new idempotency key', async () => {
      const mockPayment = {
        id: 'pay-123',
        order_id: 'ORD-123',
        status: 'processing'
      };

      db.oneOrNone.mockResolvedValue(null); // No existing record
      db.one.mockResolvedValue(mockPayment); // New payment created

      const result = await idempotencyService.resolve(
        'ORD-123',
        'key-123',
        1000,
        'USD'
      );

      expect(result).toEqual(mockPayment);
      expect(db.one).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payments'),
        expect.any(Array)
      );
    });

    it('should return existing payment for duplicate request', async () => {
      const existingPayment = {
        id: 'pay-123',
        order_id: 'ORD-123',
        amount: 1000,
        currency: 'USD',
        status: 'processing'
      };

      db.oneOrNone.mockResolvedValue(existingPayment);

      const result = await idempotencyService.resolve(
        'ORD-123',
        'key-123',
        1000,
        'USD'
      );

      expect(result).toEqual(existingPayment);
      expect(db.one).not.toHaveBeenCalled(); // No new insert
    });

    it('should throw conflict error for mismatched parameters', async () => {
      const existingPayment = {
        id: 'pay-123',
        order_id: 'ORD-123',
        amount: 1000, // Different amount
        currency: 'USD',
        status: 'processing'
      };

      db.oneOrNone.mockResolvedValue(existingPayment);

      await expect(
        idempotencyService.resolve('ORD-123', 'key-123', 2000, 'USD')
      ).rejects.toThrow('Idempotency conflict');
    });
  });
});
```

### Gateway Client Tests

Create `backend/src/utils/__tests__/gateway-client.test.js`:

```javascript
const gatewayClient = require('../gateway-client');

describe('Gateway Client', () => {
  describe('charge', () => {
    it('should create charge successfully', async () => {
      const result = await gatewayClient.charge({
        amount: 1000,
        currency: 'USD',
        idempotencyKey: 'key-123'
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('status');
      expect(result.amount).toBe(1000);
      expect(result.currency).toBe('USD');
      expect(['succeeded', 'processing', 'failed']).toContain(result.status);
    });

    it('should return consistent charge ID for same idempotency key', async () => {
      const key = 'test-key-456';

      const result1 = await gatewayClient.charge({
        amount: 1000,
        currency: 'USD',
        idempotencyKey: key
      });

      const result2 = await gatewayClient.charge({
        amount: 1000,
        currency: 'USD',
        idempotencyKey: key
      });

      expect(result1.id).toBe(result2.id);
    });
  });

  describe('lookup', () => {
    it('should lookup charge status', async () => {
      const result = await gatewayClient.lookup('ch_test123');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('status');
      expect(['succeeded', 'failed']).toContain(result.status);
    });
  });
});
```

### Run Unit Tests

```bash
npm test -- --coverage
```

---

## Integration Tests

### Database Integration Tests

Create `backend/tests/integration/payment.integration.test.js`:

```javascript
const db = require('../../src/db');
const { queueClient } = require('../../src/utils/queue');

describe('Payment Integration Tests', () => {
  beforeAll(async () => {
    // Clean test database
    await db.none('TRUNCATE TABLE payments RESTART IDENTITY CASCADE');
  });

  afterEach(async () => {
    await db.none('TRUNCATE TABLE payments RESTART IDENTITY CASCADE');
  });

  describe('Payment Creation Flow', () => {
    it('should create payment and enqueue charge job', async () => {
      // Create payment
      const payment = await db.one(
        `INSERT INTO payments (order_id, idempotency_key, amount, currency, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        ['ORD-123', 'key-123', 1000, 'USD', 'processing']
      );

      expect(payment).toHaveProperty('id');
      expect(payment.status).toBe('processing');

      // Enqueue job
      const job = await queueClient.add(
        'payment_charge',
        'charge',
        { paymentId: payment.id }
      );

      expect(job).toHaveProperty('id');
      expect(job.data).toEqual({ paymentId: payment.id });
    });

    it('should prevent duplicate payments with same idempotency key', async () => {
      const key = 'unique-key-456';

      // First insert
      await db.one(
        `INSERT INTO payments (order_id, idempotency_key, amount, currency, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        ['ORD-456', key, 2000, 'USD', 'processing']
      );

      // Second insert with same key should fail
      await expect(
        db.one(
          `INSERT INTO payments (order_id, idempotency_key, amount, currency, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          ['ORD-789', key, 3000, 'USD', 'processing']
        )
      ).rejects.toThrow();
    });
  });

  describe('Payment Status Updates', () => {
    it('should update payment status', async () => {
      // Create payment
      const payment = await db.one(
        `INSERT INTO payments (order_id, idempotency_key, amount, currency, status, gateway_charge_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        ['ORD-123', 'key-123', 1000, 'USD', 'processing', 'ch_123']
      );

      // Update status
      await db.none(
        `UPDATE payments SET status = $2, updated_at = NOW() WHERE id = $1`,
        [payment.id, 'succeeded']
      );

      // Verify update
      const updated = await db.one(
        'SELECT * FROM payments WHERE id = $1',
        [payment.id]
      );

      expect(updated.status).toBe('succeeded');
      expect(updated.updated_at).not.toEqual(payment.updated_at);
    });
  });
});
```

### API Integration Tests

Create `backend/tests/integration/api.integration.test.js`:

```javascript
const supertest = require('supertest');
const buildServer = require('../../server').buildServer;

describe('API Integration Tests', () => {
  let app;
  let request;

  beforeAll(() => {
    app = buildServer();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/payments/intents', () => {
    it('should create payment intent', async () => {
      const response = await request
        .post('/api/payments/intents')
        .set('Idempotency-Key', 'test-key-' + Date.now())
        .send({
          orderId: 'ORD-TEST-' + Date.now(),
          amount: 1000,
          currency: 'USD'
        })
        .expect(202);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status', 'processing');
      expect(response.body).toHaveProperty('orderId');
    });

    it('should return 400 for missing fields', async () => {
      const response = await request
        .post('/api/payments/intents')
        .set('Idempotency-Key', 'test-key-' + Date.now())
        .send({
          amount: 1000
          // Missing orderId and currency
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/payments/:paymentId', () => {
    it('should return 404 for non-existent payment', async () => {
      const response = await request
        .get('/api/payments/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Payment not found');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('redis');
    });
  });

  describe('GET /metrics/summary', () => {
    it('should return metrics summary', async () => {
      const response = await request
        .get('/metrics/summary')
        .expect(200);

      expect(response.body).toHaveProperty('payments');
      expect(response.body).toHaveProperty('workers');
      expect(response.body).toHaveProperty('gateway');
    });
  });
});
```

### Run Integration Tests

```bash
# Start test database and Redis
docker-compose -f docker-compose.test.yml up -d

# Run tests
npm test -- tests/integration

# Cleanup
docker-compose -f docker-compose.test.yml down
```

---

## End-to-End Tests

### Full Payment Flow Test

Create `backend/tests/e2e/payment-flow.e2e.test.js`:

```javascript
const supertest = require('supertest');
const buildServer = require('../../server').buildServer;
const db = require('../../src/db');

describe('E2E: Complete Payment Flow', () => {
  let app;
  let request;

  beforeAll(async () => {
    app = buildServer();
    request = supertest(app.server);
    await db.none('TRUNCATE TABLE payments RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('should complete full payment lifecycle', async () => {
    const orderId = 'ORD-E2E-' + Date.now();
    const idempotencyKey = 'e2e-key-' + Date.now();

    // Step 1: Create payment
    const createResponse = await request
      .post('/api/payments/intents')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        orderId,
        amount: 5000,
        currency: 'USD'
      })
      .expect(202);

    const paymentId = createResponse.body.id;
    expect(paymentId).toBeDefined();

    // Step 2: Poll for status update (wait for worker)
    let finalStatus;
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));

      const statusResponse = await request
        .get(`/api/payments/${paymentId}`)
        .expect(200);

      finalStatus = statusResponse.body.status;

      if (finalStatus !== 'processing') {
        break;
      }

      attempts++;
    }

    // Step 3: Verify final status
    expect(['succeeded', 'failed']).toContain(finalStatus);
    
    // Step 4: Verify database state
    const payment = await db.one(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );

    expect(payment.status).toBe(finalStatus);
    expect(payment.gateway_charge_id).toBeTruthy();
  }, 15000); // 15 second timeout

  it('should handle idempotency correctly', async () => {
    const orderId = 'ORD-IDEM-' + Date.now();
    const idempotencyKey = 'idem-key-' + Date.now();

    // First request
    const response1 = await request
      .post('/api/payments/intents')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        orderId,
        amount: 1000,
        currency: 'USD'
      })
      .expect(202);

    // Duplicate request with same key
    const response2 = await request
      .post('/api/payments/intents')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        orderId,
        amount: 1000,
        currency: 'USD'
      })
      .expect(200); // Returns existing

    expect(response1.body.id).toBe(response2.body.id);
  });
});
```

---

## Load Testing

### Artillery Configuration

Create `backend/tests/load/artillery.yml`:

```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100
      name: "Peak load"
  variables:
    orderId:
      - "ORD-LOAD-{{ $randomString() }}"
  payload:
    path: "./payment-data.csv"
    fields:
      - amount
      - currency

scenarios:
  - name: "Create Payment"
    flow:
      - post:
          url: "/api/payments/intents"
          headers:
            Idempotency-Key: "load-{{ $randomString() }}"
          json:
            orderId: "{{ orderId }}"
            amount: "{{ amount }}"
            currency: "{{ currency }}"
      - think: 2
      - get:
          url: "/api/payments/{{ id }}"

  - name: "Health Check"
    flow:
      - get:
          url: "/health"
```

### Run Load Tests

```bash
npm install -g artillery

# Run test
artillery run tests/load/artillery.yml

# Generate report
artillery run --output report.json tests/load/artillery.yml
artillery report report.json
```

---

## Manual Testing

### Test Scripts

Use the provided scripts:

```bash
# Verify entire system
./scripts/verify-system.sh

# Test payment API
./scripts/test-payment-api.sh

# Test worker flow
./scripts/test-worker-flow.sh

# Monitor system
./scripts/monitor-dashboard.sh
```

### Manual Test Cases

1. **Happy Path**
   - Create payment → Worker processes → Status updates → Reconciliation

2. **Idempotency**
   - Same key twice → Same response

3. **Error Handling**
   - Missing fields → 400 error
   - Non-existent payment → 404 error

4. **Concurrency**
   - Multiple payments simultaneously
   - Worker processes concurrently

5. **Reconciliation**
   - Payments in processing → Eventually finalize

---

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: payeazie_test
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: ./backend
        run: npm ci

      - name: Run migrations
        working-directory: ./backend
        run: npm run migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/payeazie_test

      - name: Run tests
        working-directory: ./backend
        run: npm test -- --coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/payeazie_test
          REDIS_URL: redis://localhost:6379
          NODE_ENV: test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: ./backend/coverage
```

---

## Coverage Requirements

Target coverage thresholds:

- **Unit Tests**: 80%+ code coverage
- **Integration Tests**: All critical paths
- **E2E Tests**: Main user flows

Check coverage:

```bash
npm test -- --coverage
open coverage/lcov-report/index.html
```

---

**Last Updated**: 2024-01-15
