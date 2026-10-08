# Pipeline cleanup — 2026-10-08

Data-only update to the `leads` table. No application code was changed.

## Why SQL and not a direct write

This session has no Supabase credentials: there is no `.env`, no
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in the environment, and the Vercel
token is refused (403) on the `govcon-sales-dashboard` project's env vars. So
the table could be neither read nor written from here. These scripts are the
fallback: run them in the Supabase SQL editor.

Because the table could not be read, the dry run is a **query you run**, not a
table printed here. It reports exactly what the apply step will do.

## Run order

| # | File | What it does | Safe? |
|---|------|--------------|-------|
| 1 | `01-backup.sql` | Snapshots `leads` to `leads_backup_2026_10_08`, verifies the row counts match, optionally exports JSON. Contains the rollback. | writes a new table only |
| 2 | `02-dry-run.sql` | Q1 change table · Q2 every other pipeline lead · Q3 "AK" + ~$20K/~$11K-per-month flags · Q4 duplicate & secondary-email check | read-only |
| 3 | `03-apply.sql` | Applies the 24 rows inside a transaction | **the write** |
| 4 | `04-verify.sql` | Final board: count + total `opp_value` per stage, the two header cards, BD roster | read-only |

`00-incoming.sql` and `_dataset.sql` are the shared dataset. `_dataset.sql` is
inlined verbatim into both `02` and `03`, so the dry run and the apply can
never disagree. **If you edit a person, edit them in `02` and `03` both.**

## Guarantees (all exercised against a real Postgres 16 with this repo's `schema.sql`)

- Notes are **appended**, never overwritten, and are skipped if already present.
- `metadata` is shallow-merged, so keys the scripts do not name survive.
- Re-running `03-apply.sql` is a no-op: second run inserted 0 rows and
  appended 0 duplicate notes.
- No lead outside the 24 is touched — verified by diffing against the backup.
- `type` is never flipped to `'client'`; that would drop the row off the board,
  since `/api/leads-only` filters `type <> 'client'`.
- `last_action_date` is only reset when the stage actually moved, so rows that
  were already correct keep their real aging.

## Stage → status values (from `src/components/Pipeline.tsx:35`)

| Stage | `status` written |
|---|---|
| Interested | `meeting_interest` |
| Call Booked | `booked` |
| Call Done | `call_completed` |
| Proposal Sent | `proposal_sent` |
| No Show | `no_show` |
| Won | `closed_won` |
| Lost | `closed_lost` |
