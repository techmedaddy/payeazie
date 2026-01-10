import { api } from '../services/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3467';

interface AuthResponse {
  success: boolean;
  data: {
    user: {
      id: string;
      email: string;
      name: string;
    };
    token: string;
  };
}

/**
 * Register or login a demo user for testing
 * This automatically handles authentication so users can test the payment flow
 */
export async function setupDemoAuth(): Promise<void> {
  // Check if we already have a token
  if (api.getAuthToken()) {
    console.log('✅ Auth token already exists');
    return;
  }

  try {
    // Try to register a demo user
    const demoEmail = 'demo@payeazie.local';
    const demoPassword = 'Demo123!';
    const demoName = 'Demo User';

    console.log('🔐 Setting up demo authentication...');

    try {
      // Try to register first
      const registerResponse = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: demoEmail,
          password: demoPassword,
          name: demoName,
        }),
      });

      if (registerResponse.ok) {
        const data: AuthResponse = await registerResponse.json();
        api.setAuthToken(data.data.token);
        console.log('✅ Demo user registered and authenticated');
        return;
      }
    } catch (err) {
      console.log('User might already exist, trying login...');
    }

    // If registration fails, try to login
    const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: demoEmail,
        password: demoPassword,
      }),
    });

    if (loginResponse.ok) {
      const data: AuthResponse = await loginResponse.json();
      api.setAuthToken(data.data.token);
      console.log('✅ Demo user logged in successfully');
    } else {
      console.warn('⚠️  Could not set up demo authentication. You may need to login manually.');
    }
  } catch (error) {
    console.error('❌ Failed to setup demo auth:', error);
  }
}
