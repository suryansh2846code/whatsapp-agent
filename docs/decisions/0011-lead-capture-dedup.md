# ADR 0011 — Dedupe leads by phone; keep the first N messages

- **Status:** Accepted
- **Date:** 2026-08-09
- **Refines:** ADR 0005 / 0009 (Google Sheets lead capture)

## Context

Originally every inbound message appended a row, so a chatty parent produced
many rows for one person. We want **one lead per person**, but also enough of
their early messages to understand what they want (their *intent*) — one message
is often too little.

## Decision

Dedupe leads **by phone number** (idempotency key), one row per person:

- **Read before write.** On each save, read the sheet's Phone+Message columns
  and look for a matching phone (compared with non-digits stripped, so `+91…`
  and `91…` match).
- **New phone →** create a row (`created`).
- **Existing phone, under the cap →** append the message into that row's Message
  cell (newline-separated), preserving the original timestamp (`appended`).
- **Existing phone, at the cap →** skip (`skipped`).
- **Cap:** `MAX_MESSAGES_PER_LEAD = 5` — enough to read intent, bounded growth.
- Writes use **`valueInputOption=RAW`** so a message like `=SUM(A:A)` is stored
  as text, not executed (formula / CSV injection).
- `LeadStore.save()` returns `created | appended | skipped`, logged in the live
  loop and returned by `/debug/lead`, so the behaviour is observable.

## Consequences

**Positive**
- One clean lead per person, with their first 5 messages captured for intent.
- Safe against spreadsheet formula injection.
- Observable outcomes (logs + debug route).

**Negative / accepted costs**
- **One extra Sheets read per save** (trivial at crawl volume).
- **Race condition:** two near-simultaneous *first* messages could each read
  "not found" and both create a row. Rare and low-harm at our volumes; accepted
  for v1. (A real fix would need atomic upserts, i.e. a database.)
- The Message cell can grow to 5 stacked messages — bounded, but wide.

## Alternatives considered

- **Skip after the first message** — simplest, but throws away intent. Rejected.
- **Up to 5 separate rows per parent** — simpler to write, but a parent appears
  as multiple rows (less "one lead per person"). Rejected.
- **A real database with atomic upserts** — removes the race entirely, but is
  overkill for the crawl version. Revisit at scale.
