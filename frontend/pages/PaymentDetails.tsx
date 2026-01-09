import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PaymentService } from '../services/payments';
import { PaymentResponse, PaymentStatus } from '../types';
import StatusBadge from '../components/ui/StatusBadge';
import { Loader2, ArrowLeft, RefreshCw, CreditCard, Calendar, Hash, Server, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { cn } from '../utils/cn';
import { usePaymentStream } from '../hooks/usePaymentStream';

const PaymentDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [displayStatus, setDisplayStatus] = useState<PaymentStatus | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [finalBackendStatus, setFinalBackendStatus] = useState<PaymentStatus | null>(null);
  const { showToast } = useToast();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousStatusRef = useRef<PaymentStatus | null>(null);
  const displayStatusRef = useRef<PaymentStatus | null>(null);
  
  // Keep displayStatusRef in sync
  useEffect(() => {
    displayStatusRef.current = displayStatus;
  }, [displayStatus]);
  
  const fetchPayment = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const [data, audit] = await Promise.all([
        PaymentService.getPaymentById(id),
        PaymentService.getAuditLog(id),
      ]);
      setPayment(data);
      setAuditLog(audit);
      setError(false);
      
      const backendStatus = data.status;
      const prevStatus = previousStatusRef.current;
      const currentDisplayStatus = displayStatusRef.current;
      
      // Initialize display status on first load
      if (!currentDisplayStatus) {
        if (backendStatus === PaymentStatus.PENDING) {
          setDisplayStatus(PaymentStatus.PENDING);
        } else if (backendStatus === PaymentStatus.PROCESSING) {
          setDisplayStatus(PaymentStatus.PROCESSING);
          // Start countdown for actual backend processing
          if (!processingStartTime) {
            setProcessingStartTime(Date.now());
            setCountdown(30);
          }
        } else if (backendStatus === PaymentStatus.SUCCEEDED || backendStatus === PaymentStatus.FAILED) {
          // Backend already in final state - stage the UI progression
          setDisplayStatus(PaymentStatus.PROCESSING);
          setFinalBackendStatus(backendStatus);
          setProcessingStartTime(Date.now());
          setCountdown(30);
        }
      }
      // Detect transition from pending/processing to final state
      else if (prevStatus && prevStatus !== backendStatus) {
        if ((prevStatus === PaymentStatus.PENDING || prevStatus === PaymentStatus.PROCESSING) &&
            (backendStatus === PaymentStatus.SUCCEEDED || backendStatus === PaymentStatus.FAILED)) {
          // Backend transitioned to final state - stage the UI
          setDisplayStatus(PaymentStatus.PROCESSING);
          setFinalBackendStatus(backendStatus);
          setProcessingStartTime(Date.now());
          setCountdown(30);
        } else {
          // Other transitions - update immediately
          setDisplayStatus(backendStatus);
        }
      }
      
      previousStatusRef.current = backendStatus;
      
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  // Use SSE for real-time status updates
  const { isConnected, latestStatus } = usePaymentStream(id || null, {
    onStatusChange: (event) => {
      // SSE status change detected
    },
    onError: (err) => {
      // SSE error
    },
    onConnect: () => {
      // SSE connected
    },
    onDisconnect: () => {
      // SSE disconnected
    },
  });

  // Polling effect - DISABLED to prevent infinite loops
  // Poll every 5 seconds when backend is processing or UI is staging
  useEffect(() => {
    if (!id) return;

    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // POLLING DISABLED - only fetch once on mount
    // Uncomment below to enable polling when needed
    /*
    const shouldPoll = payment?.status === PaymentStatus.PROCESSING || 
                       (displayStatus === PaymentStatus.PROCESSING && !finalBackendStatus);
    
    if (shouldPoll) {
      pollingIntervalRef.current = setInterval(() => {
        fetchPayment(true);
      }, 5000);
    }
    */

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [id, fetchPayment]);

  // Countdown effect - update countdown every second and reveal final status when done
  useEffect(() => {
    if (!processingStartTime) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    // Update countdown immediately
    const updateCountdown = () => {
      const elapsed = Math.floor((Date.now() - processingStartTime) / 1000);
      const remaining = Math.max(0, 30 - elapsed);
      setCountdown(remaining);
      
      if (remaining === 0) {
        // Countdown finished - reveal final status if we have it
        if (finalBackendStatus) {
          setDisplayStatus(finalBackendStatus);
          setFinalBackendStatus(null);
        } else if (payment?.status && payment.status !== PaymentStatus.PROCESSING) {
          // Backend completed during countdown
          setDisplayStatus(payment.status);
        }
        
        // Stop countdown
        setProcessingStartTime(null);
        setCountdown(null);
        
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }
    };

    updateCountdown();
    countdownIntervalRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [processingStartTime, finalBackendStatus, payment?.status]);

  useEffect(() => {
    fetchPayment();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <Server className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Payment Not Found</h2>
        <p className="text-slate-500 mt-2 max-w-md">
          Could not retrieve payment details for ID: <span className="font-mono bg-slate-100 px-1">{id}</span>
        </p>
        <Link to="/" className="mt-6 text-brand-600 font-medium hover:underline">Return to Dashboard</Link>
      </div>
    );
  }

  // Use displayStatus for all UI rendering
  const currentDisplayStatus = displayStatus || payment?.status || PaymentStatus.PENDING;
  
  // Calculate timeline progress based on displayStatus
  const steps = [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED];
  const currentStepIndex = steps.indexOf(currentDisplayStatus === PaymentStatus.FAILED ? PaymentStatus.PENDING : currentDisplayStatus);
  const isFailed = currentDisplayStatus === PaymentStatus.FAILED;

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-slate-900">Payment Details</h1>
                <StatusBadge status={currentDisplayStatus} size="md" showIcon={true} />
                {/* Real-time connection indicator */}
                {isConnected ? (
                  <div className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                    <Wifi className="w-3 h-3" />
                    <span>Live</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                    <WifiOff className="w-3 h-3" />
                    <span>Offline</span>
                  </div>
                )}
                {/* Countdown indicator for processing state */}
                {payment.status === PaymentStatus.PROCESSING && countdown !== null && (
                  <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="font-medium">Processing... ({countdown}s left)</span>
                  </div>
                )}
              </div>
              <p className="text-slate-500 flex items-center gap-2">
                ID: <span className="font-mono text-slate-700 select-all">{payment.id}</span>
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-slate-900">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: payment.currency }).format(payment.amount)}
              </div>
              <p className="text-slate-400 text-sm">Total Amount</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="px-8 py-8 bg-slate-50 border-b border-slate-200">
            <div className="relative flex items-center justify-between max-w-2xl mx-auto">
              {/* Progress Bar Background */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 -z-10"></div>
              {/* Active Progress */}
              <div 
                className={cn("absolute left-0 top-1/2 -translate-y-1/2 h-1 transition-all duration-500 -z-10", isFailed ? "bg-red-500" : "bg-emerald-500")}
                style={{ width: isFailed ? '100%' : `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
              ></div>

              {/* Steps */}
              {steps.map((step, idx) => {
                const isCompleted = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                
                return (
                  <div key={step} className="flex flex-col items-center gap-2 bg-slate-50">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                      isCompleted 
                        ? (isFailed && isCurrent ? "bg-red-100 border-red-500 text-red-600" : "bg-emerald-100 border-emerald-500 text-emerald-600")
                        : "bg-white border-slate-300 text-slate-300"
                    )}>
                      <div className={cn("w-2.5 h-2.5 rounded-full", isCompleted ? (isFailed && isCurrent ? "bg-red-500" : "bg-emerald-500") : "bg-transparent")} />
                    </div>
                    <span className={cn("text-xs font-medium uppercase", isCompleted ? "text-slate-900" : "text-slate-400")}>
                      {step === PaymentStatus.SUCCEEDED && isFailed ? 'FAILED' : step}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Detail Grid */}
          <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-2">Order Information</h3>
              
              <div className="flex items-start gap-4">
                <div className="p-2 bg-slate-100 rounded text-slate-500">
                  <Hash className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Order Reference</p>
                  <p className="font-medium text-slate-900">{payment.orderId}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 bg-slate-100 rounded text-slate-500">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Gateway ID</p>
                  <p className="font-medium text-slate-900 font-mono text-sm">
                    {payment.gatewayId || 'Generating...'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-2">Timestamps</h3>
              
              <div className="flex items-start gap-4">
                <div className="p-2 bg-slate-100 rounded text-slate-500">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Created At</p>
                  <p className="font-medium text-slate-900">
                    {new Date(payment.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 bg-slate-100 rounded text-slate-500">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Last Updated</p>
                  <p className="font-medium text-slate-900">
                    {new Date(payment.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Real Audit Log */}
          <div className="bg-slate-50 p-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wider">Audit Log</h3>
            {auditLog.length === 0 ? (
              <div className="text-sm text-slate-400 italic">No audit entries found</div>
            ) : (
              <div className="space-y-3">
                {auditLog.map((entry, idx) => (
                  <div key={idx} className="flex gap-4 text-sm">
                    <span className="font-mono text-slate-400 w-32 shrink-0">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    <div className="flex-1">
                      <span className={cn(
                        "font-medium",
                        entry.newStatus === 'succeeded' && "text-emerald-700",
                        entry.newStatus === 'failed' && "text-red-700",
                        entry.newStatus === 'processing' && "text-amber-700",
                        entry.newStatus === 'pending' && "text-slate-700"
                      )}>
                        {entry.previousStatus} → {entry.newStatus}
                      </span>
                      {entry.metadata && (
                        <div className="text-xs text-slate-500 mt-1">
                          {JSON.stringify(entry.metadata)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentDetails;
