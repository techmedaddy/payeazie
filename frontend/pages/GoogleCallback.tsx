import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

const GoogleCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuthContext();
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token');
      const errorMsg = searchParams.get('error');

      console.log('🔵 Google OAuth callback received');
      console.log('   Token present:', !!token);
      console.log('   Error present:', !!errorMsg);

      if (errorMsg) {
        console.error('❌ OAuth error:', errorMsg);
        setError(errorMsg);
        setTimeout(() => {
          console.log('⏩ Redirecting to login after error');
          navigate('/login');
        }, 3000);
        return;
      }

      if (token) {
        console.log('✅ JWT token received from backend');
        console.log('   Token length:', token.length);
        
        // Store token in localStorage
        api.setAuthToken(token);
        console.log('✅ Token stored in localStorage as "authToken"');
        console.log('   localStorage key: authToken');
        console.log('   Token value:', `${token.substring(0, 20)}...`);
        
        // Refresh user profile
        await refreshUser();
        console.log('✅ User profile refreshed from /api/auth/me');
        console.log('✅ Authentication complete');
        console.log('⏩ Navigating to dashboard');
        
        navigate('/dashboard', { replace: true });
      } else {
        console.error('❌ No token received from Google OAuth');
        console.error('   This usually means the backend OAuth flow failed');
        setError('No token received from Google OAuth');
        setTimeout(() => {
          console.log('⏩ Redirecting to login');
          navigate('/login');
        }, 3000);
      }
    };

    handleCallback();
  }, [searchParams, navigate, refreshUser]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Authentication Failed</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <p className="text-sm text-slate-500">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Completing authentication...</h2>
        <p className="text-slate-600">Please wait while we sign you in</p>
      </div>
    </div>
  );
};

export default GoogleCallback;
