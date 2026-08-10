# ADR 0017 — Owner dashboard auth via Google sign-in + D1 accounts

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

The CRM dashboard shows customer data, so owners must log in and see only their
own business. Owners already use Gmail, and we want low friction (not an email
click every time) plus a real **account record** in our database.

## Decision

**Google sign-in** (server-side OAuth authorization-code flow) + accounts in D1:

- `GET /auth/login` → redirect to Google (scope `openid email`, random `state`
  in KV for CSRF).
- `GET /auth/callback` → verify state → exchange the code with Google
  (server-to-server) → read the verified email → it **must match a business's
  `ownerEmail`** (else denied) → **upsert an `accounts` row in D1** (email →
  business_id) → create a session → redirect to `/dashboard`.
- **Sessions** live in the `SESSIONS` KV (30-day TTL) behind an HttpOnly,
  SameSite=Lax cookie (Secure in prod). `readSession` gives every request its
  `{ email, businessId }` — the tenant scope.
- `GET /auth/logout` clears it.

The `id_token` is trusted without a separate signature check because it comes
directly from Google's token endpoint over TLS.

## Consequences

**Positive**
- One-click login, no passwords, long session (rare re-auth).
- A persistent account in D1 (a step toward self-serve).
- Reuses the existing Google Cloud project.

**Negative / accepted costs**
- Depends on Google; the OAuth consent screen in "testing" mode only allows
  added test users until the app is verified.
- Businesses still live in config; login is gated by matching `ownerEmail`
  (moving businesses into D1 is a later step).
- Client secret is one more secret to manage.

## Alternatives considered

- **Magic link** — no passwords, but the occasional inbox trip; owners disliked
  re-clicking. Rejected in favour of Google.
- **Email + password** — password hashing + reset flows to build/own. Rejected.
