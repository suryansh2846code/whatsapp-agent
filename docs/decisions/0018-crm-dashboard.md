# ADR 0018 — CRM dashboard: server-rendered, mobile-first + JSON API

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

Owners (mostly on phones) need to view and manage their leads and bookings —
statuses, notes, quick reply. This is CRM Phase 3, on top of D1 (ADR 0016) and
auth (ADR 0017).

## Decision

- **Server-rendered page + light JS**, not a React build pipeline. The Worker
  returns one HTML document (`src/dashboard/html.ts`) with inline CSS + a small
  amount of `fetch`-based JS. No bundler/static-assets machinery.
- **Mobile-first**: everything is a **card** (reads well on a phone), centred and
  roomy on desktop; tabs (Leads / Bookings), status filter chips, inline **status
  dropdown** + **notes** editing that saves via the API, and a one-tap
  **wa.me WhatsApp** link to reply.
- **Tenant-scoped JSON API** behind `requireAuth`: `GET /api/leads`,
  `GET /api/bookings`, `PATCH /api/leads/:id` (status/notes),
  `PATCH /api/bookings/:id` (status). Every query filters by the session's
  `business_id`; updates also check the row belongs to it.
- **Security:** 401 without a session; status values are whitelisted server-side;
  user data is rendered with `textContent` (never `innerHTML`) so it can't inject.

## Consequences

**Positive**
- Fast to build, no build step, works on mobile + desktop.
- Strict per-tenant isolation; safe against XSS and bad status values.

**Negative / accepted costs**
- Not a rich SPA (no client routing/offline). Fine for a CRM; can upgrade to
  React + Workers static assets later if needed.
- The page is an inline HTML string — a bit unwieldy as it grows.

## Alternatives considered

- **React SPA + Cloudflare static assets** — nicer for a large app, but a whole
  build pipeline. Deferred until the dashboard genuinely needs it.
