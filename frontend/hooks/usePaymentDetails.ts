import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

interface PaymentActor {
  id: string;
  name: string | null;
  email: string | null;
}

export interface AuditLogEntry {
  id: string;
  paymentId: string;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
  triggeredBy: string;
  actor: PaymentActor | null;
  worker: string | null;
  jobId: string | null;
  chargeId: string | null;
  gatewayProvider: string | null;
  gatewayStatus: string | null;
  failureCode: string | null;
  failureReason: string | null;
  refundReason: string | null;
  summary: string;
  metadata: Record<string, unknown>;
}

interface PaymentGatewayDetails {
  provider: string;
  chargeId: string | null;
  lastKnownStatus: string;
}

interface ProcessingDetails {
  startedAt: string;
  worker: string | null;
  jobId: string | null;
}

interface FailureDetails {
  reason: string;
  code: string | null;
  worker: string | null;
  jobId: string | null;
  failedAt: string;
  chargeId: string | null;
}

interface RefundDetails {
  reason: string;
  refundedAt: string;
  worker: string | null;
  jobId: string | null;
  chargeId: string | null;
  gatewayStatus: string | null;
  triggeredBy: string;
  actor: PaymentActor | null;
}

interface RefundState {
  eligible: boolean;
  state: 'eligible' | 'not_eligible' | 'refunded';
  refundableStatuses: string[];
  refundedAt: string | null;
}

interface LatestActivity {
  summary: string;
  createdAt: string;
  triggeredBy: string;
  worker: string | null;
  jobId: string | null;
}

export interface PaymentDetails {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  gatewayTransactionId: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  gateway: PaymentGatewayDetails;
  processingDetails: ProcessingDetails | null;
  failureDetails: FailureDetails | null;
  refundDetails: RefundDetails | null;
  refund: RefundState | null;
  latestActivity: LatestActivity | null;
  auditLog: AuditLogEntry[];
}

function normalizeAuditEntry(entry: any): AuditLogEntry {
  return {
    id: String(entry.id),
    paymentId: entry.paymentId || entry.payment_id,
    fromStatus: entry.fromStatus ?? entry.from_status ?? null,
    toStatus: entry.toStatus || entry.to_status,
    createdAt: entry.createdAt || entry.created_at,
    triggeredBy: entry.triggeredBy || entry.triggered_by || 'system',
    actor: entry.actor
      ? {
          id: String(entry.actor.id),
          name: entry.actor.name ?? null,
          email: entry.actor.email ?? null,
        }
      : null,
    worker: entry.worker ?? null,
    jobId: entry.jobId ?? null,
    chargeId: entry.chargeId ?? null,
    gatewayProvider: entry.gatewayProvider ?? null,
    gatewayStatus: entry.gatewayStatus ?? null,
    failureCode: entry.failureCode ?? null,
    failureReason: entry.failureReason ?? null,
    refundReason: entry.refundReason ?? null,
    summary: entry.summary || 'Payment status updated.',
    metadata: entry.metadata || {},
  };
}

function transformPaymentDetails(data: any): PaymentDetails {
  const auditLog = Array.isArray(data.auditLog || data.audit_log)
    ? (data.auditLog || data.audit_log).map(normalizeAuditEntry)
    : [];

  return {
    id: data.id,
    orderId: data.orderId || data.order_id,
    amount: String(data.amount),
    currency: data.currency,
    status: data.status,
    gatewayTransactionId:
      data.gatewayChargeId ||
      data.gatewayTransactionId ||
      data.gateway_charge_id ||
      data.gateway?.chargeId ||
      null,
    idempotencyKey: data.idempotencyKey || data.idempotency_key,
    createdAt: data.createdAt || data.created_at,
    updatedAt: data.updatedAt || data.updated_at,
    userId: data.userId || data.user_id || null,
    gateway: {
      provider: data.gateway?.provider || 'mock',
      chargeId:
        data.gateway?.chargeId ||
        data.gatewayChargeId ||
        data.gateway_charge_id ||
        null,
      lastKnownStatus: data.gateway?.lastKnownStatus || data.status,
    },
    processingDetails: data.processingDetails || null,
    failureDetails: data.failureDetails || null,
    refundDetails: data.refundDetails || null,
    refund: data.refund || null,
    latestActivity: data.latestActivity || null,
    auditLog,
  };
}

interface UsePaymentDetailsResult {
  payment: PaymentDetails | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  refetch: () => Promise<void>;
  elapsedTime: number;
}

const FINAL_STATUSES = ['succeeded', 'failed', 'refunded'];
const POLL_INTERVAL = 5000;

export const usePaymentDetails = (paymentId: string): UsePaymentDetailsResult => {
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const fetchPayment = useCallback(async () => {
    try {
      setError(null);
      setNotFound(false);

      const rawData = await api.get<any>(`/api/payments/${paymentId}`);
      const data = transformPaymentDetails(rawData);
      setPayment(data);
      setLoading(false);

      if (data.status && FINAL_STATUSES.includes(data.status.toLowerCase())) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      }

      return data;
    } catch (err: any) {
      setLoading(false);

      if (err.statusCode === 404) {
        setNotFound(true);
        setError('Payment not found');
      } else if (err.statusCode === 403) {
        setNotFound(true);
        setError('You do not have permission to view this payment');
      } else if (err.statusCode && err.statusCode >= 500) {
        setError('Internal Server Error. Please try again later.');
      } else {
        setError(err.message || 'Failed to fetch payment details');
      }

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      return null;
    }
  }, [paymentId]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    fetchPayment();
  }, [fetchPayment]);

  useEffect(() => {
    if (payment && !FINAL_STATUSES.includes(payment.status.toLowerCase())) {
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedTime(elapsed);
      }, 1000);

      pollIntervalRef.current = setInterval(() => {
        fetchPayment();
      }, POLL_INTERVAL);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [payment, fetchPayment]);

  return {
    payment,
    loading,
    error,
    notFound,
    refetch: fetchPayment,
    elapsedTime,
  };
};
