# ADR 0013 — Multi-turn conversation memory via Cloudflare KV

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

The Worker is stateless (ADR 0002), so the bot forgot a parent between
messages. That blocked multi-message bookings ("I'd like to visit" → "when?" →
"Saturday") and made answers context-blind. We need per-parent state, but not
the full weight of a database.

## Decision

Store a **short rolling conversation history per parent in Cloudflare KV**:

- **Key:** `${whatsappPhoneNumberId}:${phone}` (scoped per business + parent).
- **Value:** the last `MAX_MESSAGES = 8` turns as JSON (`user`/`assistant`
  plain-text messages — the assistant text is the reply the parent actually saw).
- **TTL:** `expirationTtl` of 1 day, so old conversations auto-expire (privacy by
  default; we don't hoard chat history).
- **Each turn:** load history → `decideAndRespond(..., history)` (the LLM sees
  the context) → save the new user+assistant turn back.

The LLM does the stitching: given its own earlier "what day and time?" turn, it
reads "Saturday" as the answer and books the visit.

## Consequences

**Positive**
- Enables multi-turn booking and context-aware answers.
- Cheap and simple; KV is the minimal "state" a Worker lacks.
- TTL keeps retention short by default.

**Negative / accepted costs**
- **KV is eventually consistent** — a rare lag between write and next read.
  Harmless here (a parent's next message is usually seconds later).
- **Race:** two very rapid messages could both read stale history. Rare;
  Durable Objects would serialise them, but that's a bigger tool.
- We now store conversation **content** (mitigated by the short TTL and per-key
  scoping).
- Slightly more tokens per call (bounded by the 8-message cap).

## Alternatives considered

- **Durable Objects** — strong consistency + ordering (also fixes the lead-dedup
  race), but more machinery than this step needs. Revisit for the run phase.
- **An explicit state machine / "awaiting_time" flag** — narrower than a general
  history; history also improves ordinary answers. Rejected.
- **No memory** — the status quo; can't do multi-message flows. Rejected.
