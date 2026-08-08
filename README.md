# whatsapp-agent

A **multi-tenant WhatsApp assistant** for small businesses — schools,
preschools, coaching centres. One codebase (the *engine*); each business is a
*config* (a *tenant*). Onboarding a new client is meant to be "write one config",
not "build a new bot".

Built as a recurring product for the ORIGIN agency (see the agency's own repo for
the marketing site).

## What it does (v1 — the "crawl" version)

A parent messages the business on WhatsApp. The agent:

1. Understands the free-typed question.
2. Answers **only** from that business's real facts (fees, timings, batches,
   address) — and says "let me have someone call you back" when it doesn't know.
3. Captures the lead (name, phone, what they asked about) to the owner's sheet.

Not yet in v1: booking visits, sending reminders. (Those are the "walk" and
"run" versions.)

## Stack (and why — see `docs/decisions/`)

- **Cloudflare Workers** — serverless backend to receive the WhatsApp webhook.
- **Meta WhatsApp Cloud API** — official WhatsApp access, behind our own adapter.
- **TypeScript** — native to Workers, matches the team, safe configs.
- **Google Sheets** — where leads land, so the owner just opens a spreadsheet.

Every decision is documented as an **ADR** in [`docs/decisions/`](docs/decisions/).
The step-by-step journey is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

## Project structure

```
src/
  index.ts        # Worker entry — the single door every message comes through
docs/
  decisions/      # ADRs — one file per decision, with the reasoning
  BUILD-LOG.md    # the build journey, step by step
wrangler.jsonc    # Cloudflare Worker config
```

## Run locally

```bash
npm install
npm run typecheck   # types pass
npm run dev         # local URL should show: whatsapp-agent — alive
```

Secrets (API keys) go in a local `.dev.vars` file (git-ignored) — documented as
we add each one.

## Onboarding a new business

> _To be filled in as we build. The goal: copy one config, edit a few fields,
> deploy. That checklist is the proof the multi-tenant design worked._
```
