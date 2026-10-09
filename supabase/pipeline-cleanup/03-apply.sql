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
--   * never writes in_pipeline=false anywhere. The ~2.5k imported leads are
--     left completely untouched; the board treats a missing key as false.
-- ============================================================================

BEGIN;

-- ─────────────────────── 1. UPDATE the rows that already exist ───────────────────────
WITH
incoming (ref, full_name, alt_name, company, email, new_status, opp_value, clear_opp_value,
          set_managed, sessions_total, all_sessions_done, in_pipeline, temperature,
          amount_paid, balance_due, next_payment_due, set_date, fallback_date, note) AS (
  VALUES
  -- ─────────────── WON — paid consulting, also pushed to BD / Consulting ───────────────
  -- in_pipeline = true puts the row on the board. Rows without the key are
  -- treated as false by the UI, so the ~2.5k imported leads stay hidden without
  -- this script touching a single one of them.
  -- temperature = NULL for Won and Lost, so no badge is shown.
  -- set_date      = always write this last_action_date (the real payment date)
  -- fallback_date = only write it if the row has no last_action_date yet
  ( 1, 'Delmar Bennett',       NULL::text,  'Revo Construction',          'delmarbennett@revoconstruction.com', 'closed_won',    6000::numeric, false, true,  12::int, false, true, NULL::text, 3000::numeric, 3000::numeric, '2026-11-30'::date, '2026-10-01'::date, NULL::date,
    'Paid $3K of $6K, first installment Oct 1. Balance $3K due by Nov 30. Mindy onboarding done Oct 6. 1st consulting call w/ Eric Oct 9.'),
  ( 2, 'Tim Dieschbourg',      NULL,        'Task Construction Group',    'tim@taskcg.com',                     'closed_won',    6000,          false, true,  12,      false, true, NULL,       6000,          0,             NULL,               '2026-09-22',       NULL,
    'Payment confirmed, $6K paid in full. Engagement letter Sep 3, onboarded Oct 7.'),
  ( 3, 'Kamesha',              'Camiesha',  'EAI Industries LLC',         'cameisha2005@gmail.com',             'closed_won',    6000,          false, true,  12,      true,  true, NULL,       6000,          0,             NULL,               NULL,               '2026-09-01',
    'Name also spelled Camiesha. $6K paid in full. 12 of 12 sessions used - now billed hourly.'),
  ( 4, 'Amir',                 NULL,        NULL,                         'amirj70@gmail.com',                  'closed_won',    6000,          false, true,  12,      false, true, NULL,       6000,          0,             NULL,               NULL,               '2026-09-01',
    'Paid full $6,000 for consulting.'),
  ( 5, 'Vance Hodge',          NULL,        NULL,                         'veman232@sbcglobal.net',             'closed_won',    6000,          false, true,  12,      false, true, NULL,       3000,          3000,          '2026-08-14',       '2026-06-15',       NULL,
    'Paid $3K of $6K, first installment Jun 15. Balance $3K is OVERDUE - was due Aug 14. Missed some sessions per Sep 11 sales meeting.'),

  -- ─────────────── PROPOSAL SENT ───────────────
  ( 6, 'Ravi Ram',             NULL,        'Dhali',                      'ravi@dhali.com',                     'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Agreement sent Oct 6 via BreezeDoc. Ravi cancelled Oct 8 call, will reschedule next week. Secondary email: liia@dhali.com (payments) - merged in, duplicate row closed.'),
  ( 7, 'Joseph Boyd',          NULL,        'Building Consultants Inc',   'jboyd@buildingconsultantsinc.com',   'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Committed $6K to Eric Sep 24; agreement sent. Bought Mindy only Oct 5. Consulting still unpaid. Secondary email: fisherboyd@gmail.com - merged in, duplicate row closed.'),
  ( 8, 'Jermaine Isaac',       'Jay Isaac', 'LaTronic Solutions',         'jayisaac@latronicsolutions.com',     'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    '$6K 90-Day Accelerator. TO CONFIRM: was the engagement letter actually sent?'),
  ( 9, 'Juawan Marsh',         NULL,        'J.D. Marsh Contracting',     'juawandmarsh34@gmail.com',           'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Needs $3K down; on hold until back pay arrives. Followed up Oct 1.'),
  (10, 'Denton Douglas',       NULL,        'Monarch Yachts',             'denton@monarchyachts.com',           'proposal_sent', NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Proposal + Wave invoice sent Sep 21, followed up Sep 23. Deal value intentionally left blank.'),
  (11, 'Latwan Wolfe',         NULL,        NULL,                         'latwanw@gmail.com',                  'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    '$6K offered Oct 5, Accelerator PDF sent. Wants a follow-up call with his fiancee.'),

  -- ─────────────── CALL DONE — $6K offered, follow-up needed ───────────────
  (12, 'Joe Cary',             NULL,        'After Valor Services',       'joe@aftervalorservices.com',         'call_completed', 6000,         false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered 2x$3K Oct 1. Branden finding a medical-products consultant. Secondary email: craig@suaspontedev.com (partner Craig Belluche, bought Mindy Oct 6) - merged in, duplicate row closed. SAME deal, do not double count.'),
  (13, 'Michael L',            NULL,        'cbaytech',                   'michael@cbaytech.com',               'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'IT SDVOSB. Call Sep 24. No follow-up yet.'),
  (14, 'Kemi Alli',            NULL,        NULL,                         'kemi.alli@gmail.com',                'call_completed', 6000,         false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 30. Bought Mindy Sep 28.'),
  (15, 'Dr. Angela Marshall',  'Angela Marshall', 'MBD Tech',             'drmarshall@mdforwomen.com',          'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. BJ Brown (CCCC) - value carried on this row only.'),
  (16, 'Dr. BJ Brown',         'BJ Brown',  'CCCC',                       'dr.bjbrown@ccccmentalhealth.com',    'call_completed', NULL,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. Angela Marshall (MBD Tech) - value carried on her row to avoid double counting.'),
  (17, 'Kyzito Ukah',          NULL,        NULL,                         'juemservices@gmail.com',             'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 18.'),
  (18, 'Simon Kong',           NULL,        'Jemma Tech',                 'skong@jemma.tech',                   'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call Sep 17, engagement offer pending.'),
  (19, 'Erick El',             'Erick Ellis','Sille Consulting Services', 'edellis@silleconsultingservices.com','call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call Sep 25, waiting on his capability statement.'),

  -- ─────────────── CALL BOOKED — no deal value set (none quoted yet) ───────────────
  (20, 'Troy',                 NULL,        NULL,                         'troym1217@yahoo.com',                'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 8.'),
  (21, 'Brian Murphy',         NULL,        'Vertek Staffing',            'bmurphy@vertekstaffing.com',         'booked',        NULL,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 9 with Eric.'),
  (22, 'Terry Douglas',        NULL,        NULL,                         'terrydouglas828@gmail.com',          'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 13.'),
  (23, 'Cody Ronk',            NULL,        NULL,                         'codyronk1@gmail.com',                'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 16.'),
  (24, 'Ilan Lambert',         NULL,        'boost33',                    'ilan@boost33.com',                   'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 21.'),

  -- ─────────────── LOST ───────────────
  (25, 'James Roberts',        NULL,        NULL,                         'jroberts@vfmdllc.com',               'closed_lost',   NULL,          true,  false, NULL,    false, true, NULL,       NULL,          NULL,          NULL,               NULL,               NULL,
    'Wanted a revenue share arrangement, not consulting. Deal value cleared.')
),

-- ─────────────── DUPLICATE ROWS TO MERGE AWAY ───────────────
-- The secondary address goes in the main row's notes (above). Here the
-- duplicate row itself is closed out. Nothing is ever deleted, and these rows
-- deliberately do NOT get in_pipeline, so they stay off the board.
merges (dup_email, into_name, into_email) AS (
  VALUES
  ('fisherboyd@gmail.com',    'Joseph Boyd', 'jboyd@buildingconsultantsinc.com'),
  ('liia@dhali.com',          'Ravi Ram',    'ravi@dhali.com'),
  ('craig@suaspontedev.com',  'Joe Cary',    'joe@aftervalorservices.com')
),

merge_plan AS (
  SELECT
    m.dup_email,
    m.into_name,
    m.into_email,
    l.id            AS dup_id,
    l.name          AS dup_name,
    l.status        AS dup_status,
    l.notes         AS dup_notes,
    'Merged into ' || m.into_name || ' (' || m.into_email || ').' AS merge_note
  FROM merges m
  JOIN leads l ON lower(btrim(l.email)) = lower(btrim(m.dup_email))
),

-- Resolve each person to at most one existing leads row: email first
-- (case-insensitive, whitespace-trimmed), then exact name, then alt name.
-- A row already claimed as a merge duplicate can never be a match target.
matched AS (
  SELECT
    i.*,
    COALESCE(
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.email)) = lower(btrim(i.email))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.name)) = lower(btrim(i.full_name))
          AND lower(btrim(l.email)) NOT IN (SELECT lower(btrim(dup_email)) FROM merges)
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE i.alt_name IS NOT NULL
          AND lower(btrim(l.name)) = lower(btrim(i.alt_name))
          AND lower(btrim(l.email)) NOT IN (SELECT lower(btrim(dup_email)) FROM merges)
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1)
    ) AS target_id,
    (SELECT l.id FROM leads l
      WHERE lower(btrim(l.email)) = lower(btrim(i.email))
      ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1) IS NOT NULL AS matched_on_email
  FROM incoming i
)
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
      || CASE WHEN u.in_pipeline
              THEN jsonb_build_object('in_pipeline', true) ELSE '{}'::jsonb END
      || CASE WHEN u.temperature IS NOT NULL
              THEN jsonb_build_object('temperature', u.temperature) ELSE '{}'::jsonb END
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
incoming (ref, full_name, alt_name, company, email, new_status, opp_value, clear_opp_value,
          set_managed, sessions_total, all_sessions_done, in_pipeline, temperature,
          amount_paid, balance_due, next_payment_due, set_date, fallback_date, note) AS (
  VALUES
  -- ─────────────── WON — paid consulting, also pushed to BD / Consulting ───────────────
  -- in_pipeline = true puts the row on the board. Rows without the key are
  -- treated as false by the UI, so the ~2.5k imported leads stay hidden without
  -- this script touching a single one of them.
  -- temperature = NULL for Won and Lost, so no badge is shown.
  -- set_date      = always write this last_action_date (the real payment date)
  -- fallback_date = only write it if the row has no last_action_date yet
  ( 1, 'Delmar Bennett',       NULL::text,  'Revo Construction',          'delmarbennett@revoconstruction.com', 'closed_won',    6000::numeric, false, true,  12::int, false, true, NULL::text, 3000::numeric, 3000::numeric, '2026-11-30'::date, '2026-10-01'::date, NULL::date,
    'Paid $3K of $6K, first installment Oct 1. Balance $3K due by Nov 30. Mindy onboarding done Oct 6. 1st consulting call w/ Eric Oct 9.'),
  ( 2, 'Tim Dieschbourg',      NULL,        'Task Construction Group',    'tim@taskcg.com',                     'closed_won',    6000,          false, true,  12,      false, true, NULL,       6000,          0,             NULL,               '2026-09-22',       NULL,
    'Payment confirmed, $6K paid in full. Engagement letter Sep 3, onboarded Oct 7.'),
  ( 3, 'Kamesha',              'Camiesha',  'EAI Industries LLC',         'cameisha2005@gmail.com',             'closed_won',    6000,          false, true,  12,      true,  true, NULL,       6000,          0,             NULL,               NULL,               '2026-09-01',
    'Name also spelled Camiesha. $6K paid in full. 12 of 12 sessions used - now billed hourly.'),
  ( 4, 'Amir',                 NULL,        NULL,                         'amirj70@gmail.com',                  'closed_won',    6000,          false, true,  12,      false, true, NULL,       6000,          0,             NULL,               NULL,               '2026-09-01',
    'Paid full $6,000 for consulting.'),
  ( 5, 'Vance Hodge',          NULL,        NULL,                         'veman232@sbcglobal.net',             'closed_won',    6000,          false, true,  12,      false, true, NULL,       3000,          3000,          '2026-08-14',       '2026-06-15',       NULL,
    'Paid $3K of $6K, first installment Jun 15. Balance $3K is OVERDUE - was due Aug 14. Missed some sessions per Sep 11 sales meeting.'),

  -- ─────────────── PROPOSAL SENT ───────────────
  ( 6, 'Ravi Ram',             NULL,        'Dhali',                      'ravi@dhali.com',                     'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Agreement sent Oct 6 via BreezeDoc. Ravi cancelled Oct 8 call, will reschedule next week. Secondary email: liia@dhali.com (payments) - merged in, duplicate row closed.'),
  ( 7, 'Joseph Boyd',          NULL,        'Building Consultants Inc',   'jboyd@buildingconsultantsinc.com',   'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Committed $6K to Eric Sep 24; agreement sent. Bought Mindy only Oct 5. Consulting still unpaid. Secondary email: fisherboyd@gmail.com - merged in, duplicate row closed.'),
  ( 8, 'Jermaine Isaac',       'Jay Isaac', 'LaTronic Solutions',         'jayisaac@latronicsolutions.com',     'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    '$6K 90-Day Accelerator. TO CONFIRM: was the engagement letter actually sent?'),
  ( 9, 'Juawan Marsh',         NULL,        'J.D. Marsh Contracting',     'juawandmarsh34@gmail.com',           'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Needs $3K down; on hold until back pay arrives. Followed up Oct 1.'),
  (10, 'Denton Douglas',       NULL,        'Monarch Yachts',             'denton@monarchyachts.com',           'proposal_sent', NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Proposal + Wave invoice sent Sep 21, followed up Sep 23. Deal value intentionally left blank.'),
  (11, 'Latwan Wolfe',         NULL,        NULL,                         'latwanw@gmail.com',                  'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    '$6K offered Oct 5, Accelerator PDF sent. Wants a follow-up call with his fiancee.'),

  -- ─────────────── CALL DONE — $6K offered, follow-up needed ───────────────
  (12, 'Joe Cary',             NULL,        'After Valor Services',       'joe@aftervalorservices.com',         'call_completed', 6000,         false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered 2x$3K Oct 1. Branden finding a medical-products consultant. Secondary email: craig@suaspontedev.com (partner Craig Belluche, bought Mindy Oct 6) - merged in, duplicate row closed. SAME deal, do not double count.'),
  (13, 'Michael L',            NULL,        'cbaytech',                   'michael@cbaytech.com',               'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'IT SDVOSB. Call Sep 24. No follow-up yet.'),
  (14, 'Kemi Alli',            NULL,        NULL,                         'kemi.alli@gmail.com',                'call_completed', 6000,         false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 30. Bought Mindy Sep 28.'),
  (15, 'Dr. Angela Marshall',  'Angela Marshall', 'MBD Tech',             'drmarshall@mdforwomen.com',          'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. BJ Brown (CCCC) - value carried on this row only.'),
  (16, 'Dr. BJ Brown',         'BJ Brown',  'CCCC',                       'dr.bjbrown@ccccmentalhealth.com',    'call_completed', NULL,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. Angela Marshall (MBD Tech) - value carried on her row to avoid double counting.'),
  (17, 'Kyzito Ukah',          NULL,        NULL,                         'juemservices@gmail.com',             'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 18.'),
  (18, 'Simon Kong',           NULL,        'Jemma Tech',                 'skong@jemma.tech',                   'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call Sep 17, engagement offer pending.'),
  (19, 'Erick El',             'Erick Ellis','Sille Consulting Services', 'edellis@silleconsultingservices.com','call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call Sep 25, waiting on his capability statement.'),

  -- ─────────────── CALL BOOKED — no deal value set (none quoted yet) ───────────────
  (20, 'Troy',                 NULL,        NULL,                         'troym1217@yahoo.com',                'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 8.'),
  (21, 'Brian Murphy',         NULL,        'Vertek Staffing',            'bmurphy@vertekstaffing.com',         'booked',        NULL,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 9 with Eric.'),
  (22, 'Terry Douglas',        NULL,        NULL,                         'terrydouglas828@gmail.com',          'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 13.'),
  (23, 'Cody Ronk',            NULL,        NULL,                         'codyronk1@gmail.com',                'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 16.'),
  (24, 'Ilan Lambert',         NULL,        'boost33',                    'ilan@boost33.com',                   'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 21.'),

  -- ─────────────── LOST ───────────────
  (25, 'James Roberts',        NULL,        NULL,                         'jroberts@vfmdllc.com',               'closed_lost',   NULL,          true,  false, NULL,    false, true, NULL,       NULL,          NULL,          NULL,               NULL,               NULL,
    'Wanted a revenue share arrangement, not consulting. Deal value cleared.')
),

-- ─────────────── DUPLICATE ROWS TO MERGE AWAY ───────────────
-- The secondary address goes in the main row's notes (above). Here the
-- duplicate row itself is closed out. Nothing is ever deleted, and these rows
-- deliberately do NOT get in_pipeline, so they stay off the board.
merges (dup_email, into_name, into_email) AS (
  VALUES
  ('fisherboyd@gmail.com',    'Joseph Boyd', 'jboyd@buildingconsultantsinc.com'),
  ('liia@dhali.com',          'Ravi Ram',    'ravi@dhali.com'),
  ('craig@suaspontedev.com',  'Joe Cary',    'joe@aftervalorservices.com')
),

merge_plan AS (
  SELECT
    m.dup_email,
    m.into_name,
    m.into_email,
    l.id            AS dup_id,
    l.name          AS dup_name,
    l.status        AS dup_status,
    l.notes         AS dup_notes,
    'Merged into ' || m.into_name || ' (' || m.into_email || ').' AS merge_note
  FROM merges m
  JOIN leads l ON lower(btrim(l.email)) = lower(btrim(m.dup_email))
),

-- Resolve each person to at most one existing leads row: email first
-- (case-insensitive, whitespace-trimmed), then exact name, then alt name.
-- A row already claimed as a merge duplicate can never be a match target.
matched AS (
  SELECT
    i.*,
    COALESCE(
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.email)) = lower(btrim(i.email))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.name)) = lower(btrim(i.full_name))
          AND lower(btrim(l.email)) NOT IN (SELECT lower(btrim(dup_email)) FROM merges)
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE i.alt_name IS NOT NULL
          AND lower(btrim(l.name)) = lower(btrim(i.alt_name))
          AND lower(btrim(l.email)) NOT IN (SELECT lower(btrim(dup_email)) FROM merges)
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1)
    ) AS target_id,
    (SELECT l.id FROM leads l
      WHERE lower(btrim(l.email)) = lower(btrim(i.email))
      ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1) IS NOT NULL AS matched_on_email
  FROM incoming i
)
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
      || CASE WHEN n.in_pipeline
              THEN jsonb_build_object('in_pipeline', true) ELSE '{}'::jsonb END
      || CASE WHEN n.temperature IS NOT NULL
              THEN jsonb_build_object('temperature', n.temperature) ELSE '{}'::jsonb END
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
incoming (ref, full_name, alt_name, company, email, new_status, opp_value, clear_opp_value,
          set_managed, sessions_total, all_sessions_done, in_pipeline, temperature,
          amount_paid, balance_due, next_payment_due, set_date, fallback_date, note) AS (
  VALUES
  -- ─────────────── WON — paid consulting, also pushed to BD / Consulting ───────────────
  -- in_pipeline = true puts the row on the board. Rows without the key are
  -- treated as false by the UI, so the ~2.5k imported leads stay hidden without
  -- this script touching a single one of them.
  -- temperature = NULL for Won and Lost, so no badge is shown.
  -- set_date      = always write this last_action_date (the real payment date)
  -- fallback_date = only write it if the row has no last_action_date yet
  ( 1, 'Delmar Bennett',       NULL::text,  'Revo Construction',          'delmarbennett@revoconstruction.com', 'closed_won',    6000::numeric, false, true,  12::int, false, true, NULL::text, 3000::numeric, 3000::numeric, '2026-11-30'::date, '2026-10-01'::date, NULL::date,
    'Paid $3K of $6K, first installment Oct 1. Balance $3K due by Nov 30. Mindy onboarding done Oct 6. 1st consulting call w/ Eric Oct 9.'),
  ( 2, 'Tim Dieschbourg',      NULL,        'Task Construction Group',    'tim@taskcg.com',                     'closed_won',    6000,          false, true,  12,      false, true, NULL,       6000,          0,             NULL,               '2026-09-22',       NULL,
    'Payment confirmed, $6K paid in full. Engagement letter Sep 3, onboarded Oct 7.'),
  ( 3, 'Kamesha',              'Camiesha',  'EAI Industries LLC',         'cameisha2005@gmail.com',             'closed_won',    6000,          false, true,  12,      true,  true, NULL,       6000,          0,             NULL,               NULL,               '2026-09-01',
    'Name also spelled Camiesha. $6K paid in full. 12 of 12 sessions used - now billed hourly.'),
  ( 4, 'Amir',                 NULL,        NULL,                         'amirj70@gmail.com',                  'closed_won',    6000,          false, true,  12,      false, true, NULL,       6000,          0,             NULL,               NULL,               '2026-09-01',
    'Paid full $6,000 for consulting.'),
  ( 5, 'Vance Hodge',          NULL,        NULL,                         'veman232@sbcglobal.net',             'closed_won',    6000,          false, true,  12,      false, true, NULL,       3000,          3000,          '2026-08-14',       '2026-06-15',       NULL,
    'Paid $3K of $6K, first installment Jun 15. Balance $3K is OVERDUE - was due Aug 14. Missed some sessions per Sep 11 sales meeting.'),

  -- ─────────────── PROPOSAL SENT ───────────────
  ( 6, 'Ravi Ram',             NULL,        'Dhali',                      'ravi@dhali.com',                     'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Agreement sent Oct 6 via BreezeDoc. Ravi cancelled Oct 8 call, will reschedule next week. Secondary email: liia@dhali.com (payments) - merged in, duplicate row closed.'),
  ( 7, 'Joseph Boyd',          NULL,        'Building Consultants Inc',   'jboyd@buildingconsultantsinc.com',   'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Committed $6K to Eric Sep 24; agreement sent. Bought Mindy only Oct 5. Consulting still unpaid. Secondary email: fisherboyd@gmail.com - merged in, duplicate row closed.'),
  ( 8, 'Jermaine Isaac',       'Jay Isaac', 'LaTronic Solutions',         'jayisaac@latronicsolutions.com',     'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    '$6K 90-Day Accelerator. TO CONFIRM: was the engagement letter actually sent?'),
  ( 9, 'Juawan Marsh',         NULL,        'J.D. Marsh Contracting',     'juawandmarsh34@gmail.com',           'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Needs $3K down; on hold until back pay arrives. Followed up Oct 1.'),
  (10, 'Denton Douglas',       NULL,        'Monarch Yachts',             'denton@monarchyachts.com',           'proposal_sent', NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Proposal + Wave invoice sent Sep 21, followed up Sep 23. Deal value intentionally left blank.'),
  (11, 'Latwan Wolfe',         NULL,        NULL,                         'latwanw@gmail.com',                  'proposal_sent', 6000,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    '$6K offered Oct 5, Accelerator PDF sent. Wants a follow-up call with his fiancee.'),

  -- ─────────────── CALL DONE — $6K offered, follow-up needed ───────────────
  (12, 'Joe Cary',             NULL,        'After Valor Services',       'joe@aftervalorservices.com',         'call_completed', 6000,         false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered 2x$3K Oct 1. Branden finding a medical-products consultant. Secondary email: craig@suaspontedev.com (partner Craig Belluche, bought Mindy Oct 6) - merged in, duplicate row closed. SAME deal, do not double count.'),
  (13, 'Michael L',            NULL,        'cbaytech',                   'michael@cbaytech.com',               'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'IT SDVOSB. Call Sep 24. No follow-up yet.'),
  (14, 'Kemi Alli',            NULL,        NULL,                         'kemi.alli@gmail.com',                'call_completed', 6000,         false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 30. Bought Mindy Sep 28.'),
  (15, 'Dr. Angela Marshall',  'Angela Marshall', 'MBD Tech',             'drmarshall@mdforwomen.com',          'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. BJ Brown (CCCC) - value carried on this row only.'),
  (16, 'Dr. BJ Brown',         'BJ Brown',  'CCCC',                       'dr.bjbrown@ccccmentalhealth.com',    'call_completed', NULL,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. Angela Marshall (MBD Tech) - value carried on her row to avoid double counting.'),
  (17, 'Kyzito Ukah',          NULL,        NULL,                         'juemservices@gmail.com',             'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Offered Sep 18.'),
  (18, 'Simon Kong',           NULL,        'Jemma Tech',                 'skong@jemma.tech',                   'call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call Sep 17, engagement offer pending.'),
  (19, 'Erick El',             'Erick Ellis','Sille Consulting Services', 'edellis@silleconsultingservices.com','call_completed', 6000,         false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call Sep 25, waiting on his capability statement.'),

  -- ─────────────── CALL BOOKED — no deal value set (none quoted yet) ───────────────
  (20, 'Troy',                 NULL,        NULL,                         'troym1217@yahoo.com',                'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 8.'),
  (21, 'Brian Murphy',         NULL,        'Vertek Staffing',            'bmurphy@vertekstaffing.com',         'booked',        NULL,          false, false, NULL,    false, true, 'hot',      NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 9 with Eric.'),
  (22, 'Terry Douglas',        NULL,        NULL,                         'terrydouglas828@gmail.com',          'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 13.'),
  (23, 'Cody Ronk',            NULL,        NULL,                         'codyronk1@gmail.com',                'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 16.'),
  (24, 'Ilan Lambert',         NULL,        'boost33',                    'ilan@boost33.com',                   'booked',        NULL,          false, false, NULL,    false, true, 'warm',     NULL,          NULL,          NULL,               NULL,               NULL,
    'Call booked Oct 21.'),

  -- ─────────────── LOST ───────────────
  (25, 'James Roberts',        NULL,        NULL,                         'jroberts@vfmdllc.com',               'closed_lost',   NULL,          true,  false, NULL,    false, true, NULL,       NULL,          NULL,          NULL,               NULL,               NULL,
    'Wanted a revenue share arrangement, not consulting. Deal value cleared.')
),

-- ─────────────── DUPLICATE ROWS TO MERGE AWAY ───────────────
-- The secondary address goes in the main row's notes (above). Here the
-- duplicate row itself is closed out. Nothing is ever deleted, and these rows
-- deliberately do NOT get in_pipeline, so they stay off the board.
merges (dup_email, into_name, into_email) AS (
  VALUES
  ('fisherboyd@gmail.com',    'Joseph Boyd', 'jboyd@buildingconsultantsinc.com'),
  ('liia@dhali.com',          'Ravi Ram',    'ravi@dhali.com'),
  ('craig@suaspontedev.com',  'Joe Cary',    'joe@aftervalorservices.com')
),

merge_plan AS (
  SELECT
    m.dup_email,
    m.into_name,
    m.into_email,
    l.id            AS dup_id,
    l.name          AS dup_name,
    l.status        AS dup_status,
    l.notes         AS dup_notes,
    'Merged into ' || m.into_name || ' (' || m.into_email || ').' AS merge_note
  FROM merges m
  JOIN leads l ON lower(btrim(l.email)) = lower(btrim(m.dup_email))
),

-- Resolve each person to at most one existing leads row: email first
-- (case-insensitive, whitespace-trimmed), then exact name, then alt name.
-- A row already claimed as a merge duplicate can never be a match target.
matched AS (
  SELECT
    i.*,
    COALESCE(
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.email)) = lower(btrim(i.email))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.name)) = lower(btrim(i.full_name))
          AND lower(btrim(l.email)) NOT IN (SELECT lower(btrim(dup_email)) FROM merges)
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE i.alt_name IS NOT NULL
          AND lower(btrim(l.name)) = lower(btrim(i.alt_name))
          AND lower(btrim(l.email)) NOT IN (SELECT lower(btrim(dup_email)) FROM merges)
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1)
    ) AS target_id,
    (SELECT l.id FROM leads l
      WHERE lower(btrim(l.email)) = lower(btrim(i.email))
      ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1) IS NOT NULL AS matched_on_email
  FROM incoming i
)
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
