import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Activity, DollarSign, AlertCircle, CheckCircle, Filter, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PaymentService } from '../services/payments';
import { PaymentResponse, PaymentStatus } from '../types';
import StatusBadge from '../components/ui/StatusBadge';
import { cn } from '../utils/cn';

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; trend?: string }> = ({ 
  title, value, icon, trend 
}) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900 mt-2">{value}</h3>
      {trend && <p className="text-xs text-emerald-600 mt-1 font-medium">{trend}</p>}
    </div>
    <div className="p-3 bg-brand-50 rounded-lg text-brand-600">
      {icon}
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalVolume: 0,
    succeeded: 0,
    failed: 0,
    processing: 0,
  });

  const fetchPayments = async (filter: string = statusFilter) => {
    setLoading(true);
    try {
      const response = await PaymentService.listPayments(1, 100, filter);
      setPayments(response.data);
      setPagination(response.pagination);
      
      // Calculate stats
      const allPayments = filter === 'all' ? response.data : await PaymentService.listPayments(1, 1000, 'all').then(r => r.data);
      const stats = {
        totalVolume: allPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0),
        succeeded: allPayments.filter(p => p.status === PaymentStatus.SUCCEEDED).length,
        failed: allPayments.filter(p => p.status === PaymentStatus.FAILED).length,
        processing: allPayments.filter(p => p.status === PaymentStatus.PROCESSING).length,
      };
      setStats(stats);
      
      // Group by day for chart
      const groupedByDay = allPayments.reduce((acc: any, payment) => {
        const date = new Date(payment.createdAt).toLocaleDateString('en-US', { weekday: 'short' });
        if (!acc[date]) {
          acc[date] = { name: date, succeeded: 0, failed: 0, processing: 0, total: 0 };
        }
        const amount = parseFloat(payment.amount.toString());
        acc[date].total += amount;
        if (payment.status === PaymentStatus.SUCCEEDED) acc[date].succeeded += amount;
        else if (payment.status === PaymentStatus.FAILED) acc[date].failed += amount;
        else if (payment.status === PaymentStatus.PROCESSING) acc[date].processing += amount;
        return acc;
      }, {});
      
      setChartData(Object.values(groupedByDay));
    } catch (error) {
      console.error('Failed to fetch payments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    const interval = setInterval(() => fetchPayments(), 15000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const handleFilterChange = (filter: string) => {
    setStatusFilter(filter);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <Link 
          to="/create" 
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          New Payment
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Volume" 
          value={`$${stats.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={<DollarSign className="w-5 h-5" />} 
        />
        <StatCard 
          title="Successful Payments" 
          value={stats.succeeded.toString()}
          icon={<CheckCircle className="w-5 h-5" />} 
        />
        <StatCard 
          title="Failed Payments" 
          value={stats.failed.toString()}
          icon={<AlertCircle className="w-5 h-5" />} 
        />
        <StatCard 
          title="Processing Queue" 
          value={stats.processing.toString()}
          icon={<Activity className="w-5 h-5" />} 
        />
      </div>

      {/* Charts & Payments Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Transaction Volume by Day</h2>
          <div className="h-80 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    cursor={{fill: '#f8fafc'}}
                    formatter={(value: number) => `$${value.toFixed(2)}`}
                  />
                  <Legend />
                  <Bar dataKey="succeeded" fill="#10b981" name="Succeeded" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="processing" fill="#f59e0b" name="Processing" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                <p>No data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Payments Table */}
        <div className="lg:col-span-3 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Payments</h2>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <div className="flex gap-2">
                {['all', 'succeeded', 'failed', 'processing'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => handleFilterChange(filter)}
                    className={cn(
                      'px-3 py-1 rounded-lg text-sm font-medium transition-colors capitalize',
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

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p>No payments found</p>
              <Link to="/create" className="text-brand-600 hover:underline text-sm mt-2 block">
                Create your first payment
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200">
                  <tr className="text-left">
                    <th className="pb-3 text-sm font-semibold text-slate-900">Order ID</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Amount</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Currency</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Status</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Created At</th>
                    <th className="pb-3 text-sm font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.slice(0, 20).map((payment) => (
                    <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 text-sm font-mono text-slate-600">{payment.orderId}</td>
                      <td className="py-3 text-sm font-semibold text-slate-900">
                        ${parseFloat(payment.amount.toString()).toFixed(2)}
                      </td>
                      <td className="py-3 text-sm text-slate-600">{payment.currency}</td>
                      <td className="py-3">
                        <StatusBadge status={payment.status} size="sm" showIcon={true} />
                      </td>
                      <td className="py-3 text-sm text-slate-600">
                        {new Date(payment.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <Link
                          to={`/payment/${payment.id}`}
                          className="text-brand-600 hover:text-brand-700 text-sm font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
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
