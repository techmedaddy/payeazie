import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaymentService } from '../services/payments';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Loader2, ArrowRight, ShieldCheck, FileJson, AlertCircle, CheckCircle2 } from 'lucide-react';

interface FormErrors {
  orderId?: string;
  amount?: string;
  currency?: string;
}

const CreatePayment: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState({
    amount: '',
    currency: 'USD',
    orderId: `ORD-${Math.floor(Math.random() * 10000)}`
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [responseDebug, setResponseDebug] = useState<any>(null);
  const [responseStatus, setResponseStatus] = useState<'success' | 'error' | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);

  // Check if user has auth token
  const hasAuthToken = !!api.getAuthToken();

  // Validation function
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    // Order ID validation (alphanumeric, required)
    if (!formData.orderId.trim()) {
      newErrors.orderId = 'Order ID is required';
    } else if (!/^[a-zA-Z0-9-_]+$/.test(formData.orderId)) {
      newErrors.orderId = 'Order ID must be alphanumeric (can include - and _)';
    }
    
    // Amount validation (required, > 0)
    if (!formData.amount) {
      newErrors.amount = 'Amount is required';
    } else {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        newErrors.amount = 'Amount must be greater than 0';
      }
    }
    
    // Currency validation
    if (!['USD', 'EUR', 'GBP', 'INR'].includes(formData.currency)) {
      newErrors.currency = 'Invalid currency';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    setLoading(true);
    setResponseDebug(null);
    setResponseStatus(null);
    setIsDuplicate(false);

    const amount = parseFloat(formData.amount);

    try {
      const response = await PaymentService.createPayment({
        amount,
        currency: formData.currency,
        orderId: formData.orderId,
      });

      setResponseDebug(response);
      setResponseStatus('success');
      
      // Check if this was a duplicate request (idempotency)
      // If payment was created more than 2 seconds ago, it's likely a duplicate
      const createdAt = new Date(response.createdAt);
      const now = new Date();
      const ageInSeconds = (now.getTime() - createdAt.getTime()) / 1000;
      
      if (ageInSeconds > 2) {
        setIsDuplicate(true);
        showToast('Payment already exists (idempotency)', 'info');
      } else {
        showToast('Payment created successfully', 'success');
      }

      // Brief delay to let user see the success state before redirecting
      setTimeout(() => {
        navigate(`/payment/${response.id}`);
      }, 2000);

    } catch (error: any) {
      setResponseStatus('error');
      setResponseDebug(error);
      
      // Handle specific error cases
      if (error.statusCode === 401) {
        showToast('Unauthorized: Please login to create payments', 'error');
      } else if (error.statusCode === 409) {
        showToast('Idempotency conflict: Payment with this data already exists', 'info');
        setIsDuplicate(true);
      } else if (error.statusCode === 500) {
        showToast('Internal Server Error: Please try again later', 'error');
      } else {
        showToast(error.message || 'Failed to create payment', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Real-time validation on blur
  const handleBlur = (field: keyof FormErrors) => {
    validateForm();
  };

  // Check if form is valid for submit button
  const isFormValid = () => {
    return (
      formData.orderId.trim() &&
      formData.amount &&
      parseFloat(formData.amount) > 0 &&
      /^[a-zA-Z0-9-_]+$/.test(formData.orderId) &&
      ['USD', 'EUR', 'GBP', 'INR'].includes(formData.currency)
    );
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Create Payment</h1>
        <p className="text-slate-500 mt-2">Create a new payment. Idempotency is handled automatically by the backend.</p>
      </div>

      {/* Auth Warning */}
      {!hasAuthToken && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Authentication Required</p>
            <p className="text-yellow-700 mt-1">You need to be logged in to create payments. Using demo token for testing.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Form Section */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Order ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.orderId}
                onChange={e => setFormData({...formData, orderId: e.target.value})}
                onBlur={() => handleBlur('orderId')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all font-mono text-sm ${
                  errors.orderId ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
                placeholder="ORD-12345"
              />
              {errors.orderId && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.orderId}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">Alphanumeric characters, hyphens, and underscores only</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Amount <span className="text-red-500">*</span>
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
                    onBlur={() => handleBlur('amount')}
                    className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all ${
                      errors.amount ? 'border-red-300 bg-red-50' : 'border-slate-300'
                    }`}
                    placeholder="0.00"
                  />
                </div>
                {errors.amount && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.amount}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Currency <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.currency}
                  onChange={e => setFormData({...formData, currency: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                >
                  <option value="">Select Currency</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="INR">INR</option>
                </select>
                {errors.currency && (
                  <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.currency}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
               <div className="flex items-start gap-3 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm mb-6">
                  <ShieldCheck className="w-5 h-5 shrink-0" />
                  <p>Idempotency enabled. Submitting this form multiple times will not result in duplicate charges.</p>
               </div>

               <button
                type="submit"
                disabled={loading || !isFormValid()}
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>Create Payment</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              
              {!isFormValid() && !loading && (
                <p className="mt-2 text-xs text-slate-500 text-center">
                  Please fill in all required fields correctly to continue
                </p>
              )}
            </div>
          </form>
        </div>

        {/* Debug/Info Section */}
        <div className="space-y-6">
           {/* Success/Error Response Panel */}
           {responseDebug && (
             <div className={`rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-4 ${
               responseStatus === 'success' ? 'bg-slate-900' : 'bg-red-50'
             }`}>
                <div className={`px-4 py-2 flex items-center gap-2 border-b ${
                  responseStatus === 'success' 
                    ? 'bg-slate-800 border-slate-700' 
                    : 'bg-red-100 border-red-200'
                }`}>
                   {responseStatus === 'success' ? (
                     <>
                       <CheckCircle2 className="w-4 h-4 text-green-500" />
                       <span className="text-xs font-mono text-slate-300">
                         {isDuplicate ? 'Existing Payment (Idempotency)' : 'Payment Created'}
                       </span>
                     </>
                   ) : (
                     <>
                       <AlertCircle className="w-4 h-4 text-red-600" />
                       <span className="text-xs font-mono text-red-800">Error Response</span>
                     </>
                   )}
                </div>
                <div className="p-4 overflow-auto max-h-[400px]">
                   <pre className={`text-xs font-mono leading-relaxed ${
                     responseStatus === 'success' ? 'text-emerald-400' : 'text-red-700'
                   }`}>
                     {JSON.stringify(responseDebug, null, 2)}
                   </pre>
                </div>
             </div>
           )}

           {/* Info Panel */}
           <div className="bg-white p-6 rounded-xl border border-slate-200 text-sm text-slate-600">
              <h3 className="font-semibold text-slate-900 mb-2">How it works</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Backend auto-generates a <strong>UUID v4</strong> idempotency key.</li>
                <li>Payment is queued for processing via BullMQ workers.</li>
                <li>Status updates happen automatically (pending → processing → succeeded/failed).</li>
                <li>View real-time status on the payment details page.</li>
              </ul>
           </div>

           {/* Validation Info */}
           <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <FileJson className="w-4 h-4" />
                Form Validation
              </h3>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-start gap-2">
                  <span className={formData.orderId && /^[a-zA-Z0-9-_]+$/.test(formData.orderId) ? 'text-green-600' : 'text-slate-400'}>●</span>
                  <span>Order ID: Alphanumeric only</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className={formData.amount && parseFloat(formData.amount) > 0 ? 'text-green-600' : 'text-slate-400'}>●</span>
                  <span>Amount: Must be greater than 0</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600">●</span>
                  <span>Currency: USD, EUR, GBP, or INR</span>
                </li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CreatePayment;
