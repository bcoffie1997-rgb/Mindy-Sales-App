# GovCon Sales Dashboard — Remediation Plan

_Date: 2026-06-18 · Based on full-app diagnostic_

## How to read this
Issues are grouped into 5 phases ordered by dependency, not just severity. Phase 0
is decisions only you can make — nothing gets built until those are answered, because
they change the work in every later phase. Each item lists: **Problem → Fix → Effort →
Files**. Effort is rough dev time: S = <1h, M = half-day, L = 1–2 days.

Severity legend: 🔴 critical (app non-functional) · 🟠 high · 🟡 medium/low.

---

## Phase 0 — Decisions needed first (no code yet)

These gate everything else. Answer them before Phase 1.

1. **Where should the API live?**
   - Option A: Keep the GCP box, give it a domain + TLS (HTTPS). Lowest code change.
   - Option B: Port the Express endpoints to Vercel serverless functions, drop the
     external box. One platform, auto-HTTPS, but the `data/` files must move to where
     functions can read them (the agents currently write to local disk).
   - Option C: Keep it local-only (no public deploy) and run dashboard on the Mac Mini.
   - _This decision changes Phase 1 and Phase 2 entirely._

2. **Is the GCP box (35.223.132.217) internet-facing right now?**
   - If yes → Phase 2 (auth/CORS) becomes urgent, not "high."
   - If it's behind a VPN/firewall → auth can wait.

3. **Who owns the agent crons, and why did the feeds stop?**
   - `today-calls.json` stale since 2026-04-11; reports + agent-events since 6/16.
   - The dashboard can't fix this — but we need to know if these crons are coming back,
     or if the dashboard should stop depending on them.

---

## Phase 1 — Restore basic function 🔴

Goal: deployed app loads real data again.

1. **Fix the API origin / mixed content** 🔴 — M
   - Problem: `vercel.json` rewrites `/api/*` → `http://35.223.132.217:3007`. HTTPS page
     calling plain HTTP = browser-blocked; the host is also currently unreachable.
   - Fix: depends on Phase 0 #1. If Option A, point the rewrite at `https://<domain>`.
     If Option B, replace rewrites with `/api` function routes.
   - Files: `vercel.json`, possibly new `api/` dir.

2. **Add data-freshness guards** 🟠 — M
   - Problem: stale `today-calls.json` and reports render as confident current data.
   - Fix: in each view, compare `generated_at` / file mtime to now; show an amber banner
     ("Calendar data is N days old — feed may be down") when older than a threshold
     (e.g. calls > 6h, reports > 36h, events > 26h).
   - Files: `TodayCalls.tsx`, `Reports.tsx`, `Dashboard.tsx` (agent health already has
     stale logic — surface it visually).

3. **Make the sidebar agent count real** 🟡 — S
   - Problem: `App.tsx:60` hardcodes "7 Agents Active" regardless of actual health.
   - Fix: derive count from `/api/stats` agentHealth (e.g. "5/7 agents healthy").
   - Files: `App.tsx`.

---

## Phase 2 — Secure the API 🟠 (urgent if box is public)

1. **Add auth to write endpoints** 🔴-if-public — M
   - Problem: `PATCH /api/leads/:id` and `POST /api/stripe-crossref/upgrade` mutate the
     CRM with no auth.
   - Fix: shared-secret header / bearer token checked by middleware on all mutating
     routes (and ideally all routes). Store secret in env, not config.json.
   - Files: `server/index.ts`.

2. **Tighten CORS** 🟠 — S
   - Problem: `app.use(cors())` allows any origin.
   - Fix: restrict `origin` to the known dashboard URL(s).
   - Files: `server/index.ts:11`.

3. **Move secrets out of plaintext files** 🟡 — S
   - Problem: Stripe key + Slack token live in `data/config.json`; a full `xoxb-` Slack
     token is baked into a permission rule in `.claude/settings.local.json`.
   - Fix: read from environment variables; rotate the exposed Slack token.
   - Files: `server/index.ts` (config load), `config.json`, settings file.

---

## Phase 3 — Data integrity 🟠

1. **Eliminate the write race** 🟠 — M
   - Problem: Express `PATCH` rewrites all of `master-sheet.json` while the agents also
     write it — concurrent read-modify-write, no locking → lost updates.
   - Fix options: (a) file lock (e.g. `proper-lockfile`) around read-modify-write; or
     (b) write only the changed lead's per-file JSON and have one owner reconcile the
     master sheet; or (c) move to SQLite (bigger change, removes the class of bug).
   - Files: `server/index.ts:55-71`.

2. **Reconcile lead files vs master-sheet** 🟡 — M
   - Problem: 948 per-lead files vs 924 master rows; `/api/leads/:id` and the list can
     disagree. Orphans accumulate.
   - Fix: one-time reconcile script + decide a single source of truth (recommend master
     sheet is canonical, per-file is a cache).
   - Files: new script under `scripts/`.

3. **Normalize the status vocabulary** 🟡 — M
   - Problem: 18 of 24 statuses are non-canonical (`active_dialog`, `purchase_intent`,
     `call_outcome_unverified`, …) and render as raw snake_case.
   - Fix: define a canonical status enum; map legacy values; add to `STATUS_LABELS`.
     (Coordinate with whoever owns the agents so they emit canonical values.)
   - Files: `Dashboard.tsx`, `Leads.tsx`, agent side.

4. **Archive the data backups** 🟡 — S
   - Problem: ~300 of 335 `data/` entries are `agent-events.jsonl.bak_*` clutter.
   - Fix: move backups to `data/_archive/` or prune old ones.

---

## Phase 4 — Metrics & UX polish 🟡

1. **Fix the "Active Leads" / pipeline metric** 🟠 — M
   - Problem: 731 of 862 leads are `call_completed`; "Active Leads = 862" is misleading
     and the Pipeline Stages chart is one giant bar.
   - Fix: define "active pipeline" = excludes terminal statuses (call_completed,
     closed_won/lost, paid, unsubscribed). Show active count as headline; put completed
     in a separate "lifetime" stat. Consider grouping minor statuses into "Other" in the
     chart.
   - Files: `server/index.ts:82-146` (stats), `Dashboard.tsx`.

2. **Fix weekly report loading (latent)** 🟡 — S
   - Problem: `/api/reports/:type` hardcodes `daily/` subdir; weekly files would 404.
   - Fix: respect a `kind=weekly` param; fix the filename regex for weekly naming.
   - Files: `server/index.ts:161-169`, `Reports.tsx`.

3. **Surface fetch errors instead of swallowing** 🟡 — S
   - Problem: every `fetch().catch(() => {})` hides API failures behind empty cards.
   - Fix: set an error state; show a small "couldn't load — API may be down" inline.
   - Files: all components.

4. **Code-split the bundle** 🟡 — S
   - Problem: single 685 KB JS chunk (Recharts-heavy).
   - Fix: lazy-load Revenue/Reports routes; `manualChunks` for recharts.
   - Files: `App.tsx`, `vite.config.ts`.

---

## Suggested sequencing

```
Week 1:  Phase 0 (decide) → Phase 1 (restore function) → Phase 2 if box is public
Week 2:  Phase 3 (data integrity)
Week 3:  Phase 4 (polish)
```

The single highest-leverage move is **Phase 0 #1 + Phase 1 #1** — without an HTTPS API
origin, nothing else the user sees matters. The single cheapest high-value win is
**Phase 1 #2 (freshness guards)** — it turns "silently wrong" into "visibly stale,"
which is the difference between a misleading dashboard and a trustworthy one.
