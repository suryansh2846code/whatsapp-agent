# ADR 0016 — Move leads/bookings to Cloudflare D1 (CRM data store)

- **Status:** Accepted
- **Date:** 2026-08-10
- **Supersedes (as source of truth):** ADR 0005 / 0009 (Google Sheets)

## Context

We're building an owner **dashboard + CRM**. That needs queries, statuses,
notes, and filtering — Google Sheets is fine for "open a spreadsheet" but poor as
a CRM database (weak queries, eventual-consistency races, no relations). We need
a real database that lives on our stack.

## Decision

Use **Cloudflare D1** (SQLite) as the source of truth for leads and bookings:

- Two tables scoped by `business_id`, each **UNIQUE(business_id, phone)**:
  `leads` (with `status`, `notes`, `messages`, `message_count`) and `bookings`
  (with `status`, `requested_time`).
- New adapters `leads/d1.ts` + `bookings/d1.ts` implement the *existing*
  `LeadStore` / `BookingStore` interfaces — the bot code is unchanged; only the
  factory switches Sheets → D1 (the adapter pattern paying off).
- Phones are normalised (digits only) so dedup is reliable.
- Businesses stay in code config for now; auth (next) maps `ownerEmail` →
  `business.id`.

## Consequences

**Positive**
- Real queries + CRM fields (status/notes) — the foundation the dashboard needs.
- **Strong consistency** — the upsert is atomic, so the dedup **race condition**
  we'd accepted with Sheets/KV is gone.
- Same interfaces → no change to the brain/webhook/voice/alert code.

**Negative / accepted costs**
- The owner loses the "just open a spreadsheet" view — the dashboard replaces it.
  (Sheets adapters are kept parked for an optional export.)
- Old Sheets rows aren't migrated (they were test data); D1 starts fresh.
- A schema to maintain (`schema.sql`) and migrations to apply on changes.

## Alternatives considered

- **Keep Sheets, build UI on top** — faster to a viewer, but a CRM on Sheets gets
  slow/messy and limits features. Rejected as the store.
- **Durable Objects** — great for per-key coordination, but D1 fits tabular CRM
  data and cross-record queries far better.
