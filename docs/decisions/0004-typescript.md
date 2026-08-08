# ADR 0004 — TypeScript

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

We need to pick the language for the backend. Constraints: it runs on Cloudflare
Workers, the team already uses TypeScript on the agency site, and the
multi-tenant design leans hard on **config objects** that must be correct
(a malformed config could break a live client).

## Decision

Write the backend in **TypeScript** with `strict` mode on.

## Consequences

**Positive**
- **Native** to Workers — the first-class, best-supported path.
- **Matches existing team skill** (the agency site is Next.js + TypeScript).
- **Types catch bad configs at build time** — e.g. a business config missing its
  facts sheet fails to compile instead of failing in front of a customer.

**Negative / accepted costs**
- A compile/type-check step (trivial; Wrangler handles bundling).

## Alternatives considered

- **Plain JavaScript** — no type safety; risky for a config-driven system.
- **Rust/WASM or Python (beta on Workers)** — swimming upstream, no benefit here.
