# Build Log

A running narrative of how this project was built, step by step — the companion
to the ADRs. ADRs capture *decisions*; this log captures *the journey* (what we
did, in what order, and why that order).

Target reader: the owner, six months from now, explaining this project in an
interview without help.

---

## Step 1 — Scaffold + decision records (2026-08-08)

**Goal:** a deployable, empty skeleton and the decisions written down — before
any bot logic. Smallest possible first step.

**What we made**
- `package.json`, `wrangler.jsonc`, `tsconfig.json`, `.gitignore` — a minimal
  Cloudflare Workers + TypeScript project.
- `src/index.ts` — the Worker entry point. Does nothing yet but answer a health
  check (`/` → `"whatsapp-agent — alive"`). This is the single door every
  message will later come through.
- `docs/decisions/` — five ADRs for every decision locked so far (separate
  multi-tenant project, Cloudflare Workers, Meta Cloud API behind an adapter,
  TypeScript, Google Sheets for leads).

**Why this order:** get a working, deployable shell and the reasoning on paper
*first*, so every later step is a small, verifiable addition on a solid base —
never a big unexplained dump.

**How to verify (not yet run):**
- `npm install` — pull Wrangler + TypeScript.
- `npm run typecheck` — should pass.
- `npm run dev` — visiting the local URL should show `whatsapp-agent — alive`.

**Verified (2026-08-08):** `npm install` + `npm run typecheck` pass; `wrangler
dev` boots and `GET /health` returns `whatsapp-agent — alive` (200). Fixed the
`compatibility_date` to `2025-07-18` (the date I first set wasn't supported by
the installed runtime, so it was silently falling back).

**Next step:** define the multi-tenant **config shape** — the TypeScript type for
"a business" (name, facts sheet, lead destination) plus one example business —
so the engine has tenants to serve.

---

## Step 2 — The multi-tenant config shape (2026-08-08)

**Goal:** define what a "business" (a *tenant*) is, so the engine has something
to serve. This is the core of the "little changes → replicate" requirement.

**What we made**
- `src/config/types.ts` — the `BusinessConfig` type. One object = one client.
  The important fields: `whatsappPhoneNumberId` (the **routing key** — how we
  know which business a message is for) and `knowledge` (the **grounding
  source** — the only facts the bot may answer from).
- `src/config/businesses/sunshine-preschool.ts` — a full example tenant with a
  realistic (placeholder) facts sheet. This is the file you copy to onboard a
  new client.
- `src/config/index.ts` — the **tenant registry**: an array of all businesses
  plus `findBusinessByPhoneNumberId()`. Adding a client = write a config file +
  add it to the array.

**Key decision:** facts are stored as one markdown `knowledge` blob rather than
rigid structured fields — see ADR 0006. Flexible across business types, easy for
the owner to proofread, and feeds the LLM directly.

**Why nothing is wired to the Worker yet:** the config isn't *used* until the
brain exists. Defining the tenant shape first keeps each step small and
verifiable. Verified via `npm run typecheck` (passes).

**Next step:** the **brain** — grounded answering. Take a question + a business's
`knowledge`, ask the LLM to answer *only* from it, and test it locally with a
fake message (no WhatsApp yet).

---

## Step 3 — The brain (grounded answering), LLM behind an adapter (2026-08-08)

**Goal:** answer a question using only a business's `knowledge`, with the LLM
vendor swappable. Owner chose **Groq** for early phases but wants to switch
anytime — so the vendor sits behind an interface (ADR 0007).

**What we made**
- `src/llm/types.ts` — the `LlmProvider` interface (the "switch anytime" seam).
- `src/llm/groq.ts` — the Groq adapter (OpenAI-compatible API, low temperature
  for faithfulness).
- `src/llm/index.ts` — a factory that returns the configured provider based on
  the `LLM_PROVIDER` / `LLM_MODEL` settings.
- `src/brain/answer.ts` — the grounded-answer logic. The safety lives in its
  system prompt: answer ONLY from `knowledge`, never invent, and fall back to the
  business's `fallbackMessage` when unsure. Provider-agnostic (depends on the
  interface, not Groq).
- `src/env.ts` — the `Env` type (secrets/settings), extracted so multiple files
  can share it.
- `src/index.ts` — added a guarded, test-only `POST /debug/ask` so we can try the
  brain locally without WhatsApp.
- `.dev.vars.example` — template for local secrets (`GROQ_API_KEY`, etc.).

**How to verify (needs your Groq key):**
1. `cp .dev.vars.example .dev.vars` and put your real `GROQ_API_KEY` in it.
2. `npm run dev`
3. \`\`\`
   curl -X POST localhost:8787/debug/ask \\
     -H 'content-type: application/json' \\
     -d '{"phoneNumberId":"PLACEHOLDER_PHONE_NUMBER_ID","message":"what are your fees?"}'
   \`\`\`
   Expect a grounded answer about ₹4,000/month. Then ask something NOT in the
   facts (e.g. "do you have a swimming pool?") — it should fall back to offering
   a callback, NOT invent an answer. That fallback is the whole point of v1.

**Verified (2026-08-08):** with a real Groq key in `.dev.vars`, `POST
/debug/ask` answered the fees question from the facts, and *refused* to invent an
answer for something not in the facts (swimming pool) — falling back to a
callback offer. Grounding + anti-hallucination guardrail both confirmed working.

**Next step:** lead capture — save the parent's name/phone/question to the
business's Google Sheet.

---

## Step 4 — Lead capture to Google Sheets (service account) (2026-08-08)

**Goal:** save an enquiry (timestamp, business, name, phone, message) to the
business's Google Sheet. Two onboarding decisions were made first: **concierge**
onboarding (ADR 0008) and **service-account** Sheets writes (ADR 0009).

**What we made**
- `src/leads/types.ts` — the `LeadStore` interface + `Lead` shape.
- `src/leads/google-sheets.ts` — the service-account writer. Signs a **JWT** with
  the private key (RS256 via Web Crypto), swaps it for an **OAuth access token**,
  and calls the Sheets API to append a row. This is the crypto "hard part",
  written once and reused by every client.
- `src/leads/index.ts` — the `createLeadStore` factory (shared credentials from
  env, per-business sheet id from config).
- `src/env.ts` — added `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`.
- `src/index.ts` — added a guarded `POST /debug/lead` to test saving without
  WhatsApp.
- `.dev.vars.example` — added the Google vars.
- `docs/ONBOARDING.md` — the concrete "add a new business" guide (one-time agency
  setup + per-client checklist). Answers "what do we do per new business".

**How to verify (needs one-time Google setup — see ONBOARDING.md):**
1. Create a service account + JSON key; put `GOOGLE_CLIENT_EMAIL` /
   `GOOGLE_PRIVATE_KEY` in `.dev.vars`.
2. Create a test sheet with headers, share it with the robot email, put its ID in
   `sunshine-preschool.ts`'s `leadSheetId`.
3. Restart `npm run dev`, then:
   \`\`\`
   curl -X POST localhost:8787/debug/lead \\
     -H 'content-type: application/json' \\
     -d '{"phoneNumberId":"PLACEHOLDER_PHONE_NUMBER_ID","phone":"+919999999999","message":"interested in nursery"}'
   \`\`\`
   Expect `{"saved":true,...}` and a new row in the sheet.

**Verified (2026-08-08):** with the service account creds in `.dev.vars` and a
real sheet shared with the robot email, `POST /debug/lead` returned
`{"saved":true}` and a row appeared in the Google Sheet. The full chain works:
JWT signed via Web Crypto → OAuth access token → Sheets `values.append`.

**Next step:** the real **WhatsApp webhook** — receive a real message, run the
brain, reply on WhatsApp, and capture the lead. This ties everything together.

---

## Step 5 — WhatsApp webhook: the live loop (2026-08-08)

**Goal:** connect real WhatsApp messages to the brain + lead capture. See
ADR 0010 for the design (fast-ack, text-only, background processing).

**What we made**
- `src/whatsapp/types.ts` — `IncomingMessage` (Meta's payload flattened) +
  `WhatsAppClient` interface.
- `src/whatsapp/meta.ts` — Meta Cloud API adapter: `parseIncomingMessages`
  (flatten + keep text only) and `createMetaWhatsAppClient` (send replies).
- `src/whatsapp/index.ts` — the WhatsApp client factory.
- `src/index.ts` — `GET /webhook` (verification handshake), `POST /webhook`
  (fast-ack + `ctx.waitUntil`), and `processMessages` (route → brain → reply →
  lead, per-message try/catch).
- `src/env.ts` + `.dev.vars.example` — `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`,
  `GRAPH_API_VERSION`.

**Verified locally (2026-08-08), without Meta:**
- `GET /webhook` with the right verify token echoes `hub.challenge`; wrong token
  → 403.
- A simulated Meta payload to `POST /webhook` returns `ok` (200) instantly, and
  the background loop *routed* to Sunshine Preschool and *ran the brain*
  (Groq answered). It then failed at the send step with `401 Invalid OAuth
  access token` — EXPECTED, because `WHATSAPP_TOKEN` was a placeholder. This
  proves parse → route → brain → attempt-reply all work.

**Not yet verified (needs real Meta setup):** the actual WhatsApp send, and the
lead-save that runs after a successful send.

**OPEN SECURITY ITEM:** `POST /webhook` is unauthenticated — must add
`X-Hub-Signature-256` verification before going live (see ADR 0010).

**v1 status:** all four pieces built (config, brain, leads, webhook). Brain and
leads verified end-to-end; webhook verified up to the send. Remaining to go
live: Meta account setup + webhook signature verification.

---

## Step 6 — Webhook signature verification (security) (2026-08-08)

**Goal:** stop anyone from POSTing fake webhooks (which could make us send
WhatsApp messages and write junk leads). Close the open item from ADR 0010.

**What we made**
- `src/whatsapp/verify.ts` — `verifyMetaSignature()`: recomputes the
  HMAC-SHA256 of the raw body with the app secret (via Web Crypto) and compares
  it to `X-Hub-Signature-256` in constant time. Fails closed.
- `src/index.ts` — `POST /webhook` now reads the RAW body, verifies the
  signature, returns 401 on failure, and only then parses + processes.
- `src/env.ts` + `.dev.vars.example` — added `WHATSAPP_APP_SECRET`.

**Verified locally (2026-08-08):** valid signature → 200; missing → 401; wrong
→ 401.

**v1 is now code-complete and hardened.** To go live: do the Meta setup
(ONBOARDING Part A step 3 — including the app secret), deploy, and test a real
message.

---

## Step 7 — First live end-to-end message (2026-08-09)

**Milestone:** a real WhatsApp message to the Meta test number produced a
grounded reply back to the phone AND a lead row in the Google Sheet. Deployed to
`https://whatsapp-agent.suryansh2846.workers.dev`.

**Two blockers hit and fixed on the way (both Meta config, not our code):**

1. **App not subscribed to the WABA.** Messages showed in Meta's "Check test
   webhooks" viewer but never reached our Worker (`wrangler tail` stayed empty).
   Cause: the WhatsApp Business Account was subscribed only to Meta's internal
   test app, not ours. Fixed with `POST /<WABA_ID>/subscribed_apps`. This was the
   big one — see ONBOARDING Troubleshooting.
2. **Expired access token.** The temporary token expires in ~24h
   (`OAuthException 190`). Regenerated it and updated the `WHATSAPP_TOKEN` secret.

**Verified live:** `POST /webhook` arrives, signature verifies, Groq answers,
reply sent, lead saved — no exceptions in the logs.

**Known limitation (expected):** in Development mode with the test number, the
bot only replies to allow-listed recipients. Going live (real number + published
app + Business Verification + permanent System User token) is documented in
ONBOARDING Part C.

---

## Step 8 — Lead dedup (one lead per phone, first 5 messages) (2026-08-09)

**Goal:** stop one chatty parent from creating many rows; keep one lead per
person with their first 5 messages so the owner can read the lead's intent.
See ADR 0011.

**What changed**
- `leads/google-sheets.ts` — `save()` now reads Phone+Message first
  (read-before-write), then: new phone → create row; existing under the cap →
  append the message into that row's Message cell (newline-separated), keeping
  the original timestamp; at the cap (5) → skip. Phones compared with non-digits
  stripped. Writes switched to `valueInputOption=RAW` (formula-injection safety).
- `leads/types.ts` — `save()` returns `created | appended | skipped`.
- `index.ts` — the live loop logs the result; `/debug/lead` returns it.

**Verified locally (2026-08-09):** 6 `/debug/lead` calls with the same phone →
`created, appended, appended, appended, appended, skipped`; the sheet held one
row for that phone with 5 messages stacked in the Message cell.

**Accepted caveat:** a race between two near-simultaneous first messages could
double-create a row (rare; would need a DB with atomic upserts to fully fix).

---

## Step 9 — Walk phase: visit-request capture (2026-08-09)

**Goal:** the bot's first *action* — capture a visit request. Stateless,
single-message (ADR 0012).

**What we made**
- `google/sheets.ts` — refactor: shared service-account auth + read/append/
  update helpers, reused by leads and bookings (no duplicated JWT crypto).
- `llm/{types,groq}.ts` — `complete()` gains optional `{ json: true }` (Groq JSON
  mode) for structured decisions.
- `brain/booking.ts` — `decideAndRespond()`: one JSON LLM call classifies
  question vs visit and extracts day/time + name. Question → grounded answer;
  visit+time → templated confirmation + booking; visit w/o time → ask for a time.
  Confirmation wording is templated in code (never over-promises).
- `bookings/{types,google-sheets,index}.ts` — a BookingStore that appends to a
  **"Bookings"** tab in the business's sheet.
- `index.ts` — the live loop now decides, replies, saves the lead, and records a
  booking when present; added `/debug/decide`.

**Verified locally (2026-08-09) via `/debug/decide`:**
- "what are your fees?" → grounded answer, no booking.
- "I am Anita. Can I visit this Saturday at 11am?" → confirmation reply +
  `bookingSaved:true`, row in the Bookings tab.
- "I want to visit the school" → asks for a day/time, no booking.

**Note:** each business's sheet now needs a second tab named `Bookings`
(ONBOARDING Part B step 1). **Next (run phase):** multi-turn state, then outbound
reminders.

---

## Step 10 — Multi-turn conversation memory (2026-08-09)

**Goal:** give the bot memory of the recent conversation per parent, so a booking
split across messages works and answers have context (ADR 0013).

**What we made**
- Created a **Cloudflare KV namespace** `CONVERSATIONS`; bound it in
  `wrangler.jsonc`; added `CONVERSATIONS: KVNamespace` to `env.ts`.
- `memory/conversation.ts` — `runConversationTurn`: load per-parent history from
  KV (key `phoneNumberId:phone`), decide with it, save the turn back. Cap 8
  messages, TTL 1 day (auto-expire = privacy default).
- `brain/booking.ts` — `decideAndRespond` now takes optional `history` and
  includes it in the LLM call.
- `index.ts` — the live loop and `/debug/decide` route through
  `runConversationTurn`.

**Verified locally (2026-08-09, KV simulated by `wrangler dev`):** two
`/debug/decide` calls, same phone — "I want to visit the school" → asks for a
time (no booking); then "Saturday at 11am" → **booked**, using the remembered
context (the second message alone has no "visit" word). `bookingSaved:true`.

**Accepted caveats (ADR 0013):** KV eventual consistency; a rapid-message race;
we now store conversation content (short TTL mitigates). **Next:** the run phase
(outbound reminders) — or a permanent WhatsApp token for production.

---

## Step 11 — Booking dedup + absolute dates (2026-08-09)

Two fixes found via live testing (ADR 0012 update).

**Double-booking** — once memory held the visit context, a follow-up ("ok
thanks") got re-classified as a visit and added a *second* Bookings row. Fixed:
the BookingStore now **upserts by phone** (read-before-write) and returns
`created | updated | unchanged`. One row per parent; a changed time updates it; a
follow-up with the same time is `unchanged` and the reply is softened to "you're
all set" (no re-confirmation, no duplicate). Booking is saved *before* the reply
so the reply can reflect the result.

**Ambiguous dates** ("which Sunday?") — the prompt now includes **today's date in
IST** (fixed +5:30, no DST) and the model resolves relative days to an absolute
date (e.g. `Saturday, 16 August 2026`), stored resolved and echoed in the
confirmation. If a day is given without a time, the bot asks specifically for the
time.

**Verified locally (2026-08-09) via `/debug/decide`, one phone:**
"I want to visit" → asks day+time; "Saturday at 11am" → **created**, resolved to
"Saturday, 15 August 2026 at 11:00 AM"; "ok thanks" → **unchanged** (no
duplicate); "make it Sunday at 10am" → **updated** (same row).

---

## Step 12 — Voice notes (Groq Whisper) (2026-08-09)

**Goal:** accept WhatsApp voice notes (common in India), for every business
(ADR 0014).

**What we made**
- `whatsapp/types.ts` + `meta.ts` — parse `type:"audio"` messages
  (`IncomingMessage.audioId`), and a `getMedia(mediaId)` on the WhatsApp client
  (two-step Meta media download).
- `voice/transcribe.ts` — `transcribeAudio` posts the audio to Groq Whisper
  (`whisper-large-v3`, `STT_MODEL`), returns the text.
- `index.ts` — if a message is audio, download + transcribe first, then run the
  normal question/booking flow on the transcript.
- `env.ts` / `.dev.vars.example` — `STT_MODEL`.

**Verified (2026-08-09):** Groq Whisper transcription confirmed with a generated
clip ("what are the fees of the preschool?" → exact match), using the same call
the Worker makes. The WhatsApp media download follows Meta's documented flow;
full end-to-end needs a live voice note (and a valid token).

**Next:** instant owner alerts (email now, WhatsApp template later).

---

## Step 13 — Owner booking alerts by email (Resend) (2026-08-09)

**Goal:** email the owner the moment a booking comes in, so they call back while
the lead is warm (ADR 0015).

**What we made**
- `config/types.ts` — `ownerEmail?` per business.
- `alerts/email.ts` — `sendBookingAlert` via Resend (non-fatal on failure).
- `index.ts` — fire the alert on a `created`/`updated` booking, after replying;
  also wired into `/debug/decide` (returns `alertSent`).
- `env.ts` / `.dev.vars.example` — `RESEND_API_KEY`, `ALERT_FROM_EMAIL`.

**Verified (2026-08-09):** local `/debug/decide` booking ("visit tomorrow at
3pm") → `bookingResult:created`, `alertSent:true`, and the email arrived in the
owner's inbox. (Resend test mode only delivers to the account's own email; a
domain must be verified to email arbitrary owners.)

**Next:** WhatsApp-template owner alert; permanent WhatsApp token; or the run
phase (reminders).

---

## Step 14 — CRM Phase 1: move data to Cloudflare D1 (2026-08-10)

**Goal:** foundation for the owner dashboard + CRM — a real database (ADR 0016).
First of three phases (data → auth → dashboard UI).

**What we made**
- Created a D1 database `whatsapp-agent-db`; bound as `DB` in `wrangler.jsonc`.
- `schema.sql` — `leads` and `bookings` tables, each `UNIQUE(business_id, phone)`,
  with `status`/`notes` for the CRM. Applied to remote + local.
- `leads/d1.ts` + `bookings/d1.ts` — D1 adapters implementing the existing
  `LeadStore` / `BookingStore` interfaces (bot code unchanged). Dedup is now
  atomic SQL upsert (kills the old race).
- Switched the factories (`leads/index.ts`, `bookings/index.ts`) from Sheets to
  D1; Sheets adapters kept parked. `env.ts` gains `DB: D1Database`.

**Verified locally (2026-08-10):** two `/debug/lead` calls (same phone) →
one row, `message_count: 2`, messages joined, `status: new`; a `/debug/decide`
booking → one `bookings` row, `status: requested`. Queried via
`wrangler d1 execute --local`.

**Next:** CRM Phase 2 — owner auth (magic link + sessions).

---

## Step 15 — CRM Phase 2: owner auth (Google sign-in) (2026-08-10)

**Goal:** owners log in (once, then a long session) and see only their business
(ADR 0017). Chose Google sign-in over magic link (owners disliked re-clicking
emails) and over passwords.

**What we made**
- D1 `accounts` table (email unique → business_id); `SESSIONS` KV namespace.
- `auth/google.ts` (build authorize URL, exchange code → email),
  `auth/accounts.ts` (upsert account), `auth/session.ts` (sessions + CSRF state
  in KV, cookie helpers).
- `config/index.ts` — `findBusinessByOwnerEmail` (gates login).
- `index.ts` routes: `/auth/login`, `/auth/callback`, `/auth/logout`, and a
  `/dashboard` placeholder guarded by the session.
- `wrangler.jsonc` — `GOOGLE_OAUTH_CLIENT_ID` var + `SESSIONS` KV; env gains the
  OAuth id/secret + `SESSIONS`.

**Verified locally (2026-08-10):** `/auth/login` → 302 to Google with the right
client_id/scope/state; `/dashboard` without a session → 302 to `/auth/login`.
Full code-exchange callback needs the client secret + a real browser Google
login (owner's step).

**Next:** CRM Phase 3 — the dashboard UI (list/filter leads & bookings, edit
status & notes) behind `requireAuth`.

**Login fix (2026-08-10):** first live login failed — OAuth state was in KV
(eventually consistent). Moved state → an HttpOnly cookie and sessions → D1
(strongly consistent). Login now works.

---

## Step 16 — CRM Phase 3: the dashboard (2026-08-10)

**Goal:** a mobile-first dashboard for owners to view + manage leads/bookings
(ADR 0018).

**What we made**
- `crm/queries.ts` — tenant-scoped D1 reads/updates for leads + bookings
  (status whitelists).
- `dashboard/html.ts` — one server-rendered, mobile-first page (cards, Leads/
  Bookings tabs, status filter chips, inline status dropdown + notes editing,
  one-tap wa.me reply). User data rendered via `textContent` (XSS-safe).
- `index.ts` — `/dashboard` (renders the page) + a `/api/*` router behind a
  session: `GET /api/leads`, `GET /api/bookings`, `PATCH /api/leads/:id`
  (status/notes), `PATCH /api/bookings/:id` (status). `config` gains
  `findBusinessById`.

**Verified locally (2026-08-10, seeded session):** `/api/leads` → 401 without a
session; with a session → returns the tenant's leads; `PATCH` status+notes →
persisted; `/dashboard` renders the page. Full visual UI is exercised in the
browser after Google login.

**CRM v1 complete** (data → auth → dashboard). Next ideas: analytics tiles,
edit the bot's knowledge from the dashboard, WhatsApp owner alerts, run phase.
