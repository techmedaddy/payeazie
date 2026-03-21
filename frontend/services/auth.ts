import { api } from './api';

interface AuthMessageResponse {
  success: boolean;
  message: string;
}

export const AuthService = {
  forgotPassword: async (email: string): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>('/api/auth/forgot-password', { email });
  },

  resetPassword: async (token: string, newPassword: string): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>('/api/auth/reset-password', { token, newPassword });
  },
};

export type { AuthMessageResponse };
