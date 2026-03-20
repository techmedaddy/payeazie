# Payeazie Frontend

React + TypeScript frontend for the Payeazie payment orchestration demo.

This app provides the user-facing flow for authentication, payment creation, dashboard monitoring, and payment detail tracking.

## Stack

- React
- TypeScript
- Vite
- React Router
- Recharts
- Lucide icons

## Main Screens

- Login
- Register
- Dashboard
- Create Payment
- Payment Details
- Google OAuth callback

## What The Frontend Shows

- Email/password login and registration
- Google OAuth entry point
- Protected routes for authenticated users
- Dashboard with payment list, status filters, and charts
- Payment creation form with client-side validation
- Payment details page with status timeline and audit trail
- API health indicator in the main layout

## Run Locally

```bash
npm install
npm run dev
```

Default Vite dev server:

```bash
http://localhost:3000
```

## Environment

Set the backend base URL with:

```bash
VITE_API_URL=http://localhost:3467
```

If `VITE_API_URL` is not set, the app falls back to `http://localhost:3467`.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm test
npm run test:ui
npm run test:coverage
```

## Routing

The app uses `HashRouter`, which makes it friendly for static hosting setups such as Netlify.

Main routes:

- `/#/login`
- `/#/register`
- `/#/dashboard`
- `/#/create`
- `/#/payment/:id`
- `/#/auth/google/callback`

## App Structure

- `App.tsx` application routes and top-level providers
- `pages/` route-level screens
- `components/` shared UI and route guards
- `context/` auth and toast providers
- `hooks/` auth, payment polling, API health, and related hooks
- `services/` API wrapper and payment service layer
- `types.ts` shared frontend types

## Notes

- Auth tokens are stored in `localStorage`.
- The main payment details flow currently relies on polling.
- The backend exposes an SSE payment stream endpoint, but the primary UI path is still polling-based.
- The project is designed as a portfolio demo and currently favors clarity of flow over heavy optimization.
