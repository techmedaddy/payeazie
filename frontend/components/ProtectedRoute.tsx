import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface ProtectedRouteProps {
  children: React.ReactElement;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthContext();
  const location = useLocation();

  useEffect(() => {
    const token = api.getAuthToken();
    
    if (token && isAuthenticated) {
      console.log(`✅ Token found, access granted to ${location.pathname}`);
      console.log('   Token length:', token.length);
      console.log('   User authenticated: true');
    } else if (!token) {
      console.log(`❌ No token, redirecting to login from ${location.pathname}`);
      console.log('   Token in localStorage: none');
    }
  }, [isAuthenticated, location.pathname]);

  if (isLoading) {
    console.log('⏳ Checking authentication status...');
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log(`🔒 Access denied to ${location.pathname} - redirecting to login`);
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
