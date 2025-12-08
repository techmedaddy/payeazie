import { api } from './api';
import { PaymentIntentRequest, PaymentResponse } from '../types';

export const PaymentService = {
  /**
   * Creates a payment intent with a specific idempotency key.
   */
  createPaymentIntent: async (
    data: PaymentIntentRequest, 
    idempotencyKey: string
  ): Promise<PaymentResponse> => {
    return api.post<PaymentResponse>('/payments/intents', data, idempotencyKey);
  },

  /**
   * Retrieves payment details by ID.
   */
  getPaymentById: async (id: string): Promise<PaymentResponse> => {
    return api.get<PaymentResponse>(`/payments/${id}`);
  }
};
