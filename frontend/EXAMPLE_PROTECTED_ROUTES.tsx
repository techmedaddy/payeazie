/**
 * EXAMPLE: Frontend Route Protection with JWT Tokens
 * 
 * This example demonstrates how protected routes work in the frontend
 * using JWT tokens stored in localStorage.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { api } from '../services/api';

/**
 * EXAMPLE 1: ProtectedRoute Component
 * =====================================
 * Wraps any component that requires authentication
 */

interface ProtectedRouteProps {
  children: React.ReactElement;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthContext();
  const location = useLocation();

  // Log token status
  useEffect(() => {
    const token = api.getAuthToken();
    
    if (token && isAuthenticated) {
      console.log(`✅ Token found, access granted to ${location.pathname}`);
      // Token exists and user is authenticated
    } else if (!token) {
      console.log(`❌ No token, redirecting to login from ${location.pathname}`);
      // No token - redirect to login
    }
  }, [isAuthenticated, location.pathname]);

  // Show loading while checking auth
  if (isLoading) {
    return <div>Verifying authentication...</div>;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Render protected content
  return children;
};

/**
 * EXAMPLE 2: Using ProtectedRoute in App.tsx
 * ============================================
 */

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes - No authentication required */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Protected Routes - Require authentication */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/create" element={
          <ProtectedRoute>
            <CreatePayment />
          </ProtectedRoute>
        } />
        
        <Route path="/payment/:id" element={
          <ProtectedRoute>
            <PaymentDetails />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

/**
 * EXAMPLE 3: Login Component with Token Storage
 * ===============================================
 */

const Login: React.FC = () => {
  const { login } = useAuthContext();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Login with email/password
      await login(email, password);
      
      // Token is automatically stored by login function
      // api.setAuthToken(token) is called internally
      
      console.log('✅ Login successful, token stored');
      
      // Redirect to dashboard
      navigate('/dashboard');
      
    } catch (error) {
      console.error('❌ Login failed:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Login form fields */}
    </form>
  );
};

/**
 * EXAMPLE 4: Google OAuth Callback Handler
 * ==========================================
 * Extracts token from URL and stores it
 */

const GoogleCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // 1. Extract token from URL query parameter
    const token = searchParams.get('token');
    
    console.log('🔵 Google OAuth callback received');
    console.log('   Token present:', !!token);

    if (token) {
      console.log('✅ JWT token received from backend');
      console.log('   Token length:', token.length);
      
      // 2. Store token in localStorage
      api.setAuthToken(token);
      // This does: localStorage.setItem('authToken', token)
      
      console.log('✅ Token stored in localStorage');
      console.log('   Key: authToken');
      
      // 3. Redirect to dashboard
      console.log('⏩ Navigating to dashboard');
      navigate('/dashboard', { replace: true });
    } else {
      console.error('❌ No token received');
      navigate('/login');
    }
  }, [searchParams, navigate]);

  return <div>Completing authentication...</div>;
};

/**
 * EXAMPLE 5: Logout Functionality
 * =================================
 */

const LogoutButton: React.FC = () => {
  const { logout } = useAuthContext();
  const navigate = useNavigate();

  const handleLogout = () => {
    console.log('🔵 Logout button clicked');
    console.log('   Clearing token from localStorage');
    
    // 1. Clear token and reset user state
    logout();
    // This does:
    //   api.clearAuthToken() → localStorage.removeItem('authToken')
    //   setUser(null)
    
    console.log('✅ Logout complete');
    console.log('   Token cleared');
    console.log('   User state reset');
    
    // 2. Redirect to login
    console.log('⏩ Redirecting to login');
    navigate('/login');
  };

  return (
    <button onClick={handleLogout}>
      Sign Out
    </button>
  );
};

/**
 * EXAMPLE 6: Token Storage & Retrieval
 * =====================================
 */

// api.ts - Token management functions

export const api = {
  // Store token in localStorage
  setAuthToken: (token: string) => {
    localStorage.setItem('authToken', token);
    console.log('✅ Token stored:', token.substring(0, 20) + '...');
  },
  
  // Retrieve token from localStorage
  getAuthToken: (): string | null => {
    const token = localStorage.getItem('authToken');
    if (token) {
      console.log('✅ Token found in localStorage');
    } else {
      console.log('❌ No token in localStorage');
    }
    return token;
  },
  
  // Clear token from localStorage
  clearAuthToken: () => {
    localStorage.removeItem('authToken');
    console.log('✅ Token cleared from localStorage');
  },
};

/**
 * EXAMPLE 7: Automatic Token Attachment
 * =======================================
 * Token is automatically added to all API requests
 */

async function fetchWithRetry(url: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  
  // 1. Get token from localStorage
  const token = getAuthToken();
  
  // 2. Add Authorization header if token exists
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    console.log('✅ Token attached to request:', url);
  } else {
    console.log('⚠️  No token available for request:', url);
  }

  // 3. Make the request
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });

  // 4. Handle 401 Unauthorized
  if (response.status === 401) {
    console.warn('❌ 401 Unauthorized - Redirecting to login');
    
    // Clear invalid token
    localStorage.removeItem('authToken');
    
    // Redirect to login (if not already there)
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  }

  return response.json();
}

/**
 * EXAMPLE 8: Complete Authentication Flow
 * =========================================
 */

/**
 * FLOW 1: Email/Password Login
 * 
 * 1. User enters email/password
 * 2. Frontend: POST /api/auth/login { email, password }
 * 3. Backend: Validates credentials, returns { token, user }
 * 4. Frontend: api.setAuthToken(token) → stores in localStorage
 * 5. Frontend: navigate('/dashboard')
 * 6. ProtectedRoute: Checks token → Grants access
 * 7. Dashboard renders with user data
 */

/**
 * FLOW 2: Google OAuth Login
 * 
 * 1. User clicks "Sign in with Google"
 * 2. Frontend: Redirects to /api/auth/google
 * 3. Backend: Redirects to Google OAuth
 * 4. User authorizes on Google
 * 5. Google: Redirects to /api/auth/google/callback
 * 6. Backend: Validates OAuth, generates JWT
 * 7. Backend: Redirects to /#/auth/google/callback?token=<jwt>
 * 8. Frontend: Extracts token from URL
 * 9. Frontend: api.setAuthToken(token) → stores in localStorage
 * 10. Frontend: navigate('/dashboard')
 * 11. ProtectedRoute: Checks token → Grants access
 * 12. Dashboard renders with user data
 */

/**
 * FLOW 3: Accessing Protected Route
 * 
 * 1. User navigates to /dashboard
 * 2. ProtectedRoute component checks authentication
 * 3. useAuthContext checks for token in localStorage
 * 4. If token exists:
 *    - Verify with backend: GET /api/auth/me
 *    - If valid: Render Dashboard
 *    - If invalid: Clear token, redirect to /login
 * 5. If no token:
 *    - Redirect to /login
 */

/**
 * FLOW 4: Logout
 * 
 * 1. User clicks "Sign Out" button
 * 2. Frontend: logout() function called
 * 3. localStorage.removeItem('authToken')
 * 4. setUser(null) - clear user state
 * 5. navigate('/login')
 * 6. Login page renders
 */

/**
 * EXAMPLE 9: Token Validation
 * =============================
 */

// useAuth hook - validates token on mount
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    // Check for token
    const token = api.getAuthToken();
    
    if (!token) {
      console.log('❌ No token found');
      setUser(null);
      setIsLoading(false);
      return;
    }

    console.log('✅ Token found, validating with backend');

    try {
      // Validate token with backend
      const response = await api.get('/api/auth/me');
      
      console.log('✅ Token valid');
      console.log('   User:', response.user.email);
      
      setUser(response.user);
    } catch (error) {
      console.error('❌ Token validation failed');
      console.error('   Error:', error);
      
      // Clear invalid token
      api.clearAuthToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  return { user, isAuthenticated: !!user, isLoading };
};

/**
 * EXAMPLE 10: Console Logging Examples
 * ======================================
 */

/**
 * Successful Login:
 * 
 * 🔵 Attempting login
 *    Email: user@example.com
 * ✅ Login successful
 *    User: user@example.com
 *    Token received, length: 186
 * ✅ Token stored in localStorage
 * ✅ Token found, access granted to /dashboard
 *    Token length: 186
 *    User authenticated: true
 */

/**
 * Access Without Token:
 * 
 * ❌ No token, redirecting to login from /dashboard
 *    Token in localStorage: none
 * 🔒 Access denied to /dashboard - redirecting to login
 */

/**
 * Successful Logout:
 * 
 * 🔵 User logging out
 *    Clearing authentication token
 * ✅ Logout complete
 *    Token cleared from localStorage
 *    User state reset
 * 🔵 Logout button clicked
 *    Clearing token and redirecting to login
 * ✅ Redirected to login page
 */

/**
 * Google OAuth Success:
 * 
 * 🔵 Google OAuth callback received
 *    Token present: true
 * ✅ JWT token received from backend
 *    Token length: 186
 * ✅ Token stored in localStorage as "authToken"
 *    localStorage key: authToken
 *    Token value: eyJhbGciOiJIUzI1NiI...
 * ✅ User profile refreshed from /api/auth/me
 * ✅ Authentication complete
 * ⏩ Navigating to dashboard
 * ✅ Token found, access granted to /dashboard
 */

/**
 * TESTING PROTECTED ROUTES
 * =========================
 */

/**
 * Test 1: Access protected route without token
 * 
 * 1. Clear localStorage: localStorage.clear()
 * 2. Navigate to: /#/dashboard
 * 3. Expected: Redirect to /#/login
 * 4. Console: "❌ No token, redirecting to login"
 */

/**
 * Test 2: Access protected route with valid token
 * 
 * 1. Login with valid credentials
 * 2. Check localStorage: localStorage.getItem('authToken')
 * 3. Navigate to: /#/dashboard
 * 4. Expected: Dashboard renders
 * 5. Console: "✅ Token found, access granted"
 */

/**
 * Test 3: Logout clears token
 * 
 * 1. Login and navigate to dashboard
 * 2. Click "Sign Out" button
 * 3. Check localStorage: localStorage.getItem('authToken') → null
 * 4. Expected: Redirect to login
 * 5. Console: "✅ Token cleared from localStorage"
 */

/**
 * Test 4: Invalid token redirects to login
 * 
 * 1. Set invalid token: localStorage.setItem('authToken', 'invalid')
 * 2. Navigate to: /#/dashboard
 * 3. Expected: Redirect to login after validation fails
 * 4. Console: "❌ Token validation failed"
 */

export {};
