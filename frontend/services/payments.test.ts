import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from './payments';
import { PaymentStatus } from '../types';

// Mock the api module
vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from './api';

describe('PaymentService Status Normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should normalize lowercase status to uppercase enum', async () => {
      const mockBackendResponse = {
        id: 'pay-123',
        orderId: 'ORD-123',
        amount: 1000,
        currency: 'USD',
        status: 'processing', // lowercase from backend
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:00:00Z',
      };

      vi.mocked(api.post).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.createPaymentIntent(
        { orderId: 'ORD-123', amount: 1000, currency: 'USD' },
        'key-123'
      );

      expect(result.status).toBe(PaymentStatus.PROCESSING); // uppercase enum
      expect(result.status).toBe('PROCESSING');
    });

    it('should handle "succeeded" status from backend', async () => {
      const mockBackendResponse = {
        id: 'pay-456',
        orderId: 'ORD-456',
        amount: 2000,
        currency: 'USD',
        status: 'succeeded', // lowercase
        gatewayChargeId: 'ch_123',
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:00:00Z',
      };

      vi.mocked(api.post).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.createPaymentIntent(
        { orderId: 'ORD-456', amount: 2000, currency: 'USD' },
        'key-456'
      );

      expect(result.status).toBe(PaymentStatus.SUCCEEDED);
      expect(result.gatewayId).toBe('ch_123');
    });

    it('should handle "failed" status from backend', async () => {
      const mockBackendResponse = {
        id: 'pay-789',
        orderId: 'ORD-789',
        amount: 3000,
        currency: 'USD',
        status: 'failed', // lowercase
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:00:00Z',
      };

      vi.mocked(api.post).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.createPaymentIntent(
        { orderId: 'ORD-789', amount: 3000, currency: 'USD' },
        'key-789'
      );

      expect(result.status).toBe(PaymentStatus.FAILED);
    });

    it('should handle "refunded" status from backend', async () => {
      const mockBackendResponse = {
        id: 'pay-refund-123',
        orderId: 'ORD-REFUND-123',
        amount: 1500,
        currency: 'USD',
        status: 'refunded',
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:10:00Z',
      };

      vi.mocked(api.post).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.createPaymentIntent(
        { orderId: 'ORD-REFUND-123', amount: 1500, currency: 'USD' },
        'key-refund-123'
      );

      expect(result.status).toBe(PaymentStatus.REFUNDED);
    });

    it('should default to PENDING for missing status', async () => {
      const mockBackendResponse = {
        id: 'pay-000',
        orderId: 'ORD-000',
        amount: 1000,
        currency: 'USD',
        // status is missing
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:00:00Z',
      };

      vi.mocked(api.post).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.createPaymentIntent(
        { orderId: 'ORD-000', amount: 1000, currency: 'USD' },
        'key-000'
      );

      expect(result.status).toBe(PaymentStatus.PENDING);
    });

    it('should default to PENDING for unknown status', async () => {
      const mockBackendResponse = {
        id: 'pay-999',
        orderId: 'ORD-999',
        amount: 1000,
        currency: 'USD',
        status: 'unknown_status', // invalid status
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:00:00Z',
      };

      vi.mocked(api.post).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.createPaymentIntent(
        { orderId: 'ORD-999', amount: 1000, currency: 'USD' },
        'key-999'
      );

      expect(result.status).toBe(PaymentStatus.PENDING);
    });

    it('should handle snake_case field names from backend', async () => {
      const mockBackendResponse = {
        id: 'pay-snake',
        order_id: 'ORD-SNAKE', // snake_case
        amount: 1000,
        currency: 'USD',
        status: 'processing',
        gateway_charge_id: 'ch_snake', // snake_case
        created_at: '2026-01-07T10:00:00Z', // snake_case
        updated_at: '2026-01-07T10:00:00Z', // snake_case
      };

      vi.mocked(api.post).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.createPaymentIntent(
        { orderId: 'ORD-SNAKE', amount: 1000, currency: 'USD' },
        'key-snake'
      );

      expect(result.orderId).toBe('ORD-SNAKE');
      expect(result.gatewayId).toBe('ch_snake');
      expect(result.createdAt).toBe('2026-01-07T10:00:00Z');
      expect(result.updatedAt).toBe('2026-01-07T10:00:00Z');
    });
  });

  describe('getPaymentById', () => {
    it('should normalize status for fetched payment', async () => {
      const mockBackendResponse = {
        id: 'pay-get-123',
        orderId: 'ORD-GET-123',
        amount: 5000,
        currency: 'USD',
        status: 'succeeded', // lowercase
        gatewayChargeId: 'ch_get_123',
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:05:00Z',
      };

      vi.mocked(api.get).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.getPaymentById('pay-get-123');

      expect(result.status).toBe(PaymentStatus.SUCCEEDED);
      expect(result.id).toBe('pay-get-123');
    });

    it('should handle all status values correctly', async () => {
      const testCases = [
        { backend: 'pending', expected: PaymentStatus.PENDING },
        { backend: 'processing', expected: PaymentStatus.PROCESSING },
        { backend: 'succeeded', expected: PaymentStatus.SUCCEEDED },
        { backend: 'failed', expected: PaymentStatus.FAILED },
        { backend: 'refunded', expected: PaymentStatus.REFUNDED },
        { backend: 'PENDING', expected: PaymentStatus.PENDING }, // already uppercase
        { backend: 'ProCessinG', expected: PaymentStatus.PROCESSING }, // mixed case
      ];

      for (const testCase of testCases) {
        const mockResponse = {
          id: 'pay-test',
          orderId: 'ORD-TEST',
          amount: 1000,
          currency: 'USD',
          status: testCase.backend,
          createdAt: '2026-01-07T10:00:00Z',
          updatedAt: '2026-01-07T10:00:00Z',
        };

        vi.mocked(api.get).mockResolvedValue(mockResponse);

        const result = await PaymentService.getPaymentById('pay-test');

        expect(result.status).toBe(testCase.expected);
      }
    });
  });

  describe('Field Name Transformation', () => {
    it('should prefer camelCase over snake_case when both exist', async () => {
      const mockBackendResponse = {
        id: 'pay-both',
        orderId: 'ORD-CAMEL', // camelCase
        order_id: 'ORD-SNAKE', // snake_case (should be ignored)
        amount: 1000,
        currency: 'USD',
        status: 'processing',
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:00:00Z',
      };

      vi.mocked(api.get).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.getPaymentById('pay-both');

      expect(result.orderId).toBe('ORD-CAMEL'); // camelCase takes priority
    });

    it('should fall back to snake_case if camelCase is missing', async () => {
      const mockBackendResponse = {
        id: 'pay-fallback',
        order_id: 'ORD-FALLBACK', // only snake_case
        amount: 1000,
        currency: 'USD',
        status: 'processing',
        created_at: '2026-01-07T10:00:00Z',
        updated_at: '2026-01-07T10:00:00Z',
      };

      vi.mocked(api.get).mockResolvedValue(mockBackendResponse);

      const result = await PaymentService.getPaymentById('pay-fallback');

      expect(result.orderId).toBe('ORD-FALLBACK');
      expect(result.createdAt).toBe('2026-01-07T10:00:00Z');
    });
  });

  describe('refundPayment', () => {
    it('should call the refund endpoint for a payment', async () => {
      const mockRefundResponse = {
        id: 'pay-refund-456',
        status: 'refunded',
      };

      vi.mocked(api.post).mockResolvedValue(mockRefundResponse);

      const result = await PaymentService.refundPayment('pay-refund-456', 'Customer requested a duplicate charge reversal.');

      expect(api.post).toHaveBeenCalledWith('/api/payments/pay-refund-456/refund', {
        reason: 'Customer requested a duplicate charge reversal.',
      });
      expect(result).toEqual(mockRefundResponse);
    });
  });
});
