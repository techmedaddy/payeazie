/**
 * EXAMPLE: Creating a Protected Route with JWT Authentication
 * 
 * This example shows how to create and protect API routes using the JWT middleware
 */

const { authMiddleware } = require('../middleware/auth.middleware');

/**
 * EXAMPLE 1: Simple Protected Route
 * ===================================
 */
module.exports = async function exampleRoutes(fastify) {
  
  // ✅ PROTECTED: Dashboard route - requires authentication
  fastify.get(
    '/dashboard',
    { 
      preHandler: [authMiddleware]  // 🔒 Add middleware here
    },
    async (request, reply) => {
      // At this point, request.user is populated with:
      // {
      //   id: "user-uuid",
      //   email: "user@example.com", 
      //   name: "User Name",
      //   role: "user"
      // }
      
      const userId = request.user.id;
      
      // Fetch dashboard data for this specific user
      const payments = await getPaymentsForUser(userId);
      
      return {
        user: request.user,
        payments: payments,
        summary: {
          total: payments.length,
          pending: payments.filter(p => p.status === 'pending').length
        }
      };
    }
  );

  /**
   * EXAMPLE 2: Protected Create Endpoint
   * =====================================
   */
  fastify.post(
    '/create',
    {
      schema: {
        body: {
          type: 'object',
          required: ['orderId', 'amount', 'currency'],
          properties: {
            orderId: { type: 'string' },
            amount: { type: 'number', minimum: 0.01 },
            currency: { type: 'string' }
          }
        }
      },
      preHandler: [authMiddleware]  // 🔒 Protected
    },
    async (request, reply) => {
      const { orderId, amount, currency } = request.body;
      const userId = request.user.id;  // From JWT
      
      // Create payment and associate with user
      const payment = await createPayment({
        orderId,
        amount,
        currency,
        userId  // Link to authenticated user
      });
      
      return { payment };
    }
  );

  /**
   * EXAMPLE 3: Protected Payment Details Route
   * ===========================================
   */
  fastify.get(
    '/payment/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' }
          }
        }
      },
      preHandler: [authMiddleware]  // 🔒 Protected
    },
    async (request, reply) => {
      const paymentId = request.params.id;
      const userId = request.user.id;
      
      // Fetch payment
      const payment = await getPaymentById(paymentId);
      
      if (!payment) {
        return reply.code(404).send({ error: 'Payment not found' });
      }
      
      // Security: Ensure user can only access their own payments
      if (payment.userId !== userId && request.user.role !== 'admin') {
        return reply.code(403).send({ error: 'Access denied' });
      }
      
      return { payment };
    }
  );

  /**
   * EXAMPLE 4: Public Route (No Authentication)
   * ============================================
   */
  fastify.get(
    '/health',
    // No preHandler = no authentication required
    async (request, reply) => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    }
  );
};

/**
 * TESTING THE PROTECTED ROUTES
 * ==============================
 */

/**
 * Test 1: Access without token (should fail with 401)
 * 
 * curl -X GET http://localhost:3467/api/dashboard
 * 
 * Response:
 * {
 *   "error": "Unauthorized",
 *   "message": "Authorization header missing"
 * }
 * 
 * Server Log:
 * ❌ Unauthorized access attempt - No authorization header
 */

/**
 * Test 2: Access with invalid token (should fail with 401)
 * 
 * curl -X GET http://localhost:3467/api/dashboard \
 *   -H "Authorization: Bearer invalid_token"
 * 
 * Response:
 * {
 *   "error": "Unauthorized",
 *   "message": "Invalid token"
 * }
 * 
 * Server Log:
 * ❌ Unauthorized access attempt - Invalid token
 */

/**
 * Test 3: Access with valid token (should succeed)
 * 
 * # Step 1: Login to get token
 * TOKEN=$(curl -X POST http://localhost:3467/api/auth/login \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"user@example.com","password":"password"}' \
 *   | jq -r '.token')
 * 
 * # Step 2: Use token to access protected route
 * curl -X GET http://localhost:3467/api/dashboard \
 *   -H "Authorization: Bearer $TOKEN"
 * 
 * Response:
 * {
 *   "user": { ... },
 *   "payments": [ ... ],
 *   "summary": { ... }
 * }
 * 
 * Server Log:
 * ✅ JWT verified - User authenticated
 */

/**
 * FRONTEND INTEGRATION
 * =====================
 */

/**
 * The frontend automatically handles authentication:
 * 
 * 1. Token Storage: After login, token is stored in localStorage
 * 2. Automatic Attachment: Axios interceptor adds token to all requests
 * 3. Error Handling: 401 responses redirect to /login
 * 
 * From frontend/services/api.ts:
 * 
 * // Attach token to all requests
 * axios.interceptors.request.use((config) => {
 *   const token = localStorage.getItem('token');
 *   if (token) {
 *     config.headers.Authorization = `Bearer ${token}`;
 *   }
 *   return config;
 * });
 * 
 * // Handle 401 errors
 * axios.interceptors.response.use(
 *   (response) => response,
 *   (error) => {
 *     if (error.response?.status === 401) {
 *       localStorage.removeItem('token');
 *       window.location.href = '/login';
 *     }
 *     return Promise.reject(error);
 *   }
 * );
 */

/**
 * SECURITY BEST PRACTICES
 * ========================
 */

// ✅ DO: Always use authMiddleware for sensitive routes
fastify.get('/sensitive-data', { preHandler: [authMiddleware] }, handler);

// ❌ DON'T: Forget to verify user ownership
async function badHandler(request, reply) {
  const data = await getSensitiveData(request.params.id);
  return data;  // ⚠️ No check if user owns this data!
}

// ✅ DO: Verify user owns the resource
async function goodHandler(request, reply) {
  const data = await getSensitiveData(request.params.id);
  
  if (data.userId !== request.user.id && request.user.role !== 'admin') {
    return reply.code(403).send({ error: 'Access denied' });
  }
  
  return data;
}

// ✅ DO: Use rate limiting on protected routes
fastify.get(
  '/protected',
  { 
    preHandler: [authMiddleware],
    config: { 
      rateLimit: { 
        max: 5,           // 5 requests
        timeWindow: '1 hour'  // per hour
      } 
    }
  },
  handler
);

/**
 * LOGGING EXAMPLES
 * =================
 */

// When authentication succeeds, you'll see:
// ✅ JWT verified - User authenticated { userId: "123", email: "user@example.com", path: "/api/dashboard" }

// When authentication fails, you'll see:
// ❌ Unauthorized access attempt - Token expired { path: "/api/dashboard", method: "GET" }
// ❌ Unauthorized access attempt - No authorization header { path: "/api/payments", method: "POST" }
// ❌ Unauthorized access attempt - Invalid token { path: "/api/payment/123", method: "GET" }

/**
 * MIDDLEWARE FLOW
 * ================
 * 
 * 1. Request arrives: GET /api/dashboard
 *    Header: Authorization: Bearer <token>
 * 
 * 2. authMiddleware executes BEFORE route handler
 *    - Extracts token from header
 *    - Verifies token with JWT_SECRET
 *    - Queries database for user
 *    - Attaches user to req.user
 * 
 * 3. If valid: Route handler executes with req.user populated
 *    If invalid: Returns 401 and handler never runs
 * 
 * 4. Handler can safely use req.user knowing it's authenticated
 */

/**
 * REQUEST OBJECT STRUCTURE
 * =========================
 */

// After successful authentication, request.user contains:
const authenticatedRequest = {
  // ... standard Fastify request properties
  user: {
    id: "550e8400-e29b-41d4-a716-446655440000",  // UUID
    email: "user@example.com",
    name: "John Doe",
    role: "user"  // or "admin"
  }
};

// In route handlers, you can use:
async function myHandler(request, reply) {
  const userId = request.user.id;
  const userEmail = request.user.email;
  const isAdmin = request.user.role === 'admin';
  
  // Your logic here
}
