# ADR 0008 — Concierge onboarding for v1 (agency-operated)

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

Question: when a new business joins, who does the setup? Two models:

1. **Concierge / agency-operated** — the business gives us info; *we* wire it up
   (config file, sheet, WhatsApp number) and deploy.
2. **Self-serve SaaS** — the business signs up themselves on a dashboard,
   "connects" their Google + WhatsApp accounts, and provisions their own tenant.

Self-serve is much larger: it needs a web dashboard, a **tenant database**
(businesses can't edit our code, so tenants must be created at runtime, not in
committed config files), a **Google OAuth** consent flow, per-business token
storage, and WhatsApp **Embedded Signup**. That's building a SaaS.

## Decision

For v1, use **concierge onboarding**: the business provides their **Gmail** and
**WhatsApp number**; the agency does the wiring (create+share a sheet, write the
`knowledge`, connect the number, add a config, deploy). Keep the tenant model
clean so it can evolve into self-serve later without a rewrite.

## Consequences

**Positive**
- No dashboard/OAuth/DB to build — fastest path to a first paying client.
- We learn exactly what each onboarding needs by doing it by hand first — the
  classic thing you automate *after* you understand it.
- From the client's view it's still "give us your Gmail + number to start."

**Negative / accepted costs**
- Each new client is manual work for us (doesn't scale to hundreds without more
  automation). Fine at crawl volumes.
- Adding a client requires editing config + a deploy (not a runtime action yet).

## Alternatives considered

- **Self-serve dashboard now** — the eventual "run" phase. Rejected for v1:
  large scope, and premature before we've onboarded anyone by hand.

## Path to self-serve (later)

Move tenants from config files → a database; add a signup dashboard; replace the
agency service account with per-business **Google OAuth**; use WhatsApp Embedded
Signup. The `LeadStore` / config abstractions are designed so these are additions,
not rewrites.
