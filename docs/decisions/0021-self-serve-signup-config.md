# ADR 0021 — Self-serve signup + dashboard configuration

- **Status:** Accepted
- **Date:** 2026-08-10
- **Builds on:** ADR 0020 (businesses in D1).

## Context

With businesses in D1, a new owner should be able to sign up and configure their
bot entirely from the dashboard — no code, no deploy.

## Decision

- **Signup (B):** on Google login, if no business owns that email, **create one**
  (`upsertBusiness` with a generated id, the owner's email, and sensible
  defaults) and log them in. Open signup — anyone with a Google account can
  create a business.
- **Configuration (C):** the dashboard **Settings** tab now edits `displayName`,
  `whatsappPhoneNumberId`, `languages`, `knowledge`, and `fallbackMessage`.
  `PATCH /api/settings` upserts the whole business row; routing then follows the
  new WhatsApp number ID.

## Consequences

**Positive**
- A business can onboard + fully configure itself from the dashboard.
- Config changes (name, number, knowledge) are instant — no redeploy.

**Negative / accepted costs**
- **Open signup:** anyone can create a business/account. Fine pre-revenue; gate
  or add billing before a public launch.
- The **WhatsApp number connection is still manual** — the owner pastes the
  phone number ID after connecting the number in Meta. Automating it needs Meta
  Embedded Signup (Tech Provider verification), a separate external effort.
- A new business starts with an empty WhatsApp number ID, so it can't receive
  messages until the owner sets it.

## Alternatives considered

- **Invite-only signup** (only pre-seeded emails) — safer but not self-serve;
  can be layered back on as gating later.
