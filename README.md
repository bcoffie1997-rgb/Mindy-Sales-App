# Mindy Sales App

## Local development

```sh
cp .env.example .env
npm ci
npm run dev
```

The web app runs on `http://localhost:3002`; Vite proxies `/api` to the local API on port `3007`.

## Production

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD`, and
`DASHBOARD_SESSION_SECRET` in Vercel. Optional integration variables are listed
in `.env.example`.

Use `/api/health` to verify the deployment. A healthy response is:

```json
{"status":"ok","database":"connected"}
```

The Enterprise Leads files live in `public/`. Replace the empty starter arrays
with the approved non-sensitive datasets before deployment.
