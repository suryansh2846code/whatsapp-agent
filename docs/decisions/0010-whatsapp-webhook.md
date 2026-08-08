# ADR 0010 — WhatsApp webhook: fast-ack, text-only, background processing

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

The final v1 piece: receive real WhatsApp messages and drive the brain + lead
capture. Meta's Cloud API has two webhook interactions:

- **Verification** — a one-time GET with `hub.mode` / `hub.verify_token` /
  `hub.challenge`. We echo the challenge only if the token matches ours.
- **Inbound messages** — POSTs with a deeply nested payload that also includes
  non-message events (delivery/read statuses).

Meta **retries** a webhook if we don't respond quickly, which risks processing
the same message twice.

## Decision

- **Fast-ack:** parse the payload, return `200` immediately, and do the real
  work (brain → reply → lead) in the background via `ctx.waitUntil()`.
- **Text-only for v1:** `parseIncomingMessages` ignores anything that isn't an
  inbound text message (statuses, images, etc.).
- **Per-message isolation:** each message is processed in its own try/catch so
  one failure doesn't sink a batch.
- **Route by `metadata.phone_number_id`** → `findBusinessByPhoneNumberId` (the
  multi-tenant key).

## Consequences

**Positive**
- Quick 200 avoids Meta retrying and double-sending.
- Replies stay inside WhatsApp's 24-hour customer-service window (we only reply
  to inbound messages), so no paid message templates are needed in v1.
- The webhook code is provider-shaped but the vendor sits behind the WhatsApp
  adapter (ADR 0003).

**Negative / accepted costs**
- With fast-ack, if background work fails *after* we've 200'd, Meta won't retry —
  we log and move on (acceptable for v1; a queue could add retries later).
- We currently save a lead per inbound message → possible duplicate rows for a
  chatty sender. De-duping is a later enhancement.

## SECURITY: webhook signature verification (RESOLVED 2026-08-08)

The `POST /webhook` endpoint now verifies Meta's `X-Hub-Signature-256` header:
an HMAC-SHA256 over the raw body keyed by the **app secret** (`WHATSAPP_APP_SECRET`),
compared in constant time (`src/whatsapp/verify.ts`). We read the raw body first
(not `request.json()`) so the bytes match what Meta signed, and **fail closed**
(reject) if the secret is unset or the signature is missing/wrong.

Verified locally: valid signature → 200; missing signature → 401; wrong
signature → 401.
