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
      
      const response = await api.get<{ success: boolean; data: { user: User } }>('/api/auth/me');
      
      console.log('✅ Authenticated API call succeeded');
      console.log('   Response:', response);
      console.log('   User:', response.data.user.email);
      console.log('   Role:', response.data.user.role);
      
      setUser(response.data.user);
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
    
    const response = await api.post<{ success: boolean; data: { token: string; user: User } }>(
      '/api/auth/login',
      { email, password }
    );
    
    console.log('✅ Login successful');
    console.log('   User:', response.data.user.email);
    console.log('   Token received, length:', response.data.token.length);
    
    api.setAuthToken(response.data.token);
    setUser(response.data.user);
    
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
    console.log('   Clearing authentication token from localStorage');
    
    api.clearAuthToken();
    setUser(null);
    
    console.log('✅ Logout successful');
    console.log('   Token removed from localStorage');
    console.log('   User state cleared');
    console.log('   Protected routes will now redirect to /login');
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
