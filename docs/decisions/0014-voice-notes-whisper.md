# ADR 0014 — Voice notes via Groq Whisper

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

In India, people often send **voice notes** instead of typing. The bot was
text-only, so it silently ignored them. We want voice to work everywhere text
does, for every business (not just preschools).

## Decision

Handle inbound audio messages end-to-end:

1. **Detect** `type: "audio"` in the webhook and carry the media id
   (`IncomingMessage.audioId`).
2. **Download** the audio from WhatsApp — a two-step Meta flow: resolve the
   media id to a URL, then fetch the bytes (both need the auth token). Added to
   the WhatsApp adapter as `getMedia`.
3. **Transcribe** with **Groq Whisper** (`whisper-large-v3`, configurable via
   `STT_MODEL`) — same provider/key as the chat LLM; Whisper auto-detects the
   language, so mixed Hindi/English works.
4. **Feed the transcript into the normal flow** — it answers or books exactly as
   if the person had typed it.

## Consequences

**Positive**
- Voice works for every capability (answers, bookings) and every tenant.
- Reuses the Groq key; no new vendor.
- Multilingual out of the box.

**Negative / accepted costs**
- Extra latency (download + transcribe) and Groq audio usage per voice note.
- Transcription can mishear (names, times) — the booking confirmation echo
  (ADR 0012) helps catch errors.
- Media download needs a valid WhatsApp token (the same token expiry applies).

## Alternatives considered

- **A dedicated STT vendor** (Deepgram, etc.) — deferred; Groq Whisper is good
  enough and needs no new key.
- **Ignore voice / ask them to type** — poor UX for the target users. Rejected.

## Verified

Groq Whisper transcription confirmed with a generated clip
("what are the fees of the preschool?" → exact). The WhatsApp media download
follows Meta's documented flow; full end-to-end needs a live voice note.
