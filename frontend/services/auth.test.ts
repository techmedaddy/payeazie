import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth';

vi.mock('./api', () => ({
  api: {
    post: vi.fn(),
  },
}));

import { api } from './api';

describe('AuthService password reset flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls forgot-password with the provided email', async () => {
    vi.mocked(api.post).mockResolvedValue({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });

    await AuthService.forgotPassword('user@example.com');

    expect(api.post).toHaveBeenCalledWith('/api/auth/forgot-password', {
      email: 'user@example.com',
    });
  });

  it('calls reset-password with the token and new password', async () => {
    vi.mocked(api.post).mockResolvedValue({
      success: true,
      message: 'Password has been reset successfully.',
    });

    await AuthService.resetPassword('token-123', 'new-password-123');

    expect(api.post).toHaveBeenCalledWith('/api/auth/reset-password', {
      token: 'token-123',
      newPassword: 'new-password-123',
    });
  });
});
