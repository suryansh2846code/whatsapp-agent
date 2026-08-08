# ADR 0001 — Separate, multi-tenant project

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

ORIGIN (the agency) wants to sell a WhatsApp assistant to schools, preschools,
and coaching centres as a **recurring** product (a retainer, like its social
media service). Two forces shape where this code should live:

1. The agency's own website is a **static export** — just files on a CDN, with
   no server. A WhatsApp bot needs an **always-on backend** to receive messages.
2. We want **one engine that serves many businesses**, where onboarding a new
   client is "write one config", not "build a new bot". The owner's words:
   *"little changes and it replicates for other businesses."*

The name for #2 is **multi-tenancy**: one codebase (the *engine*), many
businesses (*tenants*), each represented by a config.

## Decision

Build a **new, standalone project** (not inside the agency repo), designed
**multi-tenant from day one**: the engine never changes per client; each
business is a config object. This mirrors the agency's existing school
templates, where `config.ts` is the only per-client file.

## Consequences

**Positive**
- Clean separation: a static marketing site and a live server backend don't get
  tangled together.
- Reuse: the engine is written once and serves every client.
- Onboarding a client ≈ adding a config, not writing code.

**Negative / accepted costs**
- A second project/repo to maintain.
- Shared code/branding between the agency site and this project isn't automatic.

## Alternatives considered

- **Put it inside the agency repo** — rejected: mixes a static export with a
  server backend; two very different runtimes and mental models in one place.
- **A separate one-off bot per client** — rejected: no reuse, no leverage;
  every client would be a fresh build. Defeats the whole point.
