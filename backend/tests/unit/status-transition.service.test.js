/**
 * Unit tests for Status Transition Service
 * 
 * Run with: npm test tests/unit/status-transition.service.test.js
 */

const statusTransitionService = require('../../src/core/status-transition/status-transition.service');
const db = require('../../src/db');

// Helper to create test payment
async function createTestPayment(overrides = {}) {
    const defaults = {
        order_id: `TEST-ORDER-${Date.now()}`,
        idempotency_key: require('crypto').randomUUID(),
        amount: 1000,
        currency: 'USD',
        status: 'pending'
    };
    
    const payment = { ...defaults, ...overrides };
    
    return db.one(
        `INSERT INTO payments (order_id, idempotency_key, amount, currency, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [payment.order_id, payment.idempotency_key, payment.amount, payment.currency, payment.status]
    );
}

// Helper to clean up test data
async function cleanupPayment(paymentId) {
    await db.none('DELETE FROM payment_audit_log WHERE payment_id = $1', [paymentId]);
    await db.none('DELETE FROM payments WHERE id = $1', [paymentId]);
}

describe('Status Transition Service', () => {
    afterEach(async () => {
        // Clean up any test payments (optional, could also do this per-test)
    });

    describe('Valid Transitions', () => {
        test('should allow pending → processing transition', async () => {
            const payment = await createTestPayment({ status: 'pending' });
            
            try {
                const updated = await statusTransitionService.transitionStatus(
                    payment.id,
                    'processing',
                    { test: true }
                );
                
                expect(updated.status).toBe('processing');
                expect(updated.id).toBe(payment.id);
            } finally {
                await cleanupPayment(payment.id);
            }
        });

        test('should allow processing → succeeded transition', async () => {
            const payment = await createTestPayment({ status: 'processing' });
            
            try {
                const updated = await statusTransitionService.transitionStatus(
                    payment.id,
                    'succeeded'
                );
                
                expect(updated.status).toBe('succeeded');
            } finally {
                await cleanupPayment(payment.id);
            }
        });

        test('should allow processing → failed transition', async () => {
            const payment = await createTestPayment({ status: 'processing' });
            
            try {
                const updated = await statusTransitionService.transitionStatus(
                    payment.id,
                    'failed',
                    { error: 'Test error' }
                );
                
                expect(updated.status).toBe('failed');
            } finally {
                await cleanupPayment(payment.id);
            }
        });

        test('should allow same status (no-op)', async () => {
            const payment = await createTestPayment({ status: 'pending' });
            
            try {
                const updated = await statusTransitionService.transitionStatus(
                    payment.id,
                    'pending'
                );
                
                expect(updated.status).toBe('pending');
                
                // Should not create audit log for no-op
                const auditLog = await statusTransitionService.getAuditLog(payment.id);
                expect(auditLog).toHaveLength(0);
            } finally {
                await cleanupPayment(payment.id);
            }
        });
    });

    describe('Invalid Transitions', () => {
        test('should reject pending → succeeded transition', async () => {
            const payment = await createTestPayment({ status: 'pending' });
            
            try {
                await expect(
                    statusTransitionService.transitionStatus(payment.id, 'succeeded')
                ).rejects.toThrow('Invalid transition');
            } finally {
                await cleanupPayment(payment.id);
            }
        });

        test('should reject succeeded → processing transition', async () => {
            const payment = await createTestPayment({ status: 'succeeded' });
            
            try {
                await expect(
                    statusTransitionService.transitionStatus(payment.id, 'processing')
                ).rejects.toThrow('Invalid transition');
            } finally {
                await cleanupPayment(payment.id);
            }
        });

        test('should reject failed → processing transition', async () => {
            const payment = await createTestPayment({ status: 'failed' });
            
            try {
                await expect(
                    statusTransitionService.transitionStatus(payment.id, 'processing')
                ).rejects.toThrow('Invalid transition');
            } finally {
                await cleanupPayment(payment.id);
            }
        });
    });

    describe('Audit Log', () => {
        test('should create audit log entry for valid transition', async () => {
            const payment = await createTestPayment({ status: 'pending' });
            
            try {
                await statusTransitionService.transitionStatus(
                    payment.id,
                    'processing',
                    { worker: 'test-worker', reason: 'Testing' }
                );
                
                const auditLog = await statusTransitionService.getAuditLog(payment.id);
                
                expect(auditLog).toHaveLength(1);
                expect(auditLog[0].payment_id).toBe(payment.id);
                expect(auditLog[0].from_status).toBe('pending');
                expect(auditLog[0].to_status).toBe('processing');
                expect(auditLog[0].metadata.worker).toBe('test-worker');
                expect(auditLog[0].metadata.reason).toBe('Testing');
            } finally {
                await cleanupPayment(payment.id);
            }
        });

        test('should track multiple transitions', async () => {
            const payment = await createTestPayment({ status: 'pending' });
            
            try {
                await statusTransitionService.transitionStatus(payment.id, 'processing');
                await statusTransitionService.transitionStatus(payment.id, 'succeeded');
                
                const auditLog = await statusTransitionService.getAuditLog(payment.id);
                
                expect(auditLog).toHaveLength(2);
                expect(auditLog[0].from_status).toBe('pending');
                expect(auditLog[0].to_status).toBe('processing');
                expect(auditLog[1].from_status).toBe('processing');
                expect(auditLog[1].to_status).toBe('succeeded');
            } finally {
                await cleanupPayment(payment.id);
            }
        });

        test('should return empty array for payment with no transitions', async () => {
            const payment = await createTestPayment({ status: 'pending' });
            
            try {
                const auditLog = await statusTransitionService.getAuditLog(payment.id);
                expect(auditLog).toHaveLength(0);
            } finally {
                await cleanupPayment(payment.id);
            }
        });
    });

    describe('Validation', () => {
        test('should reject transition for non-existent payment', async () => {
            const fakeId = require('crypto').randomUUID();
            
            await expect(
                statusTransitionService.transitionStatus(fakeId, 'processing')
            ).rejects.toThrow('not found');
        });

        test('should reject transition without paymentId', async () => {
            await expect(
                statusTransitionService.transitionStatus(null, 'processing')
            ).rejects.toThrow('paymentId is required');
        });

        test('should reject transition without toStatus', async () => {
            const payment = await createTestPayment();
            
            try {
                await expect(
                    statusTransitionService.transitionStatus(payment.id, null)
                ).rejects.toThrow('toStatus is required');
            } finally {
                await cleanupPayment(payment.id);
            }
        });
    });

    describe('isValidTransition', () => {
        test('should validate pending → processing', () => {
            expect(statusTransitionService.isValidTransition('pending', 'processing')).toBe(true);
        });

        test('should validate processing → succeeded', () => {
            expect(statusTransitionService.isValidTransition('processing', 'succeeded')).toBe(true);
        });

        test('should validate processing → failed', () => {
            expect(statusTransitionService.isValidTransition('processing', 'failed')).toBe(true);
        });

        test('should validate succeeded → refunded', () => {
            expect(statusTransitionService.isValidTransition('succeeded', 'refunded')).toBe(true);
        });

        test('should reject invalid transitions', () => {
            expect(statusTransitionService.isValidTransition('pending', 'succeeded')).toBe(false);
            expect(statusTransitionService.isValidTransition('succeeded', 'processing')).toBe(false);
            expect(statusTransitionService.isValidTransition('failed', 'pending')).toBe(false);
            expect(statusTransitionService.isValidTransition('failed', 'refunded')).toBe(false);
        });

        test('should allow same status', () => {
            expect(statusTransitionService.isValidTransition('pending', 'pending')).toBe(true);
            expect(statusTransitionService.isValidTransition('processing', 'processing')).toBe(true);
        });
    });
});

// Gracefully close connections after all tests
afterAll(async () => {
    await statusTransitionService.closeConnections();
    await db.$pool.end();
});
