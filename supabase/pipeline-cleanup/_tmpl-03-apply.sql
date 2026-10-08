-- ============================================================================
-- STEP 5 — APPLY.  DO NOT RUN until 01-backup.sql passed and you approved the
-- dry run. Wrapped in a transaction: inspect the row counts, then COMMIT.
-- ============================================================================
-- Safe to run twice: notes are only appended when not already present, and
-- every write is keyed to the resolved row id.
--
-- What it does NOT do, on purpose:
--   * never touches a lead that is not one of your 25 rows or 3 merge dups
--   * never overwrites notes, only appends
--   * never deletes anything, merges included
--   * never sets opp_value where you left the value blank
--   * never flips type to 'client' (that would remove the row from the board,
--     because /api/leads-only filters type <> 'client')
--   * never touches the "AK" / $20K / $11K-per-month flagged rows
-- ============================================================================

BEGIN;

-- ─────────────────────── 1. UPDATE the rows that already exist ───────────────────────
WITH
-- @@DATASET@@
, to_update AS (SELECT * FROM matched WHERE target_id IS NOT NULL)
UPDATE leads AS l
SET
  status = u.new_status,

  -- Real payment dates where you gave one; fallback only fills a blank;
  -- otherwise reset the clock only when the stage actually moved.
  last_action_date = CASE
      WHEN u.set_date IS NOT NULL                                      THEN u.set_date::timestamptz
      WHEN u.fallback_date IS NOT NULL AND l.last_action_date IS NULL  THEN u.fallback_date::timestamptz
      WHEN u.fallback_date IS NOT NULL                                 THEN l.last_action_date
      WHEN l.status <> u.new_status                                    THEN now()
      ELSE l.last_action_date
    END,
  last_action = CASE WHEN l.status <> u.new_status
                     THEN 'Pipeline cleanup 2026-10-08: moved to ' || u.new_status
                     ELSE l.last_action END,

  -- Append the note. Never overwrite. Skipped entirely if already present.
  notes = CASE
            WHEN position(u.note in COALESCE(l.notes, '')) > 0 THEN l.notes
            WHEN COALESCE(btrim(l.notes), '') = ''             THEN '[2026-10-08] ' || u.note
            ELSE l.notes || E'\n' || '[2026-10-08] ' || u.note
          END,

  -- Shallow-merge the metadata keys. Any key not named here is preserved.
  -- The trailing subtraction clears opp_value where you asked for it; removing
  -- the '__noop__' key is a no-op everywhere else.
  metadata = (
    COALESCE(l.metadata, '{}'::jsonb)
      || CASE WHEN u.opp_value IS NOT NULL
              THEN jsonb_build_object('opp_value', u.opp_value) ELSE '{}'::jsonb END
      || CASE WHEN u.set_managed
              THEN jsonb_build_object('managed', true) ELSE '{}'::jsonb END
      || CASE WHEN u.sessions_total IS NOT NULL
              THEN jsonb_build_object('sessions_total', u.sessions_total) ELSE '{}'::jsonb END
      || CASE WHEN u.amount_paid IS NOT NULL
              THEN jsonb_build_object('amount_paid', u.amount_paid) ELSE '{}'::jsonb END
      || CASE WHEN u.balance_due IS NOT NULL
              THEN jsonb_build_object('balance_due', u.balance_due) ELSE '{}'::jsonb END
      || CASE WHEN u.next_payment_due IS NOT NULL
              THEN jsonb_build_object('next_payment_due', to_char(u.next_payment_due, 'YYYY-MM-DD'))
              ELSE '{}'::jsonb END
      || CASE WHEN u.all_sessions_done
              THEN jsonb_build_object('sessions', (
                     SELECT jsonb_agg(
                              jsonb_build_object('n', g, 'done', true, 'date', '', 'note', '')
                              ORDER BY g)
                     FROM generate_series(1, 12) AS g))
              ELSE '{}'::jsonb END
  ) - CASE WHEN u.clear_opp_value THEN 'opp_value' ELSE '__noop__' END
FROM to_update AS u
WHERE l.id = u.target_id;


-- ─────────────────────── 2. INSERT the people with no row yet ───────────────────────
WITH
-- @@DATASET@@
, to_insert AS (SELECT * FROM matched WHERE target_id IS NULL)
INSERT INTO leads (
  id, type, name, email, company, score, source, status,
  last_action, last_action_date, notes, metadata
)
SELECT
  'manual-2026-10-08-' || regexp_replace(lower(btrim(n.email)), '[^a-z0-9]+', '-', 'g'),
  'lead',
  n.full_name,
  lower(btrim(n.email)),
  n.company,
  'WARM',
  'manual-pipeline-cleanup-2026-10-08',
  n.new_status,
  'Pipeline cleanup 2026-10-08: created at stage ' || n.new_status,
  COALESCE(n.set_date::timestamptz, n.fallback_date::timestamptz, now()),
  '[2026-10-08] ' || n.note,
  (
    '{}'::jsonb
      || CASE WHEN n.opp_value IS NOT NULL
              THEN jsonb_build_object('opp_value', n.opp_value) ELSE '{}'::jsonb END
      || CASE WHEN n.set_managed
              THEN jsonb_build_object('managed', true) ELSE '{}'::jsonb END
      || CASE WHEN n.sessions_total IS NOT NULL
              THEN jsonb_build_object('sessions_total', n.sessions_total) ELSE '{}'::jsonb END
      || CASE WHEN n.amount_paid IS NOT NULL
              THEN jsonb_build_object('amount_paid', n.amount_paid) ELSE '{}'::jsonb END
      || CASE WHEN n.balance_due IS NOT NULL
              THEN jsonb_build_object('balance_due', n.balance_due) ELSE '{}'::jsonb END
      || CASE WHEN n.next_payment_due IS NOT NULL
              THEN jsonb_build_object('next_payment_due', to_char(n.next_payment_due, 'YYYY-MM-DD'))
              ELSE '{}'::jsonb END
      || CASE WHEN n.all_sessions_done
              THEN jsonb_build_object('sessions', (
                     SELECT jsonb_agg(
                              jsonb_build_object('n', g, 'done', true, 'date', '', 'note', '')
                              ORDER BY g)
                     FROM generate_series(1, 12) AS g))
              ELSE '{}'::jsonb END
  ) - CASE WHEN n.clear_opp_value THEN 'opp_value' ELSE '__noop__' END
FROM to_insert AS n
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────── 3. CLOSE OUT the 3 duplicate rows ───────────────────────
-- Nothing is deleted. The row stays, moves to Lost, and says where it went.
-- The surviving contact already carries the secondary email in its notes.
WITH
-- @@DATASET@@
UPDATE leads AS l
SET
  status           = 'closed_lost',
  last_action      = 'Pipeline cleanup 2026-10-08: ' || p.merge_note,
  last_action_date = now(),
  notes = CASE
            WHEN position(p.merge_note in COALESCE(l.notes, '')) > 0 THEN l.notes
            WHEN COALESCE(btrim(l.notes), '') = ''             THEN '[2026-10-08] ' || p.merge_note
            ELSE l.notes || E'\n' || '[2026-10-08] ' || p.merge_note
          END
FROM merge_plan AS p
WHERE l.id = p.dup_id;


-- Expect: UPDATE (existing contacts), INSERT (new contacts), UPDATE 3 (merges).
-- Then:
COMMIT;
-- ...or if anything looks wrong:
-- ROLLBACK;
