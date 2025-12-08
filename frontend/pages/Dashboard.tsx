import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PaymentService } from '../services/payments';
import { PaymentResponse, PaymentStatus } from '../types';
import Badge from '../components/ui/Badge';

// Mock data for analytics (since backend specific endpoint for aggregate stats wasn't specified)
const ANALYTICS_DATA = [
  { name: 'Mon', success: 40, failed: 24, total: 2400 },
  { name: 'Tue', success: 30, failed: 13, total: 1398 },
  { name: 'Wed', success: 20, failed: 58, total: 9800 },
  { name: 'Thu', success: 27, failed: 39, total: 3908 },
  { name: 'Fri', success: 18, failed: 48, total: 4800 },
  { name: 'Sat', success: 23, failed: 38, total: 3800 },
  { name: 'Sun', success: 34, failed: 43, total: 4300 },
];

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
  const [recentPayments, setRecentPayments] = useState<PaymentResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Since there is no "list all payments" endpoint, we use a local history hack
  // to display meaningful data for the demo.
  useEffect(() => {
    const fetchRecent = async () => {
      const stored = localStorage.getItem('payeazie_recent_ids');
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        // Take last 5
        const last5 = ids.slice(-5).reverse();
        
        try {
          const promises = last5.map(id => PaymentService.getPaymentById(id).catch(() => null));
          const results = await Promise.all(promises);
          setRecentPayments(results.filter(p => p !== null) as PaymentResponse[]);
        } catch (e) {
          console.error("Failed to sync recent payments", e);
        }
      }
      setLoading(false);
    };

    fetchRecent();
    // Auto refresh status of table items every 10s
    const interval = setInterval(fetchRecent, 10000);
    return () => clearInterval(interval);
  }, []);

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
          value="$128,430" 
          trend="+12.5% from last week"
          icon={<DollarSign className="w-5 h-5" />} 
        />
        <StatCard 
          title="Successful Payments" 
          value="1,245" 
          trend="+3.2% from last week"
          icon={<CheckCircle className="w-5 h-5" />} 
        />
        <StatCard 
          title="Failed Payments" 
          value="24" 
          trend="-0.5% from last week"
          icon={<AlertCircle className="w-5 h-5" />} 
        />
        <StatCard 
          title="Processing Queue" 
          value="12" 
          icon={<Activity className="w-5 h-5" />} 
        />
      </div>

      {/* Charts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Transaction Volume</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ANALYTICS_DATA}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{fill: '#f8fafc'}}
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Transactions List */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Recent Activity (Local)</h2>
          <div className="flex-1 overflow-auto">
            {loading ? (
               <div className="space-y-3 animate-pulse">
                 {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg"></div>)}
               </div>
            ) : recentPayments.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p>No local history found.</p>
                <Link to="/create" className="text-brand-600 hover:underline text-sm mt-2 block">Create your first payment</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((payment) => (
                  <Link 
                    to={`/payment/${payment.id}`} 
                    key={payment.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                         <span className="font-mono text-xs text-slate-500">#{payment.orderId}</span>
                         <Badge status={payment.status} className="scale-75 origin-left" />
                      </div>
                      <div className="text-sm font-semibold text-slate-900 mt-1">
                        {payment.amount} <span className="text-xs text-slate-500">{payment.currency}</span>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className="text-xs text-slate-400">View</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
