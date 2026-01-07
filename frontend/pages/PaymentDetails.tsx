import React, { useEffect, useState, useRef } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { showToast } = useToast();
  
  // Use SSE for real-time status updates instead of polling
  const { isConnected, latestStatus } = usePaymentStream(id || null, {
    onStatusChange: (event) => {
      console.log('Status changed:', event);
      // Refetch payment details when status changes
      if (id) {
        fetchPayment(true);
      }
    },
    onError: (err) => {
      console.error('SSE error:', err);
      // Fall back to manual refresh on error
    },
    onConnect: () => {
      console.log('SSE connected for payment:', id);
    },
    onDisconnect: () => {
      console.log('SSE disconnected for payment:', id);
    },
  });

  const fetchPayment = async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const data = await PaymentService.getPaymentById(id);
      setPayment(data);
      setError(false);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

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

  if (error || !payment) {
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

  // Calculate timeline progress
  const steps = [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED];
  const currentStepIndex = steps.indexOf(payment.status === PaymentStatus.FAILED ? PaymentStatus.PENDING : payment.status);
  const isFailed = payment.status === PaymentStatus.FAILED;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/" className="inline-flex items-center text-slate-500 hover:text-slate-800 transition-colors mb-2">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Link>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
             <div className="flex items-center gap-3 mb-2">
               <h1 className="text-2xl font-bold text-slate-900">Payment Details</h1>
               <StatusBadge status={payment.status} size="md" showIcon={true} />
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
        
        {/* Mock Audit Log */}
        <div className="bg-slate-50 p-6 border-t border-slate-200">
           <h3 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wider">Audit Log</h3>
           <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                 <span className="font-mono text-slate-400 w-20">{new Date(payment.createdAt).toLocaleTimeString()}</span>
                 <span className="text-slate-700">Payment created via API</span>
              </div>
              {payment.status !== PaymentStatus.PENDING && (
                 <div className="flex gap-4 text-sm">
                   <span className="font-mono text-slate-400 w-20">{new Date(new Date(payment.createdAt).getTime() + 500).toLocaleTimeString()}</span>
                   <span className="text-slate-700">Idempotency key locked</span>
                </div>
              )}
               {payment.status === PaymentStatus.SUCCEEDED && (
                 <div className="flex gap-4 text-sm">
                   <span className="font-mono text-slate-400 w-20">{new Date(payment.updatedAt).toLocaleTimeString()}</span>
                   <span className="text-emerald-700 font-medium">Payment authorized by gateway</span>
                </div>
              )}
               {payment.status === PaymentStatus.FAILED && (
                 <div className="flex gap-4 text-sm">
                   <span className="font-mono text-slate-400 w-20">{new Date(payment.updatedAt).toLocaleTimeString()}</span>
                   <span className="text-red-700 font-medium">Transaction declined</span>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentDetails;
