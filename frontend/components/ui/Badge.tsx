import React from 'react';
import { cn } from '../../utils/cn';
import { PaymentStatus } from '../../types';

interface BadgeProps {
  status?: PaymentStatus | string;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({ status, className }) => {
  // Provide fallback for missing or unknown status
  const displayStatus = status || 'Unknown';
  
  const variants: Record<string, string> = {
    [PaymentStatus.SUCCEEDED]: "bg-emerald-100 text-emerald-800 border-emerald-200",
    [PaymentStatus.PROCESSING]: "bg-blue-100 text-blue-800 border-blue-200 animate-pulse",
    [PaymentStatus.PENDING]: "bg-slate-100 text-slate-800 border-slate-200",
    [PaymentStatus.FAILED]: "bg-red-100 text-red-800 border-red-200",
    'Unknown': "bg-amber-100 text-amber-800 border-amber-200",
  };

  // Get variant style, fallback to Unknown style if status not recognized
  const variantStyle = variants[displayStatus] || variants['Unknown'];

  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
      variantStyle,
      className
    )}>
      {displayStatus}
    </span>
  );
};

export default Badge;
