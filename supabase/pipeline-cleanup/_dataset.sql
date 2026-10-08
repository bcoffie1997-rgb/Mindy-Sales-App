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
