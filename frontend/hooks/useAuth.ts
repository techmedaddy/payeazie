import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface UseAuthResult {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const useAuth = (): UseAuthResult => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch current user from token
  const refreshUser = useCallback(async () => {
    const token = api.getAuthToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      console.log('🔵 Making authenticated API call to /api/auth/me');
      console.log('   Token present:', !!token);
      console.log('   Token length:', token.length);
      
      const response = await api.get<{ user: User }>('/api/auth/me');
      
      console.log('✅ Authenticated API call succeeded');
      console.log('   User:', response.user.email);
      console.log('   Role:', response.user.role);
      
      setUser(response.user);
    } catch (error) {
      console.error('❌ Failed to fetch user:', error);
      api.clearAuthToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize - check if user is logged in
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Login
  const login = async (email: string, password: string) => {
    console.log('🔵 Attempting login');
    console.log('   Email:', email);
    
    const response = await api.post<{ token: string; user: User }>(
      '/api/auth/login',
      { email, password }
    );
    
    console.log('✅ Login successful');
    console.log('   User:', response.user.email);
    console.log('   Token received, length:', response.token.length);
    
    api.setAuthToken(response.token);
    setUser(response.user);
    
    console.log('✅ Token stored in localStorage');
  };

  // Register
  const register = async (name: string, email: string, password: string) => {
    await api.post('/api/auth/register', { name, email, password });
    // User must login after registration
  };

  // Logout
  const logout = () => {
    console.log('🔵 User logging out');
    console.log('   Clearing authentication token');
    
    api.clearAuthToken();
    setUser(null);
    
    console.log('✅ Logout complete');
    console.log('   Token cleared from localStorage');
    console.log('   User state reset');
  };

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
  };
};
