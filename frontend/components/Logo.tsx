import React from 'react';
import { Link } from 'react-router-dom';

const Logo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Link to="/" className={`group flex items-center gap-2 select-none ${className}`}>
      <div className="relative w-8 h-8">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full text-brand-600 transition-transform group-hover:scale-110"
        >
          <path
            d="M3 10L10 3L14 7L21 3V14L14 21L10 17L3 21V10Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 17L14 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-50"
          />
        </svg>
      </div>
      <span className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-brand-700 transition-colors">
        Payeazie
      </span>
    </Link>
  );
};

export default Logo;
