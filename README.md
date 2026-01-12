# Payeazie 💳

> A production-grade payment orchestration platform demonstrating modern full-stack architecture, microservices patterns, and enterprise-level best practices.

[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://payeazie.netlify.app/)
[![Backend API](https://img.shields.io/badge/API-online-blue)](https://payeazie-backend.onrender.com/health)
[![License](https://img.shields.io/badge/license-ISC-green)](LICENSE)

**🔗 Live Links:**
- **Frontend:** https://payeazie.netlify.app/
- **Backend API:** https://payeazie-backend.onrender.com/

---

## 📋 Table of Contents

- [Project Overview](#-project-overview)
- [System Architecture](#-system-architecture)
- [High-Level Design (HLD)](#-high-level-design-hld)
- [Low-Level Design (LLD)](#-low-level-design-lld)
- [API Documentation](#-api-documentation)
- [Dataflow & Sequence Diagrams](#-dataflow--sequence-diagrams)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Deployment](#-deployment)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Security & Observability](#-security--observability)
- [Challenges & Solutions](#-challenges--solutions)
- [Future Enhancements](#-future-enhancements)
- [Contributing](#-contributing)

---

## 🎯 Project Overview

**Payeazie** is a comprehensive payment processing platform that demonstrates enterprise-grade software architecture patterns. It showcases:

### Key Features

- **🔐 Multi-Strategy Authentication**
  - Email/password authentication with bcrypt hashing
  - Google OAuth 2.0 integration via Passport.js
  - JWT-based session management with secure token refresh
  - Password reset flow with time-limited tokens

- **💰 Payment Lifecycle Management**
  - Idempotent payment intent creation
  - Asynchronous payment processing via BullMQ queues
  - Real-time payment status tracking
  - Automated reconciliation workflows

- **📊 Audit & Compliance**
  - Comprehensive audit logging for all transactions
  - User action tracking with timestamps
  - Payment state transition history
  - Immutable audit trail for compliance

- **⚡ Performance & Reliability**
  - Redis-backed job queues (BullMQ) for async processing
  - Rate limiting to prevent abuse (100 req/15min per IP)
  - Database connection pooling with pg-promise
  - Retry mechanisms for failed payment processing

- **🏥 Health Monitoring**
  - Real-time health checks for database, Redis, and workers
  - Service status dashboard with component-level monitoring
  - Auto-recovery mechanisms for degraded services

### Demo Scope

This project serves as a **portfolio demonstration** of:
- Modern full-stack development practices
- Microservices architecture patterns
- Event-driven systems with message queues
- Production deployment and CI/CD workflows
- Security best practices and authentication flows

---

## 🏗️ System Architecture

### Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        FE[React Frontend<br/>Vite + TypeScript]
    end
    
    subgraph "API Layer"
        API[Fastify Backend<br/>Node.js + TypeScript]
        AUTH[Passport Middleware<br/>JWT + OAuth]
        RL[Rate Limiter<br/>Redis-backed]
    end
    
    subgraph "Data Layer"
        PG[(Supabase PostgreSQL<br/>Primary Database)]
        REDIS[(Upstash Redis<br/>Cache + Queues)]
    end
    
    subgraph "Worker Layer"
        CHARGE[Charge Worker<br/>BullMQ]
        RECON[Reconcile Worker<br/>BullMQ]
    end
    
    subgraph "External Services"
        GOOGLE[Google OAuth 2.0]
        GATEWAY[Payment Gateway<br/>Mock/Stripe]
    end
    
    FE -->|HTTPS| API
    API --> AUTH
    API --> RL
    API --> PG
    API --> REDIS
    REDIS --> CHARGE
    REDIS --> RECON
    CHARGE --> GATEWAY
    CHARGE --> PG
    RECON --> PG
    AUTH --> GOOGLE
    
    style FE fill:#61dafb,stroke:#333,stroke-width:2px
    style API fill:#68a063,stroke:#333,stroke-width:2px
    style PG fill:#336791,stroke:#333,stroke-width:2px
    style REDIS fill:#dc382d,stroke:#333,stroke-width:2px
```

### Component Breakdown

| Component | Technology | Purpose | Hosting |
|-----------|-----------|---------|---------|
| **Frontend** | React 19, Vite, TailwindCSS | User interface and client-side logic | Netlify |
| **Backend API** | Node.js, Fastify, TypeScript | RESTful API, business logic | Render |
| **Database** | PostgreSQL (Supabase) | Persistent data storage | Supabase Cloud |
| **Cache/Queue** | Redis (Upstash) | Rate limiting, job queues, pub/sub | Upstash Cloud |
| **Workers** | BullMQ | Async payment processing | Render (background) |
| **Authentication** | Passport.js, JWT | User authentication & authorization | Backend service |
| **CI/CD** | GitHub Actions | Automated testing & deployment | GitHub |

---

## 📐 High-Level Design (HLD)

### Module Overview

#### 1. Authentication Module
- **Email/Password Flow:** User registration with bcrypt password hashing, login with JWT token generation
- **Google OAuth Flow:** OAuth 2.0 authorization code flow with Passport.js strategy
- **Session Management:** Secure HTTP-only cookies with JWT tokens, refresh token rotation
- **Password Recovery:** Email-based token generation, time-limited reset links

#### 2. Payments Module
- **Intent Creation:** Idempotent payment creation with unique order IDs
- **Queue Processing:** Async payment submission to BullMQ charge queue
- **Status Tracking:** Real-time payment status updates (pending → processing → completed/failed)
- **Reconciliation:** Automated reconciliation worker to verify payment gateway responses

#### 3. Audit Logging Module
- **Action Tracking:** All user actions logged with timestamps, IP, user agent
- **Payment Trail:** Complete payment lifecycle tracking with state transitions
- **Immutable Logs:** Write-only audit table with no updates/deletes
- **Query API:** Paginated audit log retrieval for admin dashboards

#### 4. Job Queue Module
- **BullMQ Integration:** Redis-backed job queues for async processing
- **Worker Pools:** Dedicated workers for charge and reconciliation tasks
- **Retry Logic:** Exponential backoff for failed jobs (3 retries max)
- **Dead Letter Queue:** Failed jobs moved to DLQ after exhausting retries

#### 5. Rate Limiting Module
- **IP-based Limiting:** 100 requests per 15 minutes per IP address
- **Redis Storage:** Distributed rate limit counters with TTL
- **Custom Error Responses:** 429 Too Many Requests with retry-after header

### Request Flow

```
┌─────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Client  │─────▶│  Fastify │─────▶│   Auth   │─────▶│ Business │
│ (React) │      │   API    │      │Middleware│      │  Logic   │
└─────────┘      └──────────┘      └──────────┘      └──────────┘
                       │                                    │
                       │                                    ▼
                       │                             ┌──────────┐
                       │                             │PostgreSQL│
                       │                             │ Database │
                       │                             └──────────┘
                       │
                       ▼
                 ┌──────────┐      ┌──────────┐
                 │  Redis   │─────▶│  BullMQ  │
                 │  Queue   │      │  Worker  │
                 └──────────┘      └──────────┘
```

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Internet / CDN                        │
└─────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
        ┌───────▼────────┐     ┌───────▼────────┐
        │ Netlify CDN    │     │  Render Cloud  │
        │  (Frontend)    │     │   (Backend)    │
        └────────────────┘     └───────┬────────┘
                                       │
                         ┌─────────────┼─────────────┐
                         │             │             │
                  ┌──────▼──────┐ ┌───▼────┐ ┌─────▼─────┐
                  │  Supabase   │ │ Upstash│ │  Google   │
                  │  PostgreSQL │ │  Redis │ │  OAuth    │
                  └─────────────┘ └────────┘ └───────────┘
```

---

## 🔬 Low-Level Design (LLD)

### Backend Folder Structure

```
backend/
├── src/
│   ├── api/                    # API routes
│   │   ├── auth.js            # Authentication endpoints
│   │   ├── payments.js        # Payment CRUD operations
│   │   └── audit.js           # Audit log retrieval
│   ├── core/
│   │   ├── db.js              # PostgreSQL connection
│   │   ├── redis.js           # Redis client
│   │   └── logger.js          # Pino logger configuration
│   ├── utils/
│   │   ├── jwt.js             # JWT helper functions
│   │   ├── validation.js      # Input validation schemas
│   │   └── email.js           # Email service (nodemailer)
│   ├── workers/
│   │   ├── charge-worker.js   # Payment processing worker
│   │   └── reconcile-worker.js # Reconciliation worker
│   └── middleware/
│       ├── auth.js            # JWT verification middleware
│       ├── rate-limit.js      # Rate limiting middleware
│       └── error-handler.js   # Global error handler
├── migrations/                 # Database migrations
│   ├── 001_create_payments_table.sql
│   ├── 004_create_users_table.sql
│   └── ...
├── tests/                      # Test suites
│   ├── auth.test.js
│   ├── payments.test.js
│   └── ...
├── scripts/                    # Utility scripts
│   ├── migrate.js             # Run migrations
│   └── seed-payments.js       # Seed test data
├── server.js                   # Application entry point
└── package.json
```

### Database Schema

#### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  google_id VARCHAR(255) UNIQUE,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
```

#### Payments Table
```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'pending',
  gateway_response JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_user_id ON payments(user_id);
```

#### Payment Audit Log Table
```sql
CREATE TABLE payment_audit_log (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER REFERENCES payments(id),
  user_id INTEGER REFERENCES users(id),
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  action VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_payment_id ON payment_audit_log(payment_id);
CREATE INDEX idx_audit_created_at ON payment_audit_log(created_at);
```

#### Password Resets Table
```sql
CREATE TABLE password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_password_resets_token ON password_resets(token);
```

### Redis Key Patterns

| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `ratelimit:{ip}` | Rate limit counter | 15 min |
| `bull:charge:*` | Charge queue jobs | Persistent |
| `bull:reconcile:*` | Reconciliation queue | Persistent |
| `session:{userId}` | User session cache | 7 days |

### BullMQ Worker Logic

```javascript
// Charge Worker (Simplified)
chargeQueue.process(async (job) => {
  const { paymentId, orderId, amount } = job.data;
  
  // 1. Update status to 'processing'
  await db.query(
    'UPDATE payments SET status = $1 WHERE id = $2',
    ['processing', paymentId]
  );
  
  // 2. Call payment gateway (mock/Stripe)
  const gatewayResponse = await callPaymentGateway({
    orderId,
    amount
  });
  
  // 3. Update payment with gateway response
  await db.query(
    'UPDATE payments SET status = $1, gateway_response = $2 WHERE id = $3',
    [gatewayResponse.status, gatewayResponse, paymentId]
  );
  
  // 4. Log audit trail
  await logAuditEvent({
    paymentId,
    action: 'payment_processed',
    status: gatewayResponse.status
  });
  
  return { success: true };
});
```

---

## 📡 API Documentation

### Base URL
```
Production:  https://payeazie-backend.onrender.com
Development: http://localhost:3467
```

### Authentication Endpoints

#### POST `/api/auth/register`
Register a new user with email/password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "userId": 42,
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### POST `/api/auth/login`
Login with email/password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "userId": 42,
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

#### GET `/api/auth/google`
Initiate Google OAuth flow.

**Response:** Redirect to Google consent screen

#### GET `/api/auth/google/callback`
OAuth callback endpoint (handled by Passport.js).

**Response:** Redirect to frontend with auth token

### Payment Endpoints

#### POST `/api/payments`
Create a new payment intent.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Request:**
```json
{
  "orderId": "ORDER-2026-001",
  "amount": 99.99,
  "currency": "USD"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "paymentId": 123,
    "orderId": "ORDER-2026-001",
    "status": "pending",
    "amount": 99.99,
    "currency": "USD",
    "createdAt": "2026-01-13T01:15:00Z"
  }
}
```

#### GET `/api/payments`
List all payments for authenticated user.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters:**
- `status` (optional): Filter by status (pending, processing, completed, failed)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "paymentId": 123,
      "orderId": "ORDER-2026-001",
      "status": "completed",
      "amount": 99.99,
      "currency": "USD",
      "createdAt": "2026-01-13T01:15:00Z",
      "updatedAt": "2026-01-13T01:16:30Z"
    }
  ],
  "pagination": {
    "total": 15,
    "limit": 50,
    "offset": 0
  }
}
```

#### GET `/api/payments/:orderId`
Get payment details by order ID.

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "paymentId": 123,
    "orderId": "ORDER-2026-001",
    "status": "completed",
    "amount": 99.99,
    "currency": "USD",
    "gatewayResponse": {
      "transactionId": "tx_abc123",
      "processorCode": "00"
    },
    "createdAt": "2026-01-13T01:15:00Z",
    "updatedAt": "2026-01-13T01:16:30Z"
  }
}
```

### Audit Endpoints

#### GET `/api/audit/:paymentId`
Get audit trail for a specific payment.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "paymentId": 123,
      "oldStatus": null,
      "newStatus": "pending",
      "action": "payment_created",
      "userId": 42,
      "createdAt": "2026-01-13T01:15:00Z"
    },
    {
      "id": 2,
      "paymentId": 123,
      "oldStatus": "pending",
      "newStatus": "processing",
      "action": "payment_queued",
      "userId": 42,
      "createdAt": "2026-01-13T01:15:05Z"
    }
  ]
}
```

### Health Check Endpoint

#### GET `/health`
System health check.

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "timestamp": "2026-01-13T01:20:00Z",
  "services": {
    "database": {
      "status": "up",
      "responseTime": 12
    },
    "redis": {
      "status": "up",
      "responseTime": 3
    },
    "workers": {
      "charge": "active",
      "reconcile": "active"
    }
  }
}
```

### Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": {
      "field": "email",
      "value": "invalid-email"
    }
  }
}
```

**Common Error Codes:**
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## 🔄 Dataflow & Sequence Diagrams

### User Login Flow (Email/Password)

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as Backend API
    participant DB as PostgreSQL
    participant JWT as JWT Service
    
    U->>FE: Enter email/password
    FE->>API: POST /api/auth/login
    API->>DB: Query user by email
    DB-->>API: User record
    API->>API: Verify password (bcrypt)
    API->>JWT: Generate JWT token
    JWT-->>API: JWT token
    API->>DB: Log login audit event
    API-->>FE: { token, userId, email }
    FE->>FE: Store token in localStorage
    FE-->>U: Redirect to dashboard
```

### Google OAuth Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as Backend API
    participant PASS as Passport.js
    participant GOOGLE as Google OAuth
    participant DB as PostgreSQL
    
    U->>FE: Click "Sign in with Google"
    FE->>API: GET /api/auth/google
    API->>PASS: Initiate OAuth flow
    PASS->>GOOGLE: Redirect to consent screen
    GOOGLE-->>U: Show consent dialog
    U->>GOOGLE: Grant permissions
    GOOGLE->>API: Redirect to /callback + code
    API->>PASS: Process callback
    PASS->>GOOGLE: Exchange code for tokens
    GOOGLE-->>PASS: Access token + user profile
    PASS->>DB: Find or create user
    DB-->>PASS: User record
    PASS->>API: Authenticate user
    API-->>FE: Redirect with JWT token
    FE-->>U: Logged in
```

### Payment Processing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as Backend API
    participant DB as PostgreSQL
    participant REDIS as Redis Queue
    participant WORKER as Charge Worker
    participant GW as Payment Gateway
    
    U->>FE: Initiate payment
    FE->>API: POST /api/payments
    API->>DB: Insert payment (status=pending)
    DB-->>API: Payment ID
    API->>REDIS: Enqueue charge job
    REDIS-->>API: Job ID
    API-->>FE: { paymentId, status=pending }
    FE-->>U: Show pending status
    
    Note over REDIS,WORKER: Async Processing
    WORKER->>REDIS: Fetch job
    WORKER->>DB: Update status=processing
    WORKER->>GW: Process payment
    GW-->>WORKER: Gateway response
    WORKER->>DB: Update status=completed/failed
    WORKER->>DB: Log audit trail
    WORKER-->>REDIS: Job complete
    
    U->>FE: Poll for status
    FE->>API: GET /api/payments/:orderId
    API->>DB: Query payment
    DB-->>API: Payment record
    API-->>FE: { status=completed }
    FE-->>U: Show success message
```

### Rate Limiting Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌──────────┐
│ Request │────▶│  Rate   │────▶│  Redis  │────▶│ Business │
│         │     │ Limiter │     │ Counter │     │  Logic   │
└─────────┘     └─────────┘     └─────────┘     └──────────┘
                      │
                      │ (if exceeded)
                      ▼
                ┌─────────┐
                │  429    │
                │ Response│
                └─────────┘
```

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 19 with TypeScript
- **Build Tool:** Vite 6.x (fast HMR, optimized builds)
- **Styling:** TailwindCSS 3.x + custom components
- **Routing:** React Router DOM v7
- **State Management:** React Context API + custom hooks
- **HTTP Client:** Native Fetch API with custom wrappers
- **Charts:** Recharts for data visualization
- **Testing:** Vitest + React Testing Library

### Backend
- **Runtime:** Node.js 20.x
- **Framework:** Fastify 5.x (high-performance HTTP server)
- **Language:** JavaScript (ES modules)
- **Authentication:** Passport.js + JWT (jsonwebtoken)
- **Database Client:** pg-promise (PostgreSQL)
- **Queue System:** BullMQ 5.x (Redis-backed job queues)
- **Validation:** Fastify schema validation
- **Logging:** Pino + pino-pretty
- **Security:** @fastify/helmet, @fastify/rate-limit, @fastify/cors
- **Testing:** Vitest

### Infrastructure
- **Database:** Supabase PostgreSQL (AWS ap-northeast-1)
- **Cache/Queue:** Upstash Redis (TLS-enabled)
- **Backend Hosting:** Render (Oregon, US West)
- **Frontend Hosting:** Netlify (CDN + auto-deploy)
- **OAuth Provider:** Google Cloud Platform
- **CI/CD:** GitHub Actions

### Development Tools
- **Version Control:** Git + GitHub
- **Package Manager:** npm
- **Linting:** ESLint (configured for React + Node.js)
- **Environment:** dotenv for local development

---

## 🚀 Getting Started

### Prerequisites

- **Node.js:** v20.x or higher
- **npm:** v10.x or higher
- **PostgreSQL:** 14+ (or Supabase account)
- **Redis:** 7+ (or Upstash account)
- **Google Cloud:** OAuth 2.0 credentials

### Local Development Setup

#### 1. Clone the Repository

```bash
git clone https://github.com/techmedaddy/payeazie.git
cd payeazie
```

#### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

**Required Environment Variables:**

```env
# Application
NODE_ENV=development
PORT=3467
APP_URL=http://localhost:3467

# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Redis (Upstash)
REDIS_URL=rediss://default:password@host:6379

# Authentication
JWT_SECRET=<generate-strong-random-secret>
JWT_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_CALLBACK_URL=http://localhost:3467/api/auth/google/callback

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

#### 3. Database Migrations

```bash
# Initialize database
npm run db:init

# Run migrations
npm run db:migrate
```

#### 4. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env
nano .env
```

**Frontend Environment Variables:**

```env
VITE_API_URL=http://localhost:3467
```

#### 5. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run start
```

**Terminal 2 - Charge Worker:**
```bash
cd backend
node src/workers/charge-worker.js
```

**Terminal 3 - Reconcile Worker:**
```bash
cd backend
node src/workers/reconcile-worker.js
```

**Terminal 4 - Frontend:**
```bash
cd frontend
npm run dev
```

#### 6. Access the Application

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3467
- **Health Check:** http://localhost:3467/health

### Running Tests

**Backend Tests:**
```bash
cd backend
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

**Frontend Tests:**
```bash
cd frontend
npm test
npm run test:ui         # Visual UI for tests
```

---

## 📦 Deployment

### Environment Strategy

| Environment | Branch | Backend | Frontend | Database |
|-------------|--------|---------|----------|----------|
| **Development** | `feature/*` | localhost | localhost | Local/Supabase Dev |
| **Staging** | `staging` | Render Staging | Netlify Preview | Supabase Staging |
| **Production** | `master` | Render Production | Netlify | Supabase Production |

### Backend Deployment (Render)

#### Step 1: Create Render Web Service

1. Go to https://dashboard.render.com/
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `payeazie-backend`
   - **Environment:** `Node`
   - **Region:** `Oregon (US West)`
   - **Branch:** `master`
   - **Root Directory:** `backend`
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Instance Type:** Starter ($7/month) or Free

#### Step 2: Set Environment Variables

Add in Render dashboard:

```env
NODE_ENV=production
PORT=3467
APP_URL=https://payeazie-backend.onrender.com
DATABASE_URL=<supabase-connection-string>
REDIS_URL=<upstash-redis-url>
JWT_SECRET=<strong-random-secret>
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_CALLBACK_URL=https://payeazie-backend.onrender.com/api/auth/google/callback
FRONTEND_URL=https://payeazie.netlify.app
LOG_LEVEL=info
```

#### Step 3: Deploy

Render auto-deploys on push to `master` branch. Monitor logs in Render dashboard.

### Frontend Deployment (Netlify)

#### Step 1: Create Netlify Site

1. Go to https://app.netlify.com/
2. Click **"Add new site"** → **"Import an existing project"**
3. Connect GitHub and select repository
4. Configure:
   - **Base directory:** `frontend`
   - **Build command:** `npm run build`
   - **Publish directory:** `frontend/dist`
   - **Branch:** `master`

#### Step 2: Set Environment Variables

Add in Netlify dashboard:

```env
VITE_API_URL=https://payeazie-backend.onrender.com
```

#### Step 3: Custom Domain (Optional)

1. Go to **Domain settings**
2. Add custom domain: `payeazie.netlify.app` (or your domain)
3. Netlify auto-provisions SSL certificate

### Database Setup (Supabase)

1. Create project at https://supabase.com/dashboard
2. Navigate to **Database** → **Connection String**
3. Copy Session Pooler URL (for compatibility with IPv4):
   ```
   postgresql://postgres.xxx:pass@aws-0-region.pooler.supabase.com:5432/postgres
   ```
4. Run migrations manually or via CI/CD

### Redis Setup (Upstash)

1. Create database at https://console.upstash.com/
2. Copy connection string with TLS:
   ```
   rediss://default:password@host.upstash.io:6379
   ```
3. Test connection:
   ```bash
   node backend/test-redis-upstash.js
   ```

### Google OAuth Configuration

1. Go to https://console.cloud.google.com/apis/credentials
2. Select your OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - **Development:** `http://localhost:3467/api/auth/google/callback`
   - **Production:** `https://payeazie-backend.onrender.com/api/auth/google/callback`
4. Add authorized JavaScript origins:
   - `https://payeazie.netlify.app`
5. Save and wait 5-10 minutes for propagation

---

## ⚙️ CI/CD Pipeline

### GitHub Actions Workflow

**File:** `.github/workflows/backend-ci-cd.yml`

```yaml
name: Backend CI/CD Pipeline

on:
  push:
    branches: [staging, master]
    paths: ['backend/**', '.github/workflows/backend-ci-cd.yml']
  pull_request:
    branches: [staging, master]

jobs:
  ci:
    name: CI - Build & Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      
      - name: Install dependencies
        run: npm ci
        working-directory: ./backend
      
      - name: Run tests
        run: npm test
        working-directory: ./backend
        env:
          NODE_ENV: test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info
  
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: ci
    if: github.ref == 'refs/heads/staging'
    steps:
      - uses: actions/checkout@v4
      - name: Run migrations
        run: node scripts/migrate.js
        working-directory: ./backend
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_STAGING }}
      
      - name: Deploy to Render
        run: echo "Render auto-deploys staging branch"
  
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: ci
    if: github.ref == 'refs/heads/master'
    environment:
      name: production
      url: https://payeazie-backend.onrender.com
    steps:
      - uses: actions/checkout@v4
      - name: Run migrations
        run: node scripts/migrate.js
        working-directory: ./backend
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      
      - name: Deploy to Render
        run: echo "Render auto-deploys master branch"
```

### Deployment Workflow

```
┌──────────────┐
│  Git Push    │
│  to master   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ GitHub       │
│ Actions      │
│ - Lint       │
│ - Test       │
│ - Build      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Run DB       │
│ Migrations   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Deploy to    │
│ Render       │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Health Check │
│ & Notify     │
└──────────────┘
```

### Rollback Strategy

If deployment fails:

1. **Render:** Use "Manual Deploy" → select previous commit
2. **Database:** Rollback migrations:
   ```bash
   psql $DATABASE_URL -f migrations/rollback_XXX.sql
   ```
3. **Frontend:** Netlify auto-keeps previous builds; revert via dashboard

---

## 🔒 Security & Observability

### Security Measures

#### Authentication & Authorization
- **Password Hashing:** bcrypt with salt rounds (10)
- **JWT Tokens:** HS256 algorithm, 7-day expiration
- **Secure Cookies:** HTTP-only, SameSite=Strict (production)
- **OAuth 2.0:** Google consent screen with profile + email scopes

#### API Security
- **Helmet:** Security headers (X-Frame-Options, CSP, HSTS)
- **CORS:** Whitelist frontend origin only
- **Rate Limiting:** 100 req/15min per IP (Redis-backed)
- **Input Validation:** Fastify schema validation on all endpoints
- **SQL Injection Prevention:** Parameterized queries via pg-promise

#### Infrastructure Security
- **Environment Variables:** Never committed to Git
- **Database:** TLS-encrypted connections (Supabase)
- **Redis:** TLS-enabled (Upstash rediss://)
- **HTTPS:** Enforced on all production endpoints (Let's Encrypt)

### Logging & Monitoring

#### Application Logs (Pino)
```javascript
logger.info({ userId, action: 'payment_created' }, 'Payment initiated');
logger.error({ err, paymentId }, 'Payment processing failed');
```

**Log Levels:**
- `trace` - Detailed debugging (not in production)
- `debug` - Development diagnostics
- `info` - General information (production default)
- `warn` - Warning conditions
- `error` - Error events
- `fatal` - Critical failures

#### Audit Trail
Every payment action logged to `payment_audit_log` table:
- User ID, payment ID, timestamp
- Old status → new status transitions
- Gateway responses, error messages
- Immutable records (no updates/deletes)

#### Health Monitoring

**Endpoint:** `GET /health`

Returns:
- Database connection status + latency
- Redis connection status
- Worker process status (charge, reconcile)
- Memory usage, uptime

**Example:**
```json
{
  "status": "healthy",
  "uptime": 86400,
  "services": {
    "database": { "status": "up", "latency": 12 },
    "redis": { "status": "up", "latency": 3 },
    "workers": { "charge": "active", "reconcile": "active" }
  }
}
```

#### Monitoring Stack (Future)
- **Sentry:** Error tracking and performance monitoring
- **Grafana + Prometheus:** Metrics dashboards
- **Uptime Robot:** Endpoint health monitoring
- **PagerDuty:** Incident alerting

---

## 💡 Challenges & Solutions

### Challenge 1: Google OAuth Redirect URI Mismatch

**Problem:** During deployment, Google OAuth failed with `Error 400: redirect_uri_mismatch`. The callback URL configured in development (`http://localhost:3467`) didn't match the production URL (`https://payeazie-backend.onrender.com`).

**Impact:** Users couldn't sign in with Google on the deployed application, breaking a key authentication flow.

**Solution:**
1. **Configured multiple redirect URIs** in Google Cloud Console to support both local and production environments:
   - `http://localhost:3467/api/auth/google/callback` (development)
   - `https://payeazie-backend.onrender.com/api/auth/google/callback` (production)

2. **Updated backend environment variables** on Render to use production callback URL:
   ```env
   GOOGLE_CALLBACK_URL=https://payeazie-backend.onrender.com/api/auth/google/callback
   ```

3. **Implemented environment-specific configuration** to dynamically set callback URLs based on `NODE_ENV`.

**Outcome:** OAuth flow now works seamlessly in both development and production. Learned to always configure staging/production OAuth URIs before deployment.

---

### Challenge 2: Redis Integration on Render

**Problem:** Render doesn't provide managed Redis. Initial attempts to use in-memory queues caused job loss during dyno restarts and prevented horizontal scaling.

**Impact:** Payment processing was unreliable—jobs would disappear if the backend restarted, leading to incomplete transactions.

**Solution:**
1. **Provisioned Upstash Redis** (cloud-hosted, TLS-enabled) for persistent queue storage.

2. **Configured BullMQ** to use external Redis with TLS:
   ```javascript
   const connection = {
     host: 'coherent-lemming-36797.upstash.io',
     port: 6379,
     password: process.env.REDIS_PASSWORD,
     tls: { rejectUnauthorized: false }
   };
   ```

3. **Tested connection** with `test-redis-upstash.js` script to verify connectivity before deploying workers.

4. **Separated worker processes** from the main API server to prevent blocking and enable independent scaling.

**Outcome:** Payment queues are now persistent, surviving server restarts. Jobs are processed reliably even under high load. Gained experience with distributed queue architectures.

---

### Challenge 3: Database Migrations in CI/CD

**Problem:** Early deployments succeeded but crashed at runtime due to missing database tables. Render was deploying code before running migrations, causing schema mismatches.

**Impact:** Production downtime (~15 minutes) while manually fixing schema via SQL console.

**Solution:**
1. **Added migration step** to GitHub Actions workflow that runs *before* deployment trigger:
   ```yaml
   - name: Run database migrations
     run: node scripts/migrate.js
     env:
       DATABASE_URL: ${{ secrets.DATABASE_URL }}
   ```

2. **Created idempotent migration scripts** using `CREATE TABLE IF NOT EXISTS` to prevent errors on re-runs.

3. **Implemented migration logging** to track which migrations have been applied:
   ```sql
   CREATE TABLE schema_migrations (
     version VARCHAR(255) PRIMARY KEY,
     applied_at TIMESTAMP DEFAULT NOW()
   );
   ```

4. **Set up Render deploy hooks** to only trigger after successful migration completion in CI.

**Outcome:** Zero-downtime deployments with guaranteed schema consistency. Migrations now run automatically on every production deploy. Learned the importance of schema versioning in CI/CD pipelines.

---

### Challenge 4: CORS Issues with Frontend/Backend Separation

**Problem:** After deploying frontend to Netlify and backend to Render, browser blocked API requests with CORS errors. The backend wasn't configured to accept requests from the Netlify domain.

**Impact:** Frontend couldn't communicate with backend—no login, no payments, complete system failure.

**Solution:**
1. **Configured CORS middleware** in Fastify to whitelist production frontend:
   ```javascript
   app.register(cors, {
     origin: [
       'http://localhost:3000',           // Development
       'https://payeazie.netlify.app'     // Production
     ],
     credentials: true
   });
   ```

2. **Set `FRONTEND_URL` environment variable** on Render to dynamically configure allowed origins.

3. **Enabled credentials** in frontend fetch calls:
   ```javascript
   fetch(url, { credentials: 'include' })
   ```

**Outcome:** Cross-origin requests now work correctly. Cookies and JWT tokens flow securely between frontend and backend. Gained deeper understanding of CORS policies and credential handling.

---

## 🚧 Future Enhancements

### Scalability
- [ ] **Horizontal Scaling:** Add load balancer with multiple backend instances
- [ ] **Read Replicas:** PostgreSQL read replicas for analytics queries
- [ ] **Caching Layer:** Redis caching for frequently accessed payments
- [ ] **CDN Integration:** Cloudflare for static asset delivery

### Features
- [ ] **Webhook Support:** Real-time payment notifications to merchants
- [ ] **Multi-Currency:** Support for EUR, GBP, JPY, etc.
- [ ] **Recurring Payments:** Subscription and billing cycles
- [ ] **Refund API:** Automated refund processing with audit trail
- [ ] **Admin Dashboard:** Real-time monitoring and analytics
- [ ] **Two-Factor Authentication:** SMS/TOTP for enhanced security

### Observability
- [ ] **Distributed Tracing:** OpenTelemetry integration
- [ ] **Custom Metrics:** Business KPIs (conversion rate, average transaction value)
- [ ] **Log Aggregation:** Centralized logging with Elasticsearch
- [ ] **Alerting:** PagerDuty integration for critical errors

### Developer Experience
- [ ] **API Documentation:** OpenAPI/Swagger spec
- [ ] **GraphQL API:** Alternative to REST for flexible querying
- [ ] **SDK Libraries:** JavaScript, Python, Go client libraries
- [ ] **Sandbox Environment:** Test mode with mock payment gateway

### Infrastructure
- [ ] **Kubernetes Deployment:** Migrate from Render to K8s cluster
- [ ] **Blue-Green Deployments:** Zero-downtime releases
- [ ] **Disaster Recovery:** Automated backups and restore procedures
- [ ] **Multi-Region:** Deploy in US, EU, Asia for lower latency

---

## 🤝 Contributing

Contributions are welcome! This is a portfolio project, but feedback and improvements are appreciated.

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes** and commit:
   ```bash
   git commit -m "Add amazing feature"
   ```
4. **Push to your fork:**
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open a Pull Request**

### Code Standards

- Follow existing code style (ESLint config)
- Write tests for new features
- Update documentation (README, API docs)
- Keep commits atomic and well-described

### Reporting Issues

Found a bug? Have a suggestion? [Open an issue](https://github.com/techmedaddy/payeazie/issues) with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)

---

## 📄 License

This project is licensed under the **ISC License** - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Umar Ejaz Imam**  
- GitHub: [@techmedaddy](https://github.com/techmedaddy)
- Email: umarejazimam69@gmail.com

---

## 🙏 Acknowledgments

- **Fastify Team** - For the blazing-fast HTTP framework
- **Supabase** - For managed PostgreSQL with great developer experience
- **Upstash** - For serverless Redis with generous free tier
- **Render & Netlify** - For seamless deployment platforms
- **Open Source Community** - For the amazing tools and libraries

---

## 📊 Project Stats

![GitHub stars](https://img.shields.io/github/stars/techmedaddy/payeazie?style=social)
![GitHub forks](https://img.shields.io/github/forks/techmedaddy/payeazie?style=social)
![GitHub issues](https://img.shields.io/github/issues/techmedaddy/payeazie)
![GitHub last commit](https://img.shields.io/github/last-commit/techmedaddy/payeazie)

---

<div align="center">

**⭐ If you found this project helpful, consider giving it a star!**

[Live Demo](https://payeazie.netlify.app/) • [Report Bug](https://github.com/techmedaddy/payeazie/issues) • [Request Feature](https://github.com/techmedaddy/payeazie/issues)

</div>
