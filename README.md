# Payeazie

Payeazie is a full-stack payment orchestration demo built as a portfolio project. It simulates a small payments platform with authenticated users, idempotent payment creation, background workers, audit logs, and a React dashboard for tracking payment state.

The goal of the project is not to integrate a real gateway yet, but to show how a payment flow can be structured across an API, database, queue, workers, and frontend.

## Stack

- Backend: Node.js, Fastify, BullMQ, pg-promise, Redis, PostgreSQL
- Frontend: React, TypeScript, Vite, React Router
- Auth: JWT, email/password login, Google OAuth support
- Observability: structured logging, health endpoints, in-memory metrics

## What The App Does

- Registers and logs in users
- Protects payment routes with JWT auth
- Creates payments with idempotency support
- Queues background charge jobs in Redis via BullMQ
- Transitions payments through `pending`, `processing`, `succeeded`, and `failed`
- Writes status changes to an audit log
- Shows a dashboard, payment details page, and audit trail in the frontend

## Repo Layout

```text
.
├── backend/    Fastify API, workers, DB models, migrations, tests, scripts
├── frontend/   React app with auth, dashboard, create-payment, details pages
└── README.md   Project overview
```

## Architecture

```text
Frontend (React)
    |
    | REST API
    v
Backend (Fastify)
    |
    | PostgreSQL writes + BullMQ jobs
    v
PostgreSQL <----> Redis
    ^              |
    |              |
    +------ Workers (charge + reconcile)
```

## Main Flow

1. A signed-in user creates a payment from the frontend.
2. The backend stores a `pending` payment and enqueues a charge job.
3. The charge worker moves the payment to `processing`, simulates a gateway call, and writes the final status.
4. Each valid transition is recorded in `payment_audit_log`.
5. The frontend polls the payment details endpoint and shows the latest state.

## Local Development

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Required backend environment variables:

```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-me
PORT=3467
```

The backend runs database migrations on startup and then starts the API server and workers.

Useful endpoints:

- `GET /health`
- `GET /health/detailed`
- `GET /metrics`
- `GET /metrics/summary`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/payments`
- `POST /api/payments`
- `POST /api/payments/intents`
- `GET /api/payments/:paymentId`
- `GET /api/payments/:paymentId/audit`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend environment variable:

```bash
VITE_API_URL=http://localhost:3467
```

The frontend uses a `HashRouter`, so the main routes look like:

- `/#/login`
- `/#/register`
- `/#/dashboard`
- `/#/create`
- `/#/payment/:id`

## Notes

- The backend currently uses JavaScript, not TypeScript.
- The frontend is TypeScript-based.
- The payment gateway is mocked.
- The primary UI currently relies on polling for status updates, though the backend also exposes an SSE stream endpoint.
- This project is aimed at demonstrating architecture and implementation decisions, not payment compliance or production gateway integration.

## Why This Project Works Well As A Portfolio Piece

- It goes beyond CRUD by showing async processing and system design thinking.
- It demonstrates practical backend concerns like idempotency, auth, retries, and auditability.
- It includes both API and UI work, which helps in entry-level full-stack interviews.

## Current Focus

The strongest parts of the project are the backend flow, worker orchestration, and overall scope. The best next step for polish is keeping the docs, routes, tests, and frontend/backend contracts tightly aligned.
