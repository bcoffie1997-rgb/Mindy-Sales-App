-- GovCon Sales Dashboard — Supabase Schema
-- Run this in your Supabase SQL editor

-- Leads and clients (unified table; type field distinguishes)
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'lead',
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  score TEXT DEFAULT 'warm',
  source TEXT,
  status TEXT DEFAULT 'new',
  first_contact_date DATE,
  last_action TEXT,
  last_action_date TIMESTAMPTZ,
  follow_up_count INTEGER DEFAULT 0,
  notes TEXT,
  client_tier TEXT,
  client_product TEXT,
  client_amount NUMERIC,
  client_start_date DATE,
  client_status TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent event log (replaces agent-events.jsonl)
CREATE TABLE IF NOT EXISTS agent_events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_name TEXT,
  event_type TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calls cache (replaces today-calls.json; agents upsert a single row)
CREATE TABLE IF NOT EXISTS calls_cache (
  id INTEGER PRIMARY KEY DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{"today":[],"tomorrow":[],"this_week":[],"generated_at":null}',
  generated_at TIMESTAMPTZ
);

INSERT INTO calls_cache (id, payload) VALUES (1, '{"today":[],"tomorrow":[],"this_week":[],"generated_at":null}')
  ON CONFLICT (id) DO NOTHING;

-- Reports (replaces data/reports/**/*.md files)
CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'daily',
  report_date DATE,
  report_type TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Proposals (replaces data/proposals/*.md)
CREATE TABLE IF NOT EXISTS proposals (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stripe charge cache (replaces data/stripe-cache.json; one row, refreshed every 30 min)
CREATE TABLE IF NOT EXISTS stripe_cache (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '[]',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO stripe_cache (id, data) VALUES (1, '[]')
  ON CONFLICT (id) DO NOTHING;

-- Auto-update updated_at on leads
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS leads_type_idx ON leads(type);
CREATE INDEX IF NOT EXISTS leads_score_idx ON leads(score);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS agent_events_agent_idx ON agent_events(agent_name);
CREATE INDEX IF NOT EXISTS agent_events_ts_idx ON agent_events(ts DESC);
CREATE INDEX IF NOT EXISTS reports_filename_idx ON reports(filename);
CREATE INDEX IF NOT EXISTS reports_category_idx ON reports(category);
