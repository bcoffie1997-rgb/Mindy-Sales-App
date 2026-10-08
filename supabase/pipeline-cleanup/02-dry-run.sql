-- ============================================================================
-- STEP 4 — DRY RUN. READ-ONLY. Changes nothing. Run after 01-backup.sql.
-- ============================================================================
--   Q1  the change table: 25 contacts + 3 duplicate merges
--   Q2  every OTHER lead currently in the pipeline that is not on your list
--   Q3  possible "AK" rows, and proposals worth ~$20K or ~$11K/month (FLAG ONLY)
--   Q4  remaining duplicate / near-duplicate check
-- ============================================================================


-- ─────────────────────────── Q1 — THE CHANGE TABLE ───────────────────────────
WITH
incoming (ref, full_name, alt_name, company, email, new_status, opp_value, clear_opp_value,
          set_managed, sessions_total, all_sessions_done, set_date, fallback_date, note) AS (
  VALUES
  -- ─────────────── WON — paid consulting, also pushed to BD / Consulting ───────────────
  -- set_date      = always write this last_action_date (the real payment date)
  -- fallback_date = only write it if the row has no last_action_date yet
  ( 1, 'Delmar Bennett',       NULL::text,  'Revo Construction',          'delmarbennett@revoconstruction.com', 'closed_won',    6000::numeric, false, true,  12::int, false, '2026-10-01'::date, NULL::date,
    'Paid 90-Day Accelerator Oct 1. Mindy onboarding done Oct 6. 1st consulting call w/ Eric Oct 9.'),
  ( 2, 'Tim Dieschbourg',      NULL,        'Task Construction Group',    'tim@taskcg.com',                     'closed_won',    6000,          false, true,  12,      false, '2026-09-22',       NULL,
    'Payment confirmed. Engagement letter Sep 3, onboarded Oct 7.'),
  ( 3, 'Kamesha',              'Camiesha',  'EAI Industries LLC',         'cameisha2005@gmail.com',             'closed_won',    6000,          false, true,  12,      true,  NULL,               '2026-09-01',
    'Name also spelled Camiesha. 12 of 12 sessions used - now billed hourly.'),
  ( 4, 'Amir',                 NULL,        NULL,                         'amirj70@gmail.com',                  'closed_won',    6000,          false, true,  12,      false, NULL,               '2026-09-01',
    'Paid full $6,000 for consulting.'),
  ( 5, 'Vance Hodge',          NULL,        NULL,                         'veman232@sbcglobal.net',             'closed_won',    6000,          false, true,  12,      false, '2026-06-15',       NULL,
    'Paid $3K of $6K. Balance $3K outstanding. Missed some sessions per Sep 11 sales meeting.'),

  -- ─────────────── PROPOSAL SENT ───────────────
  ( 6, 'Ravi Ram',             NULL,        'Dhali',                      'ravi@dhali.com',                     'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    'Agreement sent Oct 6 via BreezeDoc. Ravi cancelled Oct 8 call, will reschedule next week. Secondary email: liia@dhali.com (payments) - merged in, duplicate row closed.'),
  ( 7, 'Joseph Boyd',          NULL,        'Building Consultants Inc',   'jboyd@buildingconsultantsinc.com',   'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    'Committed $6K to Eric Sep 24; agreement sent. Bought Mindy only Oct 5. Consulting still unpaid. Secondary email: fisherboyd@gmail.com - merged in, duplicate row closed.'),
  ( 8, 'Jermaine Isaac',       'Jay Isaac', 'LaTronic Solutions',         'jayisaac@latronicsolutions.com',     'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    '$6K 90-Day Accelerator. TO CONFIRM: was the engagement letter actually sent?'),
  ( 9, 'Juawan Marsh',         NULL,        'J.D. Marsh Contracting',     'juawandmarsh34@gmail.com',           'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    'Needs $3K down; on hold until back pay arrives. Followed up Oct 1.'),
  (10, 'Denton Douglas',       NULL,        'Monarch Yachts',             'denton@monarchyachts.com',           'proposal_sent', NULL,          false, false, NULL,    false, NULL,               NULL,
    'Proposal + Wave invoice sent Sep 21, followed up Sep 23. Deal value intentionally left blank.'),
  (11, 'Latwan Wolfe',         NULL,        NULL,                         'latwanw@gmail.com',                  'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    '$6K offered Oct 5, Accelerator PDF sent. Wants a follow-up call with his fiancee.'),

  -- ─────────────── CALL DONE — $6K offered, follow-up needed ───────────────
  (12, 'Joe Cary',             NULL,        'After Valor Services',       'joe@aftervalorservices.com',         'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered 2x$3K Oct 1. Branden finding a medical-products consultant. Secondary email: craig@suaspontedev.com (partner Craig Belluche, bought Mindy Oct 6) - merged in, duplicate row closed. SAME deal, do not double count.'),
  (13, 'Michael L',            NULL,        'cbaytech',                   'michael@cbaytech.com',               'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'IT SDVOSB. Call Sep 24. No follow-up yet.'),
  (14, 'Kemi Alli',            NULL,        NULL,                         'kemi.alli@gmail.com',                'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 30. Bought Mindy Sep 28.'),
  (15, 'Dr. Angela Marshall',  'Angela Marshall', 'MBD Tech',             'drmarshall@mdforwomen.com',          'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. BJ Brown (CCCC) - value carried on this row only.'),
  (16, 'Dr. BJ Brown',         'BJ Brown',  'CCCC',                       'dr.bjbrown@ccccmentalhealth.com',    'call_completed', NULL,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. Angela Marshall (MBD Tech) - value carried on her row to avoid double counting.'),
  (17, 'Kyzito Ukah',          NULL,        NULL,                         'juemservices@gmail.com',             'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 18.'),
  (18, 'Simon Kong',           NULL,        'Jemma Tech',                 'skong@jemma.tech',                   'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Call Sep 17, engagement offer pending.'),
  (19, 'Erick El',             'Erick Ellis','Sille Consulting Services', 'edellis@silleconsultingservices.com','call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Call Sep 25, waiting on his capability statement.'),

  -- ─────────────── CALL BOOKED — no deal value set (none quoted yet) ───────────────
  (20, 'Troy',                 NULL,        NULL,                         'troym1217@yahoo.com',                'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 8.'),
  (21, 'Brian Murphy',         NULL,        'Vertek Staffing',            'bmurphy@vertekstaffing.com',         'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 9 with Eric.'),
  (22, 'Terry Douglas',        NULL,        NULL,                         'terrydouglas828@gmail.com',          'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 13.'),
  (23, 'Cody Ronk',            NULL,        NULL,                         'codyronk1@gmail.com',                'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 16.'),
  (24, 'Ilan Lambert',         NULL,        'boost33',                    'ilan@boost33.com',                   'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 21.'),

  -- ─────────────── LOST ───────────────
  (25, 'James Roberts',        NULL,        NULL,                         'jroberts@vfmdllc.com',               'closed_lost',   NULL,          true,  false, NULL,    false, NULL,               NULL,
    'Wanted a revenue share arrangement, not consulting. Deal value cleared.')
),

-- ─────────────── DUPLICATE ROWS TO MERGE AWAY ───────────────
-- The secondary address goes in the main row's notes (above). Here the
-- duplicate row itself is closed out. Nothing is ever deleted.
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
SELECT change_type, ref, name, matched_row_id, matched_how, status_change,
       opp_value_change, last_action_date_change, bd_flags, note_being_added
FROM (
SELECT
  1                                                        AS grp,
  m.ref                                                    AS sort_ref,
  'contact'                                                AS change_type,
  m.ref::text                                              AS ref,
  m.full_name                                              AS name,
  COALESCE(m.target_id, '** NEW ROW **')                   AS matched_row_id,
  CASE WHEN m.target_id IS NULL THEN 'n/a (create)'
       WHEN m.matched_on_email THEN 'email'
       ELSE 'NAME ONLY - eyeball this' END                 AS matched_how,
  COALESCE(l.status, '(none)') || ' -> ' || m.new_status
    || CASE WHEN l.status = m.new_status THEN '  (no change)' ELSE '' END AS status_change,
  COALESCE((l.metadata->>'opp_value'), '(unset)') || ' -> ' ||
    CASE WHEN m.clear_opp_value       THEN 'CLEARED'
         WHEN m.opp_value IS NOT NULL THEN m.opp_value::text
         ELSE 'left as-is' END                             AS opp_value_change,
  COALESCE(to_char(l.last_action_date, 'YYYY-MM-DD'), '(none)') || ' -> ' ||
    CASE WHEN m.set_date IS NOT NULL THEN to_char(m.set_date, 'YYYY-MM-DD') || ' (forced)'
         WHEN m.fallback_date IS NOT NULL AND l.last_action_date IS NULL
              THEN to_char(m.fallback_date, 'YYYY-MM-DD') || ' (fallback)'
         WHEN m.fallback_date IS NOT NULL THEN 'kept'
         WHEN l.status IS DISTINCT FROM m.new_status THEN 'today (stage moved)'
         ELSE 'kept' END                                   AS last_action_date_change,
  NULLIF(
    CASE WHEN m.set_managed THEN 'managed=true ' ELSE '' END ||
    CASE WHEN m.sessions_total IS NOT NULL THEN 'sessions_total=' || m.sessions_total ELSE '' END ||
    CASE WHEN m.all_sessions_done THEN ' +12 done' ELSE '' END, '')  AS bd_flags,
  CASE WHEN position(m.note in COALESCE(l.notes, '')) > 0
       THEN '(already present - will NOT re-append)'
       ELSE m.note END                                     AS note_being_added
FROM matched m
LEFT JOIN leads l ON l.id = m.target_id

UNION ALL

SELECT
  2                                                        AS grp,
  0                                                        AS sort_ref,
  'MERGE dup'                                              AS change_type,
  '-'                                                      AS ref,
  p.dup_name                                               AS name,
  p.dup_id                                                 AS matched_row_id,
  'email: ' || p.dup_email                                 AS matched_how,
  p.dup_status || ' -> closed_lost'                        AS status_change,
  'left as-is'                                             AS opp_value_change,
  'today (merged)'                                         AS last_action_date_change,
  NULL                                                     AS bd_flags,
  p.merge_note                                             AS note_being_added
FROM merge_plan p
) t
ORDER BY grp, sort_ref;


-- ───────────── Q2 — EVERY OTHER LEAD IN THE PIPELINE (NOT TOUCHED) ─────────────
WITH
incoming (ref, full_name, alt_name, company, email, new_status, opp_value, clear_opp_value,
          set_managed, sessions_total, all_sessions_done, set_date, fallback_date, note) AS (
  VALUES
  -- ─────────────── WON — paid consulting, also pushed to BD / Consulting ───────────────
  -- set_date      = always write this last_action_date (the real payment date)
  -- fallback_date = only write it if the row has no last_action_date yet
  ( 1, 'Delmar Bennett',       NULL::text,  'Revo Construction',          'delmarbennett@revoconstruction.com', 'closed_won',    6000::numeric, false, true,  12::int, false, '2026-10-01'::date, NULL::date,
    'Paid 90-Day Accelerator Oct 1. Mindy onboarding done Oct 6. 1st consulting call w/ Eric Oct 9.'),
  ( 2, 'Tim Dieschbourg',      NULL,        'Task Construction Group',    'tim@taskcg.com',                     'closed_won',    6000,          false, true,  12,      false, '2026-09-22',       NULL,
    'Payment confirmed. Engagement letter Sep 3, onboarded Oct 7.'),
  ( 3, 'Kamesha',              'Camiesha',  'EAI Industries LLC',         'cameisha2005@gmail.com',             'closed_won',    6000,          false, true,  12,      true,  NULL,               '2026-09-01',
    'Name also spelled Camiesha. 12 of 12 sessions used - now billed hourly.'),
  ( 4, 'Amir',                 NULL,        NULL,                         'amirj70@gmail.com',                  'closed_won',    6000,          false, true,  12,      false, NULL,               '2026-09-01',
    'Paid full $6,000 for consulting.'),
  ( 5, 'Vance Hodge',          NULL,        NULL,                         'veman232@sbcglobal.net',             'closed_won',    6000,          false, true,  12,      false, '2026-06-15',       NULL,
    'Paid $3K of $6K. Balance $3K outstanding. Missed some sessions per Sep 11 sales meeting.'),

  -- ─────────────── PROPOSAL SENT ───────────────
  ( 6, 'Ravi Ram',             NULL,        'Dhali',                      'ravi@dhali.com',                     'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    'Agreement sent Oct 6 via BreezeDoc. Ravi cancelled Oct 8 call, will reschedule next week. Secondary email: liia@dhali.com (payments) - merged in, duplicate row closed.'),
  ( 7, 'Joseph Boyd',          NULL,        'Building Consultants Inc',   'jboyd@buildingconsultantsinc.com',   'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    'Committed $6K to Eric Sep 24; agreement sent. Bought Mindy only Oct 5. Consulting still unpaid. Secondary email: fisherboyd@gmail.com - merged in, duplicate row closed.'),
  ( 8, 'Jermaine Isaac',       'Jay Isaac', 'LaTronic Solutions',         'jayisaac@latronicsolutions.com',     'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    '$6K 90-Day Accelerator. TO CONFIRM: was the engagement letter actually sent?'),
  ( 9, 'Juawan Marsh',         NULL,        'J.D. Marsh Contracting',     'juawandmarsh34@gmail.com',           'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    'Needs $3K down; on hold until back pay arrives. Followed up Oct 1.'),
  (10, 'Denton Douglas',       NULL,        'Monarch Yachts',             'denton@monarchyachts.com',           'proposal_sent', NULL,          false, false, NULL,    false, NULL,               NULL,
    'Proposal + Wave invoice sent Sep 21, followed up Sep 23. Deal value intentionally left blank.'),
  (11, 'Latwan Wolfe',         NULL,        NULL,                         'latwanw@gmail.com',                  'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    '$6K offered Oct 5, Accelerator PDF sent. Wants a follow-up call with his fiancee.'),

  -- ─────────────── CALL DONE — $6K offered, follow-up needed ───────────────
  (12, 'Joe Cary',             NULL,        'After Valor Services',       'joe@aftervalorservices.com',         'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered 2x$3K Oct 1. Branden finding a medical-products consultant. Secondary email: craig@suaspontedev.com (partner Craig Belluche, bought Mindy Oct 6) - merged in, duplicate row closed. SAME deal, do not double count.'),
  (13, 'Michael L',            NULL,        'cbaytech',                   'michael@cbaytech.com',               'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'IT SDVOSB. Call Sep 24. No follow-up yet.'),
  (14, 'Kemi Alli',            NULL,        NULL,                         'kemi.alli@gmail.com',                'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 30. Bought Mindy Sep 28.'),
  (15, 'Dr. Angela Marshall',  'Angela Marshall', 'MBD Tech',             'drmarshall@mdforwomen.com',          'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. BJ Brown (CCCC) - value carried on this row only.'),
  (16, 'Dr. BJ Brown',         'BJ Brown',  'CCCC',                       'dr.bjbrown@ccccmentalhealth.com',    'call_completed', NULL,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. Angela Marshall (MBD Tech) - value carried on her row to avoid double counting.'),
  (17, 'Kyzito Ukah',          NULL,        NULL,                         'juemservices@gmail.com',             'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 18.'),
  (18, 'Simon Kong',           NULL,        'Jemma Tech',                 'skong@jemma.tech',                   'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Call Sep 17, engagement offer pending.'),
  (19, 'Erick El',             'Erick Ellis','Sille Consulting Services', 'edellis@silleconsultingservices.com','call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Call Sep 25, waiting on his capability statement.'),

  -- ─────────────── CALL BOOKED — no deal value set (none quoted yet) ───────────────
  (20, 'Troy',                 NULL,        NULL,                         'troym1217@yahoo.com',                'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 8.'),
  (21, 'Brian Murphy',         NULL,        'Vertek Staffing',            'bmurphy@vertekstaffing.com',         'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 9 with Eric.'),
  (22, 'Terry Douglas',        NULL,        NULL,                         'terrydouglas828@gmail.com',          'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 13.'),
  (23, 'Cody Ronk',            NULL,        NULL,                         'codyronk1@gmail.com',                'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 16.'),
  (24, 'Ilan Lambert',         NULL,        'boost33',                    'ilan@boost33.com',                   'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 21.'),

  -- ─────────────── LOST ───────────────
  (25, 'James Roberts',        NULL,        NULL,                         'jroberts@vfmdllc.com',               'closed_lost',   NULL,          true,  false, NULL,    false, NULL,               NULL,
    'Wanted a revenue share arrangement, not consulting. Deal value cleared.')
),

-- ─────────────── DUPLICATE ROWS TO MERGE AWAY ───────────────
-- The secondary address goes in the main row's notes (above). Here the
-- duplicate row itself is closed out. Nothing is ever deleted.
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
SELECT
  l.status,
  l.id,
  l.name,
  l.company,
  l.email,
  l.score,
  l.metadata->>'opp_value'                 AS opp_value,
  (l.metadata->>'managed')                 AS managed,
  l.last_action_date::date                 AS last_action,
  left(COALESCE(l.last_action, ''), 60)    AS last_action_text
FROM leads l
WHERE l.type <> 'client'                          -- same filter the board uses
  AND l.id NOT IN (SELECT target_id FROM matched WHERE target_id IS NOT NULL)
  AND l.id NOT IN (SELECT dup_id     FROM merge_plan)
ORDER BY
  array_position(ARRAY['closed_won','paid','proposal_sent','call_completed',
                       'booked','no_show','meeting_interest','first_touch_drafted',
                       'new','closed_lost','unsubscribed'], l.status),
  l.last_action_date DESC NULLS LAST;

-- Same thing as a count per stage, if the full list is too long:
-- SELECT status, count(*) FROM leads WHERE type <> 'client' GROUP BY status ORDER BY 2 DESC;


-- ───────── Q3 — FLAGS ONLY, NOTHING CHANGED: "AK" + ~$20K / ~$11K-per-month ─────────
-- Still unidentified. These are candidates to eyeball, never written to.
SELECT
  'possible AK'                            AS flag_reason,
  l.id, l.name, l.company, l.email, l.status,
  l.metadata->>'opp_value'                 AS opp_value,
  l.client_amount,
  left(COALESCE(l.notes, ''), 200)         AS notes_excerpt
FROM leads l
WHERE
      l.name    ~* '^\s*a[a-z]*\.?\s+k[a-z]*'
   OR l.company ~* '^\s*a[a-z]*\.?\s+k[a-z]*'
   OR l.name    ~* '(^|[^a-z])a\.?\s?k\.?([^a-z]|$)'
   OR l.company ~* '(^|[^a-z])a\.?\s?k\.?([^a-z]|$)'

UNION ALL

SELECT
  'value ~20k or ~11k/mo'                  AS flag_reason,
  l.id, l.name, l.company, l.email, l.status,
  l.metadata->>'opp_value'                 AS opp_value,
  l.client_amount,
  left(COALESCE(l.notes, ''), 200)         AS notes_excerpt
FROM leads l
WHERE
      ( (l.metadata->>'opp_value') ~ '^[0-9.]+$'
        AND ( (l.metadata->>'opp_value')::numeric BETWEEN 18000 AND 22000
           OR (l.metadata->>'opp_value')::numeric BETWEEN 10000 AND 12000
           OR (l.metadata->>'opp_value')::numeric BETWEEN 125000 AND 140000 ) )
   OR COALESCE(l.notes, '') || ' ' || COALESCE(l.client_amount::text, '')
        ~* '(\$?\s?20[,.]?0{3})|(\$?\s?20\s?k)|(\$?\s?11[,.]?0{3})|(\$?\s?11\s?k)'
ORDER BY flag_reason, opp_value NULLS LAST;


-- ───────── Q4 — ANY REMAINING NEAR-DUPLICATE AMONG YOUR 25 ─────────
-- A row whose NAME matches one of your 25 but whose email does not, and which
-- is not already handled as a merge. Each of these is a possible duplicate.
WITH
incoming (ref, full_name, alt_name, company, email, new_status, opp_value, clear_opp_value,
          set_managed, sessions_total, all_sessions_done, set_date, fallback_date, note) AS (
  VALUES
  -- ─────────────── WON — paid consulting, also pushed to BD / Consulting ───────────────
  -- set_date      = always write this last_action_date (the real payment date)
  -- fallback_date = only write it if the row has no last_action_date yet
  ( 1, 'Delmar Bennett',       NULL::text,  'Revo Construction',          'delmarbennett@revoconstruction.com', 'closed_won',    6000::numeric, false, true,  12::int, false, '2026-10-01'::date, NULL::date,
    'Paid 90-Day Accelerator Oct 1. Mindy onboarding done Oct 6. 1st consulting call w/ Eric Oct 9.'),
  ( 2, 'Tim Dieschbourg',      NULL,        'Task Construction Group',    'tim@taskcg.com',                     'closed_won',    6000,          false, true,  12,      false, '2026-09-22',       NULL,
    'Payment confirmed. Engagement letter Sep 3, onboarded Oct 7.'),
  ( 3, 'Kamesha',              'Camiesha',  'EAI Industries LLC',         'cameisha2005@gmail.com',             'closed_won',    6000,          false, true,  12,      true,  NULL,               '2026-09-01',
    'Name also spelled Camiesha. 12 of 12 sessions used - now billed hourly.'),
  ( 4, 'Amir',                 NULL,        NULL,                         'amirj70@gmail.com',                  'closed_won',    6000,          false, true,  12,      false, NULL,               '2026-09-01',
    'Paid full $6,000 for consulting.'),
  ( 5, 'Vance Hodge',          NULL,        NULL,                         'veman232@sbcglobal.net',             'closed_won',    6000,          false, true,  12,      false, '2026-06-15',       NULL,
    'Paid $3K of $6K. Balance $3K outstanding. Missed some sessions per Sep 11 sales meeting.'),

  -- ─────────────── PROPOSAL SENT ───────────────
  ( 6, 'Ravi Ram',             NULL,        'Dhali',                      'ravi@dhali.com',                     'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    'Agreement sent Oct 6 via BreezeDoc. Ravi cancelled Oct 8 call, will reschedule next week. Secondary email: liia@dhali.com (payments) - merged in, duplicate row closed.'),
  ( 7, 'Joseph Boyd',          NULL,        'Building Consultants Inc',   'jboyd@buildingconsultantsinc.com',   'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    'Committed $6K to Eric Sep 24; agreement sent. Bought Mindy only Oct 5. Consulting still unpaid. Secondary email: fisherboyd@gmail.com - merged in, duplicate row closed.'),
  ( 8, 'Jermaine Isaac',       'Jay Isaac', 'LaTronic Solutions',         'jayisaac@latronicsolutions.com',     'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    '$6K 90-Day Accelerator. TO CONFIRM: was the engagement letter actually sent?'),
  ( 9, 'Juawan Marsh',         NULL,        'J.D. Marsh Contracting',     'juawandmarsh34@gmail.com',           'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    'Needs $3K down; on hold until back pay arrives. Followed up Oct 1.'),
  (10, 'Denton Douglas',       NULL,        'Monarch Yachts',             'denton@monarchyachts.com',           'proposal_sent', NULL,          false, false, NULL,    false, NULL,               NULL,
    'Proposal + Wave invoice sent Sep 21, followed up Sep 23. Deal value intentionally left blank.'),
  (11, 'Latwan Wolfe',         NULL,        NULL,                         'latwanw@gmail.com',                  'proposal_sent', 6000,          false, false, NULL,    false, NULL,               NULL,
    '$6K offered Oct 5, Accelerator PDF sent. Wants a follow-up call with his fiancee.'),

  -- ─────────────── CALL DONE — $6K offered, follow-up needed ───────────────
  (12, 'Joe Cary',             NULL,        'After Valor Services',       'joe@aftervalorservices.com',         'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered 2x$3K Oct 1. Branden finding a medical-products consultant. Secondary email: craig@suaspontedev.com (partner Craig Belluche, bought Mindy Oct 6) - merged in, duplicate row closed. SAME deal, do not double count.'),
  (13, 'Michael L',            NULL,        'cbaytech',                   'michael@cbaytech.com',               'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'IT SDVOSB. Call Sep 24. No follow-up yet.'),
  (14, 'Kemi Alli',            NULL,        NULL,                         'kemi.alli@gmail.com',                'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 30. Bought Mindy Sep 28.'),
  (15, 'Dr. Angela Marshall',  'Angela Marshall', 'MBD Tech',             'drmarshall@mdforwomen.com',          'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. BJ Brown (CCCC) - value carried on this row only.'),
  (16, 'Dr. BJ Brown',         'BJ Brown',  'CCCC',                       'dr.bjbrown@ccccmentalhealth.com',    'call_completed', NULL,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 30, reports sent. Joint deal with Dr. Angela Marshall (MBD Tech) - value carried on her row to avoid double counting.'),
  (17, 'Kyzito Ukah',          NULL,        NULL,                         'juemservices@gmail.com',             'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Offered Sep 18.'),
  (18, 'Simon Kong',           NULL,        'Jemma Tech',                 'skong@jemma.tech',                   'call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Call Sep 17, engagement offer pending.'),
  (19, 'Erick El',             'Erick Ellis','Sille Consulting Services', 'edellis@silleconsultingservices.com','call_completed', 6000,         false, false, NULL,    false, NULL,               NULL,
    'Call Sep 25, waiting on his capability statement.'),

  -- ─────────────── CALL BOOKED — no deal value set (none quoted yet) ───────────────
  (20, 'Troy',                 NULL,        NULL,                         'troym1217@yahoo.com',                'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 8.'),
  (21, 'Brian Murphy',         NULL,        'Vertek Staffing',            'bmurphy@vertekstaffing.com',         'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 9 with Eric.'),
  (22, 'Terry Douglas',        NULL,        NULL,                         'terrydouglas828@gmail.com',          'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 13.'),
  (23, 'Cody Ronk',            NULL,        NULL,                         'codyronk1@gmail.com',                'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 16.'),
  (24, 'Ilan Lambert',         NULL,        'boost33',                    'ilan@boost33.com',                   'booked',        NULL,          false, false, NULL,    false, NULL,               NULL,
    'Call booked Oct 21.'),

  -- ─────────────── LOST ───────────────
  (25, 'James Roberts',        NULL,        NULL,                         'jroberts@vfmdllc.com',               'closed_lost',   NULL,          true,  false, NULL,    false, NULL,               NULL,
    'Wanted a revenue share arrangement, not consulting. Deal value cleared.')
),

-- ─────────────── DUPLICATE ROWS TO MERGE AWAY ───────────────
-- The secondary address goes in the main row's notes (above). Here the
-- duplicate row itself is closed out. Nothing is ever deleted.
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
SELECT l.id, l.name, l.email, l.status,
       i.full_name AS looks_like, i.email AS expected_email
FROM leads l
JOIN incoming i
  ON lower(btrim(l.name)) = lower(btrim(i.full_name))
  OR (i.alt_name IS NOT NULL AND lower(btrim(l.name)) = lower(btrim(i.alt_name)))
WHERE lower(btrim(l.email)) <> lower(btrim(i.email))
  AND lower(btrim(l.email)) NOT IN (SELECT lower(btrim(dup_email)) FROM merges)
ORDER BY i.ref;
