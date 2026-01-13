# Payeazie

> Production-grade payment orchestration demo that highlights enterprise authentication, idempotent payments, auditability, and cloud-native delivery.

[![Frontend](https://img.shields.io/badge/Frontend-React%2019-61dafb?logo=react&logoColor=white)](#1-project-overview)
[![Backend](https://img.shields.io/badge/Backend-Fastify%20%2B%20Node.js-339933?logo=node.js&logoColor=white)](#2-system-architecture)
[![Database](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3FCF8E?logo=postgresql&logoColor=white)](#4-low-level-design-lld)
[![Cache](https://img.shields.io/badge/Queues-Upstash%20Redis-dd0031?logo=redis&logoColor=white)](#4-low-level-design-lld)
[![Workers](https://img.shields.io/badge/Workers-BullMQ-orange)](#4-low-level-design-lld)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-0A0FFF?logo=githubactions&logoColor=white)](#8-cicd)
[![Deploy](https://img.shields.io/badge/Deploy-Render%20%2B%20Netlify-00C7B7?logo=render&logoColor=white)](#7-deployment-guide)

**Live Demo**
- Frontend (Netlify CDN): https://payeazie.netlify.app
- Backend API (Render): https://payeazie-backend.onrender.com

---

## Table of Contents
- [1. Project Overview](#1-project-overview)
- [2. System Architecture](#2-system-architecture)
- [3. High-Level Design (HLD)](#3-high-level-design-hld)
- [4. Low-Level Design (LLD)](#4-low-level-design-lld)
- [5. API Documentation](#5-api-documentation)
- [6. Dataflow & Sequence Diagrams](#6-dataflow--sequence-diagrams)
- [7. Deployment Guide](#7-deployment-guide)
- [8. CI/CD](#8-cicd)
- [9. Security & Observability](#9-security--observability)
- [10. Challenges & Resolutions](#10-challenges--resolutions)
- [11. Future Enhancements](#11-future-enhancements)

---

## 1. Project Overview

### What is Payeazie?
Payeazie is a full-stack reference implementation of a payment orchestration platform that mirrors the constraints of regulated fintech systems. It demonstrates multi-strategy authentication (email/password and Google OAuth), idempotent payment intent creation, BullMQ-backed async processing, comprehensive audit logging, and production-ready DevOps with Render, Netlify, Supabase, and Upstash.

### Demo Scope
- Showcase enterprise-ready patterns (zero-downtime deployments, blue/green-ready database migrations, rate limiting, and observability hooks).
- Provide engineers with an end-to-end template: frontend dashboard, backend API, workers, migration scripts, and tests.
- Give recruiters a narratable, metrics-focused story about architecture trade-offs, failure recovery, and developer experience.

### Key Features
- **Authentication:** Email/password with bcrypt, Google OAuth 2.0 via Passport.js, JWT session issuance, refresh token rotation, password reset flows.
- **Payments:** Idempotent payment intents, charge queue with retries, reconciliation worker, deterministic state transitions, mock/Stripe-compatible gateway client.
- **Audit & Compliance:** Append-only audit log spanning all state transitions, IP/user agent capture, immutable ledger approach with replay protection.
- **Performance & Reliability:** Upstash Redis-backed rate limiter (100 req / 15 min per IP), BullMQ concurrency controls, DLQ handoff, health probes for DB/Redis/workers.
- **Developer Experience:** Scripts for lint/test/migrate/seed, extensive unit + e2e test harnesses, local Supabase + Upstash parity using docker-compose.

### Tech Stack Snapshot
| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 6, TailwindCSS, React Router, TanStack Query |
| Backend API | Node.js 20, Fastify 5, Passport.js, pg-promise, Zod, Pino |
| Data & Infra | Supabase PostgreSQL, Upstash Redis, BullMQ workers, Google OAuth |
| Tooling | npm, ESLint, Prettier, Vitest, GitHub Actions, Netlify, Render |

---

## 2. System Architecture

### End-to-End Diagram
```mermaid
flowchart LR
    FE[React + Vite SPA]
    API[Fastify API (Render)]
    PG[(Supabase PostgreSQL)]
    REDIS[(Upstash Redis)]
    WORKERS[BullMQ Workers (charge/reconcile)]
    OAUTH[Google OAuth 2.0]
    GATEWAY[Mock/Stripe Gateway]

    FE -->|HTTPS| API
    API -->|SQL| PG
    API -->|rate limit / queues| REDIS
    REDIS --> WORKERS
    WORKERS --> PG
    WORKERS --> GATEWAY
    API --> OAUTH
    WORKERS -->|token refresh| OAUTH
```

### Component Breakdown
| Component | Responsibilities | Hosting |
| --- | --- | --- |
| Frontend SPA | Auth flows, payment dashboard, audit timeline, health probes UI | Netlify + Netlify Edge CDN |
| Fastify API | REST surface, validation, JWT issuance, payment orchestration, audit logging | Render Web Service |
| Workers | BullMQ charge + reconcile workers, DLQ monitor, rate-limit resets | Render background worker dynos |
| PostgreSQL | Users, payments, events, audit, password resets | Supabase managed Postgres |
| Redis | BullMQ job store, rate limiter state, pub/sub notifications | Upstash Redis (TLS) |
| External Services | Google OAuth, mock/Stripe gateway, email provider (Nodemailer/SES) | Google Cloud + Mock service |
| CI/CD | Test + deploy pipelines, status reporting | GitHub Actions + Netlify deploy hooks |

---
