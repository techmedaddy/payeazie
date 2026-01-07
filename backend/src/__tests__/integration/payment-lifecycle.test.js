/**
 * Integration Test: Payment Lifecycle
 * 
 * Tests the complete payment flow from creation to final status:
 * 1. POST /api/payments/intents → payment created with status='pending'
 * 2. Worker picks up job → status='processing'
 * 3. Gateway responds → status='succeeded' or 'failed'
 * 4. Frontend can query status and see transitions in audit log
 */

const { describe, it, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api';
const TEST_TIMEOUT = 30000; // 30 seconds for integration tests

describe('Payment Lifecycle Integration', () => {
    let testOrderId;
    let testIdempotencyKey;

    beforeEach(() => {
        // Generate unique test identifiers
        testOrderId = `ORD-TEST-${Date.now()}`;
        testIdempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    });

    describe('Complete Happy Path: pending → processing → succeeded', () => {
        it('should create payment with pending status', async () => {
            // Arrange
            const paymentRequest = {
                orderId: testOrderId,
                amount: 10000,
                currency: 'USD'
            };

            // Act
            const response = await axios.post(
                `${API_BASE_URL}/payments/intents`,
                paymentRequest,
                {
                    headers: {
                        'Idempotency-Key': testIdempotencyKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Assert
            expect(response.status).toBe(202); // Accepted
            expect(response.data).toMatchObject({
                id: expect.any(String),
                orderId: testOrderId,
                amount: 10000,
                currency: 'USD',
                status: 'pending' // Key assertion: initial status is pending
            });

            return response.data.id; // Return for next test
        }, TEST_TIMEOUT);

        it('should transition to processing when worker starts', async () => {
            // Arrange: Create payment first
            const paymentRequest = {
                orderId: testOrderId,
                amount: 5000,
                currency: 'USD'
            };

            const createResponse = await axios.post(
                `${API_BASE_URL}/payments/intents`,
                paymentRequest,
                {
                    headers: {
                        'Idempotency-Key': testIdempotencyKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const paymentId = createResponse.data.id;

            // Act: Poll for status change (worker should process it)
            let currentStatus = 'pending';
            let attempts = 0;
            const maxAttempts = 20;

            while (currentStatus === 'pending' && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const statusResponse = await axios.get(
                    `${API_BASE_URL}/payments/${paymentId}`
                );
                
                currentStatus = statusResponse.data.status;
                attempts++;
            }

            // Assert
            expect(['processing', 'succeeded']).toContain(currentStatus);
            expect(currentStatus).not.toBe('pending'); // Should have transitioned
        }, TEST_TIMEOUT);

        it('should transition to final status (succeeded/failed)', async () => {
            // Arrange: Create payment
            const paymentRequest = {
                orderId: testOrderId,
                amount: 7500,
                currency: 'USD'
            };

            const createResponse = await axios.post(
                `${API_BASE_URL}/payments/intents`,
                paymentRequest,
                {
                    headers: {
                        'Idempotency-Key': testIdempotencyKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const paymentId = createResponse.data.id;

            // Act: Poll until final status
            let currentStatus = 'pending';
            let attempts = 0;
            const maxAttempts = 30;

            while (!['succeeded', 'failed'].includes(currentStatus) && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const statusResponse = await axios.get(
                    `${API_BASE_URL}/payments/${paymentId}`
                );
                
                currentStatus = statusResponse.data.status;
                attempts++;
            }

            // Assert
            expect(['succeeded', 'failed']).toContain(currentStatus);
            expect(attempts).toBeLessThan(maxAttempts); // Should not timeout
        }, TEST_TIMEOUT);
    });

    describe('Audit Log Verification', () => {
        it('should record all status transitions in audit log', async () => {
            // Arrange: Create and process payment
            const paymentRequest = {
                orderId: testOrderId,
                amount: 12000,
                currency: 'USD'
            };

            const createResponse = await axios.post(
                `${API_BASE_URL}/payments/intents`,
                paymentRequest,
                {
                    headers: {
                        'Idempotency-Key': testIdempotencyKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const paymentId = createResponse.data.id;

            // Wait for payment to reach final status
            let finalStatus = null;
            let attempts = 0;
            while (!finalStatus && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 500));
                const statusResponse = await axios.get(
                    `${API_BASE_URL}/payments/${paymentId}`
                );
                if (['succeeded', 'failed'].includes(statusResponse.data.status)) {
                    finalStatus = statusResponse.data.status;
                }
                attempts++;
            }

            // Act: Get audit log
            const auditResponse = await axios.get(
                `${API_BASE_URL}/payments/${paymentId}/audit`
            );

            // Assert
            expect(auditResponse.status).toBe(200);
            expect(auditResponse.data.auditLog).toBeDefined();
            expect(auditResponse.data.auditLog.length).toBeGreaterThanOrEqual(2);

            // Verify transition sequence
            const transitions = auditResponse.data.auditLog;
            
            // First transition should be pending → processing
            expect(transitions[0]).toMatchObject({
                payment_id: paymentId,
                from_status: 'pending',
                to_status: 'processing'
            });

            // Last transition should be processing → final status
            const lastTransition = transitions[transitions.length - 1];
            expect(lastTransition).toMatchObject({
                payment_id: paymentId,
                from_status: 'processing',
                to_status: finalStatus
            });

            // Each transition should have metadata
            transitions.forEach(transition => {
                expect(transition.metadata).toBeDefined();
                expect(transition.metadata.worker).toBe('charge.worker');
                expect(transition.metadata.reason).toBeDefined();
            });
        }, TEST_TIMEOUT);
    });

    describe('Real-Time Updates (SSE)', () => {
        it('should receive status updates via SSE stream', async () => {
            // Arrange: Create payment
            const paymentRequest = {
                orderId: testOrderId,
                amount: 8000,
                currency: 'USD'
            };

            const createResponse = await axios.post(
                `${API_BASE_URL}/payments/intents`,
                paymentRequest,
                {
                    headers: {
                        'Idempotency-Key': testIdempotencyKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const paymentId = createResponse.data.id;

            // Act: Connect to SSE stream
            const events = [];
            
            return new Promise((resolve, reject) => {
                const EventSource = require('eventsource');
                const eventSource = new EventSource(
                    `${API_BASE_URL}/payments/${paymentId}/stream`
                );

                const timeout = setTimeout(() => {
                    eventSource.close();
                    reject(new Error('SSE stream timeout'));
                }, TEST_TIMEOUT);

                eventSource.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    events.push(data);

                    // Close when we receive final status
                    if (['succeeded', 'failed'].includes(data.toStatus)) {
                        clearTimeout(timeout);
                        eventSource.close();
                        
                        // Assert
                        expect(events.length).toBeGreaterThanOrEqual(2);
                        
                        // First event should be pending → processing
                        expect(events[0]).toMatchObject({
                            type: 'payment.status.changed',
                            paymentId,
                            fromStatus: 'pending',
                            toStatus: 'processing'
                        });

                        // Last event should be processing → final
                        const lastEvent = events[events.length - 1];
                        expect(lastEvent).toMatchObject({
                            type: 'payment.status.changed',
                            paymentId,
                            fromStatus: 'processing',
                            toStatus: expect.stringMatching(/^(succeeded|failed)$/)
                        });

                        resolve();
                    }
                };

                eventSource.onerror = (error) => {
                    clearTimeout(timeout);
                    eventSource.close();
                    reject(error);
                };
            });
        }, TEST_TIMEOUT);
    });

    describe('Error Scenarios', () => {
        it('should transition to failed when gateway rejects', async () => {
            // Arrange: Create payment with amount that triggers failure
            // (Assuming gateway-client has test mode that fails on certain amounts)
            const paymentRequest = {
                orderId: testOrderId,
                amount: 666, // Trigger failure in test mode
                currency: 'USD'
            };

            const createResponse = await axios.post(
                `${API_BASE_URL}/payments/intents`,
                paymentRequest,
                {
                    headers: {
                        'Idempotency-Key': testIdempotencyKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const paymentId = createResponse.data.id;

            // Act: Wait for final status
            let currentStatus = 'pending';
            let attempts = 0;
            
            while (!['succeeded', 'failed'].includes(currentStatus) && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const statusResponse = await axios.get(
                    `${API_BASE_URL}/payments/${paymentId}`
                );
                
                currentStatus = statusResponse.data.status;
                attempts++;
            }

            // Assert
            expect(currentStatus).toBe('failed');

            // Verify audit log shows failure reason
            const auditResponse = await axios.get(
                `${API_BASE_URL}/payments/${paymentId}/audit`
            );
            
            const lastTransition = auditResponse.data.auditLog[auditResponse.data.auditLog.length - 1];
            expect(lastTransition.to_status).toBe('failed');
            expect(lastTransition.metadata.reason).toBeDefined();
        }, TEST_TIMEOUT);
    });

    describe('Idempotency', () => {
        it('should return same payment for duplicate requests', async () => {
            // Arrange
            const paymentRequest = {
                orderId: testOrderId,
                amount: 9000,
                currency: 'USD'
            };

            // Act: Make same request twice with same idempotency key
            const response1 = await axios.post(
                `${API_BASE_URL}/payments/intents`,
                paymentRequest,
                {
                    headers: {
                        'Idempotency-Key': testIdempotencyKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const response2 = await axios.post(
                `${API_BASE_URL}/payments/intents`,
                paymentRequest,
                {
                    headers: {
                        'Idempotency-Key': testIdempotencyKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Assert
            expect(response1.data.id).toBe(response2.data.id);
            expect(response1.data.status).toBe(response2.data.status);
        }, TEST_TIMEOUT);
    });
});
