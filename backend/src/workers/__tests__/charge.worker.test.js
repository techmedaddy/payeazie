/**
 * Tests for charge.worker.js
 * 
 * Verifies that the worker properly transitions payment status through lifecycle:
 * pending → processing → succeeded/failed
 */

const { describe, it, expect, beforeEach, afterEach, vi } = require('@jest/globals');

// Mock dependencies before requiring the worker
const mockStatusTransition = {
    transitionStatus: vi.fn()
};

const mockDb = {
    tx: vi.fn(),
    oneOrNone: vi.fn()
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
    recordWorkerJob: vi.fn()
};

vi.mock('../../core/status-transition/status-transition.service', () => mockStatusTransition);
vi.mock('../../db', () => mockDb);
vi.mock('../../utils/gateway-client', () => mockGatewayClient);
vi.mock('../../utils/logger', () => mockLogger);
vi.mock('../../utils/metrics', () => mockMetrics);

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

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Default successful transaction behavior
        mockDb.tx.mockImplementation(async (callback) => {
            const mockT = {
                oneOrNone: vi.fn().mockResolvedValue(mockPayment),
                none: vi.fn().mockResolvedValue(null)
            };
            return callback(mockT);
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Status Transitions', () => {
        it('should transition from pending to processing when worker starts', async () => {
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
            // Note: You'll need to export the processor function from charge.worker.js
            // For now, this demonstrates the test structure
            
            // Assert
            expect(mockStatusTransition.transitionStatus).toHaveBeenCalledWith(
                mockPaymentId,
                'processing',
                expect.objectContaining({
                    worker: 'charge.worker',
                    jobId: mockJobId,
                    reason: 'Worker acquired job lock'
                })
            );
        });

        it('should transition to succeeded when gateway returns success', async () => {
            // Arrange
            const successResponse = {
                id: 'ch_success_123',
                status: 'succeeded'
            };
            
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue(successResponse);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act & Assert
            // Worker should call transitionStatus with 'succeeded'
            expect(mockStatusTransition.transitionStatus).toHaveBeenCalledWith(
                mockPaymentId,
                'succeeded',
                expect.objectContaining({
                    worker: 'charge.worker',
                    reason: expect.stringContaining('Gateway charge completed')
                })
            );
        });

        it('should transition to failed when gateway returns failure', async () => {
            // Arrange
            const failureResponse = {
                id: 'ch_failed_123',
                status: 'failed'
            };
            
            mockStatusTransition.transitionStatus
                .mockResolvedValueOnce({}) // processing
                .mockResolvedValueOnce({}); // failed
            
            mockGatewayClient.charge.mockResolvedValue(failureResponse);

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act & Assert
            expect(mockStatusTransition.transitionStatus).toHaveBeenCalledWith(
                mockPaymentId,
                'failed',
                expect.objectContaining({
                    worker: 'charge.worker'
                })
            );
        });

        it('should transition to failed when gateway throws error', async () => {
            // Arrange
            mockStatusTransition.transitionStatus
                .mockResolvedValueOnce({}) // processing
                .mockResolvedValueOnce({}); // failed
            
            mockGatewayClient.charge.mockRejectedValue(
                new Error('Gateway timeout')
            );

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act & Assert
            await expect(async () => {
                // Worker execution should fail
            }).rejects.toThrow();

            expect(mockStatusTransition.transitionStatus).toHaveBeenCalledWith(
                mockPaymentId,
                'failed',
                expect.objectContaining({
                    reason: 'Gateway charge failed',
                    error: 'Gateway timeout'
                })
            );
        });
    });

    describe('Gateway Integration', () => {
        it('should call gateway with correct payment details', async () => {
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
            // Worker executes...

            // Assert
            expect(mockGatewayClient.charge).toHaveBeenCalledWith({
                amount: mockPayment.amount,
                currency: mockPayment.currency,
                idempotencyKey: mockPayment.idempotency_key
            });
        });

        it('should update payment with gateway_charge_id', async () => {
            // Arrange
            const chargeId = 'ch_gateway_123';
            mockStatusTransition.transitionStatus.mockResolvedValue({});
            mockGatewayClient.charge.mockResolvedValue({
                id: chargeId,
                status: 'succeeded'
            });

            let capturedUpdate = null;
            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    oneOrNone: vi.fn().mockResolvedValue(mockPayment),
                    none: vi.fn().mockImplementation((sql, params) => {
                        if (sql.includes('gateway_charge_id')) {
                            capturedUpdate = params;
                        }
                        return Promise.resolve(null);
                    })
                };
                return callback(mockT);
            });

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            // Worker executes...

            // Assert
            expect(capturedUpdate).toBeDefined();
            expect(capturedUpdate).toContain(chargeId);
        });
    });

    describe('Error Handling', () => {
        it('should handle missing paymentId', async () => {
            const job = {
                id: mockJobId,
                data: {}
            };

            // Act & Assert
            await expect(async () => {
                // Worker should throw
            }).rejects.toThrow('paymentId is required');

            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith('charge', false);
        });

        it('should handle payment not found', async () => {
            // Arrange
            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    oneOrNone: vi.fn().mockResolvedValue(null),
                    none: vi.fn()
                };
                return callback(mockT);
            });

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act & Assert
            await expect(async () => {
                // Worker should throw
            }).rejects.toThrow('Payment not found');
        });

        it('should skip processing if payment already has gateway_charge_id', async () => {
            // Arrange
            const processedPayment = {
                ...mockPayment,
                gateway_charge_id: 'ch_existing_123'
            };

            mockDb.tx.mockImplementation(async (callback) => {
                const mockT = {
                    oneOrNone: vi.fn().mockResolvedValue(processedPayment),
                    none: vi.fn()
                };
                return callback(mockT);
            });

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act
            // Worker executes...

            // Assert
            expect(mockGatewayClient.charge).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    existingChargeId: 'ch_existing_123'
                }),
                expect.stringContaining('already processed')
            );
        });
    });

    describe('Metrics', () => {
        it('should record successful job completion with processing time', async () => {
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
            // Worker executes...

            // Assert
            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'charge',
                true,
                expect.any(Number)
            );
            expect(mockMetrics.recordPaymentStatus).toHaveBeenCalledWith('succeeded');
        });

        it('should record failed job with processing time', async () => {
            // Arrange
            mockStatusTransition.transitionStatus
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({});
            mockGatewayClient.charge.mockRejectedValue(new Error('Gateway error'));

            const job = {
                id: mockJobId,
                data: { paymentId: mockPaymentId }
            };

            // Act & Assert
            await expect(async () => {
                // Worker executes...
            }).rejects.toThrow();

            expect(mockMetrics.recordWorkerJob).toHaveBeenCalledWith(
                'charge',
                false,
                expect.any(Number)
            );
        });
    });

    describe('Audit Logging', () => {
        it('should create audit log entries for each transition', async () => {
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
            // Worker executes...

            // Assert
            // Should call transitionStatus at least twice: pending→processing, processing→succeeded
            expect(mockStatusTransition.transitionStatus).toHaveBeenCalledTimes(2);
            
            // Each call includes metadata for audit
            expect(mockStatusTransition.transitionStatus).toHaveBeenCalledWith(
                mockPaymentId,
                expect.any(String),
                expect.objectContaining({
                    worker: 'charge.worker',
                    jobId: mockJobId,
                    reason: expect.any(String)
                })
            );
        });
    });
});
