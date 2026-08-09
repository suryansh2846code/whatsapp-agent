# ADR 0015 — Owner booking alerts via Resend (email)

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

A lead sitting in a sheet isn't enough — the owner needs to know *now* so they
can call back while the parent is warm (speed-to-lead drives conversion). The
ideal channel is WhatsApp, but business-initiated WhatsApp messages need
Meta-approved **templates** (a review process), so that's deferred.

## Decision

Email the owner on a **new or updated** booking, via **Resend**:

- `ownerEmail` per business config; no email → no alert.
- `RESEND_API_KEY` is an agency-wide secret; `ALERT_FROM_EMAIL` defaults to
  Resend's test sender (`onboarding@resend.dev`).
- Sent **after** replying to the parent, and **non-fatal** — a failed email is
  logged but never breaks the bot.
- Only `created` / `updated` bookings alert; an `unchanged` follow-up
  ("ok thanks") does not.

## Consequences

**Positive**
- Instant, reliable owner notification with no Meta template dependency.
- Simple `fetch` to Resend; free tier covers early volume.

**Negative / accepted costs**
- Resend **test mode** only delivers to the account's own email; to alert an
  arbitrary client owner you must **verify a domain** in Resend.
- Email can land in spam; WhatsApp alerts (future, template-based) are more
  immediate for the owner.
- One more vendor + key to manage.

## Alternatives considered

- **WhatsApp template alert to the owner** — the eventual best channel, but needs
  template approval. Planned as an addition, not a replacement.
- **Owner dashboard / push** — heavier; deferred to the scaling phase.
