# ADR 0019 — Owner-editable bot knowledge (D1) + dashboard analytics

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

Owners should be able to update their bot's FAQ (fees, timings…) themselves,
without us editing code and redeploying — the first real step toward self-serve.
The knowledge currently lives in the code config.

## Decision

- New D1 table **`business_settings`** (`business_id`, `knowledge`,
  `fallback_message`, `updated_at`).
- The bot reads **effective settings** at message time: the D1 override if set +
  non-empty, otherwise the code config default (`crm/settings.ts:
  withEffectiveSettings`). So un-edited businesses keep working from config, and
  config becomes the *seed / fallback*.
- Dashboard gets a **Settings tab** (edit knowledge + fallback) backed by
  `GET`/`PATCH /api/settings` (tenant-scoped).
- Also added **analytics tiles** on the dashboard (Leads, New, Converted,
  Conversion %, Bookings, This week) — computed client-side from the already-
  fetched data, no new endpoint.

## Consequences

**Positive**
- Owners self-serve their FAQ; no redeploy to change fees/timings.
- Effective-settings pattern is safe: nothing breaks before an edit.
- At-a-glance metrics for the owner.

**Negative / accepted costs**
- Knowledge now lives in **two places**: the code config (seed) and D1 (the live
  override that wins once set). Remember edits are in the DB, not the repo.
- A step toward, but not yet, full self-serve (businesses still seeded in config).

## Alternatives considered

- **Keep knowledge in code only** — no owner self-edit. Rejected.
- **Move ALL business config to D1** — the full self-serve model; larger change,
  deferred. This is a contained first slice (just knowledge + fallback).
