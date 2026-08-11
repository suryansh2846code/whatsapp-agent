-- D1 schema for the CRM (leads + bookings), scoped per business.
-- Apply:  npx wrangler d1 execute whatsapp-agent-db --remote --file=schema.sql
-- Local:  npx wrangler d1 execute whatsapp-agent-db --local  --file=schema.sql

-- One lead per (business, phone). `messages` holds up to the first 5 messages
-- (newline-separated), like the Sheets version. status/notes are the CRM bits.
CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id   TEXT NOT NULL,
  phone         TEXT NOT NULL,
  name          TEXT,
  messages      TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'new',   -- new | contacted | converted | lost
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (business_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_leads_business ON leads (business_id, updated_at);

-- One active visit request per (business, phone). `requested_time` is the
-- resolved date/time text; status lets the owner track it.
CREATE TABLE IF NOT EXISTS bookings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id    TEXT NOT NULL,
  phone          TEXT NOT NULL,
  name           TEXT,
  requested_time TEXT NOT NULL,
  message        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'requested', -- requested | confirmed | done | cancelled
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (business_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_bookings_business ON bookings (business_id, updated_at);

-- Owner accounts for the dashboard. One account per email; linked to a business
-- (matched to that business's ownerEmail at first login). Created via Google
-- sign-in (ADR 0017).
CREATE TABLE IF NOT EXISTS accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  business_id   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

-- Dashboard sessions (in D1 for strong consistency — KV's eventual consistency
-- caused flaky logins). A session id lives in an HttpOnly cookie.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  business_id TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Per-business editable settings (the FAQ knowledge + fallback), so owners can
-- update them from the dashboard. If a row is absent/blank the code config is
-- used as the default (ADR 0019). Superseded by `businesses` (ADR 0020) — the
-- businesses table now holds knowledge/fallback too; this table is left in place
-- but unused.
CREATE TABLE IF NOT EXISTS business_settings (
  business_id      TEXT PRIMARY KEY,
  knowledge        TEXT,
  fallback_message TEXT,
  updated_at       TEXT NOT NULL
);

-- Businesses (tenants) live here for self-serve (ADR 0020): lookups read D1
-- first, falling back to the code config for un-migrated businesses. Editing any
-- field in the dashboard upserts the row here (promoting it out of config).
CREATE TABLE IF NOT EXISTS businesses (
  id                       TEXT PRIMARY KEY,
  display_name             TEXT NOT NULL,
  owner_email              TEXT,
  whatsapp_phone_number_id TEXT,
  languages                TEXT NOT NULL DEFAULT '["English"]',
  knowledge                TEXT NOT NULL DEFAULT '',
  fallback_message         TEXT NOT NULL DEFAULT '',
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_businesses_phone ON businesses (whatsapp_phone_number_id);
CREATE INDEX IF NOT EXISTS idx_businesses_email ON businesses (owner_email);

-- Generic action submissions (ADR 0022): one table for every vertical action
-- (booking, order, quote…). `data` is the JSON of the collected fields.
CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  TEXT NOT NULL,
  action_key   TEXT NOT NULL,
  action_label TEXT NOT NULL,
  phone        TEXT,
  name         TEXT,
  data            TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'new',
  amount          TEXT,                                   -- payment amount (rupees), if any
  payment_status  TEXT NOT NULL DEFAULT 'none',           -- none | pending | paid
  payment_link_id TEXT,                                   -- Razorpay payment link id
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_business ON submissions (business_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_submissions_link ON submissions (payment_link_id);
