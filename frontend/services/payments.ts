import { api } from './api';
import { PaymentIntentRequest, PaymentResponse, PaymentStatus } from '../types';

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

export const PaymentService = {
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
  }
};
