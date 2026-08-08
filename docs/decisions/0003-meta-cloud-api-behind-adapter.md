# ADR 0003 — Meta WhatsApp Cloud API, behind an adapter

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

To send/receive on WhatsApp Business, you go through the **WhatsApp Business
Platform**. There are two doors:

1. **Meta's own WhatsApp Cloud API** — talk straight to Meta.
2. **A BSP** (Business Solution Provider — Twilio, Gupshup, 360dialog…) — a
   middleman that wraps Meta's API in a friendlier one, for a markup.

We're selling to small clients with thin margins, and we'll replicate across
many of them.

## Decision

Use the **Meta Cloud API directly** for v1. Crucially, **hide it behind our own
WhatsApp adapter** — one module the rest of the app talks to, so the rest of the
code never knows which provider is underneath.

## Consequences

**Positive**
- No middleman markup — we keep margin on every client.
- Official, first-party; a **free test number** lets us build v1 today without a
  real client.
- The **adapter** means swapping to a BSP later = rewrite one module, not the app
  (loose coupling).

**Negative / accepted costs**
- We own the Meta setup per client: business verification, number registration,
  and managing message templates. Fiddly the first time.

## Alternatives considered

- **A BSP (Twilio/Gupshup)** — easier onboarding and support, but a per-message
  markup and another dependency. The adapter keeps this option open if Meta's
  setup ever becomes a real blocker.

## Real-world note (not a code decision)

For a live client, the WhatsApp number is usually the **client's** business
number, managed through our Meta account. For building v1, Meta's free test
number is enough.
