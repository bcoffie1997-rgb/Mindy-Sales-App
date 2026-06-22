-- Run this in the Supabase SQL editor to add the Fireflies transcripts table.

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  title TEXT,
  meeting_date TIMESTAMPTZ,
  duration NUMERIC,
  transcript_url TEXT,
  participants JSONB DEFAULT '[]',
  overview TEXT,
  short_summary TEXT,
  action_items TEXT,
  keywords JSONB DEFAULT '[]',
  matched_lead_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transcripts_date_idx ON transcripts(meeting_date DESC);
CREATE INDEX IF NOT EXISTS transcripts_lead_idx ON transcripts(matched_lead_id);

ALTER TABLE transcripts DISABLE ROW LEVEL SECURITY;
