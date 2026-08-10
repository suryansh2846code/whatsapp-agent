# ADR 0020 — Businesses in D1 (self-serve foundation)

- **Status:** Accepted
- **Date:** 2026-08-10
- **Supersedes:** ADR 0019's `business_settings` (folded into `businesses`).

## Context

Businesses lived in the code config, so adding/editing one needed a code change
+ deploy. Full self-serve (owners signing up and configuring themselves) needs
businesses to live in the database.

## Decision

- New D1 **`businesses`** table (id, display_name, owner_email,
  whatsapp_phone_number_id, languages, knowledge, fallback_message, timestamps).
- **D1-first, config-fallback** lookups (`businesses/store.ts`):
  `getBusinessById` / `getBusinessByPhoneNumberId` / `getBusinessByOwnerEmail`
  read D1, and fall back to the code config if there's no row — so un-migrated
  businesses keep working unchanged.
- The returned business is the **effective** record (D1 override else config),
  including `knowledge` / `fallbackMessage` — so `business_settings` and the
  separate "effective settings" step are retired.
- **Editing any field** (e.g. dashboard Settings) calls `upsertBusiness`, which
  writes the whole row — **promoting** a config business into D1.
- Routing (webhook), auth (login by email), and the dashboard all now read
  through the store (async).

## Consequences

**Positive**
- Foundation for self-serve signup + full dashboard configuration.
- Zero behaviour change for existing businesses (config fallback); the first edit
  promotes them into D1.

**Negative / accepted costs**
- A business now spans code (seed) + D1 (live, wins once promoted).
- `business_settings` table is left unused; the code config stays as the seed.
- **Not** self-serve for the WhatsApp *number* connection — that needs Meta
  Embedded Signup (Tech Provider verification), a separate external effort. For
  now the phone number ID is entered manually.

## Alternatives considered

- **Full migrate + seed config into D1 up front** — riskier (escaping the
  knowledge blob, one-shot cutover). The fallback approach is incremental and
  safe.
- **Keep businesses in code** — blocks self-serve. Rejected.
