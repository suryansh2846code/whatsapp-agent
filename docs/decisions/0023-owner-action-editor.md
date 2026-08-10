# ADR 0023 — Owner-facing action editor (no-code)

- **Status:** Accepted
- **Date:** 2026-08-10
- **Builds on:** ADR 0022 (generic action engine).

## Context

Actions are data (ADR 0022), but we still authored them. To be a real product,
the **owner** must define their own actions from the dashboard — no code.

## Decision

- **API:** `GET /api/actions` returns the business's actions; **`PUT
  /api/actions`** replaces the whole set. Server **sanitizes** input: turns
  owner-entered labels into stable **keys** via slugify ("Delivery address" →
  `delivery_address`), drops empty entries, coerces types.
- **Dashboard "Actions" tab:** a form builder — add/remove actions, each with a
  name, a "when to use it" description, a list of **fields** (label + required
  checkbox, add/remove), and a confirmation message that shows the available
  `{placeholders}`. The owner never sees "keys" — they're generated from labels.
- Saving upserts the business row; the bot picks up the new actions on the next
  message (no deploy).

## Consequences

**Positive**
- Owners build their own bot features from a form — the product is now truly
  self-serve.
- Simple, safe: whole-set `PUT` + server sanitization; keys auto-derived.

**Negative / accepted costs**
- Keys are derived from labels, so **renaming a label changes its key** — old
  confirmation placeholders / stored submission keys won't match. Acceptable for
  v1; a stable-id scheme can come later.
- Fields are **plain text** only (no types/validation UI yet).
- `PUT`-replace means concurrent edits from two tabs could clobber; fine for a
  single owner.

## Alternatives considered

- **Per-action / per-field CRUD endpoints** — more granular but much more UI +
  API surface. Whole-set PUT is simpler and enough here.
