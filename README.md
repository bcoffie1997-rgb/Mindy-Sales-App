# GovCon Sales Dashboard

## Environment setup

Copy `.env.example` to `.env` and configure the server-side environment:

- `SUPABASE_URL` — the project URL from Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` — the Supabase service-role key. Never expose this value to the browser or commit it.
- `API_SECRET` — a long random value for authenticated API/worker communication.
- `DASHBOARD_PASSWORD` — the password users enter before the production API returns client data.
- `APP_ORIGIN` — the dashboard origin, such as `http://localhost:3002` for local development.
- `AGENT_WORKER_URL` — optional URL for a separately deployed agent worker.
- `STRIPE_SECRET_KEY` — the Stripe secret key used by revenue endpoints. The legacy `STRIPE_API_KEY` is accepted by the server config as a fallback, but new deployments should use `STRIPE_SECRET_KEY`.

Note that `DASHBOARD_PASSWORD` is now **required**: the API returns 503 for every
route when it is unset, rather than serving data unauthenticated.

Issuing refunds needs a Stripe key with write access to charges. A **restricted**
key scoped to Charges (write) is enough, and safer than the account secret key.

The existing Slack, Gmail, Google Calendar, Fireflies, and OpenAI variables in `.env.example` configure their respective integrations. Keep all secret values in local or deployment environment configuration; migration and verification output never needs to include them.

## Refunds

`POST /api/refund { chargeId, amount?, reason? }` issues a Stripe refund. Omit
`amount` for a full refund; `reason` is one of `requested_by_customer` (default),
`duplicate`, `fraudulent`. It is a mutation, so it requires the same
authorization as the other write routes (session cookie or `Authorization: Bearer
$API_SECRET`).

The endpoint re-reads the charge from Stripe and caps the refund at what is
actually still refundable, so a tampered client cannot over-refund. Calls are
idempotent per (charge, current refund state, amount): a double-click or a
serverless retry collapses into one refund, while a deliberate later refund of
the same amount still goes through on its own. Each refund is written to the
`refunds` table for audit — run `supabase/schema.sql` to create it — and Stripe
remains the source of truth. A failure to write that audit row is reported in the
response as `logged: false` but never as a failed refund, since the money has
already moved.

In the UI: **Revenue → Transactions**, then *Refund* on a row. It asks for
confirmation with the customer name and amount before anything moves.

Refunded charges keep `status: succeeded` in Stripe, so summing `charge.amount`
counts refunds as full revenue. Every revenue figure now nets out
`amount_refunded`, which means a refund reduces reported revenue instead of being
invisible.

## Supabase setup and data migration

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
4. Preview the local data migration:

   ```sh
   npm run migrate:supabase
   ```

   Dry-run is the default. It reads and validates `data/master-sheet.json`, `data/agent-events.jsonl`, Markdown files below `data/reports`, and `data/today-calls.json` without connecting to or writing to Supabase.

5. Apply the migration explicitly:

   ```sh
   npm run migrate:supabase -- --apply
   ```

   If Vercel stores the Supabase credentials as non-exportable sensitive
   variables, migrate through the protected production API instead:

   ```sh
   MIGRATION_API_URL=https://mindy-sales-app.vercel.app \
   API_SECRET=your-api-secret \
   npm run migrate:supabase -- --apply
   ```

The migration writes in batches. Leads and reports use their stable `id` and `filename` keys, and the calls cache uses row `id = 1`. Agent events are compared by timestamp, agent name, event type, and JSON data before missing rows are inserted. Re-running `--apply` is therefore safe and does not add another copy of already migrated source records.

When using `MIGRATION_API_URL`, the protected endpoint replaces the existing
agent event set before inserting the validated local events, making repeated
runs deterministic.

The source event fields map as follows:

- `from` → `agent_events.agent_name`
- `type` → `agent_events.event_type`
- `payload` → `agent_events.data`

Additional lead fields that do not have dedicated columns are retained in `leads.metadata`.

## Verification

Run the project checks:

```sh
npm run build
npx tsc --noEmit
```

Then verify table counts in the Supabase SQL editor:

```sql
select count(*) from leads;
select count(*) from agent_events;
select count(*) from reports;
select id, generated_at from calls_cache where id = 1;
```

Run `npm run migrate:supabase -- --apply` a second time and confirm it reports zero new agent events. Finally, start the app with `npm run dev` and check `/api/health`, `/api/leads`, `/api/events`, `/api/reports`, and `/api/calls` from the configured `APP_ORIGIN`.
