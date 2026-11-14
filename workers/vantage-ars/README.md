# vantage-ars Worker

Cloudflare Worker behind the vantage-ars content site — the admin queue, AI
writer and task workflow. It no longer owns the custom domains; the public site
and office are served by the Vercel deployment (see "Fallback to the Vercel
app" below).

- `src/worker.production.js` — the deployed Worker (routes, AI calls, admin,
  rendering, plus the `AgentTaskWorkflow` class); this is `main` in `wrangler.toml`
- `src/worker.js` — the `AgentTaskWorkflow` class alone; not deployable and not
  imported by `wrangler.toml` (the Durable Workflow entry needs its own module)
- `wrangler.toml` — bindings: D1 `vantage-data`, Workers AI, Durable Workflow,
  cron `0 7 * * 1` + `*/15 * * * *`, and `VERCEL_ORIGIN`. The Worker deploys to
  `https://vantage-ars.greylingjuanlouw-850.workers.dev`; the custom-domain
  routes for `vantage-ars.co.za` + `www.vantage-ars.co.za` are commented out
  because those hostnames are served by Vercel (Cloudflare error 100117 if the
  Worker tries to claim them while the Vercel DNS records exist).
- `schema.sql` / `seed.sql` — idempotent D1 schema + starter backlog

## Deploy

Automatic: pushing changes under `workers/vantage-ars/**` to `main` runs
`.github/workflows/deploy-vantage-ars.yml`, which applies the schema/seed to
the remote D1 and deploys the Worker. Requires repo secret
`CLOUDFLARE_API_TOKEN` with only the required Workers Scripts Edit and D1 Edit
permissions, scoped in Cloudflare to the account and resources used by this
Worker. The workflow exposes the secret only to the D1 and deploy steps, not
dependency installation. The account ID lives in `wrangler.toml`.

Manual:

```bash
cd workers/vantage-ars
npx wrangler@4 d1 execute vantage-data --remote --file=schema.sql --yes
npx wrangler@4 d1 execute vantage-data --remote --file=seed.sql --yes
npx wrangler@4 deploy
```

## Fallback to the Vercel app

The Worker owns the content site, admin queue, AI writer and the `/api/*`
routes it implements. Every other path (services, rates, legal pages, office,
auth, quotes, ...) is proxied to `VERCEL_ORIGIN` (default
`https://vercel.vantage-ars.co.za`), so the Worker and the Vercel app can
coexist on one origin instead of one replacing the other. `VERCEL_ORIGIN` is a
Worker variable in `wrangler.toml`; override it there if the Vercel deployment
lives elsewhere.

Until the Worker is given the hostnames back, `vantage-ars.co.za` and
`www.vantage-ars.co.za` are served directly by Vercel and this proxy is only
reachable through the workers.dev URL. To put the Worker in front again, delete
the Vercel DNS records for both hostnames, uncomment the `[[routes]]` blocks in
`wrangler.toml`, and redeploy.

## Admin

`https://vantage-ars.co.za/admin?t=<ADMIN_TOKEN>` — approvals, edits,
corrections, weekly report (`/admin/report`), and a manual writer run
(`/admin/run`). `ADMIN_TOKEN` is a Worker secret (set once; persists across
deploys).
