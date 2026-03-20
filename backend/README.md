# Payeazie Backend

Fastify API for the Payeazie payment orchestration demo.

This service handles authentication, payment creation, audit logging, background job scheduling, worker startup, and health/metrics endpoints. Payments are persisted in PostgreSQL and processed asynchronously through Redis-backed BullMQ queues.

## Stack

- Node.js
- Fastify
- PostgreSQL with `pg-promise`
- Redis with BullMQ
- JWT authentication
- Passport Google OAuth
- Pino logging

## Responsibilities

- Register and log in users
- Validate JWTs for protected routes
- Create payments with idempotency support
- Queue payment charge jobs
- Start charge and reconciliation workers
- Track payment status transitions and audit logs
- Expose health and metrics endpoints

## Run Locally

```bash
npm install
cp .env.example .env
npm start
```

Default local port:

```bash
3467
```

Minimum environment variables:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/payeazie
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me
PORT=3467
NODE_ENV=development
```

Optional integrations:

- Google OAuth via `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- Password reset email via SMTP variables

## Available Scripts

```bash
npm start
npm test
npm run test:watch
npm run test:coverage
npm run db:init
npm run db:migrate
npm run db:setup
```

There are also several shell and JS verification scripts in `scripts/` and the backend root for manual testing and demos.

## Startup Behavior

On startup the backend:

1. Loads environment variables
2. Runs SQL migrations from `backend/migrations`
3. Verifies PostgreSQL and Redis connectivity
4. Starts BullMQ workers
5. Starts the Fastify server
6. Schedules periodic reconciliation jobs

## Key Routes

Health and metrics:

- `GET /`
- `GET /health`
- `GET /health/detailed`
- `GET /metrics`
- `GET /metrics/summary`

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`

Payments:

- `GET /api/payments`
- `GET /api/payments/:paymentId`
- `POST /api/payments`
- `POST /api/payments/intents`
- `GET /api/payments/:paymentId/audit`
- `GET /api/payments/:paymentId/stream`
- `POST /api/payments/reconcile`
- `POST /api/payments/webhook`

Audit:

- `GET /api/audit-logs`
- `GET /api/audit-logs/:paymentId`

## Core Backend Modules

- `src/api/` route handlers, controllers, and middleware
- `src/core/idempotency/` payment creation and duplicate request handling
- `src/core/status-transition/` transition validation, audit logging, pub/sub events
- `src/workers/` charge and reconciliation workers
- `src/utils/queue.js` BullMQ queue and worker helpers
- `src/db/` database bootstrap and model helpers

## Data Model Overview

Main tables created by migrations:

- `payments`
- `payment_audit_log`
- `events`
- `users`
- `password_resets`

Payment lifecycle statuses used by the app:

- `pending`
- `processing`
- `succeeded`
- `failed`
- `refunded`

## Notes

- The gateway client is mocked for demo purposes.
- The frontend currently polls payment status, while the backend also exposes an SSE endpoint.
- This backend is written in CommonJS JavaScript.
