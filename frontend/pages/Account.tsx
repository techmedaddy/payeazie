import React from 'react';
import { Mail, ShieldCheck, User, UserCog, Lock } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';

const Account: React.FC = () => {
  const { user } = useAuthContext();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Basic profile details for your Payeazie account.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
              <UserCog className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{user?.name || 'Account owner'}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Keep your contact details accurate so receipts, reset links, and account notices reach you.
              </p>
            </div>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Active account
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <User className="h-4 w-4 text-slate-400" />
              Name
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-900">{user?.name || 'Not provided'}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Mail className="h-4 w-4 text-slate-400" />
              Email
            </div>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">{user?.email || 'Not available'}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              Role
            </div>
            <p className="mt-2 text-sm font-semibold capitalize text-slate-900">{user?.role || 'member'}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-600 border border-slate-200">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Password Update</h2>
            <p className="mt-1 text-sm text-slate-600">
              Password management is the next step here. For now, you can use the existing forgot-password flow if you need to reset access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Account;
