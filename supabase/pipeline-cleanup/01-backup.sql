-- ============================================================================
-- STEP 2 — BACK UP THE leads TABLE.  RUN THIS FIRST. NOTHING ELSE UNTIL IT PASSES.
-- ============================================================================

-- A. In-database snapshot. Instant, stays inside Supabase, no PII leaves the DB.
--    This is the real safety net — it is what you restore from.
CREATE TABLE IF NOT EXISTS leads_backup_2026_10_08 AS
SELECT * FROM leads;

-- B. Verify the snapshot matches before you change anything.
--    Both numbers must be identical. If they are not, STOP.
SELECT
  (SELECT count(*) FROM leads)                     AS live_rows,
  (SELECT count(*) FROM leads_backup_2026_10_08)   AS backup_rows,
  (SELECT count(*) FROM leads) = (SELECT count(*) FROM leads_backup_2026_10_08) AS ok;

-- C. Optional JSON export, if you also want the file on disk.
--    Run this, then use the "Download CSV"/copy button in the Supabase SQL editor
--    and save the single returned value as backups/leads-2026-10-08.json
--    NOTE: this output contains real names, emails and phone numbers. Keep it
--    out of git — see the .gitignore entry added for backups/.
SELECT jsonb_pretty(jsonb_agg(to_jsonb(l) ORDER BY l.id)) AS leads_json
FROM leads l;

-- ── ROLLBACK (only if something goes wrong after you apply step 3) ──
-- Restores every column on every row that existed at backup time.
--
-- UPDATE leads AS l
--   SET type = b.type, name = b.name, email = b.email, phone = b.phone,
--       company = b.company, score = b.score, source = b.source,
--       status = b.status, first_contact_date = b.first_contact_date,
--       last_action = b.last_action, last_action_date = b.last_action_date,
--       follow_up_count = b.follow_up_count, notes = b.notes,
--       client_tier = b.client_tier, client_product = b.client_product,
--       client_amount = b.client_amount, client_start_date = b.client_start_date,
--       client_status = b.client_status, metadata = b.metadata
--   FROM leads_backup_2026_10_08 AS b
--   WHERE l.id = b.id;
--
-- Then remove any rows step 3 newly created:
-- DELETE FROM leads WHERE id LIKE 'manual-2026-10-08-%';
