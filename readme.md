# payeazie

Node.js/Fastify payments microservice focused on idempotent payment intent creation, payment orchestration, gateway interaction, webhook processing, and reconciliation backed by PostgreSQL and Redis/BullMQ.

## Highlights
- Idempotent payment intents enforced by Postgres unique constraints and the `idempotency.service` resolver.
- Ledger-style `payments` table plus webhook event journal (`gateway_events`) to dedupe asynchronous callbacks.
- Payment orchestrator coordinates gateway calls, background charge execution, and status transitions with strict state guards.
- BullMQ workers (`payment-charge` queue) execute gateway charges and scheduled reconciliation, both backed by Redis 7+.
- Structured logging via `pino` and dependency-light Fastify API surface for easy embedding.

## Architecture
- **API layer (`server.js`, `src/api`)** – Fastify routes for payment intents, status reads, and webhook ingestion.
- **Idempotency service (`src/core/idempotency`)** – Performs `INSERT ... ON CONFLICT DO NOTHING` writes to guarantee a single ledger row per `(order_id, idempotency_key)` pair.
- **Payment orchestrator (`src/core/orchestrator`)** – Applies gateway results, validates state transitions, and reacts to webhook signals.
- **Background workers (`src/workers`)** – `charge.worker` consumes BullMQ jobs, `reconcile.worker` polls the gateway to correct drift.
- **Webhook handler (`src/api/controllers/webhook.controller.js`)** – Deduplicates events via the `gateway_events` table before promoting status updates.
- **Postgres ledger (`src/db`)** – `payments` table stores amounts, statuses, and gateway IDs with unique + foreign key constraints to keep mutations safe.

## Project layout
```
package.json
server.js
src/
	api/
		controllers/
			payment.controller.js
			webhook.controller.js
		routes/
			payment.routes.js
	core/
		idempotency/
			idempotency.service.js
		orchestrator/
			payment.orchestrator.js
	db/
		index.js
		models/
			event.model.js
			payment.model.js
	utils/
		gateway-client.js
		logger.js
		queue.js
	workers/
		charge.worker.js
		reconcile.worker.js
```

## Prerequisites
- Node.js 18+
- PostgreSQL 14+ with the `pgcrypto` extension (for `gen_random_uuid()`)
- Redis 7+ (BullMQ backend)
- Access to a payment gateway or the included mock client

## Setup
Install dependencies:

```powershell
npm install
```

Create a `.env` file with the variables listed below (sample values shown):

```powershell
@"
DATABASE_URL=postgres://postgres:postgres@localhost:5432/payeazie
REDIS_URL=redis://localhost:6379
PORT=3000
LOG_LEVEL=debug
"@ | Out-File -Encoding utf8 .env
```

## Environment variables
| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres connection string consumed by `pg-promise`. | `postgres://postgres:postgres@localhost:5432/payeazie` |
| `REDIS_URL` | ✅ | Redis URI for BullMQ workers/queues. | `redis://localhost:6379` |
| `PORT` | ➖ | Fastify listen port; defaults to `3000`. | `8080` |
| `LOG_LEVEL` | ➖ | `pino` log level. | `info` |

## Database
Run migrations using your preferred tool. The schema implied by `src/db/models` is:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS payments (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		order_id UUID NOT NULL,
		idempotency_key UUID NOT NULL,
		amount BIGINT NOT NULL,
		currency VARCHAR(3) NOT NULL,
		status VARCHAR(20) NOT NULL DEFAULT 'processing',
		gateway_charge_id TEXT UNIQUE,
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_idempotency
		ON payments (order_id, idempotency_key);

CREATE TABLE IF NOT EXISTS gateway_events (
		event_id TEXT PRIMARY KEY,
		payload JSONB NOT NULL,
		created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Example (psql) migration run:

```powershell
psql $env:DATABASE_URL -f ./schema.sql
```

## Running services
- **API server** – starts Fastify, connects to Postgres, exposes `/payments/intent`, `/payments/webhook`, and `/health`.

```powershell
node server.js
```

- **Charge worker** – attaches to the `payment-charge` BullMQ queue and executes gateway charges.

```powershell
node src/workers/charge.worker.js
```

Enqueue jobs from the API or a script:

```javascript
const { createQueue } = require('./src/utils/queue');
await createQueue('payment-charge').add('charge', { paymentId });
```

- **Reconciliation worker** – polls payments created within the last 24h and re-syncs with the gateway; schedule via cron or task runner.

```powershell
node -e "require('./src/workers/reconcile.worker').runReconciliation()"
```

## Idempotency model
- `idempotency.service.resolve()` inserts a payment row with `(order_id, idempotency_key)` and returns the new row when the insert succeeds.
- On conflict, Postgres returns `null`; the service then fetches the existing row, ensuring the same payload is returned for repeated requests.
- Ledger status transitions are validated in `payment.orchestrator` using `ALLOWED_TRANSITIONS`, preventing webhook replays or race conditions from moving a payment backwards.
- The `gateway_events` table captures webhook IDs, so duplicate events are acknowledged without mutating the ledger.

## Sequence diagrams

### Payment intent creation flow
```mermaid
sequenceDiagram
		participant Client
		participant API as Fastify API
		participant Idempotency
		participant PG as Postgres
		participant Queue as BullMQ (payment-charge)

		Client->>API: POST /payments/intent
		API->>Idempotency: resolve(orderId, key, amount, currency)
		Idempotency->>PG: INSERT payment (ON CONFLICT DO NOTHING)
		PG-->>Idempotency: payment row (new or existing)
		Idempotency-->>API: payment payload
		API->>Queue: enqueue { paymentId }
		API-->>Client: 200 { id, status }
```

### Charge worker flow
```mermaid
sequenceDiagram
		participant Queue as BullMQ
		participant Worker as charge.worker
		participant PG as Postgres
		participant Gateway

		Queue-->>Worker: job { paymentId }
		Worker->>PG: SELECT ... FOR UPDATE SKIP LOCKED
		Worker->>Gateway: createCharge(amount, currency, idempotency_key)
		Gateway-->>Worker: charge result + status
		Worker->>PG: UPDATE payments SET gateway_charge_id,status
		Worker-->>Queue: job completed
```

### Webhook dedupe flow
```mermaid
sequenceDiagram
		participant Gateway
		participant API as /payments/webhook
		participant Events as gateway_events
		participant Orchestrator

		Gateway->>API: webhook event { id, chargeId, status }
		API->>Events: INSERT event_id ON CONFLICT DO NOTHING
		Events-->>API: null (duplicate?)
		API->>Orchestrator: applyWebhookUpdate(chargeId, status)
		Orchestrator->>Orchestrator: validate transition
		Orchestrator->>PG: UPDATE payments status
		API-->>Gateway: 200 OK
```

### Reconciliation flow
```mermaid
sequenceDiagram
		participant Scheduler
		participant Recon as reconcile.worker
		participant PG as Postgres
		participant Gateway

		Scheduler->>Recon: trigger run
		Recon->>PG: SELECT payments needing sync
		loop each payment
				Recon->>Gateway: fetchCharge(gateway_charge_id)
				Gateway-->>Recon: latest status
				Recon->>PG: UPDATE payments (if drift)
		end
		Recon-->>Scheduler: run complete
```

## Operational notes
- Health check lives at `/health` for probes.
- Use `LOG_LEVEL=debug` during integration to capture SQL + worker chatter; switch to `info` in production.
- The included gateway client is deterministic; replace `src/utils/gateway-client.js` with a real provider while preserving the same method signatures.
