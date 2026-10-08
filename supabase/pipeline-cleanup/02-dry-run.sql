-- ============================================================================
-- STEP 4 — DRY RUN. READ-ONLY. Changes nothing. Run after 01-backup.sql.
-- ============================================================================
-- Four result sets. Run them one at a time.
--   Q1  the change table: name | matched id or NEW | current -> new status | value | note
--   Q2  every OTHER lead currently in the pipeline that is not on your list
--   Q3  possible "AK" rows, and proposals worth ~$20K or ~$11K/month
--   Q4  duplicate / secondary-email check for the people on your list
-- ============================================================================


-- ─────────────────────────── Q1 — THE CHANGE TABLE ───────────────────────────
WITH
incoming (ref, full_name, alt_name, company, email, new_status, opp_value, set_managed, sessions_total, all_sessions_done, note) AS (
  VALUES
  -- ─────────────── WON — paid consulting, also pushed to BD / Consulting ───────────────
  ( 1, 'Delmar Bennett',       NULL::text,  'Revo Construction',          'delmarbennett@revoconstruction.com', 'closed_won',    6000::numeric, true,  12::int, false,
    'Paid 90-Day Accelerator Oct 1. Mindy onboarding done Oct 6. 1st consulting call w/ Eric Oct 9.'),
  ( 2, 'Tim Dieschbourg',      NULL,        'Task Construction Group',    'tim@taskcg.com',                     'closed_won',    6000,          true,  12,      false,
    'Paid (confirmed). Engagement letter Sep 3, onboarded Oct 7.'),
  ( 3, 'Kamesha',              'Camiesha',  'EAI Industries LLC',         'cameisha2005@gmail.com',             'closed_won',    6000,          true,  12,      true,
    'Name also spelled Camiesha. 12 of 12 sessions used - now billed hourly.'),
  ( 4, 'Amir',                 NULL,        NULL,                         'amirj70@gmail.com',                  'closed_won',    6000,          true,  12,      false,
    'Paid full $6,000 for consulting.'),

  -- ─────────────── PROPOSAL SENT ───────────────
  ( 5, 'Ravi Ram',             NULL,        'Dhali',                      'ravi@dhali.com',                     'proposal_sent', 6000,          false, NULL,    false,
    'Agreement sent Oct 6 via BreezeDoc. Ravi cancelled Oct 8 call, will reschedule next week. Payments come from liia@dhali.com.'),
  ( 6, 'Joseph Boyd',          NULL,        'Building Consultants Inc',   'jboyd@buildingconsultantsinc.com',   'proposal_sent', 6000,          false, NULL,    false,
    'Committed $6K to Eric Sep 24; agreement sent. Bought Mindy only (Oct 5, fisherboyd@gmail.com). Consulting still unpaid.'),
  ( 7, 'Jermaine Isaac',       'Jay Isaac', 'LaTronic Solutions',         'jayisaac@latronicsolutions.com',     'proposal_sent', 6000,          false, NULL,    false,
    '$6K 90-Day Accelerator. TO CONFIRM: was the engagement letter actually sent?'),
  ( 8, 'Juawan Marsh',         NULL,        'J.D. Marsh Contracting',     'juawandmarsh34@gmail.com',           'proposal_sent', 6000,          false, NULL,    false,
    'Needs $3K down; on hold until back pay arrives. Followed up Oct 1.'),
  ( 9, 'Denton Douglas',       NULL,        'Monarch Yachts',             'denton@monarchyachts.com',           'proposal_sent', NULL,          false, NULL,    false,
    'Proposal + Wave invoice sent Sep 21, followed up Sep 23. Deal value intentionally left blank.'),
  (10, 'Latwan Wolfe',         NULL,        NULL,                         'latwanw@gmail.com',                  'proposal_sent', 6000,          false, NULL,    false,
    '$6K offered Oct 5, Accelerator PDF sent. Wants a follow-up call with his fiancee.'),

  -- ─────────────── CALL DONE — $6K offered, follow-up needed ───────────────
  (11, 'Joe Cary',             NULL,        'After Valor Services',       'joe@aftervalorservices.com',         'call_completed', 6000,         false, NULL,    false,
    'Offered 2x$3K Oct 1. Branden finding a medical-products consultant. Partner Craig Belluche (craig@suaspontedev.com) bought Mindy Oct 6 - SAME deal, do not double count.'),
  (12, 'Michael L',            NULL,        'cbaytech',                   'michael@cbaytech.com',               'call_completed', 6000,         false, NULL,    false,
    'IT SDVOSB. Call Sep 24. No follow-up yet.'),
  (13, 'Kemi Alli',            NULL,        NULL,                         'kemi.alli@gmail.com',                'call_completed', 6000,         false, NULL,    false,
    'Offered Sep 30. Bought Mindy Sep 28.'),
  (14, 'Dr. Angela Marshall',  'Angela Marshall', 'MBD Tech',             'drmarshall@mdforwomen.com',          'call_completed', 6000,         false, NULL,    false,
    'Offered Sep 30, reports sent. Joint deal with Dr. BJ Brown (CCCC) - value carried on this row only.'),
  (15, 'Dr. BJ Brown',         'BJ Brown',  'CCCC',                       'dr.bjbrown@ccccmentalhealth.com',    'call_completed', NULL,         false, NULL,    false,
    'Offered Sep 30, reports sent. Joint deal with Dr. Angela Marshall (MBD Tech) - value carried on her row to avoid double counting.'),
  (16, 'Kyzito Ukah',          NULL,        NULL,                         'juemservices@gmail.com',             'call_completed', 6000,         false, NULL,    false,
    'Offered Sep 18.'),
  (17, 'Simon Kong',           NULL,        'Jemma Tech',                 'skong@jemma.tech',                   'call_completed', 6000,         false, NULL,    false,
    'Call Sep 17, engagement offer pending.'),
  (18, 'Erick El',             'Erick Ellis','Sille Consulting Services', 'edellis@silleconsultingservices.com','call_completed', 6000,         false, NULL,    false,
    'Call Sep 25, waiting on his capability statement.'),

  -- ─────────────── CALL BOOKED — no deal value set (none quoted yet) ───────────────
  (19, 'Troy',                 NULL,        NULL,                         'troym1217@yahoo.com',                'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 8.'),
  (20, 'Brian Murphy',         NULL,        'Vertek Staffing',            'bmurphy@vertekstaffing.com',         'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 9 with Eric.'),
  (21, 'Terry Douglas',        NULL,        NULL,                         'terrydouglas828@gmail.com',          'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 13.'),
  (22, 'Cody Ronk',            NULL,        NULL,                         'codyronk1@gmail.com',                'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 16.'),
  (23, 'Ilan Lambert',         NULL,        'boost33',                    'ilan@boost33.com',                   'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 21.'),

  -- ─────────────── LOST ───────────────
  (24, 'James Roberts',        NULL,        NULL,                         'jroberts@vfmdllc.com',               'closed_lost',   NULL,          false, NULL,    false,
    'Wanted a revenue share arrangement, not consulting.')
),

-- Resolve each person to at most one existing leads row: email first
-- (case-insensitive, whitespace-trimmed), then exact name, then alt name.
-- Prefers a client row, then the oldest row, so a duplicate set resolves
-- deterministically instead of at random.
matched AS (
  SELECT
    i.*,
    COALESCE(
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.email)) = lower(btrim(i.email))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.name)) = lower(btrim(i.full_name))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE i.alt_name IS NOT NULL
          AND lower(btrim(l.name)) = lower(btrim(i.alt_name))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1)
    ) AS target_id,
    (SELECT l.id FROM leads l
      WHERE lower(btrim(l.email)) = lower(btrim(i.email))
      ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1) IS NOT NULL AS matched_on_email
  FROM incoming i
)
SELECT
  m.ref,
  m.full_name                                              AS name,
  COALESCE(m.target_id, '** NEW ROW **')                   AS matched_row_id,
  CASE WHEN m.target_id IS NULL THEN 'n/a (create)'
       WHEN m.matched_on_email THEN 'email'
       ELSE 'NAME ONLY - eyeball this' END                 AS matched_how,
  COALESCE(l.status, '(none)') || ' -> ' || m.new_status    AS status_change,
  CASE WHEN l.status IS NOT NULL AND l.status = m.new_status
       THEN 'no change' ELSE '' END                        AS status_note,
  COALESCE((l.metadata->>'opp_value'), '(unset)') || ' -> ' ||
    CASE WHEN m.opp_value IS NULL THEN 'left as-is'
         ELSE m.opp_value::text END                        AS opp_value_change,
  CASE WHEN m.set_managed       THEN 'managed=true ' ELSE '' END ||
  CASE WHEN m.sessions_total IS NOT NULL THEN 'sessions_total=' || m.sessions_total ELSE '' END ||
  CASE WHEN m.all_sessions_done THEN ' +12 done' ELSE '' END AS bd_flags,
  CASE WHEN position(m.note in COALESCE(l.notes, '')) > 0
       THEN '(already present - will NOT re-append)'
       ELSE m.note END                                     AS note_being_added,
  COALESCE(l.type, 'lead')                                 AS row_type,
  length(COALESCE(l.notes, ''))                            AS existing_note_chars
FROM matched m
LEFT JOIN leads l ON l.id = m.target_id
ORDER BY
  array_position(ARRAY['closed_won','proposal_sent','call_completed','booked','closed_lost'], m.new_status),
  m.ref;


-- ───────────── Q2 — EVERY OTHER LEAD IN THE PIPELINE (NOT TOUCHED) ─────────────
-- Nothing below is modified by 03-apply.sql. Shown so you can decide separately.
WITH
incoming (ref, full_name, alt_name, company, email, new_status, opp_value, set_managed, sessions_total, all_sessions_done, note) AS (
  VALUES
  -- ─────────────── WON — paid consulting, also pushed to BD / Consulting ───────────────
  ( 1, 'Delmar Bennett',       NULL::text,  'Revo Construction',          'delmarbennett@revoconstruction.com', 'closed_won',    6000::numeric, true,  12::int, false,
    'Paid 90-Day Accelerator Oct 1. Mindy onboarding done Oct 6. 1st consulting call w/ Eric Oct 9.'),
  ( 2, 'Tim Dieschbourg',      NULL,        'Task Construction Group',    'tim@taskcg.com',                     'closed_won',    6000,          true,  12,      false,
    'Paid (confirmed). Engagement letter Sep 3, onboarded Oct 7.'),
  ( 3, 'Kamesha',              'Camiesha',  'EAI Industries LLC',         'cameisha2005@gmail.com',             'closed_won',    6000,          true,  12,      true,
    'Name also spelled Camiesha. 12 of 12 sessions used - now billed hourly.'),
  ( 4, 'Amir',                 NULL,        NULL,                         'amirj70@gmail.com',                  'closed_won',    6000,          true,  12,      false,
    'Paid full $6,000 for consulting.'),

  -- ─────────────── PROPOSAL SENT ───────────────
  ( 5, 'Ravi Ram',             NULL,        'Dhali',                      'ravi@dhali.com',                     'proposal_sent', 6000,          false, NULL,    false,
    'Agreement sent Oct 6 via BreezeDoc. Ravi cancelled Oct 8 call, will reschedule next week. Payments come from liia@dhali.com.'),
  ( 6, 'Joseph Boyd',          NULL,        'Building Consultants Inc',   'jboyd@buildingconsultantsinc.com',   'proposal_sent', 6000,          false, NULL,    false,
    'Committed $6K to Eric Sep 24; agreement sent. Bought Mindy only (Oct 5, fisherboyd@gmail.com). Consulting still unpaid.'),
  ( 7, 'Jermaine Isaac',       'Jay Isaac', 'LaTronic Solutions',         'jayisaac@latronicsolutions.com',     'proposal_sent', 6000,          false, NULL,    false,
    '$6K 90-Day Accelerator. TO CONFIRM: was the engagement letter actually sent?'),
  ( 8, 'Juawan Marsh',         NULL,        'J.D. Marsh Contracting',     'juawandmarsh34@gmail.com',           'proposal_sent', 6000,          false, NULL,    false,
    'Needs $3K down; on hold until back pay arrives. Followed up Oct 1.'),
  ( 9, 'Denton Douglas',       NULL,        'Monarch Yachts',             'denton@monarchyachts.com',           'proposal_sent', NULL,          false, NULL,    false,
    'Proposal + Wave invoice sent Sep 21, followed up Sep 23. Deal value intentionally left blank.'),
  (10, 'Latwan Wolfe',         NULL,        NULL,                         'latwanw@gmail.com',                  'proposal_sent', 6000,          false, NULL,    false,
    '$6K offered Oct 5, Accelerator PDF sent. Wants a follow-up call with his fiancee.'),

  -- ─────────────── CALL DONE — $6K offered, follow-up needed ───────────────
  (11, 'Joe Cary',             NULL,        'After Valor Services',       'joe@aftervalorservices.com',         'call_completed', 6000,         false, NULL,    false,
    'Offered 2x$3K Oct 1. Branden finding a medical-products consultant. Partner Craig Belluche (craig@suaspontedev.com) bought Mindy Oct 6 - SAME deal, do not double count.'),
  (12, 'Michael L',            NULL,        'cbaytech',                   'michael@cbaytech.com',               'call_completed', 6000,         false, NULL,    false,
    'IT SDVOSB. Call Sep 24. No follow-up yet.'),
  (13, 'Kemi Alli',            NULL,        NULL,                         'kemi.alli@gmail.com',                'call_completed', 6000,         false, NULL,    false,
    'Offered Sep 30. Bought Mindy Sep 28.'),
  (14, 'Dr. Angela Marshall',  'Angela Marshall', 'MBD Tech',             'drmarshall@mdforwomen.com',          'call_completed', 6000,         false, NULL,    false,
    'Offered Sep 30, reports sent. Joint deal with Dr. BJ Brown (CCCC) - value carried on this row only.'),
  (15, 'Dr. BJ Brown',         'BJ Brown',  'CCCC',                       'dr.bjbrown@ccccmentalhealth.com',    'call_completed', NULL,         false, NULL,    false,
    'Offered Sep 30, reports sent. Joint deal with Dr. Angela Marshall (MBD Tech) - value carried on her row to avoid double counting.'),
  (16, 'Kyzito Ukah',          NULL,        NULL,                         'juemservices@gmail.com',             'call_completed', 6000,         false, NULL,    false,
    'Offered Sep 18.'),
  (17, 'Simon Kong',           NULL,        'Jemma Tech',                 'skong@jemma.tech',                   'call_completed', 6000,         false, NULL,    false,
    'Call Sep 17, engagement offer pending.'),
  (18, 'Erick El',             'Erick Ellis','Sille Consulting Services', 'edellis@silleconsultingservices.com','call_completed', 6000,         false, NULL,    false,
    'Call Sep 25, waiting on his capability statement.'),

  -- ─────────────── CALL BOOKED — no deal value set (none quoted yet) ───────────────
  (19, 'Troy',                 NULL,        NULL,                         'troym1217@yahoo.com',                'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 8.'),
  (20, 'Brian Murphy',         NULL,        'Vertek Staffing',            'bmurphy@vertekstaffing.com',         'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 9 with Eric.'),
  (21, 'Terry Douglas',        NULL,        NULL,                         'terrydouglas828@gmail.com',          'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 13.'),
  (22, 'Cody Ronk',            NULL,        NULL,                         'codyronk1@gmail.com',                'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 16.'),
  (23, 'Ilan Lambert',         NULL,        'boost33',                    'ilan@boost33.com',                   'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 21.'),

  -- ─────────────── LOST ───────────────
  (24, 'James Roberts',        NULL,        NULL,                         'jroberts@vfmdllc.com',               'closed_lost',   NULL,          false, NULL,    false,
    'Wanted a revenue share arrangement, not consulting.')
),

-- Resolve each person to at most one existing leads row: email first
-- (case-insensitive, whitespace-trimmed), then exact name, then alt name.
-- Prefers a client row, then the oldest row, so a duplicate set resolves
-- deterministically instead of at random.
matched AS (
  SELECT
    i.*,
    COALESCE(
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.email)) = lower(btrim(i.email))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.name)) = lower(btrim(i.full_name))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE i.alt_name IS NOT NULL
          AND lower(btrim(l.name)) = lower(btrim(i.alt_name))
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
ORDER BY
  array_position(ARRAY['closed_won','paid','proposal_sent','call_completed',
                       'booked','no_show','meeting_interest','first_touch_drafted',
                       'new','closed_lost','unsubscribed'], l.status),
  l.last_action_date DESC NULLS LAST;

-- Same thing as a one-line count per stage, if the full list is too long:
-- SELECT status, count(*) FROM leads WHERE type <> 'client' GROUP BY status ORDER BY 2 DESC;


-- ───────── Q3 — FLAGS ONLY, NOTHING CHANGED: "AK" + ~$20K / ~$11K-per-month ─────────
SELECT
  'possible AK'                            AS flag_reason,
  l.id, l.name, l.company, l.email, l.status,
  l.metadata->>'opp_value'                 AS opp_value,
  l.client_amount,
  left(COALESCE(l.notes, ''), 200)         AS notes_excerpt
FROM leads l
WHERE
  -- initials A.K. in the person name (first name A..., last name K...)
      l.name  ~* '^\s*a[a-z]*\.?\s+k[a-z]*'
  -- initials A.K. in the company name
   OR l.company ~* '^\s*a[a-z]*\.?\s+k[a-z]*'
  -- literal "AK" / "A.K." as a standalone token anywhere in name or company
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
  -- numeric opp_value in either band
      (l.metadata->>'opp_value') ~ '^[0-9.]+$'
      AND ( (l.metadata->>'opp_value')::numeric BETWEEN 18000 AND 22000
         OR (l.metadata->>'opp_value')::numeric BETWEEN 10000 AND 12000
         OR (l.metadata->>'opp_value')::numeric BETWEEN 125000 AND 140000 )  -- 11k/mo annualised
  -- or the figures written in free text / client_amount
   OR COALESCE(l.notes, '') || ' ' || COALESCE(l.client_amount::text, '')
        ~* '(\$?\s?20[,.]?0{3})|(\$?\s?20\s?k)|(\$?\s?11[,.]?0{3})|(\$?\s?11\s?k)'
ORDER BY flag_reason, opp_value NULLS LAST;


-- ───────── Q4 — DUPLICATE AND SECONDARY-EMAIL CHECK FOR YOUR 23 ─────────
-- Secondary addresses you mentioned. If any of these resolve to a DIFFERENT
-- row than Q1 matched, you have a duplicate contact to merge first.
SELECT
  l.id, l.name, l.company, l.email, l.type, l.status,
  l.metadata->>'opp_value' AS opp_value
FROM leads l
WHERE lower(btrim(l.email)) IN (
  'liia@dhali.com',            -- Ravi Ram, payments address
  'fisherboyd@gmail.com',      -- Joseph Boyd, bought Mindy under this one
  'craig@suaspontedev.com',    -- Craig Belluche, Joe Cary's partner
  'dr.bjbrown@ccccmentalhealth.com'
)
ORDER BY l.email;

-- Any row whose name looks like one of your 23 but whose email does NOT match
-- (i.e. a near-duplicate the matcher would miss):
WITH
incoming (ref, full_name, alt_name, company, email, new_status, opp_value, set_managed, sessions_total, all_sessions_done, note) AS (
  VALUES
  -- ─────────────── WON — paid consulting, also pushed to BD / Consulting ───────────────
  ( 1, 'Delmar Bennett',       NULL::text,  'Revo Construction',          'delmarbennett@revoconstruction.com', 'closed_won',    6000::numeric, true,  12::int, false,
    'Paid 90-Day Accelerator Oct 1. Mindy onboarding done Oct 6. 1st consulting call w/ Eric Oct 9.'),
  ( 2, 'Tim Dieschbourg',      NULL,        'Task Construction Group',    'tim@taskcg.com',                     'closed_won',    6000,          true,  12,      false,
    'Paid (confirmed). Engagement letter Sep 3, onboarded Oct 7.'),
  ( 3, 'Kamesha',              'Camiesha',  'EAI Industries LLC',         'cameisha2005@gmail.com',             'closed_won',    6000,          true,  12,      true,
    'Name also spelled Camiesha. 12 of 12 sessions used - now billed hourly.'),
  ( 4, 'Amir',                 NULL,        NULL,                         'amirj70@gmail.com',                  'closed_won',    6000,          true,  12,      false,
    'Paid full $6,000 for consulting.'),

  -- ─────────────── PROPOSAL SENT ───────────────
  ( 5, 'Ravi Ram',             NULL,        'Dhali',                      'ravi@dhali.com',                     'proposal_sent', 6000,          false, NULL,    false,
    'Agreement sent Oct 6 via BreezeDoc. Ravi cancelled Oct 8 call, will reschedule next week. Payments come from liia@dhali.com.'),
  ( 6, 'Joseph Boyd',          NULL,        'Building Consultants Inc',   'jboyd@buildingconsultantsinc.com',   'proposal_sent', 6000,          false, NULL,    false,
    'Committed $6K to Eric Sep 24; agreement sent. Bought Mindy only (Oct 5, fisherboyd@gmail.com). Consulting still unpaid.'),
  ( 7, 'Jermaine Isaac',       'Jay Isaac', 'LaTronic Solutions',         'jayisaac@latronicsolutions.com',     'proposal_sent', 6000,          false, NULL,    false,
    '$6K 90-Day Accelerator. TO CONFIRM: was the engagement letter actually sent?'),
  ( 8, 'Juawan Marsh',         NULL,        'J.D. Marsh Contracting',     'juawandmarsh34@gmail.com',           'proposal_sent', 6000,          false, NULL,    false,
    'Needs $3K down; on hold until back pay arrives. Followed up Oct 1.'),
  ( 9, 'Denton Douglas',       NULL,        'Monarch Yachts',             'denton@monarchyachts.com',           'proposal_sent', NULL,          false, NULL,    false,
    'Proposal + Wave invoice sent Sep 21, followed up Sep 23. Deal value intentionally left blank.'),
  (10, 'Latwan Wolfe',         NULL,        NULL,                         'latwanw@gmail.com',                  'proposal_sent', 6000,          false, NULL,    false,
    '$6K offered Oct 5, Accelerator PDF sent. Wants a follow-up call with his fiancee.'),

  -- ─────────────── CALL DONE — $6K offered, follow-up needed ───────────────
  (11, 'Joe Cary',             NULL,        'After Valor Services',       'joe@aftervalorservices.com',         'call_completed', 6000,         false, NULL,    false,
    'Offered 2x$3K Oct 1. Branden finding a medical-products consultant. Partner Craig Belluche (craig@suaspontedev.com) bought Mindy Oct 6 - SAME deal, do not double count.'),
  (12, 'Michael L',            NULL,        'cbaytech',                   'michael@cbaytech.com',               'call_completed', 6000,         false, NULL,    false,
    'IT SDVOSB. Call Sep 24. No follow-up yet.'),
  (13, 'Kemi Alli',            NULL,        NULL,                         'kemi.alli@gmail.com',                'call_completed', 6000,         false, NULL,    false,
    'Offered Sep 30. Bought Mindy Sep 28.'),
  (14, 'Dr. Angela Marshall',  'Angela Marshall', 'MBD Tech',             'drmarshall@mdforwomen.com',          'call_completed', 6000,         false, NULL,    false,
    'Offered Sep 30, reports sent. Joint deal with Dr. BJ Brown (CCCC) - value carried on this row only.'),
  (15, 'Dr. BJ Brown',         'BJ Brown',  'CCCC',                       'dr.bjbrown@ccccmentalhealth.com',    'call_completed', NULL,         false, NULL,    false,
    'Offered Sep 30, reports sent. Joint deal with Dr. Angela Marshall (MBD Tech) - value carried on her row to avoid double counting.'),
  (16, 'Kyzito Ukah',          NULL,        NULL,                         'juemservices@gmail.com',             'call_completed', 6000,         false, NULL,    false,
    'Offered Sep 18.'),
  (17, 'Simon Kong',           NULL,        'Jemma Tech',                 'skong@jemma.tech',                   'call_completed', 6000,         false, NULL,    false,
    'Call Sep 17, engagement offer pending.'),
  (18, 'Erick El',             'Erick Ellis','Sille Consulting Services', 'edellis@silleconsultingservices.com','call_completed', 6000,         false, NULL,    false,
    'Call Sep 25, waiting on his capability statement.'),

  -- ─────────────── CALL BOOKED — no deal value set (none quoted yet) ───────────────
  (19, 'Troy',                 NULL,        NULL,                         'troym1217@yahoo.com',                'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 8.'),
  (20, 'Brian Murphy',         NULL,        'Vertek Staffing',            'bmurphy@vertekstaffing.com',         'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 9 with Eric.'),
  (21, 'Terry Douglas',        NULL,        NULL,                         'terrydouglas828@gmail.com',          'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 13.'),
  (22, 'Cody Ronk',            NULL,        NULL,                         'codyronk1@gmail.com',                'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 16.'),
  (23, 'Ilan Lambert',         NULL,        'boost33',                    'ilan@boost33.com',                   'booked',        NULL,          false, NULL,    false,
    'Call booked Oct 21.'),

  -- ─────────────── LOST ───────────────
  (24, 'James Roberts',        NULL,        NULL,                         'jroberts@vfmdllc.com',               'closed_lost',   NULL,          false, NULL,    false,
    'Wanted a revenue share arrangement, not consulting.')
),

-- Resolve each person to at most one existing leads row: email first
-- (case-insensitive, whitespace-trimmed), then exact name, then alt name.
-- Prefers a client row, then the oldest row, so a duplicate set resolves
-- deterministically instead of at random.
matched AS (
  SELECT
    i.*,
    COALESCE(
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.email)) = lower(btrim(i.email))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE lower(btrim(l.name)) = lower(btrim(i.full_name))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1),
      (SELECT l.id FROM leads l
        WHERE i.alt_name IS NOT NULL
          AND lower(btrim(l.name)) = lower(btrim(i.alt_name))
        ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1)
    ) AS target_id,
    (SELECT l.id FROM leads l
      WHERE lower(btrim(l.email)) = lower(btrim(i.email))
      ORDER BY (l.type = 'client') DESC, l.created_at ASC, l.id ASC LIMIT 1) IS NOT NULL AS matched_on_email
  FROM incoming i
)
SELECT l.id, l.name, l.email, l.status, i.full_name AS looks_like, i.email AS expected_email
FROM leads l
JOIN incoming i
  ON lower(btrim(l.name)) = lower(btrim(i.full_name))
  OR (i.alt_name IS NOT NULL AND lower(btrim(l.name)) = lower(btrim(i.alt_name)))
WHERE lower(btrim(l.email)) <> lower(btrim(i.email))
ORDER BY i.ref;
