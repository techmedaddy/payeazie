import { api } from './api';
import { PaymentIntentRequest, PaymentResponse, PaymentStatus } from '../types';

export interface PaymentListResponse {
  data: PaymentResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters: {
    status: string;
  };
}

export interface AuditLogEntry {
  id: number;
  paymentId: string;
  previousStatus: string;
  newStatus: string;
  timestamp: string;
  metadata?: any;
}

/**
 * Normalize backend status (lowercase) to frontend enum (uppercase)
 * Provides fallback for unknown statuses
 */
function normalizePaymentStatus(status: string | undefined): PaymentStatus {
  if (!status) return PaymentStatus.PENDING;
  
  const normalized = status.toUpperCase();
  
  // Check if it's a valid enum value
  if (Object.values(PaymentStatus).includes(normalized as PaymentStatus)) {
    return normalized as PaymentStatus;
  }
  
  // Fallback to PENDING for unknown statuses
  console.warn(`Unknown payment status: "${status}", defaulting to PENDING`);
  return PaymentStatus.PENDING;
}

/**
 * Transform backend payment response to frontend format
 */
function transformPaymentResponse(backendData: any): PaymentResponse {
  return {
    id: backendData.id,
    orderId: backendData.orderId || backendData.order_id,
    amount: backendData.amount,
    currency: backendData.currency,
    status: normalizePaymentStatus(backendData.status),
    gatewayId: backendData.gatewayChargeId || backendData.gateway_charge_id,
    createdAt: backendData.createdAt || backendData.created_at,
    updatedAt: backendData.updatedAt || backendData.updated_at,
  };
}

export interface PaymentListResponse {
  data: PaymentResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters: {
    status: string;
  };
}

export interface AuditLogEntry {
  id: number;
  paymentId: string;
  previousStatus: string;
  newStatus: string;
  timestamp: string;
  metadata?: any;
}

export const PaymentService = {
  /**
   * List payments with pagination and optional status filter
   */
  listPayments: async (
    page: number = 1,
    limit: number = 20,
    status?: string
  ): Promise<PaymentListResponse> => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (status && status !== 'all') {
        params.append('status', status.toLowerCase());
      }
      const response = await api.get<any>(`/api/payments?${params.toString()}`);
      return {
        data: response.data.map(transformPaymentResponse),
        pagination: response.pagination,
        filters: response.filters,
      };
    } catch (err) {
      console.error('PaymentService.listPayments failed', err);
      throw err;
    }
  },

  /**
   * Creates a payment with auto-generated idempotency key
   */
  createPayment: async (data: PaymentIntentRequest): Promise<PaymentResponse> => {
    try {
      const response = await api.post<any>('/api/payments', data);
      return transformPaymentResponse(response);
    } catch (err) {
      console.error('PaymentService.createPayment failed', err);
      throw err;
    }
  },

  /**
   * Creates a payment intent with a specific idempotency key.
   */
  createPaymentIntent: async (
    data: PaymentIntentRequest,
    idempotencyKey: string
  ): Promise<PaymentResponse> => {
    try {
      // Pass idempotencyKey as third parameter (api.post signature)
      const response = await api.post<any>(
        '/api/payments/intents',
        data,
        idempotencyKey
      );
      return transformPaymentResponse(response);
    } catch (err) {
      console.error('PaymentService.createPaymentIntent failed', err);
      throw err;
    }
  },

  /**
   * Retrieves payment details by ID.
   */
  getPaymentById: async (id: string): Promise<PaymentResponse> => {
    try {
      const response = await api.get<any>(`/api/payments/${id}`);
      return transformPaymentResponse(response);
    } catch (err) {
      console.error(`PaymentService.getPaymentById failed for id=${id}`, err);
      throw err;
    }
  },

  /**
   * Get audit log for a payment
   */
  getAuditLog: async (paymentId: string): Promise<AuditLogEntry[]> => {
    try {
      const response = await api.get<any>(`/api/payments/${paymentId}/audit-log`);
      return response.auditLog || [];
    } catch (err) {
      console.error(`PaymentService.getAuditLog failed for id=${paymentId}`, err);
      return [];
    }
  },
};
