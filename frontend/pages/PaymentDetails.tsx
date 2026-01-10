import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePaymentDetails } from '../hooks/usePaymentDetails';
import StatusBadge from '../components/ui/StatusBadge';
import { 
  Loader2, 
  ArrowLeft, 
  RefreshCw, 
  CreditCard, 
  Calendar, 
  Hash, 
  DollarSign,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Activity,
  Server,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { cn } from '../utils/cn';

const PaymentDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { payment, loading, error, notFound, refetch, elapsedTime } = usePaymentDetails(id || '');
  
  // Audit log controls
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Loading state
  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading payment details...</p>
        </div>
      </div>
    );
  }

  // 404 - Payment not found
  if (notFound || !payment) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Payment Not Found</h2>
        <p className="text-slate-500 mt-2 max-w-md">
          Could not retrieve payment details for ID: <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{id}</span>
        </p>
        <Link 
          to="/dashboard" 
          className="mt-6 inline-flex items-center gap-2 text-purple-600 font-medium hover:text-purple-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // 500 - Server error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <Server className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Internal Server Error</h2>
        <p className="text-slate-500 mt-2 max-w-md">{error}</p>
        <div className="flex gap-3 mt-6">
          <button 
            onClick={() => refetch()} 
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          <Link 
            to="/dashboard" 
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const status = payment.status.toLowerCase();
  const isFinal = status === 'succeeded' || status === 'failed';
  const isProcessing = status === 'processing';
  
  // Timeline steps
  const steps = [
    { id: 'pending', label: 'Pending', icon: Clock },
    { id: 'processing', label: 'Processing', icon: Activity },
    { id: status === 'failed' ? 'failed' : 'succeeded', label: status === 'failed' ? 'Failed' : 'Succeeded', icon: status === 'failed' ? XCircle : CheckCircle2 }
  ];
  
  const currentStepIndex = steps.findIndex(s => s.id === status);

  // Filtered and sorted audit log
  const filteredAndSortedAuditLog = useMemo(() => {
    if (!payment.audit_log) return [];
    
    // Filter by status
    let filtered = payment.audit_log;
    if (statusFilter !== 'all') {
      filtered = payment.audit_log.filter(entry => 
        entry.new_status.toLowerCase() === statusFilter.toLowerCase()
      );
    }
    
    // Sort by timestamp
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.changed_at).getTime();
      const dateB = new Date(b.changed_at).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
    
    return sorted;
  }, [payment.audit_log, statusFilter, sortOrder]);

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  // Get unique statuses for filter dropdown
  const availableStatuses = useMemo(() => {
    if (!payment.audit_log) return [];
    const statuses = new Set(payment.audit_log.map(entry => entry.new_status.toLowerCase()));
    return Array.from(statuses);
  }, [payment.audit_log]);

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <Link 
          to="/dashboard" 
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-medium">Back to Dashboard</span>
        </Link>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="p-6 md:p-8 border-b border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-slate-900">Payment Details</h1>
                  <StatusBadge status={status} size="md" showIcon={true} />
                </div>
                <p className="text-slate-500 flex items-center gap-2">
                  ID: <span className="font-mono text-sm text-slate-700 bg-slate-100 px-2 py-0.5 rounded select-all">{payment.id}</span>
                </p>
              </div>
              <div className="text-left md:text-right">
                <div className="text-3xl font-bold text-slate-900">
                  {new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: payment.currency 
                  }).format(parseFloat(payment.amount))}
                </div>
                <p className="text-slate-400 text-sm mt-1">{payment.currency}</p>
              </div>
            </div>

            {/* Processing Countdown */}
            {isProcessing && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">Processing payment...</p>
                  <p className="text-xs text-amber-700 mt-0.5">{elapsedTime}s elapsed</p>
                </div>
                <button 
                  onClick={() => refetch()} 
                  className="p-2 hover:bg-amber-100 rounded-lg transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4 text-amber-700" />
                </button>
              </div>
            )}
          </div>

          {/* Status Timeline */}
          <div className="px-6 md:px-8 py-8 bg-slate-50 border-b border-slate-200">
            <div className="relative flex items-center justify-between max-w-2xl mx-auto">
              {/* Progress Bar Background */}
              <div className="absolute left-0 top-5 w-full h-1 bg-slate-200 -z-10"></div>
              
              {/* Active Progress */}
              <div 
                className={cn(
                  "absolute left-0 top-5 h-1 transition-all duration-700 -z-10",
                  status === 'failed' ? "bg-red-500" : "bg-emerald-500"
                )}
                style={{ 
                  width: currentStepIndex >= 0 
                    ? `${(currentStepIndex / (steps.length - 1)) * 100}%` 
                    : '0%' 
                }}
              ></div>

              {/* Step Markers */}
              {steps.map((step, idx) => {
                const isCompleted = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                const StepIcon = step.icon;
                
                return (
                  <div key={step.id} className="flex flex-col items-center gap-3 bg-slate-50 relative z-10">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shadow-sm",
                      isCompleted 
                        ? (step.id === 'failed' ? "bg-red-100 border-red-500 text-red-600" : "bg-emerald-100 border-emerald-500 text-emerald-600")
                        : "bg-white border-slate-300 text-slate-400"
                    )}>
                      <StepIcon className="w-5 h-5" />
                    </div>
                    <span className={cn(
                      "text-xs font-semibold uppercase tracking-wider",
                      isCompleted ? "text-slate-900" : "text-slate-400"
                    )}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details Grid */}
          <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Order Information
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                    <Hash className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Order ID</p>
                    <p className="font-medium text-slate-900">{payment.order_id}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-500">Gateway Transaction ID</p>
                    <p className="font-mono text-sm text-slate-900 break-all">
                      {payment.gateway_transaction_id || (
                        <span className="text-slate-400 italic">Pending...</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 bg-green-50 rounded-lg text-green-600">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Amount</p>
                    <p className="font-bold text-lg text-slate-900">
                      {new Intl.NumberFormat('en-US', { 
                        style: 'currency', 
                        currency: payment.currency 
                      }).format(parseFloat(payment.amount))}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Timestamps
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Created At</p>
                    <p className="font-medium text-slate-900">
                      {new Date(payment.created_at).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Last Updated</p>
                    <p className="font-medium text-slate-900">
                      {new Date(payment.updated_at).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Idempotency Key</p>
                    <p className="font-mono text-xs text-slate-900 break-all">
                      {payment.idempotency_key}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Enhanced Audit Log */}
          {payment.audit_log && payment.audit_log.length > 0 && (
            <div className="bg-slate-50 p-6 md:p-8 border-t border-slate-200">
              {/* Header with Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Audit Trail
                  <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                    {filteredAndSortedAuditLog.length} {filteredAndSortedAuditLog.length === 1 ? 'entry' : 'entries'}
                  </span>
                </h3>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Status Filter */}
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="all">All Statuses</option>
                      {availableStatuses.map(s => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Sort Toggle */}
                  <button
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center gap-2 text-sm px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                    title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                  >
                    {sortOrder === 'desc' ? (
                      <>
                        <ArrowDown className="w-4 h-4" />
                        <span className="hidden sm:inline">Newest First</span>
                      </>
                    ) : (
                      <>
                        <ArrowUp className="w-4 h-4" />
                        <span className="hidden sm:inline">Oldest First</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Audit Entries */}
              {filteredAndSortedAuditLog.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No audit entries match the selected filter</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAndSortedAuditLog.map((entry, index) => {
                    const isFinalStatus = entry.new_status === 'succeeded' || entry.new_status === 'failed';
                    const isLastEntry = index === filteredAndSortedAuditLog.length - 1;
                    
                    return (
                      <div 
                        key={entry.id} 
                        className={cn(
                          "flex flex-col md:flex-row gap-4 text-sm bg-white p-4 rounded-lg border-2 transition-all",
                          isFinalStatus && "border-l-4",
                          entry.new_status === 'succeeded' && "border-l-emerald-500 bg-emerald-50/30",
                          entry.new_status === 'failed' && "border-l-red-500 bg-red-50/30",
                          !isFinalStatus && "border-slate-200"
                        )}
                      >
                        {/* Timestamp */}
                        <div className="flex items-center gap-2 md:w-48 shrink-0">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span className="font-mono text-xs text-slate-600">
                            {formatTimestamp(entry.changed_at)}
                          </span>
                        </div>
                        
                        {/* Status Transition */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-slate-600">Status changed from</span>
                            
                            {entry.old_status ? (
                              <span className={cn(
                                "font-semibold px-2 py-0.5 rounded text-xs",
                                "bg-slate-100 text-slate-700"
                              )}>
                                {entry.old_status.charAt(0).toUpperCase() + entry.old_status.slice(1)}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-xs">—</span>
                            )}
                            
                            <span className="text-slate-400">→</span>
                            
                            <span className={cn(
                              "font-bold px-2.5 py-0.5 rounded text-xs uppercase tracking-wide",
                              entry.new_status === 'succeeded' && "bg-emerald-100 text-emerald-700 border border-emerald-300",
                              entry.new_status === 'failed' && "bg-red-100 text-red-700 border border-red-300",
                              entry.new_status === 'processing' && "bg-amber-100 text-amber-700 border border-amber-300",
                              entry.new_status === 'pending' && "bg-slate-100 text-slate-700 border border-slate-300"
                            )}>
                              {entry.new_status}
                            </span>
                            
                            {isFinalStatus && (
                              <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                {entry.new_status === 'succeeded' ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Final
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3 h-3 text-red-600" />
                                    Final
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                          
                          {/* Metadata */}
                          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                            <div className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                              <span className="font-semibold text-slate-700">Details: </span>
                              <span className="font-mono">{JSON.stringify(entry.metadata)}</span>
                            </div>
                          )}
                          
                          {/* Narration-friendly text */}
                          <div className="mt-2 text-xs text-slate-400 italic hidden md:block">
                            {formatTimestamp(entry.changed_at).replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3 at')} — 
                            {entry.old_status 
                              ? ` Status changed from ${entry.old_status} to ${entry.new_status}`
                              : ` Status set to ${entry.new_status}`
                            }
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="p-6 md:p-8 bg-white border-t border-slate-200 flex gap-3">
            <button 
              onClick={() => refetch()} 
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
              disabled={isProcessing}
            >
              <RefreshCw className={cn("w-4 h-4", isProcessing && "animate-spin")} />
              Refresh
            </button>
            <Link 
              to="/create" 
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              Create New Payment
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentDetails;
