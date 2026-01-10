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
      const response = await api.get<{ user: User }>('/api/auth/me');
      setUser(response.user);
    } catch (error) {
      console.error('Failed to fetch user:', error);
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
    const response = await api.post<{ token: string; user: User }>(
      '/api/auth/login',
      { email, password }
    );
    
    api.setAuthToken(response.token);
    setUser(response.user);
  };

  // Register
  const register = async (name: string, email: string, password: string) => {
    await api.post('/api/auth/register', { name, email, password });
    // User must login after registration
  };

  // Logout
  const logout = () => {
    api.clearAuthToken();
    setUser(null);
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
