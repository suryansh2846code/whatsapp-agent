# ADR 0005 — Google Sheets for lead capture (v1)

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

When the bot captures a lead (parent name, phone, what they asked about), it has
to go somewhere the **business owner** can actually see and act on — and that
owner is non-technical (a preschool/coaching-centre operator). Whatever we pick
must be trivial to set up per client, since we replicate across many.

## Decision

Write each lead as a row in a **per-business Google Sheet**.

## Consequences

**Positive**
- The owner just opens a spreadsheet — zero learning curve.
- Per-client setup is trivial (one sheet, share it, done).
- No dashboard for us to build in v1.

**Negative / accepted costs**
- Not a real database: no relations, weak querying, limited scale. Fine for
  crawl-stage enquiry volumes.
- Needs Google API credentials/auth per sheet — a setup step to document.

## Alternatives considered

- **Airtable** — nicer (views, statuses), but the owner needs an Airtable
  account; another tool per client.
- **A proper database** — scalable and "real", but the owner can't see leads
  without us building a dashboard. Overkill for the crawl version.

## Future note

If a client outgrows a sheet (high volume, needs pipeline stages), we move that
client to a database + simple dashboard — the lead-capture code will sit behind
its own module so the destination can change without touching the brain.
