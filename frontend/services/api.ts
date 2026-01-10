import { ApiError } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3467';
const MAX_RETRIES = 3;

interface RequestOptions extends RequestInit {
  idempotencyKey?: string;
}

/**
 * Get authentication token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('authToken');
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
        console.warn('❌ 401 Unauthorized - Redirecting to login');
        localStorage.removeItem('authToken');
        // Only redirect if not already on login/register page
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login';
        }
        const errorData = await response.json().catch(() => ({ message: 'Unauthorized' }));
        throw { message: errorData.message || 'Unauthorized', statusCode: 401 } as ApiError;
      }
      
      // Don't retry client errors (4xx) except 429 or 408
      if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408) {
         const errorData = await response.json().catch(() => ({ message: 'Unknown Error' }));
         throw { message: errorData.message || response.statusText, statusCode: response.status } as ApiError;
      }
      throw { message: response.statusText, statusCode: response.status };
    }

    return await response.json();
  } catch (error: any) {
    if (retries > 0 && (!error.statusCode || error.statusCode >= 500 || error.statusCode === 429)) {
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
};
