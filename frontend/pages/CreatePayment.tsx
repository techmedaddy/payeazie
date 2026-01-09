import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaymentService } from '../services/payments';
import { generateUUID } from '../utils/uuid';
import { useToast } from '../context/ToastContext';
import { Loader2, ArrowRight, ShieldCheck, FileJson } from 'lucide-react';

const CreatePayment: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState({
    amount: '',
    currency: 'USD',
    orderId: `ORD-${Math.floor(Math.random() * 10000)}`
  });
  
  const [loading, setLoading] = useState(false);
  const [responseDebug, setResponseDebug] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResponseDebug(null);

    const amount = parseFloat(formData.amount);

    try {
      // Use new createPayment endpoint (auto-generates idempotency key)
      const response = await PaymentService.createPayment({
        amount,
        currency: formData.currency,
        orderId: formData.orderId,
      });

      setResponseDebug(JSON.stringify(response, null, 2));
      showToast('Payment created successfully', 'success');

      // Brief delay to let user see the success state before redirecting
      setTimeout(() => {
        navigate(`/payment/${response.id}`);
      }, 1500);

    } catch (error: any) {
      showToast(error.message || 'Failed to create payment', 'error');
      setResponseDebug(JSON.stringify(error, null, 2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Create Payment</h1>
        <p className="text-slate-500 mt-2">Create a new payment. Idempotency is handled automatically by the backend.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Form Section */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Order ID
              </label>
              <input
                type="text"
                required
                value={formData.orderId}
                onChange={e => setFormData({...formData, orderId: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Currency
                </label>
                <select
                  value={formData.currency}
                  onChange={e => setFormData({...formData, currency: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="INR">INR</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
               <div className="flex items-start gap-3 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm mb-6">
                  <ShieldCheck className="w-5 h-5 shrink-0" />
                  <p>Idempotency enabled. Submitting this form multiple times will not result in duplicate charges.</p>
               </div>

               <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Payment'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </div>

        {/* Debug/Info Section */}
        <div className="space-y-6">
           {responseDebug && (
             <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-slate-800 px-4 py-2 flex items-center gap-2 border-b border-slate-700">
                   <FileJson className="w-4 h-4 text-slate-400" />
                   <span className="text-xs font-mono text-slate-300">API Response</span>
                </div>
                <div className="p-4 overflow-auto max-h-[400px]">
                   <pre className="text-xs font-mono text-emerald-400 leading-relaxed">
                     {responseDebug}
                   </pre>
                </div>
             </div>
           )}

           <div className="bg-white p-6 rounded-xl border border-slate-200 text-sm text-slate-600">
              <h3 className="font-semibold text-slate-900 mb-2">How it works</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Backend auto-generates a <strong>UUID v4</strong> idempotency key.</li>
                <li>Payment is queued for processing via BullMQ workers.</li>
                <li>Status updates happen automatically (pending → processing → succeeded/failed).</li>
                <li>View real-time status on the payment details page.</li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CreatePayment;
