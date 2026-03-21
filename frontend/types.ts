export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export interface ProcessingRecoveryState {
  eligible: boolean;
  state: 'not_processing' | 'healthy' | 'reconcile' | 'restart';
  canReconcile: boolean;
  canRestart: boolean;
  message: string;
}

export interface ProcessingState {
  active: boolean;
  startedAt: string | null;
  elapsedSeconds: number | null;
  thresholdSeconds: number;
  isStuck: boolean;
  hasGatewayCharge: boolean;
  stuckSince: string | null;
  recovery: ProcessingRecoveryState;
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
  processing?: ProcessingState | null;
}

export interface ApiError {
  message: string;
  statusCode?: number;
}
