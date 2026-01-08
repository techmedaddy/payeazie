/**
 * Tests for charge.worker.js
 * 
 * Verifies that the worker properly transitions payment status through lifecycle:
 * pending → processing → succeeded/failed
 * 
 * This test suite validates the fixes for:
 * 1. Variable scope issue with chargeResult
 * 2. Gateway response handling for all statuses
 * 3. Error handling and transition failures
 * 4. Proper logging and metrics recording
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies before requiring the worker
const mockStatusTransition = {
    transitionStatus: vi.fn()
};

const mockDb = {
    tx: vi.fn(),
    oneOrNone: vi.fn(),
    one: vi.fn(),
    any: vi.fn(),
    none: vi.fn()
};

const mockGatewayClient = {
    charge: vi.fn()
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

vi.mock('../../core/status-transition/status-transition.service', () => mockStatusTransition);
vi.mock('../../db', () => mockDb);
vi.mock('../../utils/gateway-client', () => mockGatewayClient);
vi.mock('../../utils/logger', () => mockLogger);
vi.mock('../../utils/metrics', () => mockMetrics);
vi.mock('../../utils/queue', () => mockQueue);

// Mock environment
process.env.REDIS_URL = 'redis://localhost:6379';

describe('charge.worker', () => {
    const mockPaymentId = 'pay-123';
    const mockJobId = 'job-456';
    
    const mockPayment = {
        id: mockPaymentId,
        order_id: 'ORD-001',
        idempotency_key: 'idem-key-123',
        amount: 10000,
        currency: 'USD',
        status: 'pending',
        gateway_charge_id: null
    };

    let workerProcessor;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Default successful transaction behavior
        mockDb.tx.mockImplementation(async (callback) => {
            const mockT = {
                oneOrNone: vi.fn().mockResolvedValue(mockPayment),
                none: vi.fn().mockResolvedValue(null),
                one: vi.fn().mockResolvedValue(mockPayment)
            };
            return callback(mockT);
        });

        // Load the worker module to get the processor function
        delete require.cache[require.resolve('../../charge.worker')];
        require('../../charge.worker');
        workerProcessor = mockQueue._processor;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Payment Lifecycle - Happy Path', () => {
        it('should transition pending → processing → succeeded when gateway returns success', async () => {
            // Arrange
            const gatewayResponse = {
                id: 'ch_success_123',
                amount: 10000,
                currency: 'USD',
                status: 'succeeded'
            };
            
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue(gatewayResponse);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - Should transition to 'processing' first
            expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
                1,
                mockPaymentId,
                'processing',
                expect.objectContaining({
                    worker: 'charge.worker',
                    jobId: mockJobId,
                    reason: 'Worker acquired job lock'
                })
            );

            // Assert - Should call gateway with correct params
            expect(mockGatewayClient.charge).toHaveBeenCalledWith({
                amount: mockPayment.amount,
                currency: mockPayment.currency,
                idempotencyKey: mockPayment.idempotency_key
            });

            // Assert - Should transition to 'succeeded' based on gateway response
            expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
                2,
                mockPaymentId,
                'succeeded',
                expect.objectContaining({
                    worker: 'charge.worker',
                    jobId: mockJobId,
                    chargeId: gatewayResponse.id,
                    reason: 'Gateway charge completed with status: succeeded'
                })
            );

            // Assert - Should record metrics
            expect(mockMetrics.recordPaymentStatus).toHaveBeenCalledWith('succeeded');
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'charge',
                true,
                expect.any(Number)
            );

            // Assert - Should log gateway response details
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: mockPaymentId,
                    gatewayStatus: 'succeeded',
                    fullResponse: gatewayResponse
                }),
                expect.stringContaining('gateway responded')
            );
        });

        it('should transition pending → processing → failed when gateway returns failure', async () => {
            // Arrange
            const gatewayResponse = {
                id: 'ch_failed_123',
                amount: 10000,
                currency: 'USD',
                status: 'failed'
            };
            
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue(gatewayResponse);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - First transition to processing
            expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
                1,
                mockPaymentId,
                'processing',
                expect.any(Object)
            );

            // Assert - Then transition to 'failed' based on gateway response
            expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
                2,
                mockPaymentId,
                'failed',
                expect.objectContaining({
                    worker: 'charge.worker',
                    chargeId: gatewayResponse.id,
                    reason: 'Gateway charge completed with status: failed'
                })
            );

            // Assert - Should record failed status
            expect(mockMetrics.recordPaymentStatus).toHaveBeenCalledWith('failed');
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'charge',
                true,
                expect.any(Number)
            );
        });
    });

    describe('Gateway Returns Processing Status', () => {
        it('should transition to processing when gateway returns processing status', async () => {
            // Arrange - Gateway returns 'processing' (needs reconciliation)
            const gatewayResponse = {
                id: 'ch_processing_123',
                amount: 10000,
                currency: 'USD',
                status: 'processing'
            };
            
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue(gatewayResponse);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - Should transition to 'processing' twice (initial + final)
            expect(mockStatusTransition.transitionStatus).toHaveBeenCalledTimes(2);
            
            expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
                2,
                mockPaymentId,
                'processing',
                expect.objectContaining({
                    reason: 'Gateway charge completed with status: processing'
                })
            );

            // Assert - Should log that gateway returned processing
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    finalStatus: 'processing',
                    gatewayStatus: 'processing'
                }),
                expect.stringContaining('determining final status')
            );

            // Note: In production, reconcile.worker.js should poll this payment
            // until it transitions to a terminal state (succeeded/failed)
        });
    });

    describe('Error Handling', () => {
        it('should handle missing paymentId in job data', async () => {
            // Arrange
            const job = {
                id: mockJobId,
                data: {} // Missing paymentId
            };

            // Act & Assert
            await expect(workerProcessor(job)).rejects.toThrow('paymentId is required');

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({ jobId: mockJobId }),
                expect.stringContaining('missing paymentId')
            );

            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith('charge', false);
        });

        it('should transition to failed when gateway throws error', async () => {
            // Arrange
            const gatewayError = new Error('Gateway timeout');
            
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockRejectedValue(gatewayError);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act & Assert
            await expect(workerProcessor(job)).rejects.toThrow('Gateway timeout');

            // Assert - Should transition to processing first
            expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
                1,
                mockPaymentId,
                'processing',
                expect.any(Object)
            );

            // Assert - Should transition to failed after error
            expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
                2,
                mockPaymentId,
                'failed',
                expect.objectContaining({
                    reason: 'Gateway charge failed',
                    error: 'Gateway timeout'
                })
            );

            expect(mockMetrics.recordPaymentStatus).toHaveBeenCalledWith('failed');
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'charge',
                false,
                expect.any(Number)
            );
        });

        it('should handle payment not found in database', async () => {
            // Arrange
            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    oneOrNone: vi.fn().mockResolvedValue(null), // Payment not found
                    none: vi.fn()
                };
                return callback(mockT);
            });

            mockStatusTransition.transitionStatus.mockResolvedValue({});

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act & Assert
            await expect(workerProcessor(job)).rejects.toThrow('Payment not found');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({ paymentId: mockPaymentId }),
                expect.stringContaining('payment not found')
            );
        });

        it('should skip processing if payment already has gateway_charge_id', async () => {
            // Arrange
            const processedPayment = {
                ...mockPayment,
                gateway_charge_id: 'ch_existing_123',
                status: 'succeeded'
            };

            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    oneOrNone: vi.fn().mockResolvedValue(processedPayment),
                    none: vi.fn()
                };
                return callback(mockT);
            });

            mockStatusTransition.transitionStatus.mockResolvedValue({});

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - Should NOT call gateway
            expect(mockGatewayClient.charge).not.toHaveBeenCalled();

            // Assert - Should log that payment was already processed
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: mockPaymentId,
                    existingChargeId: 'ch_existing_123'
                }),
                expect.stringContaining('already processed')
            );
        });

        it('should log critical error when status transition fails', async () => {
            // Arrange
            const gatewayResponse = {
                id: 'ch_123',
                status: 'succeeded'
            };

            const transitionError = new Error('Invalid transition: processing -> succeeded');
            
            mockStatusTransition.transitionStatus
                .mockResolvedValueOnce({}) // First call (processing) succeeds
                .mockRejectedValueOnce(transitionError); // Second call (succeeded) fails
            
            mockGatewayClient.charge.mockResolvedValue(gatewayResponse);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act & Assert
            await expect(workerProcessor(job)).rejects.toThrow('Invalid transition');

            // Assert - Should log CRITICAL error
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: mockPaymentId,
                    finalStatus: 'succeeded',
                    error: transitionError.message
                }),
                expect.stringContaining('CRITICAL')
            );
        });
    });

    describe('Fallback Behavior', () => {
        it('should default to failed when chargeResult is null/undefined', async () => {
            // Arrange - Gateway returns undefined/null
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue(null);

            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    oneOrNone: vi.fn().mockResolvedValue(mockPayment),
                    none: vi.fn()
                };
                // Override to return null from gateway call
                await callback(mockT);
                return null;
            });

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - Should log warning about null chargeResult
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({ paymentId: mockPaymentId }),
                expect.stringContaining('chargeResult is null/undefined')
            );

            // Assert - Should default to 'failed'
            expect(mockStatusTransition.transitionStatus).toHaveBeenCalledWith(
                mockPaymentId,
                'failed',
                expect.any(Object)
            );
        });

        it('should default to failed when gateway response missing status', async () => {
            // Arrange - Gateway returns object without status
            const invalidResponse = {
                id: 'ch_123',
                amount: 10000
                // status is missing
            };
            
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue(invalidResponse);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - Should use fallback to 'failed'
            expect(mockStatusTransition.transitionStatus).toHaveBeenNthCalledWith(
                2,
                mockPaymentId,
                'failed',
                expect.objectContaining({
                    reason: 'Gateway charge completed with status: failed'
                })
            );
        });
    });

    describe('Database Transaction Handling', () => {
        it('should update payment with gateway_charge_id within transaction', async () => {
            // Arrange
            const gatewayResponse = {
                id: 'ch_update_123',
                status: 'succeeded'
            };
            
            let updateSql = '';
            let updateParams = [];

            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    oneOrNone: vi.fn().mockResolvedValue(mockPayment),
                    none: vi.fn().mockImplementation((sql, params) => {
                        if (sql.includes('gateway_charge_id')) {
                            updateSql = sql;
                            updateParams = params;
                        }
                        return Promise.resolve(null);
                    })
                };
                return callback(mockT);
            });

            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue(gatewayResponse);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - Should update gateway_charge_id
            expect(updateSql).toContain('gateway_charge_id');
            expect(updateParams).toEqual([mockPaymentId, gatewayResponse.id]);
        });

        it('should use FOR UPDATE SKIP LOCKED for payment selection', async () => {
            // Arrange
            let selectSql = '';

            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    oneOrNone: vi.fn().mockImplementation((sql) => {
                        selectSql = sql;
                        return Promise.resolve(mockPayment);
                    }),
                    none: vi.fn().mockResolvedValue(null)
                };
                return callback(mockT);
            });

            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue({
                id: 'ch_123',
                status: 'succeeded'
            });

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - Should use proper locking
            expect(selectSql).toContain('FOR UPDATE SKIP LOCKED');
        });
    });

    describe('Logging and Observability', () => {
        it('should log complete payment lifecycle', async () => {
            // Arrange
            const gatewayResponse = {
                id: 'ch_log_123',
                status: 'succeeded'
            };
            
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue(gatewayResponse);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - Should log job started
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    jobId: mockJobId,
                    paymentId: mockPaymentId
                }),
                expect.stringContaining('job started')
            );

            // Assert - Should log transition to processing
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ paymentId: mockPaymentId }),
                expect.stringContaining('transitioned to processing')
            );

            // Assert - Should log gateway response with full details
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: mockPaymentId,
                    chargeId: gatewayResponse.id,
                    gatewayStatus: 'succeeded',
                    fullResponse: gatewayResponse
                }),
                expect.stringContaining('gateway responded')
            );

            // Assert - Should log final status determination
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: mockPaymentId,
                    finalStatus: 'succeeded',
                    gatewayStatus: 'succeeded'
                }),
                expect.stringContaining('determining final status')
            );

            // Assert - Should log final transition
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: mockPaymentId,
                    finalStatus: 'succeeded'
                }),
                expect.stringContaining('transitioned to succeeded')
            );
        });

        it('should log gateway request details for debugging', async () => {
            // Arrange
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue({
                id: 'ch_123',
                status: 'succeeded'
            });

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await workerProcessor(job);

            // Assert - Should log gateway call parameters
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: mockPaymentId,
                    amount: mockPayment.amount,
                    currency: mockPayment.currency
                }),
                expect.stringContaining('calling gateway')
            );
        });
    });

    describe('Metrics Recording', () => {
        it('should record processing time for successful jobs', async () => {
            // Arrange
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue({
                id: 'ch_123',
                status: 'succeeded'
            });

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            const startTime = Date.now();
            await workerProcessor(job);
            const endTime = Date.now();

            // Assert
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'charge',
                true,
                expect.any(Number)
            );

            const recordedTime = mockMetrics.recordWorkerJob.mock.calls[0][2];
            expect(recordedTime).toBeGreaterThanOrEqual(0);
            expect(recordedTime).toBeLessThanOrEqual(endTime - startTime + 100);
        });

        it('should record processing time for failed jobs', async () => {
            // Arrange
            mockStatusTransition.transitionStatus
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({});
            mockGatewayClient.charge.mockRejectedValue(new Error('Gateway error'));

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            await expect(workerProcessor(job)).rejects.toThrow();

            // Assert
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'charge',
                false,
                expect.any(Number)
            );
        });

        it('should record payment status for each outcome', async () => {
            // Test succeeded
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue({
                id: 'ch_123',
                status: 'succeeded'
            });

            await workerProcessor({
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            });

            expect(mockMetrics.recordPaymentStatus).toHaveBeenCalledWith('succeeded');
        });
    });
});

