import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePaymentDetails } from '../hooks/usePaymentDetails';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Hash,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
  User,
  XCircle,
} from 'lucide-react';
import { cn } from '../utils/cn';

const toTitleCase = (value: string | null | undefined) => {
  if (!value) return 'Unknown';

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatDateTime = (timestamp: string) =>
  new Date(timestamp).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const PaymentDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { payment, loading, error, notFound, refetch, elapsedTime } = usePaymentDetails(id || '');

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredAndSortedAuditLog = useMemo(() => {
    if (!payment?.auditLog.length) return [];

    const filtered =
      statusFilter === 'all'
        ? payment.auditLog
        : payment.auditLog.filter((entry) => entry.toStatus.toLowerCase() === statusFilter.toLowerCase());

    return [...filtered].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [payment?.auditLog, sortOrder, statusFilter]);

  const availableStatuses = useMemo(() => {
    if (!payment?.auditLog.length) return [];
    return Array.from(new Set(payment.auditLog.map((entry) => entry.toStatus.toLowerCase())));
  }, [payment?.auditLog]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-brand-600" />
          <p className="text-sm text-slate-500">Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (notFound || !payment) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 rounded-full bg-red-50 p-4">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Payment Not Found</h2>
        <p className="mt-2 max-w-md text-slate-500">
          Could not retrieve payment details for ID:{' '}
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">{id}</span>
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center gap-2 font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Return to Dashboard
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 rounded-full bg-red-50 p-4">
          <Server className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Internal Server Error</h2>
        <p className="mt-2 max-w-md text-slate-500">{error}</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const status = payment.status.toLowerCase();
  const isFailed = status === 'failed';
  const isProcessing = status === 'processing';

  const steps = [
    { id: 'pending', label: 'Pending', icon: Clock },
    { id: 'processing', label: 'Processing', icon: Activity },
    {
      id: isFailed ? 'failed' : 'succeeded',
      label: isFailed ? 'Failed' : 'Succeeded',
      icon: isFailed ? XCircle : CheckCircle2,
    },
  ];

  const currentStepIndex = steps.findIndex((step) => step.id === status);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-slate-600 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="font-medium">Back to Dashboard</span>
        </Link>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6 md:p-8">
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="mb-2 flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900">Payment Details</h1>
                  <StatusBadge status={status} size="md" showIcon={true} />
                </div>
                <p className="flex items-center gap-2 text-slate-500">
                  ID:
                  <span className="select-all rounded bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-700">
                    {payment.id}
                  </span>
                </p>
              </div>
              <div className="text-left md:text-right">
                <div className="text-3xl font-bold text-slate-900">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: payment.currency,
                  }).format(parseFloat(payment.amount))}
                </div>
                <p className="mt-1 text-sm text-slate-400">{payment.currency}</p>
              </div>
            </div>

            {isProcessing && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">Processing payment...</p>
                  <p className="mt-0.5 text-xs text-amber-700">{elapsedTime}s elapsed</p>
                </div>
                <button
                  onClick={() => refetch()}
                  className="rounded-lg p-2 transition-colors hover:bg-amber-100"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4 text-amber-700" />
                </button>
              </div>
            )}

            {payment.failureDetails && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-red-900">Failure Summary</p>
                    <p className="text-sm text-red-800">{payment.failureDetails.reason}</p>
                    <div className="flex flex-wrap gap-2 pt-2 text-xs">
                      {payment.failureDetails.code && (
                        <span className="rounded-full border border-red-300 bg-white px-2 py-1 text-red-700">
                          Code: {payment.failureDetails.code}
                        </span>
                      )}
                      {payment.failureDetails.worker && (
                        <span className="rounded-full border border-red-300 bg-white px-2 py-1 text-red-700">
                          Worker: {payment.failureDetails.worker}
                        </span>
                      )}
                      {payment.failureDetails.jobId && (
                        <span className="rounded-full border border-red-300 bg-white px-2 py-1 font-mono text-red-700">
                          Job: {payment.failureDetails.jobId}
                        </span>
                      )}
                      <span className="rounded-full border border-red-300 bg-white px-2 py-1 text-red-700">
                        Failed at: {formatDateTime(payment.failureDetails.failedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-b border-slate-200 bg-slate-50 px-6 py-8 md:px-8">
            <div className="relative mx-auto flex max-w-2xl items-center justify-between">
              <div className="absolute left-0 top-5 -z-10 h-1 w-full bg-slate-200"></div>
              <div
                className={cn(
                  'absolute left-0 top-5 -z-10 h-1 transition-all duration-700',
                  isFailed ? 'bg-red-500' : 'bg-emerald-500'
                )}
                style={{
                  width: currentStepIndex >= 0 ? `${(currentStepIndex / (steps.length - 1)) * 100}%` : '0%',
                }}
              />

              {steps.map((step, index) => {
                const isCompleted = index <= currentStepIndex;
                const StepIcon = step.icon;

                return (
                  <div key={step.id} className="relative z-10 flex flex-col items-center gap-3 bg-slate-50">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full border-2 shadow-sm transition-all',
                        isCompleted
                          ? step.id === 'failed'
                            ? 'border-red-500 bg-red-100 text-red-600'
                            : 'border-emerald-500 bg-emerald-100 text-emerald-600'
                          : 'border-slate-300 bg-white text-slate-400'
                      )}
                    >
                      <StepIcon className="h-5 w-5" />
                    </div>
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wider',
                        isCompleted ? 'text-slate-900' : 'text-slate-400'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-3 md:p-8">
            <section className="space-y-4 rounded-xl border border-slate-200 p-5">
              <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 font-semibold text-slate-900">
                <Hash className="h-4 w-4" />
                Order Information
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
                    <Hash className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Order ID</p>
                    <p className="font-medium text-slate-900">{payment.orderId}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-green-50 p-2 text-green-600">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Amount</p>
                    <p className="text-lg font-bold text-slate-900">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: payment.currency,
                      }).format(parseFloat(payment.amount))}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 p-5">
              <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 font-semibold text-slate-900">
                <CreditCard className="h-4 w-4" />
                Gateway & Worker
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-slate-500">Gateway Provider</p>
                  <p className="font-medium text-slate-900">{toTitleCase(payment.gateway.provider)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Gateway Charge ID</p>
                  <p className="break-all font-mono text-slate-900">
                    {payment.gatewayTransactionId || <span className="italic text-slate-400">Pending...</span>}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Gateway Status</p>
                  <p className="font-medium text-slate-900">{toTitleCase(payment.gateway.lastKnownStatus)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Processing Worker</p>
                  <p className="font-medium text-slate-900">
                    {payment.processingDetails?.worker || payment.latestActivity?.worker || 'Not available'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Last Job ID</p>
                  <p className="break-all font-mono text-slate-900">
                    {payment.latestActivity?.jobId || payment.processingDetails?.jobId || 'Not available'}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 p-5">
              <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 font-semibold text-slate-900">
                <Calendar className="h-4 w-4" />
                Timeline Context
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-slate-500">Created</p>
                  <p className="font-medium text-slate-900">{formatDateTime(payment.createdAt)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Last Updated</p>
                  <p className="font-medium text-slate-900">{formatDateTime(payment.updatedAt)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Processing Started</p>
                  <p className="font-medium text-slate-900">
                    {payment.processingDetails ? formatDateTime(payment.processingDetails.startedAt) : 'Not started'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Latest Activity</p>
                  <p className="font-medium text-slate-900">
                    {payment.latestActivity?.summary || 'No activity recorded'}
                  </p>
                  {payment.latestActivity && (
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(payment.latestActivity.createdAt)}</p>
                  )}
                </div>
                <div>
                  <p className="text-slate-500">Idempotency Key</p>
                  <p className="break-all font-mono text-xs text-slate-900">{payment.idempotencyKey}</p>
                </div>
              </div>
            </section>
          </div>

          {payment.auditLog.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50 p-6 md:p-8">
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-900">
                  <Activity className="h-4 w-4" />
                  Audit Trail
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-normal text-slate-500">
                    {filteredAndSortedAuditLog.length} {filteredAndSortedAuditLog.length === 1 ? 'entry' : 'entries'}
                  </span>
                </h3>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="all">All statuses</option>
                    {availableStatuses.map((entryStatus) => (
                      <option key={entryStatus} value={entryStatus}>
                        {toTitleCase(entryStatus)}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))}
                    className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                    title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                  >
                    {sortOrder === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                    <span>{sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {filteredAndSortedAuditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      'rounded-lg border-2 bg-white p-4 transition-all',
                      entry.toStatus === 'succeeded' && 'border-emerald-200 bg-emerald-50/30',
                      entry.toStatus === 'failed' && 'border-red-200 bg-red-50/30',
                      entry.toStatus === 'processing' && 'border-amber-200 bg-amber-50/30',
                      !['succeeded', 'failed', 'processing'].includes(entry.toStatus) && 'border-slate-200'
                    )}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={entry.toStatus} size="sm" showIcon={true} />
                          {entry.fromStatus && (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                              From {toTitleCase(entry.fromStatus)}
                            </span>
                          )}
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                            Source: {toTitleCase(entry.triggeredBy)}
                          </span>
                        </div>

                        <p className="font-medium text-slate-900">{entry.summary}</p>

                        <div className="flex flex-wrap gap-2 text-xs">
                          {entry.worker && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                              Worker: {entry.worker}
                            </span>
                          )}
                          {entry.jobId && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-slate-700">
                              Job: {entry.jobId}
                            </span>
                          )}
                          {entry.chargeId && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-slate-700">
                              Charge: {entry.chargeId}
                            </span>
                          )}
                          {entry.failureCode && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                              Code: {entry.failureCode}
                            </span>
                          )}
                          {entry.actor?.email && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {entry.actor.email}
                              </span>
                            </span>
                          )}
                        </div>

                        {entry.failureReason && (
                          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {entry.failureReason}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-sm text-slate-500 md:text-right">
                        <p>{formatDateTime(entry.createdAt)}</p>
                        {entry.gatewayProvider && (
                          <p className="mt-1 text-xs text-slate-400">
                            Gateway: {toTitleCase(entry.gatewayProvider)}
                            {entry.gatewayStatus ? ` · ${toTitleCase(entry.gatewayStatus)}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 border-t border-slate-200 bg-white p-6 md:p-8">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50"
              disabled={isProcessing}
            >
              <RefreshCw className={cn('h-4 w-4', isProcessing && 'animate-spin')} />
              Refresh
            </button>
            <Link
              to="/create"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
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
