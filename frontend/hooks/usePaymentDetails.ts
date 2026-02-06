import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

interface AuditLogEntry {
  id: number;
  payment_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string;
  changed_at: string;
  metadata: any;
}

interface PaymentDetails {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  gatewayTransactionId: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  userId: number | null;
  audit_log?: AuditLogEntry[];
}

/**
 * Transform API response to consistent camelCase format.
 * Handles both camelCase (from controller transform) and snake_case (fallback).
 */
function transformPaymentDetails(data: any): PaymentDetails {
  return {
    id: data.id,
    orderId: data.orderId || data.order_id,
    amount: data.amount,
    currency: data.currency,
    status: data.status,
    gatewayTransactionId: data.gatewayChargeId || data.gatewayTransactionId || data.gateway_charge_id || data.gateway_transaction_id || null,
    idempotencyKey: data.idempotencyKey || data.idempotency_key,
    createdAt: data.createdAt || data.created_at,
    updatedAt: data.updatedAt || data.updated_at,
    userId: data.userId || data.user_id || null,
    audit_log: data.audit_log || data.auditLog,
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

const FINAL_STATUSES = ['succeeded', 'failed'];
const POLL_INTERVAL = 5000; // 5 seconds

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
      
      // Stop polling if status is final
      if (data?.status && FINAL_STATUSES.includes(data.status.toLowerCase())) {
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
      
      console.error('❌ Failed to fetch payment details:', err);
      
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
      
      // Stop polling on error
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      // Don't throw - let the component handle the error state
      return null;
    }
  }, [paymentId]);

  // Initial fetch
  useEffect(() => {
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    fetchPayment();
  }, [fetchPayment]);

  // Set up polling
  useEffect(() => {
    if (payment && !FINAL_STATUSES.includes(payment.status.toLowerCase())) {
      // Start elapsed timer
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
      
      // Start polling
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
