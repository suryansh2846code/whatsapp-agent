# ADR 0009 — Write leads via a Google service account

- **Status:** Accepted
- **Date:** 2026-08-08
- **Refines:** ADR 0005 (chose Google Sheets); this decides *how* we write.

## Context

ADR 0005 chose Google Sheets for leads. Two ways for the Worker to write:

1. **Apps Script webhook** — a script deployed per sheet as a URL; the Worker
   POSTs to it. Simple code, but per-client manual script + deploy, and an
   open URL needing a shared secret.
2. **Service account (official Sheets API)** — one agency "robot" Google account;
   share each client's sheet with it; the Worker signs a JWT to get an access
   token and calls the Sheets API.

Given ADR 0008 (concierge onboarding, agency owns the sheets), the deciding
factor is **per-client simplicity**: "create a sheet, share it" beats "deploy a
script per client".

## Decision

Use a **Google service account**. The Worker (`src/leads/google-sheets.ts`):
signs a **JWT** with the service account's private key (RS256 via the Workers
**Web Crypto** API), swaps it for a 1-hour **OAuth access token**, and calls the
Sheets API `values.append`. Credentials live in env (shared across clients); the
sheet ID is per-business in its config.

## Consequences

**Positive**
- Per-client onboarding is trivial: create a sheet, share it with the robot
  email, paste the sheet ID into the config.
- Official, robust, scales on one shared credential.
- Good, real engineering to understand (OAuth 2.0, JWT, service accounts).

**Negative / accepted costs**
- One-time crypto code (JWT signing) — written once, reused by all clients.
- A real secret (the private key) to guard; stored as a Worker secret, never
  committed.
- We mint a fresh token per write for simplicity (could cache the 1-hour token
  later if volume grows).

## Alternatives considered

- **Apps Script webhook** — simpler Worker code, but fiddlier per client and a
  weaker security model. Kept as a possible future adapter behind `LeadStore`.
