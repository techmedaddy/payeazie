import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CalendarRange,
  CheckCircle,
  DollarSign,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/ui/StatusBadge';
import { PaymentService } from '../services/payments';
import { PaymentResponse, PaymentStatus } from '../types';
import { cn } from '../utils/cn';

const DASHBOARD_PAGE_LIMIT = 100;
const MAX_DASHBOARD_PAGES = 5;
const STUCK_THRESHOLD_MS = 60 * 1000;

const fetchDashboardPayments = async (): Promise<PaymentResponse[]> => {
  const allResults: PaymentResponse[] = [];

  for (let page = 1; page <= MAX_DASHBOARD_PAGES; page += 1) {
    const response = await PaymentService.listPayments(page, DASHBOARD_PAGE_LIMIT, 'all');
    allResults.push(...response.data);

    if (!response.pagination.hasNext) {
      break;
    }
  }

  return allResults;
};

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  helper?: string;
  className?: string;
  iconClassName?: string;
}> = ({
  title,
  value,
  icon,
  helper,
  className,
  iconClassName,
}) => (
  <div className={cn('flex items-start justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm', className)}>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
      {helper && <p className="mt-1 text-xs font-medium text-slate-500">{helper}</p>}
    </div>
    <div className={cn('rounded-lg bg-brand-50 p-3 text-brand-600', iconClassName)}>{icon}</div>
  </div>
);

const isSameOrAfter = (value: Date, minDate: string) => {
  const start = new Date(minDate);
  start.setHours(0, 0, 0, 0);
  return value >= start;
};

const isSameOrBefore = (value: Date, maxDate: string) => {
  const end = new Date(maxDate);
  end.setHours(23, 59, 59, 999);
  return value <= end;
};

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Dashboard: React.FC = () => {
  const [allPayments, setAllPayments] = useState<PaymentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchPayments = async (isManualRefresh = false) => {
      if (isMounted) {
        setLoading(isManualRefresh || allPayments.length === 0);
        setFetchError(null);
      }

      try {
        const payments = await fetchDashboardPayments();

        if (isMounted) {
          setAllPayments(payments);
          setLastUpdatedAt(new Date().toISOString());
        }
      } catch (error) {
        console.error('Failed to fetch payments:', error);
        if (isMounted) {
          setFetchError(
            'Could not refresh the dashboard. Showing the last available data if any.'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPayments();
    const interval = setInterval(() => fetchPayments(false), 15000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [allPayments.length]);

  const filteredPayments = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return allPayments.filter((payment) => {
      const createdAt = new Date(payment.createdAt);
      const matchesStatus =
        statusFilter === 'all' || payment.status.toLowerCase() === statusFilter.toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        payment.orderId.toLowerCase().includes(normalizedSearch) ||
        payment.id.toLowerCase().includes(normalizedSearch);
      const matchesFrom = !dateFrom || isSameOrAfter(createdAt, dateFrom);
      const matchesTo = !dateTo || isSameOrBefore(createdAt, dateTo);

      return matchesStatus && matchesSearch && matchesFrom && matchesTo;
    });
  }, [allPayments, dateFrom, dateTo, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const totalVolume = filteredPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const succeededPayments = filteredPayments.filter((payment) => payment.status === PaymentStatus.SUCCEEDED);
    const refundedPayments = filteredPayments.filter((payment) => payment.status === PaymentStatus.REFUNDED);
    const processingPayments = filteredPayments.filter(
      (payment) => payment.status === PaymentStatus.PROCESSING
    );
    const stuckPayments = processingPayments.filter(
      (payment) => Date.now() - new Date(payment.updatedAt).getTime() >= STUCK_THRESHOLD_MS
    );
    const succeededVolume = succeededPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const refundedVolume = refundedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const completedRecoverableCount = succeededPayments.length + refundedPayments.length;
    const refundRate = completedRecoverableCount > 0 ? (refundedPayments.length / completedRecoverableCount) * 100 : 0;

    return {
      totalVolume,
      succeeded: succeededPayments.length,
      failed: filteredPayments.filter((payment) => payment.status === PaymentStatus.FAILED).length,
      refunded: refundedPayments.length,
      refundedVolume,
      succeededVolume,
      netCapturedVolume: succeededVolume - refundedVolume,
      refundRate,
      processing: processingPayments.length,
      stuck: stuckPayments.length,
    };
  }, [filteredPayments]);

  const recentActivity = useMemo(
    () =>
      [...filteredPayments]
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        )
        .slice(0, 5),
    [filteredPayments]
  );

  const chartData = useMemo(() => {
    const groupedByDay = filteredPayments.reduce<Record<string, { date: string; label: string; succeeded: number; failed: number; refunded: number; processing: number }>>(
      (accumulator, payment) => {
        const date = new Date(payment.createdAt);
        const dateKey = date.toISOString().slice(0, 10);
        const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (!accumulator[dateKey]) {
          accumulator[dateKey] = {
            date: dateKey,
            label,
            succeeded: 0,
            failed: 0,
            refunded: 0,
            processing: 0,
          };
        }

        const amount = Number(payment.amount);
        if (payment.status === PaymentStatus.SUCCEEDED) accumulator[dateKey].succeeded += amount;
        else if (payment.status === PaymentStatus.FAILED) accumulator[dateKey].failed += amount;
        else if (payment.status === PaymentStatus.REFUNDED) accumulator[dateKey].refunded += amount;
        else if (payment.status === PaymentStatus.PROCESSING) accumulator[dateKey].processing += amount;

        return accumulator;
      },
      {}
    );

    return Object.values(groupedByDay).sort((left, right) => left.date.localeCompare(right.date));
  }, [filteredPayments]);

  const hasActiveFilters = Boolean(searchQuery.trim() || dateFrom || dateTo || statusFilter !== 'all');

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const refreshDashboard = async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const payments = await fetchDashboardPayments();
      setAllPayments(payments);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      console.error('Failed to refresh payments:', error);
      setFetchError(
        'Manual refresh failed. Check that the backend is running and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Search by order ID or payment ID, then narrow the view by status and date.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={refreshDashboard}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <Link
            to="/create"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            New Payment
          </Link>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-semibold">Dashboard refresh issue</p>
              <p className="mt-1 text-amber-800">{fetchError}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Filter className="h-4 w-4 text-brand-600" />
          Filters
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Search className="h-4 w-4 text-slate-400" />
              Search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Order ID or payment ID"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-brand-500"
            />
          </label>

          <div>
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <CalendarRange className="h-4 w-4 text-slate-400" />
              Date Range
            </span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-brand-500"
              />
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {['all', 'pending', 'processing', 'succeeded', 'failed', 'refunded'].map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={cn(
                'rounded-lg px-3 py-1 text-sm font-medium capitalize transition-colors',
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

      {stats.refunded > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-orange-700">Refund Snapshot</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                {stats.refunded} refunded payment{stats.refunded === 1 ? '' : 's'} returned {formatCurrency(stats.refundedVolume)}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Net captured volume is {formatCurrency(stats.netCapturedVolume)} across the current filters.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border border-orange-200 bg-white px-3 py-1.5 font-medium text-orange-700">
                Refund rate {stats.refundRate.toFixed(0)}%
              </span>
              <span className="rounded-full border border-orange-200 bg-white px-3 py-1.5 font-medium text-slate-700">
                Refunded volume {formatCurrency(stats.refundedVolume)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Gross Volume"
          value={formatCurrency(stats.totalVolume)}
          helper={`${filteredPayments.length} matching payments`}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          title="Net Captured"
          value={formatCurrency(stats.netCapturedVolume)}
          helper="Succeeded volume minus refunded volume"
          icon={<DollarSign className="h-5 w-5" />}
          className="border-emerald-200 bg-emerald-50/40"
          iconClassName="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          title="Successful Payments"
          value={stats.succeeded.toString()}
          helper={`${formatCurrency(stats.succeededVolume)} captured`}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Failed Payments"
          value={stats.failed.toString()}
          helper="Within current filters"
          icon={<AlertCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Processing Queue"
          value={stats.processing.toString()}
          helper={stats.processing > 0 ? `${stats.stuck} likely stuck` : 'No active processing payments'}
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      {stats.refunded > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StatCard
            title="Refunded Payments"
            value={stats.refunded.toString()}
            helper={`${stats.refundRate.toFixed(0)}% of refundable outcomes`}
            icon={<RotateCcw className="h-5 w-5" />}
            className="border-orange-200 bg-orange-50/50"
            iconClassName="bg-orange-100 text-orange-700"
          />
          <StatCard
            title="Refunded Volume"
            value={formatCurrency(stats.refundedVolume)}
            helper="Funds returned to customers"
            icon={<RotateCcw className="h-5 w-5" />}
            className="border-orange-200 bg-orange-50/50"
            iconClassName="bg-orange-100 text-orange-700"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Transaction Volume by Day</h2>
            <span className="text-xs text-slate-400">
              {lastUpdatedAt
                ? `Last updated ${new Date(lastUpdatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}`
                : 'Auto-refreshes every 15s'}
            </span>
          </div>
          <p className="mb-6 text-sm text-slate-500">Chart updates based on the current search and filters.</p>
          <div className="h-80 w-full">
            {loading && allPayments.length === 0 ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                <div className="text-center">
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-brand-600" />
                  <p>Loading payment activity...</p>
                </div>
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar dataKey="succeeded" fill="#10b981" name="Succeeded" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="refunded" fill="#f97316" name="Refunded" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="processing" fill="#f59e0b" name="Processing" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : allPayments.length === 0 ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                <div className="max-w-sm text-center">
                  <p className="font-medium text-slate-500">No payment activity yet</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Create your first payment to populate the dashboard and charts.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">
                <div className="max-w-sm text-center">
                  <p className="font-medium text-slate-500">No chart data for the selected filters</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Try broadening the search, changing the status, or clearing the date range.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Filter Summary</h2>
          <div className="mt-5 space-y-4 text-sm">
            <div>
              <p className="text-slate-500">Search query</p>
              <p className="font-medium text-slate-900">{searchQuery.trim() || 'Any payment'}</p>
            </div>
            <div>
              <p className="text-slate-500">Status</p>
              <p className="font-medium capitalize text-slate-900">{statusFilter}</p>
            </div>
            <div>
              <p className="text-slate-500">Date range</p>
              <p className="font-medium text-slate-900">
                {dateFrom || dateTo ? `${dateFrom || 'Any'} to ${dateTo || 'Any'}` : 'All time'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Results</p>
              <p className="font-medium text-slate-900">
                {filteredPayments.length} of {allPayments.length} payments
              </p>
            </div>
            <div>
              <p className="text-slate-500">Processing / Stuck</p>
              <p className="font-medium text-slate-900">
                {stats.processing} processing, {stats.stuck} likely stuck
              </p>
            </div>
            <div>
              <p className="text-slate-500">Refunded</p>
              <p className="font-medium text-slate-900">{stats.refunded} refunded payments</p>
            </div>
            <div>
              <p className="text-slate-500">Refunded volume / Net captured</p>
              <p className="font-medium text-slate-900">
                {formatCurrency(stats.refundedVolume)} refunded, {formatCurrency(stats.netCapturedVolume)} net
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
            <span className="text-xs text-slate-400">Latest updates</span>
          </div>
          <p className="mb-5 text-sm text-slate-500">
            The most recently updated payments in the current view.
          </p>

          {loading && allPayments.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              {allPayments.length === 0
                ? 'Recent activity will appear here after payments start flowing.'
                : 'No recent activity matches the current filters.'}
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((payment) => {
                const ageMs = Date.now() - new Date(payment.updatedAt).getTime();
                const isLikelyStuck =
                  payment.status === PaymentStatus.PROCESSING && ageMs >= STUCK_THRESHOLD_MS;
                const isRefundedPayment = payment.status === PaymentStatus.REFUNDED;

                return (
                  <Link
                    key={payment.id}
                    to={`/payment/${payment.id}`}
                    className={cn(
                      'block rounded-lg border p-3 transition-colors',
                      isRefundedPayment
                        ? 'border-orange-200 bg-orange-50/60 hover:bg-orange-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm text-slate-900">{payment.orderId}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{payment.id}</p>
                        <p className="mt-2 text-xs text-slate-400">
                          Updated {new Date(payment.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusBadge status={payment.status} size="sm" showIcon={true} />
                        {isRefundedPayment && (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                            Funds returned
                          </span>
                        )}
                        {isLikelyStuck && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                            Stuck
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Payments</h2>
              <p className="mt-1 text-sm text-slate-500">
                Search by order ID or payment ID, then refine the list with status and date filters.
              </p>
            </div>
            <div className="text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-900">{Math.min(filteredPayments.length, 20)}</span> of{' '}
              <span className="font-semibold text-slate-900">{filteredPayments.length}</span> matching payments
            </div>
          </div>

          {loading && allPayments.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            </div>
          ) : allPayments.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="font-medium text-slate-500">No payments yet</p>
              <p className="mt-1 text-sm text-slate-400">
                Create a payment to start seeing lifecycle activity, metrics, and audit visibility.
              </p>
              <Link to="/create" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
                Create your first payment
              </Link>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="font-medium text-slate-500">No payments match the current filters.</p>
              <p className="mt-1 text-sm text-slate-400">
                Try clearing filters or broadening your search to bring payments back into view.
              </p>
              {hasActiveFilters ? (
                <button onClick={resetFilters} className="mt-2 text-sm text-brand-600 hover:underline">
                  Clear filters
                </button>
              ) : (
                <Link to="/create" className="mt-2 block text-sm text-brand-600 hover:underline">
                  Create your first payment
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200">
                  <tr className="text-left">
                    <th className="pb-3 text-sm font-semibold text-slate-900">Order ID</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Payment ID</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Amount</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Currency</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Status</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Created At</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.slice(0, 20).map((payment) => {
                    const isRefundedPayment = payment.status === PaymentStatus.REFUNDED;

                    return (
                    <tr
                      key={payment.id}
                      className={cn(
                        'transition-colors',
                        isRefundedPayment ? 'bg-orange-50/40 hover:bg-orange-50' : 'hover:bg-slate-50'
                      )}
                    >
                      <td className="py-3 text-sm font-mono text-slate-700">{payment.orderId}</td>
                      <td className="py-3 text-sm font-mono text-slate-500">{payment.id.slice(0, 8)}...</td>
                      <td className="py-3 text-sm font-semibold text-slate-900">
                        {formatCurrency(Number(payment.amount))}
                        {isRefundedPayment && (
                          <div className="mt-1 text-xs font-medium text-orange-700">Returned to customer</div>
                        )}
                      </td>
                      <td className="py-3 text-sm text-slate-600">{payment.currency}</td>
                      <td className="py-3">
                        <StatusBadge status={payment.status} size="sm" showIcon={true} />
                        {isRefundedPayment && (
                          <div className="mt-1 text-xs font-medium text-orange-700">Refund completed</div>
                        )}
                        {payment.status === PaymentStatus.PROCESSING &&
                          Date.now() - new Date(payment.updatedAt).getTime() >= STUCK_THRESHOLD_MS && (
                            <div className="mt-1 text-xs font-medium text-red-600">Likely stuck</div>
                          )}
                      </td>
                      <td className="py-3 text-sm text-slate-600">
                        {new Date(payment.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <Link
                          to={`/payment/${payment.id}`}
                          className="text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
