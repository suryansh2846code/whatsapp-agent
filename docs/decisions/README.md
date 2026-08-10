# Architecture Decision Records (ADRs)

Every meaningful decision on this project gets a short, numbered file here. An
ADR captures **why** we did something, not just what — so future-you (or an
interviewer, or a teammate) can understand the reasoning without archaeology.

Each ADR has the same shape:

- **Context** — the situation and the problem we were deciding about.
- **Decision** — what we chose.
- **Consequences** — what we gain, and what we accept as the cost.
- **Alternatives considered** — what we rejected, and why.

A decision can later be **superseded** by a newer ADR (we don't delete the old
one — the history is the point).

## Index

- [0000 — ADR template](0000-template.md)
- [0001 — Separate, multi-tenant project](0001-separate-multi-tenant-project.md)
- [0002 — Cloudflare Workers as the runtime](0002-cloudflare-workers-runtime.md)
- [0003 — Meta WhatsApp Cloud API, behind an adapter](0003-meta-cloud-api-behind-adapter.md)
- [0004 — TypeScript](0004-typescript.md)
- [0005 — Google Sheets for lead capture (v1)](0005-google-sheets-for-leads.md)
- [0006 — A business config with one markdown "knowledge" blob](0006-config-as-markdown-knowledge.md)
- [0007 — LLM behind a provider interface; Groq for early phases](0007-llm-provider-abstraction-groq.md)
- [0008 — Concierge onboarding for v1 (agency-operated)](0008-concierge-onboarding-v1.md)
- [0009 — Write leads via a Google service account](0009-leads-via-service-account.md)
- [0010 — WhatsApp webhook: fast-ack, text-only, background processing](0010-whatsapp-webhook.md)
- [0011 — Dedupe leads by phone; keep the first N messages](0011-lead-capture-dedup.md)
- [0012 — Walk-v1: stateless visit-request capture](0012-walk-visit-booking.md)
- [0013 — Multi-turn conversation memory via Cloudflare KV](0013-conversation-memory-kv.md)
- [0014 — Voice notes via Groq Whisper](0014-voice-notes-whisper.md)
- [0015 — Owner booking alerts via Resend (email)](0015-owner-alerts-resend.md)
- [0016 — Move leads/bookings to Cloudflare D1 (CRM data store)](0016-d1-datastore.md)
- [0017 — Owner dashboard auth via Google sign-in + D1 accounts](0017-owner-auth-google.md)
- [0018 — CRM dashboard: server-rendered, mobile-first + JSON API](0018-crm-dashboard.md)
- [0019 — Owner-editable bot knowledge (D1) + dashboard analytics](0019-editable-knowledge.md)
- [0020 — Businesses in D1 (self-serve foundation)](0020-businesses-in-d1.md)
