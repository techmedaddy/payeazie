import { ApiError } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3467';
const MAX_RETRIES = 3;

interface RequestOptions extends RequestInit {
  idempotencyKey?: string;
}

const AUTH_REDIRECT_REASON_KEY = 'payeazie.authRedirectReason';

function shouldRetryRequest(method: string | undefined, error: ApiError | { statusCode?: number } | undefined): boolean {
  const normalizedMethod = (method || 'GET').toUpperCase();

  if (normalizedMethod !== 'GET') {
    return false;
  }

  const statusCode = error?.statusCode;
  return !statusCode || statusCode >= 500 || statusCode === 429;
}

/**
 * Get authentication token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('authToken');
}

function getHashRoute(): string {
  const hash = window.location.hash || '';
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  return normalized || '/';
}

function redirectToLogin(): void {
  const currentRoute = getHashRoute();

  if (
    currentRoute.startsWith('/login') ||
    currentRoute.startsWith('/register') ||
    currentRoute.startsWith('/forgot-password') ||
    currentRoute.startsWith('/reset-password')
  ) {
    return;
  }

  window.location.replace(`${window.location.origin}/#/login`);
}

function setAuthRedirectReason(reason: 'session_expired' | 'login_required'): void {
  try {
    sessionStorage.setItem(AUTH_REDIRECT_REASON_KEY, reason);
  } catch {
    // Ignore storage errors and fall back to redirect only.
  }
}

function consumeAuthRedirectReason(): string | null {
  try {
    const reason = sessionStorage.getItem(AUTH_REDIRECT_REASON_KEY);
    if (reason) {
      sessionStorage.removeItem(AUTH_REDIRECT_REASON_KEY);
    }
    return reason;
  } catch {
    return null;
  }
}

async function fetchWithRetry<T>(url: string, options: RequestOptions = {}, retries = MAX_RETRIES): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  
  // Add authorization header if token exists
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (options.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${BASE_URL}${url}`, config);

    if (!response.ok) {
      // Handle 401 Unauthorized - clear token and redirect to login
      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({ message: 'Unauthorized' }));
        
        // Check if it's a token expiry
        if (errorData.message && errorData.message.toLowerCase().includes('expired')) {
          console.error('❌ Token expired, redirecting to login');
          setAuthRedirectReason('session_expired');
        } else {
          console.warn('❌ 401 Unauthorized - Redirecting to login');
          setAuthRedirectReason('login_required');
        }
        
        localStorage.removeItem('authToken');
        redirectToLogin();
        throw { message: errorData.message || 'Unauthorized', statusCode: 401 } as ApiError;
      }
      
      // Don't retry client errors (4xx) except 429 or 408
      if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408) {
         const errorData = await response.json().catch(() => ({ message: 'Unknown Error' }));
         throw { 
           message: errorData.message || response.statusText, 
           statusCode: response.status,
           existingPaymentId: errorData.existingPaymentId,
           existingStatus: errorData.existingStatus,
           error: errorData.error
         } as ApiError;
      }
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw {
        message: errorData.message || response.statusText,
        statusCode: response.status,
      } as ApiError;
    }

    return await response.json();
  } catch (error: any) {
    if (retries > 0 && shouldRetryRequest(options.method, error)) {
      const delay = Math.pow(2, MAX_RETRIES - retries) * 1000; // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry<T>(url, options, retries - 1);
    }
    throw error;
  }
}

export const api = {
  get: <T>(url: string) => fetchWithRetry<T>(url, { method: 'GET' }),
  post: <T>(url: string, body: any, idempotencyKey?: string) => 
    fetchWithRetry<T>(url, { 
      method: 'POST', 
      body: JSON.stringify(body),
      idempotencyKey 
    }),
  setAuthToken: (token: string) => localStorage.setItem('authToken', token),
  clearAuthToken: () => localStorage.removeItem('authToken'),
  getAuthToken,
  consumeAuthRedirectReason,
};
