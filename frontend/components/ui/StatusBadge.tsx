import React from 'react';
import { cn } from '../../utils/cn';
import { PaymentStatus } from '../../types';
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';

interface StatusBadgeProps {
  status?: PaymentStatus | string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Enhanced StatusBadge component with icons and size variants
 * Handles missing/unknown statuses gracefully with fallback styling
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  showIcon = true,
  size = 'md',
  className 
}) => {
  // Provide fallback for missing or unknown status
  const displayStatus = status || 'Unknown';
  
  // Status configuration with colors and icons
  const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    [PaymentStatus.SUCCEEDED]: {
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: <CheckCircle className="w-3.5 h-3.5" />,
      label: "Succeeded"
    },
    [PaymentStatus.PROCESSING]: {
      color: "bg-blue-50 text-blue-700 border-blue-200 animate-pulse",
      icon: <Clock className="w-3.5 h-3.5" />,
      label: "Processing"
    },
    [PaymentStatus.PENDING]: {
      color: "bg-slate-50 text-slate-700 border-slate-200",
      icon: <Clock className="w-3.5 h-3.5" />,
      label: "Pending"
    },
    [PaymentStatus.FAILED]: {
      color: "bg-red-50 text-red-700 border-red-200",
      icon: <XCircle className="w-3.5 h-3.5" />,
      label: "Failed"
    },
    'Unknown': {
      color: "bg-amber-50 text-amber-700 border-amber-200",
      icon: <AlertCircle className="w-3.5 h-3.5" />,
      label: "Unknown"
    },
  };

  // Get config, fallback to Unknown if status not recognized
  const config = statusConfig[displayStatus] || statusConfig['Unknown'];
  
  // Size variants
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  };

  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border",
        config.color,
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label={`Payment status: ${config.label}`}
    >
      {showIcon && (
        <span className={iconSizes[size]}>
          {config.icon}
        </span>
      )}
      <span>{config.label}</span>
    </span>
  );
};

export default StatusBadge;
