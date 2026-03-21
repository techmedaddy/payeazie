/**
 * Tests for reconcile.worker.js
 * 
 * Verifies that payments stuck in 'processing' are reconciled correctly
 * when the gateway eventually returns a final status.
 * 
 * This test suite validates:
 * 1. Gateway status lookup and reconciliation
 * 2. Status transitions: processing → succeeded/failed
 * 3. Handling when gateway still returns 'processing'
 * 4. Invalid transition blocking
 * 5. Error handling and logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies before requiring the worker
const mockDb = {
    tx: vi.fn(),
    any: vi.fn(),
    none: vi.fn(),
    one: vi.fn(),
    oneOrNone: vi.fn()
};

const mockGatewayClient = {
    lookup: vi.fn()
};

const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
};

const mockMetrics = {
    recordPaymentStatus: vi.fn(),
    recordWorkerJob: vi.fn(),
    recordReconciliationUpdate: vi.fn(),
    recordGatewayCall: vi.fn()
};

// Mock the queue module to prevent worker creation
const mockQueue = {
    createWorker: vi.fn((queueName, processor) => {
        // Store the processor function for testing
        mockQueue._processor = processor;
        return {
            on: vi.fn()
        };
    }),
    _processor: null
};

vi.mock('../../db', () => mockDb);
vi.mock('../../utils/gateway-client', () => mockGatewayClient);
vi.mock('../../utils/logger', () => mockLogger);
vi.mock('../../utils/metrics', () => mockMetrics);
vi.mock('../../utils/queue', () => mockQueue);

// Mock environment
process.env.REDIS_URL = 'redis://localhost:6379';

describe('reconcile.worker', () => {
    const mockJobId = 'reconcile-job-789';
    
    const mockProcessingPayment = {
        id: 'pay-processing-123',
        order_id: 'ORD-PROCESSING',
        status: 'processing',
        gateway_charge_id: 'ch_pending_123',
        amount: 5000,
        currency: 'USD',
        updated_at: new Date()
    };

    let workerProcessor;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Load the worker module to get the processor function
        delete require.cache[require.resolve('../reconcile.worker')];
        require('../reconcile.worker');
        workerProcessor = mockQueue._processor;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Reconciliation - Gateway Returns Final Status', () => {
        it('should transition processing → succeeded when gateway returns succeeded', async () => {
            // Arrange
            const gatewayResponse = {
                id: 'ch_pending_123',
                status: 'succeeded'
            };

            mockDb.any.mockResolvedValue([mockProcessingPayment]);
            mockGatewayClient.lookup.mockResolvedValue(gatewayResponse);
            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    none: vi.fn().mockResolvedValue(null)
                };
                return callback(mockT);
            });

            const job = {
                id: mockJobId,
                data: {}
            };

            // Act
            await workerProcessor(job);

            // Assert - Should fetch non-final payments
            expect(mockDb.any).toHaveBeenCalledWith(
                expect.stringContaining('NOT IN'),
                expect.any(Array)
            );

            // Assert - Should lookup gateway status
            expect(mockGatewayClient.lookup).toHaveBeenCalledWith('ch_pending_123');

            // Assert - Should update payment status to succeeded
            expect(mockDb.tx).toHaveBeenCalled();
            const txCallback = mockDb.tx.mock.calls[0][0];
            const mockT = { none: vi.fn().mockResolvedValue(null) };
            await txCallback(mockT);
            
            expect(mockT.none).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE payments'),
                ['pay-processing-123', 'succeeded']
            );

            // Assert - Should log status update
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-processing-123',
                    oldStatus: 'processing',
                    newStatus: 'succeeded'
                }),
                expect.stringContaining('updated status')
            );

            // Assert - Should record metrics
            expect(mockMetrics.recordReconciliationUpdate).toHaveBeenCalled();
            expect(mockMetrics.recordPaymentStatus).toHaveBeenCalledWith('succeeded');
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'reconcile',
                true,
                expect.any(Number)
            );
        });

        it('should transition processing → failed when gateway returns failed', async () => {
            // Arrange
            const gatewayResponse = {
                id: 'ch_pending_123',
                status: 'failed'
            };

            mockDb.any.mockResolvedValue([mockProcessingPayment]);
            mockGatewayClient.lookup.mockResolvedValue(gatewayResponse);
            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    none: vi.fn().mockResolvedValue(null)
                };
                return callback(mockT);
            });

            const job = {
                id: mockJobId,
                data: {}
            };

            // Act
            await workerProcessor(job);

            // Assert - Should lookup gateway status
            expect(mockGatewayClient.lookup).toHaveBeenCalledWith('ch_pending_123');

            // Assert - Should update payment status to failed
            const txCallback = mockDb.tx.mock.calls[0][0];
            const mockT = { none: vi.fn().mockResolvedValue(null) };
            await txCallback(mockT);
            
            expect(mockT.none).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE payments'),
                ['pay-processing-123', 'failed']
            );

            // Assert - Should log status update
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-processing-123',
                    oldStatus: 'processing',
                    newStatus: 'failed'
                }),
                expect.stringContaining('updated status')
            );

            // Assert - Should record metrics
            expect(mockMetrics.recordPaymentStatus).toHaveBeenCalledWith('failed');
            expect(mockMetrics.recordReconciliationUpdate).toHaveBeenCalled();
        });
    });

    describe('Reconciliation - Gateway Still Returns Processing', () => {
        it('should leave payment unchanged when gateway still returns processing', async () => {
            // Arrange - Gateway still returns 'processing'
            const gatewayResponse = {
                id: 'ch_pending_123',
                status: 'processing'
            };

            mockDb.any.mockResolvedValue([mockProcessingPayment]);
            mockGatewayClient.lookup.mockResolvedValue(gatewayResponse);

            const job = {
                id: mockJobId,
                data: {}
            };

            // Act
            await workerProcessor(job);

            // Assert - Should lookup gateway status
            expect(mockGatewayClient.lookup).toHaveBeenCalledWith('ch_pending_123');

            // Assert - Should NOT update payment (status unchanged)
            expect(mockDb.tx).not.toHaveBeenCalled();

            // Assert - Should log that status is unchanged
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-processing-123',
                    status: 'processing'
                }),
                expect.stringContaining('status unchanged')
            );

            // Assert - Should NOT record reconciliation update (no change)
            expect(mockMetrics.recordReconciliationUpdate).not.toHaveBeenCalled();
        });

        it('should handle multiple payments with mixed gateway responses', async () => {
            // Arrange - Multiple payments with different gateway responses
            const payment1 = { ...mockProcessingPayment, id: 'pay-1', gateway_charge_id: 'ch_1' };
            const payment2 = { ...mockProcessingPayment, id: 'pay-2', gateway_charge_id: 'ch_2' };
            const payment3 = { ...mockProcessingPayment, id: 'pay-3', gateway_charge_id: 'ch_3' };

            mockDb.any.mockResolvedValue([payment1, payment2, payment3]);
            
            // Gateway responses: succeeded, processing, failed
            mockGatewayClient.lookup
                .mockResolvedValueOnce({ id: 'ch_1', status: 'succeeded' })
                .mockResolvedValueOnce({ id: 'ch_2', status: 'processing' })
                .mockResolvedValueOnce({ id: 'ch_3', status: 'failed' });

            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    none: vi.fn().mockResolvedValue(null)
                };
                return callback(mockT);
            });

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should lookup all three payments
            expect(mockGatewayClient.lookup).toHaveBeenCalledTimes(3);
            expect(mockGatewayClient.lookup).toHaveBeenCalledWith('ch_1');
            expect(mockGatewayClient.lookup).toHaveBeenCalledWith('ch_2');
            expect(mockGatewayClient.lookup).toHaveBeenCalledWith('ch_3');

            // Assert - Should update only payments 1 and 3 (not payment 2 - still processing)
            expect(mockDb.tx).toHaveBeenCalledTimes(2);

            // Assert - Should record 2 reconciliation updates (payment 1 and 3)
            expect(mockMetrics.recordReconciliationUpdate).toHaveBeenCalledTimes(2);

            // Assert - Should log unchanged status for payment 2
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-2',
                    status: 'processing'
                }),
                expect.stringContaining('status unchanged')
            );
        });
    });

    describe('No Candidates for Reconciliation', () => {
        it('should complete successfully when no payments need reconciliation', async () => {
            // Arrange - No payments in processing state
            mockDb.any.mockResolvedValue([]);

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should query for candidates
            expect(mockDb.any).toHaveBeenCalledWith(
                expect.stringContaining('NOT IN'),
                expect.any(Array)
            );

            // Assert - Should NOT lookup gateway (no candidates)
            expect(mockGatewayClient.lookup).not.toHaveBeenCalled();

            // Assert - Should log no candidates found
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('no candidates')
            );

            // Assert - Should record successful job completion
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'reconcile',
                true,
                expect.any(Number)
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle gateway lookup error gracefully', async () => {
            // Arrange
            const gatewayError = new Error('Gateway timeout');
            
            mockDb.any.mockResolvedValue([mockProcessingPayment]);
            mockGatewayClient.lookup.mockRejectedValue(gatewayError);

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should lookup gateway
            expect(mockGatewayClient.lookup).toHaveBeenCalledWith('ch_pending_123');

            // Assert - Should log error but continue
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-processing-123',
                    error: 'Gateway timeout'
                }),
                expect.stringContaining('reconciliation failed')
            );

            // Assert - Should NOT throw (graceful error handling)
            // Worker should complete successfully even if one payment fails
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'reconcile',
                true,
                expect.any(Number)
            );
        });

        it('should handle missing gateway response', async () => {
            // Arrange - Gateway returns null/undefined
            mockDb.any.mockResolvedValue([mockProcessingPayment]);
            mockGatewayClient.lookup.mockResolvedValue(null);

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should log warning about missing gateway record
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-processing-123',
                    chargeId: 'ch_pending_123'
                }),
                expect.stringContaining('missing gateway record')
            );

            // Assert - Should NOT update payment
            expect(mockDb.tx).not.toHaveBeenCalled();
        });

        it('should handle gateway response missing status field', async () => {
            // Arrange - Gateway returns object without status
            const invalidResponse = {
                id: 'ch_pending_123'
                // status is missing
            };

            mockDb.any.mockResolvedValue([mockProcessingPayment]);
            mockGatewayClient.lookup.mockResolvedValue(invalidResponse);

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should log warning about missing gateway record
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-processing-123'
                }),
                expect.stringContaining('missing gateway record')
            );

            // Assert - Should NOT update payment
            expect(mockDb.tx).not.toHaveBeenCalled();
        });

        it('should handle database error when fetching payments', async () => {
            // Arrange
            const dbError = new Error('Database connection failed');
            mockDb.any.mockRejectedValue(dbError);

            const job = { id: mockJobId, data: {} };

            // Act & Assert - Should throw error
            await expect(workerProcessor(job)).rejects.toThrow('Database connection failed');

            // Assert - Should log error
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Database connection failed',
                    jobId: mockJobId
                }),
                expect.stringContaining('job failed')
            );

            // Assert - Should record failed job
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'reconcile',
                false,
                expect.any(Number)
            );
        });

        it('should handle database update error but continue with other payments', async () => {
            // Arrange - Two payments, second one fails to update
            const payment1 = { ...mockProcessingPayment, id: 'pay-1', gateway_charge_id: 'ch_1' };
            const payment2 = { ...mockProcessingPayment, id: 'pay-2', gateway_charge_id: 'ch_2' };

            mockDb.any.mockResolvedValue([payment1, payment2]);
            mockGatewayClient.lookup
                .mockResolvedValueOnce({ id: 'ch_1', status: 'succeeded' })
                .mockResolvedValueOnce({ id: 'ch_2', status: 'succeeded' });

            let updateCount = 0;
            mockDb.tx.mockImplementation(async (callback) => {
                updateCount++;
                if (updateCount === 2) {
                    throw new Error('Database lock timeout');
                }
                const mockT = {
                    none: vi.fn().mockResolvedValue(null)
                };
                return callback(mockT);
            });

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should attempt to reconcile both payments
            expect(mockGatewayClient.lookup).toHaveBeenCalledTimes(2);

            // Assert - Should log error for second payment
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-2',
                    error: 'Database lock timeout'
                }),
                expect.stringContaining('reconciliation failed')
            );

            // Assert - Should still complete job successfully (graceful handling)
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'reconcile',
                true,
                expect.any(Number)
            );
        });
    });

    describe('Invalid Status Transitions', () => {
        it('should block invalid transition from succeeded to processing', async () => {
            // Arrange - Payment already succeeded, gateway incorrectly returns processing
            const succeededPayment = {
                ...mockProcessingPayment,
                status: 'succeeded'
            };

            const gatewayResponse = {
                id: 'ch_pending_123',
                status: 'processing'
            };

            mockDb.any.mockResolvedValue([succeededPayment]);
            mockGatewayClient.lookup.mockResolvedValue(gatewayResponse);

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should NOT update payment (invalid transition)
            expect(mockDb.tx).not.toHaveBeenCalled();

            // Assert - Should log warning about blocked transition
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-processing-123',
                    currentStatus: 'succeeded',
                    attemptedStatus: 'processing'
                }),
                expect.stringContaining('invalid status transition blocked')
            );
        });

        it('should block invalid transition from failed to processing', async () => {
            // Arrange - Payment already failed
            const failedPayment = {
                ...mockProcessingPayment,
                status: 'failed'
            };

            mockDb.any.mockResolvedValue([failedPayment]);
            mockGatewayClient.lookup.mockResolvedValue({ id: 'ch_123', status: 'processing' });

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should NOT update payment
            expect(mockDb.tx).not.toHaveBeenCalled();

            // Assert - Should log blocked transition
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    currentStatus: 'failed',
                    attemptedStatus: 'processing'
                }),
                expect.stringContaining('invalid status transition blocked')
            );
        });

        it('should allow valid transition from succeeded to refunded', async () => {
            // Arrange - Payment succeeded, can transition to refunded
            const succeededPayment = {
                ...mockProcessingPayment,
                status: 'succeeded'
            };

            mockDb.any.mockResolvedValue([succeededPayment]);
            mockGatewayClient.lookup.mockResolvedValue({ id: 'ch_123', status: 'refunded' });
            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    none: vi.fn().mockResolvedValue(null)
                };
                return callback(mockT);
            });

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should update payment to refunded
            expect(mockDb.tx).toHaveBeenCalled();

            // Assert - Should log status update
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    oldStatus: 'succeeded',
                    newStatus: 'refunded'
                }),
                expect.stringContaining('updated status')
            );
        });
    });

    describe('Database Query', () => {
        it('should query for non-final payments within time window', async () => {
            // Arrange
            mockDb.any.mockResolvedValue([]);

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should query with correct conditions
            expect(mockDb.any).toHaveBeenCalledWith(
                expect.stringMatching(/NOT IN \('succeeded', 'failed', 'refunded'\)/),
                [30] // Default window of 30 minutes
            );

            // Assert - Query should include gateway_charge_id check
            expect(mockDb.any).toHaveBeenCalledWith(
                expect.stringContaining('gateway_charge_id IS NOT NULL'),
                expect.any(Array)
            );

            // Assert - Query should include time window
            expect(mockDb.any).toHaveBeenCalledWith(
                expect.stringContaining('updated_at >='),
                expect.any(Array)
            );
        });
    });

    describe('Logging and Observability', () => {
        it('should log job start and completion', async () => {
            // Arrange
            mockDb.any.mockResolvedValue([mockProcessingPayment]);
            mockGatewayClient.lookup.mockResolvedValue({ id: 'ch_123', status: 'succeeded' });
            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    none: vi.fn().mockResolvedValue(null)
                };
                return callback(mockT);
            });

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should log job started
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ jobId: mockJobId }),
                expect.stringContaining('job started')
            );

            // Assert - Should log candidates found
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ count: 1 }),
                expect.stringContaining('found candidates')
            );

            // Assert - Should log job completed
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ processed: 1 }),
                expect.stringContaining('job completed')
            );
        });

        it('should log debug information for each payment', async () => {
            // Arrange
            mockDb.any.mockResolvedValue([mockProcessingPayment]);
            mockGatewayClient.lookup.mockResolvedValue({ id: 'ch_123', status: 'succeeded' });
            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    none: vi.fn().mockResolvedValue(null)
                };
                return callback(mockT);
            });

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should log reconciliation start
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: 'pay-processing-123',
                    currentStatus: 'processing'
                }),
                expect.stringContaining('reconciling payment')
            );
        });
    });

    describe('Metrics Recording', () => {
        it('should record processing time for successful jobs', async () => {
            // Arrange
            mockDb.any.mockResolvedValue([]);

            const job = { id: mockJobId, data: {} };

            // Act
            const startTime = Date.now();
            await workerProcessor(job);
            const endTime = Date.now();

            // Assert
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'reconcile',
                true,
                expect.any(Number)
            );

            const recordedTime = mockMetrics.recordWorkerJob.mock.calls[0][2];
            expect(recordedTime).toBeGreaterThanOrEqual(0);
            expect(recordedTime).toBeLessThanOrEqual(endTime - startTime + 100);
        });

        it('should record reconciliation updates for each status change', async () => {
            // Arrange
            mockDb.any.mockResolvedValue([mockProcessingPayment]);
            mockGatewayClient.lookup.mockResolvedValue({ id: 'ch_123', status: 'succeeded' });
            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    none: vi.fn().mockResolvedValue(null)
                };
                return callback(mockT);
            });

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should record reconciliation update
            expect(mockMetrics.recordReconciliationUpdate).toHaveBeenCalledTimes(1);

            // Assert - Should record payment status
            expect(mockMetrics.recordPaymentStatus).toHaveBeenCalledWith('succeeded');
        });
    });

    describe('Edge Cases', () => {
        it('should handle payment with null gateway_charge_id gracefully', async () => {
            // Arrange - Payment without gateway_charge_id (should be filtered by query)
            const paymentWithoutCharge = {
                ...mockProcessingPayment,
                gateway_charge_id: null
            };

            // This should not happen in practice (query filters these out)
            // But test defensive programming
            mockDb.any.mockResolvedValue([paymentWithoutCharge]);

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should NOT call gateway lookup (no charge ID)
            expect(mockGatewayClient.lookup).toHaveBeenCalledWith(null);

            // Assert - Should handle gracefully (may throw or return null)
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'reconcile',
                expect.any(Boolean),
                expect.any(Number)
            );
        });

        it('should skip update when both statuses are final', async () => {
            // Arrange - Payment succeeded, gateway also says succeeded
            const succeededPayment = {
                ...mockProcessingPayment,
                status: 'succeeded'
            };

            mockDb.any.mockResolvedValue([succeededPayment]);
            mockGatewayClient.lookup.mockResolvedValue({ id: 'ch_123', status: 'failed' });

            const job = { id: mockJobId, data: {} };

            // Act
            await workerProcessor(job);

            // Assert - Should log both in final state
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.objectContaining({ paymentId: 'pay-processing-123' }),
                expect.stringContaining('both in final state')
            );

            // Assert - Should NOT update payment
            expect(mockDb.tx).not.toHaveBeenCalled();
        });
    });
});
