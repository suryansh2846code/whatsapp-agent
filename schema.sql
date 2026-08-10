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
