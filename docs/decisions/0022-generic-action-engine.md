# ADR 0022 — Generic configurable action engine

- **Status:** Accepted
- **Date:** 2026-08-10
- **Supersedes:** the hardcoded booking (ADR 0012) — booking is now one action.

## Context

Hardcoding each vertical (visit booking, then orders, quotes, reservations…)
doesn't scale — every business is different. We want **features as data**: define
an action once, and the same engine carries it out. This is the "agent for
everything" foundation.

## Decision

- **Actions are data.** Each business has `actions: ActionDef[]`
  (`{ key, label, description, fields:[{key,label,required}], confirmation }`),
  stored as JSON on the business record (loaded with the business — no extra
  read).
- **One structured LLM call per message** (`brain/agent.ts`) decides *question vs
  which action* and extracts field values. **Code owns the rules:** which
  required fields are still missing, when it's complete, and the **templated
  confirmation** (so the bot never over-promises). The LLM only understands,
  extracts, and phrases the next question.
- **Multi-turn via a small `pending` state** (`{ action, collected }`) kept in the
  KV conversation memory — the agent extracts incrementally and asks for what's
  missing. This also removes the old double-submit (a follow-up "ok" isn't a new
  action, and pending clears on completion).
- **One generic `submissions` table** (business_id, action_key, data JSON,
  status) holds every vertical's results. The dashboard "Requests" tab lists them
  with the collected fields + status. Owner alert generalized to any action.
- **Retired:** `brain/booking.ts`, the `bookings` table path, and the separate
  `business_settings`/effective-settings (folded into the business record).

## Consequences

**Positive**
- **Any "collect info" feature = a config, not code** (orders, quotes,
  reservations, feedback…). Proven: an `order` action worked end-to-end with zero
  action-specific code.
- Less code overall; one engine, one results table.
- Reliable: deterministic completion/validation in code; pending-state kills
  double-submits.

**Negative / accepted costs**
- Features that **act on the outside world** (charge a payment, check inventory,
  write to a real calendar) still need a small per-integration **tool handler** —
  they plug into this framework but aren't free.
- Actions are edited in config/DB for now; the **owner-facing action editor** (no
  code, in the dashboard) is the next slice.
- Relies on the model returning valid JSON (mitigated by JSON mode + a salvage
  parser).

## Alternatives considered

- **Hardcode each vertical** — doesn't scale; the thing we're replacing.
- **A typed-field system** (dates, numbers, enums) — powerful but bloats fast;
  plain text + date-resolution covers v1. Add types later if needed.
