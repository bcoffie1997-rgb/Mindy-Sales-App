# Agent Rebuild — Acceptance Contract & Checker Rubric

_Role: this doc is the spec Kimi builds to, and the checklist Claude (manager/checker)
verifies against before any rebuilt agent is considered "done." If an agent passes
"runs fine" but violates a contract below, it FAILS review._

---

## A. Output contracts the dashboard depends on (DO NOT BREAK)

The dashboard reads these files. Shapes must stay identical or the UI breaks silently.

### A1. `data/master-sheet.json` — array of records
Required keys per record (leads and clients share the array, distinguished by `type`):
```
id, name, email, phone, company,
score          ∈ {HOT, WARM, BASIC}        // exactly these, uppercase
source, status,                            // status MUST be canonical — see C3
first_contact_date, last_action, last_action_date,
follow_up_count (number), notes,
type           ∈ {lead, client}
```
Optional/nested: `calendly`, `company_details {revenue, industry}`, `gmail_thread_id`,
`gmail_labels`, `emails_sent[]`, `calls[]`.
Client-only fields: `client_tier ∈ {tier1_training, tier2_consulting, tier3_white_glove,
shop_tools, unknown}`, `client_product`, `client_amount`, `client_start_date`,
`client_status ∈ {active, canceled, refunded}`.

### A2. `data/agent-events.jsonl` — one JSON object per line, APPEND-ONLY
```
{ ts (ISO 8601, UTC "Z"), from, to, type, lead_id?, payload? }
```
- `from` MUST be one of the canonical agent IDs (A4).
- `ts` MUST be UTC with `Z` suffix — NOT local offsets. (Current bug: crm-evening
  emits `-04:00`, which corrupts the "runs today" math.)
- Every agent run MUST emit a `run_summary` event (the Agent Health panel keys off it).
- Recognized `type` values the UI renders: `new_lead, run_summary, hot_lead,
  wants_meeting, booking_confirmed, call_completed, no_show, schedule_follow_up`.
- `run_summary` payload fields the UI reads (include the ones relevant to the agent):
  `new_leads, hot, drafts_created, replies_processed, follow_ups_drafted,
  bookings_confirmed, calls_processed, proposals_generated, briefing_generated,
  reconciliation_complete, status`.

### A3. `data/today-calls.json`
```
{ generated_at (ISO), today[], tomorrow[], this_week[] }
```
Each call: `{ event_id, title, start, end, location, status, minutes_until,
attendees[{email,name,response}], lead_match{...} | null }`.
**Must be regenerated every appointment-setter cycle** — the current file is stale since
2026-04-11, which is the bug we're fixing.

### A4. Canonical agent IDs (the dashboard hardcodes these 7)
```
gc-lead-intake, gc-email-responder, gc-appointment-setter, gc-post-call,
gc-crm-morning, gc-crm-evening, gc-qa-health
```
If Kimi adds/renames agents, the dashboard's AGENT_LABELS map must be updated in lockstep
(flag it to the checker — it's a frontend change).

### A5. Reports & proposals
- `data/reports/daily/YYYY-MM-DD-{morning|evening|qa}.md`
- `data/reports/weekly/...` (note: API currently only serves `daily/`; flag if weekly used)
- `data/proposals/*.md`
- `data/config.json` and `data/stripe-cache.json` shapes unchanged.

---

## B. Structural soundness criteria (every agent)

1. **Idempotent** — re-running the same cycle does not duplicate leads or re-emit
   the same events. (Dedup by gmail_thread_id / lead id / event key.)
2. **Single-writer-safe** — concurrent writes to `master-sheet.json` must not clobber.
   Use a file lock OR per-lead file writes + one reconciler. No blind full-file overwrite
   while another process may be writing.
3. **Append-only event log** — never rewrite `agent-events.jsonl`; only append.
4. **Emits a run_summary every run**, even on a no-op cycle (status: idle/ok).
5. **Fails safe** — one bad lead/record doesn't crash the whole cycle; log and continue.
6. **No secrets in code** — Stripe key, Slack token, etc. from env/config, never inline.
7. **Respects scheduling** — matches documented cadence with ≥6-min gaps (the "two tasks
   fired at once" failure mode).
8. **Freshness guarantee** — files the UI shows as "current" (today-calls, reports) are
   actually regenerated on schedule.

---

## C. Regression guards (hard-won lessons — do NOT reintroduce)

These are known landmines from the prior system. The checker will specifically test for
each:

1. **`emails_sent[]` are DRAFTS, not sends** — entries are draft records (draft_id), not
   confirmed sends. Don't mark a lead "contacted" off a draft.
2. **Gmail `newer_than:` is ignored** by the search tool — filter on message date +
   dedup in code, don't trust the query filter.
3. **Calendly self-booked invites are often malformed** (missing host/attendee) — verify
   invite completeness before flagging a no-show. (This cost a real HOT call.)
4. **Post-call must query Fireflies directly** each cycle — do NOT depend on a
   `call_completed` handoff event existing (that handoff stalled before).
5. **Cold-funnel/self-book calls often have no lead record** — post-call is lead-keyed;
   flag missing records to lead-intake, don't fabricate them.
6. **Slack bot token can postMessage but can't read history** (missing channels:history)
   — reading directives needs the user-token path.
7. **Invite creation gap** — email-responder hands off "create the invite" but nobody
   owns outward invite creation. Close this or escalate explicitly.
8. **QA thresholds** — draft backlog >30 and non-canonical statuses are operator/schema
   items (YELLOW), not RED/alert triggers.
9. **Voice/signature** — per current ops note, don't auto-sign drafts as "Eric" until
   posture is confirmed. Confirm sender identity rules with the operator.

---

## D. Per-agent acceptance checklist (checker fills in PASS/FAIL)

For each of the 7 agents:
- [ ] Reads/writes only the contracted files & shapes (Section A)
- [ ] Idempotent on re-run (Section B1)
- [ ] Write-safe (B2) and append-only events (B3)
- [ ] Emits valid `run_summary` with correct `from` ID and UTC `ts`
- [ ] Canonical `score` / `status` / `client_*` enums only
- [ ] Relevant regression guards from Section C verified
- [ ] Dry-run executes end-to-end without crashing on edge data
- [ ] Scheduling entry correct and gap-safe

---

## E. How the checker verifies

1. **Static review** — read Kimi's agent code/config against Sections A–C.
2. **Schema diff** — run the agent in a sandbox/dry-run against sample data, diff its
   output files against the contract (keys, enums, ts format).
3. **Idempotency test** — run the same cycle twice, confirm no dupes / no double events.
4. **UI smoke test** — point the dashboard at the produced `data/` and confirm every page
   renders (Dashboard stats, Leads, Clients, Calls, Activity, Reports, Revenue).
5. **Sign-off** — only when D is all-PASS for an agent.
