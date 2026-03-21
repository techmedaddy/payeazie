export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export interface PaymentIntentRequest {
  orderId: string;
  amount: number;
  currency: string;
  demo?: {
    outcome: 'auto' | 'success' | 'failure';
    processingSpeed: 'normal' | 'slow';
  };
}

export interface PaymentResponse {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  gatewayId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  message: string;
  statusCode?: number;
}
