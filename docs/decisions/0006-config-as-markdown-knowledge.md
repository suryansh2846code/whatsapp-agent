# ADR 0006 — A business config with one markdown "knowledge" blob

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

Each tenant is a `BusinessConfig`. The big question: how do we store the
business's facts (fees, timings, ages, address…) that the bot answers from?

- **Structured fields** — typed fields like `fees`, `timings`, `ages[]`.
- **One freeform markdown blob** — a single `knowledge` string.

Two goals pull on this: onboarding must be *easy* (a non-technical person edits
it), and the facts feed the LLM as its grounding source.

## Decision

Store the facts as a **single markdown `knowledge` string** per business, plus a
few small typed meta fields (`displayName`, `languages`, `fallbackMessage`,
`whatsappPhoneNumberId`, `leadSheetId`). ~90% of per-client work is writing the
`knowledge` sheet.

## Consequences

**Positive**
- **Flexible** — every business is different (a coaching centre has batches; a
  preschool has nap times). Freeform text fits them all without schema changes.
- **Easy to author/review** — it reads like a FAQ; the owner can proofread it.
- **Feeds the brain directly** — the LLM reads text; no transformation needed.

**Negative / accepted costs**
- **No structure to enforce** — nothing guarantees "fees" exists. We rely on a
  good template + review, not the type system, for completeness.
- Harder to do structured things later (e.g. "list all timings") — but that's a
  v2+ concern, and we can add typed fields alongside the blob when needed.

## Alternatives considered

- **Fully structured fields** — type-safe and queryable, but rigid: every new
  business type needs schema changes, and it's more for the owner to fill.
  Rejected for the crawl version; revisit if we build structured features.
