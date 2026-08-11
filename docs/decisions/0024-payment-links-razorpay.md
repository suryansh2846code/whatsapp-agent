# ADR 0024 — Payment links via Razorpay (first tool handler)

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

The generic action engine (ADR 0022) collects info, but some actions need to
*do something external* — the first being **take a payment**. This is the first
"tool handler": a step that reaches an outside service.

## Decision

**Owner-driven amount** (the bot doesn't know prices), Razorpay for the rest:

1. Bot collects the order → a submission (as today).
2. In the dashboard **Requests** card, the owner taps **"Send payment link"** and
   enters the amount.
3. Backend creates a **Razorpay payment link**, stores it on the submission
   (`amount`, `payment_link_id`, `payment_status = pending`), and **sends the link
   to the customer on WhatsApp** (they just ordered → inside the 24h window, so a
   free-form send works).
4. Customer pays on Razorpay's hosted page.
5. **Razorpay webhook** (`POST /webhook/razorpay`, HMAC-SHA256 verified with the
   webhook secret, reusing our signature pattern) → the submission is marked
   **paid**; the dashboard shows 💰.

Secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
(all optional — no keys = payments simply disabled).

## Consequences

**Positive**
- Real payments + automatic confirmation, monetizable.
- Owner-in-the-loop for the amount is reliable (no fragile price inference).
- Reuses the webhook/HMAC pattern; plugs into the action framework cleanly.

**Negative / accepted costs**
- Needs a Razorpay account + keys + a configured webhook.
- Sending the link to the customer relies on the 24h window (a business-initiated
  send later would need a WhatsApp template).
- v1 amount is manual per request (auto-send with a fixed price is an easy later
  add).

## Alternatives considered

- **UPI deep-link** (`upi://pay?…`) — no account needed, but can't confirm payment
  or track status. Rejected.
- **Auto-send on completion with a fixed price** — fine for flat-price actions;
  deferred (most shops price per order).
