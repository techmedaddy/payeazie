import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Clock3,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Siren,
  TrendingUp,
  Webhook,
} from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import { useToast } from '../context/ToastContext';
import { PaymentService } from '../services/payments';
import { PaymentResponse, PaymentStatus } from '../types';
import { buildPaymentMetricsStory, formatDurationShort, formatPercent } from '../utils/paymentMetrics';
import { cn } from '../utils/cn';

const OPS_PAGE_LIMIT = 100;
const MAX_OPS_PAGES = 5;
const STUCK_THRESHOLD_MS = 60 * 1000;
const FAILURE_SPIKE_WINDOW_MS = 15 * 60 * 1000;
const SIMULATABLE_NEXT_STATUSES: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [PaymentStatus.PROCESSING, PaymentStatus.FAILED],
  [PaymentStatus.PROCESSING]: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
  [PaymentStatus.SUCCEEDED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.REFUNDED]: [],
};
const SIMULATOR_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Pending',
  [PaymentStatus.PROCESSING]: 'Processing',
  [PaymentStatus.SUCCEEDED]: 'Succeeded',
  [PaymentStatus.FAILED]: 'Failed',
  [PaymentStatus.REFUNDED]: 'Refunded',
};

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isStuckProcessingPayment = (payment: PaymentResponse) =>
  payment.processing?.isStuck ??
  (payment.status === PaymentStatus.PROCESSING &&
    Date.now() - new Date(payment.updatedAt).getTime() >= STUCK_THRESHOLD_MS);

const getSimulatableStatuses = (payment: PaymentResponse | null): PaymentStatus[] =>
  payment ? SIMULATABLE_NEXT_STATUSES[payment.status] || [] : [];

const fetchOpsPayments = async (): Promise<PaymentResponse[]> => {
  const allResults: PaymentResponse[] = [];

  for (let page = 1; page <= MAX_OPS_PAGES; page += 1) {
    const response = await PaymentService.listPayments(page, OPS_PAGE_LIMIT, 'all');
    allResults.push(...response.data);

    if (!response.pagination.hasNext) {
      break;
    }
  }

  return allResults;
};

const MetricCard: React.FC<{
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  className?: string;
  iconClassName?: string;
}> = ({ title, value, helper, icon, className, iconClassName }) => (
  <div className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        <p className="mt-1 text-sm text-slate-500">{helper}</p>
      </div>
      <div className={cn('rounded-xl bg-slate-100 p-3 text-slate-700', iconClassName)}>{icon}</div>
    </div>
  </div>
);

const OpsDashboard: React.FC = () => {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionInFlight, setActionInFlight] = useState<{ paymentId: string; type: 'retry' | 'reconcile' | 'restart' } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [simulatorPaymentId, setSimulatorPaymentId] = useState('');
  const [simulatorStatus, setSimulatorStatus] = useState<PaymentStatus | ''>('');
  const [simulatorNote, setSimulatorNote] = useState('');
  const [simulationInFlight, setSimulationInFlight] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const refreshData = async (isManualRefresh = false) => {
      if (isMounted) {
        setLoading(isManualRefresh || payments.length === 0);
        setFetchError(null);
      }

      try {
        const nextPayments = await fetchOpsPayments();

        if (isMounted) {
          setPayments(nextPayments);
          setLastUpdatedAt(new Date().toISOString());
        }
      } catch (error) {
        console.error('Failed to fetch ops payments:', error);
        if (isMounted) {
          setFetchError('Could not load the ops overview. Check the API and try again.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    refreshData();
    const interval = setInterval(() => refreshData(false), 15000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [payments.length]);

  const refreshOpsDashboard = async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const nextPayments = await fetchOpsPayments();
      setPayments(nextPayments);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      console.error('Failed to refresh ops dashboard:', error);
      setFetchError('Manual refresh failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredPayments = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return payments.filter((payment) => {
      const matchesSearch =
        !normalizedSearch ||
        payment.orderId.toLowerCase().includes(normalizedSearch) ||
        payment.id.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === 'all' || payment.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [payments, searchQuery, statusFilter]);

  const sortedByNewest = useMemo(
    () =>
      [...filteredPayments].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [filteredPayments]
  );

  const stuckPayments = useMemo(
    () =>
      sortedByNewest.filter(
        (payment) => payment.status === PaymentStatus.PROCESSING && isStuckProcessingPayment(payment)
      ),
    [sortedByNewest]
  );

  const failedPayments = useMemo(
    () => sortedByNewest.filter((payment) => payment.status === PaymentStatus.FAILED),
    [sortedByNewest]
  );

  useEffect(() => {
    if (sortedByNewest.length === 0) {
      setSimulatorPaymentId('');
      return;
    }

    setSimulatorPaymentId((current) =>
      sortedByNewest.some((payment) => payment.id === current) ? current : sortedByNewest[0].id
    );
  }, [sortedByNewest]);

  const selectedSimulatorPayment = useMemo(
    () => sortedByNewest.find((payment) => payment.id === simulatorPaymentId) || null,
    [simulatorPaymentId, sortedByNewest]
  );

  const simulatorTargets = useMemo(
    () => getSimulatableStatuses(selectedSimulatorPayment),
    [selectedSimulatorPayment]
  );

  useEffect(() => {
    if (simulatorTargets.length === 0) {
      setSimulatorStatus('');
      return;
    }

    setSimulatorStatus((current) =>
      current && simulatorTargets.includes(current) ? current : simulatorTargets[0]
    );
  }, [simulatorTargets]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const previousWindowStart = now - (FAILURE_SPIKE_WINDOW_MS * 2);
    const currentWindowStart = now - FAILURE_SPIKE_WINDOW_MS;
    const allFailed = payments.filter((payment) => payment.status === PaymentStatus.FAILED);
    const currentFailureWindow = allFailed.filter((payment) => {
      const updatedAt = new Date(payment.updatedAt).getTime();
      return updatedAt >= currentWindowStart;
    });
    const previousFailureWindow = allFailed.filter((payment) => {
      const updatedAt = new Date(payment.updatedAt).getTime();
      return updatedAt >= previousWindowStart && updatedAt < currentWindowStart;
    });
    const currentFailures = currentFailureWindow.length;
    const previousFailures = previousFailureWindow.length;
    const spikeDelta = currentFailures - previousFailures;
    const isSpike = currentFailures >= 3 && spikeDelta > 0;
    const totalVolume = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    return {
      totalPayments: payments.length,
      totalVolume,
      failedPayments: allFailed.length,
      currentFailures,
      previousFailures,
      spikeDelta,
      isSpike,
      currentFailureWindow,
    };
  }, [payments]);

  const metricsStory = useMemo(
    () => buildPaymentMetricsStory(filteredPayments),
    [filteredPayments]
  );

  const handleAction = async (payment: PaymentResponse, type: 'retry' | 'reconcile' | 'restart') => {
    setActionError(null);
    setActionInFlight({ paymentId: payment.id, type });

    try {
      if (type === 'retry') {
        await PaymentService.retryPayment(payment.id);
        showToast(`Retry queued for ${payment.orderId}.`, 'success');
      } else if (type === 'reconcile') {
        await PaymentService.reconcileProcessingPayment(payment.id);
        showToast(`Reconciliation completed for ${payment.orderId}.`, 'success');
      } else {
        await PaymentService.restartProcessingPayment(payment.id);
        showToast(`Restarted processing for ${payment.orderId}.`, 'success');
      }

      const nextPayments = await fetchOpsPayments();
      setPayments(nextPayments);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error: any) {
      const message = error.message || 'Action failed. Please try again.';
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setActionInFlight(null);
    }
  };

  const handleSimulateGatewayStatus = async () => {
    if (!selectedSimulatorPayment || !simulatorStatus) return;

    setActionError(null);
    setSimulationInFlight(true);

    try {
      await PaymentService.simulateGatewayStatus(selectedSimulatorPayment.id, {
        status: simulatorStatus.toLowerCase() as 'processing' | 'succeeded' | 'failed' | 'refunded',
        note: simulatorNote.trim() || undefined,
      });

      showToast(
        `Simulator pushed ${selectedSimulatorPayment.orderId} to ${simulatorStatus.toLowerCase()}.`,
        'success'
      );
      setSimulatorNote('');

      const nextPayments = await fetchOpsPayments();
      setPayments(nextPayments);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error: any) {
      const message = error.message || 'Simulation failed. Please try again.';
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setSimulationInFlight(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">
            <ShieldAlert className="h-3.5 w-3.5" />
            Internal Ops
          </div>
          <h1 className="mt-4 text-3xl font-bold">Ops Center</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Monitor all payment traffic, spot stuck work and failure spikes, and trigger guarded manual recovery actions.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            {lastUpdatedAt
              ? `Last updated ${new Date(lastUpdatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}`
              : 'Auto-refreshes every 15s'}
          </div>
          <button
            onClick={refreshOpsDashboard}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh Ops View
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Ops data refresh issue</p>
              <p className="mt-1">{fetchError}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard
          title="All Payments"
          value={metrics.totalPayments.toString()}
          helper={`${formatCurrency(metrics.totalVolume)} in tracked volume`}
          icon={<ArrowUpRight className="h-5 w-5" />}
        />
        <MetricCard
          title="Stuck Queue"
          value={stuckPayments.length.toString()}
          helper={stuckPayments.length > 0 ? 'Needs manual review now' : 'No stuck processing detected'}
          icon={<Activity className="h-5 w-5" />}
          className={stuckPayments.length > 0 ? 'border-red-200 bg-red-50/60' : undefined}
          iconClassName={stuckPayments.length > 0 ? 'bg-red-100 text-red-700' : undefined}
        />
        <MetricCard
          title="Failures in 15m"
          value={metrics.currentFailures.toString()}
          helper={`${metrics.previousFailures} in the previous 15 minutes`}
          icon={<Clock3 className="h-5 w-5" />}
          className={metrics.isSpike ? 'border-red-200 bg-red-50/60' : undefined}
          iconClassName={metrics.isSpike ? 'bg-red-100 text-red-700' : undefined}
        />
        <MetricCard
          title="Failure Trend"
          value={metrics.isSpike ? 'Spike' : 'Stable'}
          helper={metrics.isSpike ? `Up by ${metrics.spikeDelta} recent failures` : 'No active spike detected'}
          icon={<TrendingUp className="h-5 w-5" />}
          className={metrics.isSpike ? 'border-orange-200 bg-orange-50/60' : 'border-emerald-200 bg-emerald-50/40'}
          iconClassName={metrics.isSpike ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Outcome Story</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{metricsStory.headline}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {metricsStory.narrative} These rates track the current ops filter view.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: 'Success Rate',
                value: formatPercent(metricsStory.successRate),
                helper: `${metricsStory.successfulOutcomes} successful outcomes`,
                tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
              },
              {
                label: 'Failure Rate',
                value: formatPercent(metricsStory.failureRate),
                helper: `${metricsStory.failedOutcomes} failed outcomes`,
                tone: 'text-red-700 bg-red-50 border-red-200',
              },
              {
                label: 'Refund Rate',
                value: formatPercent(metricsStory.refundRate),
                helper: `${metricsStory.refundedOutcomes} refunded payments`,
                tone: 'text-orange-700 bg-orange-50 border-orange-200',
              },
              {
                label: 'Avg Latency',
                value: formatDurationShort(metricsStory.averageResolutionMs),
                helper: 'Created to final status',
                tone: 'text-sky-700 bg-sky-50 border-sky-200',
              },
            ].map((metric) => (
              <div key={metric.label} className={cn('rounded-xl border p-4', metric.tone)}>
                <p className="text-xs font-semibold uppercase tracking-wide">{metric.label}</p>
                <p className="mt-2 text-2xl font-bold">{metric.value}</p>
                <p className="mt-1 text-xs font-medium">{metric.helper}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="block flex-1">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Search className="h-4 w-4 text-slate-400" />
              Search all payments
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Order ID or payment ID"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {['all', 'pending', 'processing', 'succeeded', 'failed', 'refunded'].map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-medium capitalize transition-colors',
                  statusFilter === filter
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700">
              <Webhook className="h-3.5 w-3.5" />
              Gateway Simulator
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-900">Webhook / Gateway Simulator</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Pick a payment, choose a valid next gateway status, and push a simulated event through the system on demand.
            </p>
          </div>
          {selectedSimulatorPayment && (
            <div className="rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">{selectedSimulatorPayment.orderId}</p>
              <p className="mt-1 text-xs text-slate-500">{selectedSimulatorPayment.id}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={selectedSimulatorPayment.status} size="sm" showIcon={true} />
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {selectedSimulatorPayment.gatewayId ? `Charge ${selectedSimulatorPayment.gatewayId}` : 'Charge will be generated if needed'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Payment</span>
              <select
                value={simulatorPaymentId}
                onChange={(event) => setSimulatorPaymentId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-brand-500"
              >
                {sortedByNewest.length === 0 ? (
                  <option value="">No payments available</option>
                ) : (
                  sortedByNewest.slice(0, 40).map((payment) => (
                    <option key={payment.id} value={payment.id}>
                      {payment.orderId} · {payment.status.toLowerCase()}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Target gateway status</span>
              <select
                value={simulatorStatus}
                onChange={(event) => setSimulatorStatus(event.target.value as PaymentStatus)}
                disabled={simulatorTargets.length === 0}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {simulatorTargets.length === 0 ? (
                  <option value="">No simulated transitions available</option>
                ) : (
                  simulatorTargets.map((status) => (
                    <option key={status} value={status}>
                      {SIMULATOR_STATUS_LABELS[status]}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Optional note</span>
            <textarea
              value={simulatorNote}
              onChange={(event) => setSimulatorNote(event.target.value)}
              rows={4}
              maxLength={280}
              placeholder="Explain why you are simulating this event. This note will appear in the audit trail."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-brand-500"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-slate-600">
            {selectedSimulatorPayment && simulatorTargets.length > 0
              ? `Allowed simulated outcomes from ${selectedSimulatorPayment.status.toLowerCase()}: ${simulatorTargets.map((status) => status.toLowerCase()).join(', ')}.`
              : 'This payment has no valid simulated gateway transitions from its current state.'}
          </div>
          <button
            onClick={handleSimulateGatewayStatus}
            disabled={!selectedSimulatorPayment || !simulatorStatus || simulationInFlight || simulatorTargets.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-200"
          >
            <Webhook className={cn('h-4 w-4', simulationInFlight && 'animate-pulse')} />
            {simulationInFlight ? 'Triggering Simulator...' : 'Trigger Simulator Event'}
          </button>
        </div>
      </section>

      <div className={cn(
        'rounded-2xl border p-5 shadow-sm',
        metrics.isSpike ? 'border-red-200 bg-gradient-to-r from-red-50 via-orange-50 to-white' : 'border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-white'
      )}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className={cn('text-sm font-semibold uppercase tracking-wide', metrics.isSpike ? 'text-red-700' : 'text-emerald-700')}>
              Failure Spike Monitor
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {metrics.isSpike
                ? `${metrics.currentFailures} recent failures need investigation`
                : 'Failure traffic is within a normal range'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Comparing the last 15 minutes against the previous 15-minute window across all tracked payments.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white bg-white px-3 py-2 text-sm font-medium text-slate-700">
            <Siren className={cn('h-4 w-4', metrics.isSpike ? 'text-red-600' : 'text-emerald-600')} />
            {metrics.isSpike ? `+${metrics.spikeDelta} failures vs prior window` : 'No spike alert'}
          </div>
        </div>
        {metrics.currentFailureWindow.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {metrics.currentFailureWindow.slice(0, 5).map((payment) => (
              <Link
                key={payment.id}
                to={`/payment/${payment.id}`}
                className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                {payment.orderId}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Stuck Processing Queue</h2>
              <p className="mt-1 text-sm text-slate-500">
                Reconcile charges already seen at the gateway, or restart safely when no charge exists yet.
              </p>
            </div>
            <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
              {stuckPayments.length} open
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {loading && payments.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : stuckPayments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No stuck processing payments match the current filters.
              </div>
            ) : (
              stuckPayments.slice(0, 6).map((payment) => {
                const recovery = payment.processing?.recovery;
                const activeAction = actionInFlight?.paymentId === payment.id ? actionInFlight.type : null;

                return (
                  <div key={payment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm text-slate-900">{payment.orderId}</p>
                        <p className="mt-1 text-xs text-slate-500">{payment.id}</p>
                        <p className="mt-2 text-sm text-slate-600">{recovery?.message}</p>
                      </div>
                      <StatusBadge status={payment.status} size="sm" showIcon={true} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {recovery?.canReconcile && (
                        <button
                          onClick={() => handleAction(payment, 'reconcile')}
                          disabled={Boolean(activeAction)}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
                        >
                          <RefreshCw className={cn('h-4 w-4', activeAction === 'reconcile' && 'animate-spin')} />
                          {activeAction === 'reconcile' ? 'Reconciling...' : 'Reconcile'}
                        </button>
                      )}
                      {recovery?.canRestart && (
                        <button
                          onClick={() => handleAction(payment, 'restart')}
                          disabled={Boolean(activeAction)}
                          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-200"
                        >
                          <RotateCcw className={cn('h-4 w-4', activeAction === 'restart' && 'animate-spin')} />
                          {activeAction === 'restart' ? 'Restarting...' : 'Restart'}
                        </button>
                      )}
                      <Link
                        to={`/payment/${payment.id}`}
                        className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        Review
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Failure Recovery Queue</h2>
              <p className="mt-1 text-sm text-slate-500">
                Recent failures are grouped here so ops can retry quickly or drill into the full audit trail.
              </p>
            </div>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">
              {failedPayments.length} failed
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {loading && payments.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : failedPayments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No failed payments match the current filters.
              </div>
            ) : (
              failedPayments.slice(0, 6).map((payment) => {
                const activeAction = actionInFlight?.paymentId === payment.id ? actionInFlight.type : null;

                return (
                  <div key={payment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm text-slate-900">{payment.orderId}</p>
                        <p className="mt-1 text-xs text-slate-500">{payment.id}</p>
                        <p className="mt-2 text-sm text-slate-600">
                          Last updated {new Date(payment.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <StatusBadge status={payment.status} size="sm" showIcon={true} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleAction(payment, 'retry')}
                        disabled={Boolean(activeAction)}
                        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
                      >
                        <RotateCcw className={cn('h-4 w-4', activeAction === 'retry' && 'animate-spin')} />
                        {activeAction === 'retry' ? 'Retrying...' : 'Retry'}
                      </button>
                      <Link
                        to={`/payment/${payment.id}`}
                        className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        Review
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">All Payments</h2>
            <p className="mt-1 text-sm text-slate-500">
              Full internal view across the current results set, with status context and direct access to the payment detail page.
            </p>
          </div>
          <div className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-900">{Math.min(sortedByNewest.length, 12)}</span> of{' '}
            <span className="font-semibold text-slate-900">{sortedByNewest.length}</span> matching payments
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-3 pr-4">Order</th>
                <th className="pb-3 pr-4">Amount</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Ops Signal</th>
                <th className="pb-3 pr-4">Updated</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading && payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" />
                  </td>
                </tr>
              ) : sortedByNewest.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No payments match the current filters.
                  </td>
                </tr>
              ) : (
                sortedByNewest.slice(0, 12).map((payment) => {
                  const activeAction = actionInFlight?.paymentId === payment.id ? actionInFlight.type : null;
                  const recovery = payment.processing?.recovery;
                  const isStuck = payment.status === PaymentStatus.PROCESSING && isStuckProcessingPayment(payment);
                  const rowSimulatorTargets = getSimulatableStatuses(payment);

                  return (
                    <tr key={payment.id} className="align-top">
                      <td className="py-4 pr-4">
                        <p className="font-mono text-slate-900">{payment.orderId}</p>
                        <p className="mt-1 text-xs text-slate-500">{payment.id}</p>
                      </td>
                      <td className="py-4 pr-4 font-medium text-slate-900">
                        {formatCurrency(Number(payment.amount))}
                      </td>
                      <td className="py-4 pr-4">
                        <StatusBadge status={payment.status} size="sm" showIcon={true} />
                      </td>
                      <td className="py-4 pr-4">
                        {isStuck ? (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                            Stuck processing
                          </span>
                        ) : payment.status === PaymentStatus.FAILED ? (
                          <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
                            Retry candidate
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            Monitor
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-4 text-slate-500">
                        {new Date(payment.updatedAt).toLocaleString()}
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          {payment.status === PaymentStatus.FAILED && (
                            <button
                              onClick={() => handleAction(payment, 'retry')}
                              disabled={Boolean(activeAction)}
                              className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
                            >
                              {activeAction === 'retry' ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                          {recovery?.canReconcile && (
                            <button
                              onClick={() => handleAction(payment, 'reconcile')}
                              disabled={Boolean(activeAction)}
                              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
                            >
                              {activeAction === 'reconcile' ? 'Reconciling...' : 'Reconcile'}
                            </button>
                          )}
                          {recovery?.canRestart && (
                            <button
                              onClick={() => handleAction(payment, 'restart')}
                              disabled={Boolean(activeAction)}
                              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-200"
                            >
                              {activeAction === 'restart' ? 'Restarting...' : 'Restart'}
                            </button>
                          )}
                          {rowSimulatorTargets.length > 0 && (
                            <button
                              onClick={() => setSimulatorPaymentId(payment.id)}
                              className="rounded-lg border border-sky-300 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50"
                            >
                              Simulate
                            </button>
                          )}
                          <Link
                            to={`/payment/${payment.id}`}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Review
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default OpsDashboard;
