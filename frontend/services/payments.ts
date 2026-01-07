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
    try {
      // Pass idempotencyKey as third parameter (api.post signature)
      const response = await api.post<PaymentResponse>(
        '/api/payments/intents',
        data,
        idempotencyKey
      );
      return response;
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
      const response = await api.get<PaymentResponse>(`/api/payments/${id}`);
      return response;
    } catch (err) {
      console.error(`PaymentService.getPaymentById failed for id=${id}`, err);
      throw err;
    }
  }
};
