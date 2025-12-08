import React from 'react';
import { cn } from '../../utils/cn';
import { PaymentStatus } from '../../types';

interface BadgeProps {
  status: PaymentStatus;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({ status, className }) => {
  const variants = {
    [PaymentStatus.SUCCEEDED]: "bg-emerald-100 text-emerald-800 border-emerald-200",
    [PaymentStatus.PROCESSING]: "bg-blue-100 text-blue-800 border-blue-200 animate-pulse",
    [PaymentStatus.PENDING]: "bg-slate-100 text-slate-800 border-slate-200",
    [PaymentStatus.FAILED]: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
      variants[status],
      className
    )}>
      {status}
    </span>
  );
};

export default Badge;
