-- ============================================================================
-- STEP 5 (after COMMIT) — THE FINAL BOARD. Read-only.
-- ============================================================================

-- A. Count and total opp_value per stage, in board order.
--    "open_pipeline" mirrors Pipeline.tsx: Won and Lost are excluded from the
--    open pipeline total; Won/Lost are shown for completeness.
SELECT
  CASE l.status
    WHEN 'meeting_interest'     THEN '1. Interested'
    WHEN 'new'                  THEN '1. Interested'
    WHEN 'first_touch_drafted'  THEN '1. Interested'
    WHEN 'booked'               THEN '2. Call Booked'
    WHEN 'call_completed'       THEN '3. Call Done'
    WHEN 'proposal_sent'        THEN '4. Proposal Sent'
    WHEN 'no_show'              THEN '5. No Show'
    WHEN 'closed_won'           THEN '6. Won'
    WHEN 'paid'                 THEN '6. Won'
    WHEN 'closed_lost'          THEN '7. Lost'
    WHEN 'unsubscribed'         THEN '7. Lost'
    ELSE '?? ' || COALESCE(l.status, '(null)')
  END                                                        AS stage,
  count(*)                                                   AS leads,
  COALESCE(SUM(
    CASE WHEN (l.metadata->>'opp_value') ~ '^[0-9.]+$'
         THEN (l.metadata->>'opp_value')::numeric END), 0)    AS total_opp_value,
  count(*) FILTER (WHERE (l.metadata->>'opp_value') IS NULL)  AS missing_value
FROM leads l
WHERE l.type <> 'client'
GROUP BY stage
ORDER BY stage;

-- B. Open pipeline vs closed-this-month — the two cards at the top of the board.
SELECT
  COALESCE(SUM(CASE WHEN l.status IN ('meeting_interest','new','first_touch_drafted',
                                      'booked','call_completed','proposal_sent','no_show')
                      AND (l.metadata->>'opp_value') ~ '^[0-9.]+$'
                    THEN (l.metadata->>'opp_value')::numeric END), 0) AS open_pipeline_value,
  count(*) FILTER (WHERE l.status IN ('meeting_interest','new','first_touch_drafted',
                                      'booked','call_completed','proposal_sent','no_show'))
                                                                      AS open_leads,
  COALESCE(SUM(CASE WHEN l.status IN ('closed_won','paid')
                      AND to_char(l.last_action_date, 'YYYY-MM') = to_char(now(), 'YYYY-MM')
                      AND (l.metadata->>'opp_value') ~ '^[0-9.]+$'
                    THEN (l.metadata->>'opp_value')::numeric END), 0) AS closed_this_month_value,
  count(*) FILTER (WHERE l.status IN ('closed_won','paid')
                     AND to_char(l.last_action_date, 'YYYY-MM') = to_char(now(), 'YYYY-MM'))
                                                                      AS won_this_month
FROM leads l
WHERE l.type <> 'client';

-- B2. Outstanding consulting balances — the money still owed.
SELECT
  l.name,
  (l.metadata->>'amount_paid')::numeric                     AS amount_paid,
  (l.metadata->>'balance_due')::numeric                     AS balance_due,
  l.metadata->>'next_payment_due'                           AS next_payment_due,
  CASE WHEN COALESCE((l.metadata->>'balance_due')::numeric, 0) > 0
            AND (l.metadata->>'next_payment_due') IS NOT NULL
            AND (l.metadata->>'next_payment_due')::date < current_date
       THEN 'OVERDUE' ELSE '' END                           AS flag
FROM leads l
WHERE COALESCE((l.metadata->>'balance_due')::numeric, 0) > 0
ORDER BY (l.metadata->>'next_payment_due')::date NULLS LAST;

-- B3. Collected vs outstanding across every Won consulting client.
SELECT
  SUM((l.metadata->>'amount_paid')::numeric)                AS total_collected,
  SUM((l.metadata->>'balance_due')::numeric)                AS total_outstanding,
  count(*) FILTER (WHERE COALESCE((l.metadata->>'balance_due')::numeric,0) > 0) AS clients_owing
FROM leads l
WHERE l.metadata ? 'amount_paid';

-- C. The BD / Consulting roster (what /api/managed-clients returns).
SELECT l.id, l.name, l.company, l.status,
       l.metadata->>'sessions_total'                       AS sessions_total,
       jsonb_array_length(COALESCE(l.metadata->'sessions', '[]'::jsonb)) AS sessions_rows,
       (SELECT count(*) FROM jsonb_array_elements(COALESCE(l.metadata->'sessions','[]'::jsonb)) s
         WHERE (s->>'done')::boolean)                      AS sessions_done,
       l.metadata->>'amount_paid'                          AS amount_paid,
       l.metadata->>'balance_due'                          AS balance_due,
       l.metadata->>'next_payment_due'                     AS next_payment_due
FROM leads l
WHERE (l.metadata->>'managed')::boolean IS TRUE
ORDER BY l.name;

-- D. Confirm the 25 contacts + 3 merged duplicates landed as intended.
SELECT l.status, l.name, l.email, l.metadata->>'opp_value' AS opp_value,
       l.metadata->>'managed' AS managed, l.last_action_date::date
FROM leads l
WHERE lower(btrim(l.email)) IN (
  'delmarbennett@revoconstruction.com','tim@taskcg.com','cameisha2005@gmail.com',
  'amirj70@gmail.com','ravi@dhali.com','jboyd@buildingconsultantsinc.com',
  'jayisaac@latronicsolutions.com','juawandmarsh34@gmail.com','denton@monarchyachts.com',
  'latwanw@gmail.com','joe@aftervalorservices.com','michael@cbaytech.com',
  'kemi.alli@gmail.com','drmarshall@mdforwomen.com','dr.bjbrown@ccccmentalhealth.com',
  'juemservices@gmail.com','skong@jemma.tech','edellis@silleconsultingservices.com',
  'troym1217@yahoo.com','bmurphy@vertekstaffing.com','terrydouglas828@gmail.com',
  'codyronk1@gmail.com','ilan@boost33.com','jroberts@vfmdllc.com',
  'veman232@sbcglobal.net',
  -- the three merged-away duplicates, expected to read closed_lost
  'fisherboyd@gmail.com','liia@dhali.com','craig@suaspontedev.com'
)
ORDER BY
  array_position(ARRAY['closed_won','proposal_sent','call_completed','booked','closed_lost'], l.status),
  l.name;
