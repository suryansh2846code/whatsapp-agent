# ADR 0012 — Walk-v1: stateless visit-request capture

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

Crawl answered questions and captured leads. The "walk" phase adds the bot's
first **action**: booking a visit. Real booking is a multi-turn conversation
("I'd like to visit" → "when?" → "Saturday 11") which needs **conversation
state** the stateless Worker doesn't have (ADR 0002). We want a first action
without building the whole state layer yet.

## Decision

**Stateless, single-message** visit capture, driven by one structured LLM call:

- The brain (`decideAndRespond`) asks the model for a **JSON decision**:
  `{ intent: "question"|"visit", answer, visit_time, name }`. This is the
  lightweight form of **tool calling** — the model picks an action and extracts
  its arguments. (Groq JSON mode + a salvage parser for robustness.)
- **Question** → grounded answer from `knowledge` (same rules as crawl).
- **Visit + a day/time** → append a row to a **"Bookings"** tab (same sheet as
  leads) and reply with a **templated confirmation**.
- **Visit, no time** → ask for a day/time; record nothing.
- **Commitment wording is templated in our code**, not the model — the bot says
  "request noted, team will confirm," never "you're booked."
- Bookings are **append-only** (each request matters); leads are still captured
  for every message (deduped).

## Consequences

**Positive**
- Ships the first real action with no new infrastructure (reuses the shared
  Google Sheets client; one extra tab per business).
- Safe: templated confirmations can't over-promise; writes are RAW.
- The decision/booking outcome is observable (logs + `/debug/decide`).

**Negative / accepted costs**
- **Stateless:** a booking split across two messages ("I want to visit" then, in
  a separate message, "Saturday") isn't stitched together — v1 handles the
  single-message case. True multi-turn is the next step (needs KV/Durable
  Objects for per-parent state).
- JSON reliability depends on the model; mitigated by JSON mode + a fallback
  parser. Occasional misclassification is possible.

## Update (2026-08-09) — dedup + absolute dates

Two fixes after live testing:

- **Bookings dedup (upsert by phone).** Append-only + conversation memory caused
  double-booking: a follow-up like "ok thanks" was re-classified as a visit
  (memory still held the time) and added a second row. Now the BookingStore reads
  first and returns `created | updated | unchanged` — one row per parent; a
  changed time updates the row; a follow-up with the same time is `unchanged`
  (and the reply is softened to "you're all set", not a re-confirmation).
- **Absolute date resolution.** "Sunday" is ambiguous without an anchor. The
  prompt now includes **today's date in IST** (fixed +5:30, no DST), and the
  model resolves relative days ("tomorrow", "this Saturday") to a real date
  (e.g. `Saturday, 16 August 2026`), stored resolved and echoed in the
  confirmation so the parent can catch a wrong guess.

## Alternatives considered

- **Full multi-turn stateful booking** — the real dialogue, but needs a
  conversation-state store. Deferred to the next step.
- **Google Calendar events** — deferred; a Bookings tab is enough for v1 and the
  human team confirms the slot.
- **Formal function-calling API** — the JSON-decision approach is a simpler
  equivalent; we can upgrade later behind the same brain function.
