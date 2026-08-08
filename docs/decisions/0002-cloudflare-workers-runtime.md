# ADR 0002 — Cloudflare Workers as the runtime

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

The bot needs an **always-on endpoint** so WhatsApp can deliver messages to it
via a **webhook** (WhatsApp calls a URL on our server the instant a message
arrives). Our workload is: receive a message → call Claude → reply → save a
lead. That is **short, HTTP-only, stateless, and idle most of the day**. The
team already uses Cloudflare for the agency site.

## Decision

Run the backend on **Cloudflare Workers** — a **serverless** platform where our
code runs on lightweight **V8 isolates** (not a full server, not a container).
It wakes per request and sleeps when idle.

## Consequences

**Positive**
- Near-zero cost when idle; effectively no cold start (~1ms).
- No servers to babysit; reuses tooling (Wrangler) the team already knows.
- Scales automatically with traffic.

**Negative / accepted costs**
- **Not Node.js.** It's a web-standards runtime, so many npm libraries that need
  Node internals (`fs`, native C++ addons, raw sockets) won't work.
- **CPU-time cap** per request (~30s on paid) — no heavy computation.
- **Stateless / no local disk** — all state must live in an external store.

We accept these because our workload is pure `fetch`, stateless, and light —
none of the limits bite. (See BUILD-LOG for the "why it doesn't hurt us"
reasoning.)

## Alternatives considered

- **Railway / Fly (always-on container)** — full Node, any library, but you
  **pay while idle** and babysit the process. Overkill for a mostly-idle bot.
- **Vercel** — great for frontends + Node functions, but frontend-focused and
  container/Lambda-based (cold starts); no advantage here over Workers.

## Future note

If v2 grows a piece that *doesn't* fit Workers (e.g. generating a heavy PDF
report, or holding a live voice session), we run **just that piece** on a
container and leave the rest on Workers — split the system by workload.
