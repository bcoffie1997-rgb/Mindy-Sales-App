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
-- @@DATASET@@
SELECT change_type, ref, name, matched_row_id, matched_how, status_change,
       opp_value_change, last_action_date_change, payment_change, bd_flags, note_being_added
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
  CASE WHEN m.amount_paid IS NULL AND m.balance_due IS NULL THEN NULL
       ELSE 'paid ' || COALESCE(m.amount_paid, 0)::text
            || ' / balance ' || COALESCE(m.balance_due, 0)::text
            || COALESCE(' / due ' || to_char(m.next_payment_due, 'YYYY-MM-DD'), '')
            || CASE WHEN COALESCE(m.balance_due,0) > 0 AND m.next_payment_due IS NOT NULL
                         AND m.next_payment_due < current_date
                    THEN '  ** OVERDUE **' ELSE '' END
  END                                                        AS payment_change,
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
  NULL                                                     AS payment_change,
  NULL                                                     AS bd_flags,
  p.merge_note                                             AS note_being_added
FROM merge_plan p
) t
ORDER BY grp, sort_ref;


-- ───────────── Q2 — EVERY OTHER LEAD IN THE PIPELINE (NOT TOUCHED) ─────────────
WITH
-- @@DATASET@@
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
-- @@DATASET@@
SELECT l.id, l.name, l.email, l.status,
       i.full_name AS looks_like, i.email AS expected_email
FROM leads l
JOIN incoming i
  ON lower(btrim(l.name)) = lower(btrim(i.full_name))
  OR (i.alt_name IS NOT NULL AND lower(btrim(l.name)) = lower(btrim(i.alt_name)))
WHERE lower(btrim(l.email)) <> lower(btrim(i.email))
  AND lower(btrim(l.email)) NOT IN (SELECT lower(btrim(dup_email)) FROM merges)
ORDER BY i.ref;
