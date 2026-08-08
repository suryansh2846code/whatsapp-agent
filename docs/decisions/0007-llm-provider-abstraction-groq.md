# ADR 0007 — LLM behind a provider interface; Groq for early phases

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

The brain needs an LLM to answer questions. Two separate concerns:

1. **Which vendor** to use now (cost, speed, ease for the crawl phase).
2. **Not getting locked in** — the owner explicitly wants to "switch anytime".

## Decision

- Put the LLM behind our own **`LlmProvider` interface** (`src/llm/types.ts`).
  The brain depends on that interface, never on a vendor's SDK.
- Use **Groq** as the first provider (`src/llm/groq.ts`) — a fast, cheap host
  that serves open models via an OpenAI-compatible API.
- Select the provider + model via **settings** (`LLM_PROVIDER`, `LLM_MODEL`), so
  neither is hardcoded.

This is the same loose-coupling pattern as the WhatsApp adapter (ADR 0003).

## Consequences

**Positive**
- **Switch anytime:** moving to Claude/OpenAI/etc. = write one adapter
  (`src/llm/<name>.ts`) + a `case` in the factory + change a setting. The brain
  is untouched.
- **Cheap + fast** for the crawl phase (Groq).
- Model is a setting, so a renamed/retired model is a config change, not a code
  change.

**Negative / accepted costs**
- A thin abstraction to maintain (the interface + one adapter). Trivial.
- Groq serves **open models** (e.g. Llama), which may be weaker at strict
  instruction-following than a frontier model. Mitigated by a tight, grounded
  system prompt and low temperature; revisit if grounding quality is poor.

## Alternatives considered

- **Call a vendor SDK directly from the brain** — simplest to write, but welds us
  to one vendor. Rejected: violates the explicit "switch anytime" requirement.
- **Start on a frontier model (e.g. Claude)** — likely better instruction
  following, but higher cost for the crawl phase. The abstraction means we can
  move there later with almost no rework.
