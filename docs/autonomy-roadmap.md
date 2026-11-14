# Autonomy roadmap — verified state and the ordered increments

Production observations below were made on 2026-10-24 and are historical, not
re-verified in this update. Repository behavior was rechecked on 2026-10-28:
the agent inventory contains ten agents, and the local real-office verifier
passed 245/245 checks. That local run does not prove production credentials,
deployment configuration, or live integrations; see
[`runtime-inventory.md`](./runtime-inventory.md).

## Repository checks and historical production evidence

| System                                                                                     | Evidence                                                                                | Result                                                                                                              |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Autonomy engine (ten agents, durable queue, founder gates, delegation, hash-chained audit) | `npm test` + `npm run verify:office`                                                    | 245/245 local office checks passed on 2026-10-28; production state not re-verified                                  |
| Neon database                                                                              | connectivity check against the pooled host                                              | PostgreSQL 18.6 answered; `scripts/migrate.mjs` reports up to date — 16 migrations applied                          |
| Production site                                                                            | `GET https://www.vantage-ars.co.za/` and `/api/health`                                  | both 200; health reports `state: operational`, records and decision-record integrity ok                             |
| Cron endpoint guard                                                                        | `GET /api/cron/floor` without a bearer token                                            | 401 Unauthorized — the endpoint only acts with `CRON_SECRET`                                                        |
| Self-nudge                                                                                 | `src/routes/api/health.ts`, `src/routes/api/site-signal.ts`                             | both call `nudgeScheduler`, so any health probe or real page view starts a catch-up tick when the last one is stale |
| GitHub Actions heartbeat                                                                   | `.github/workflows/office-scheduler.yml`                                                | every 10 minutes, `CRON_SECRET` as a repository secret, loud errors on 401/404/500                                  |
| Docker + systemd paths                                                                     | `docker-compose.yml` (scheduler sidecar), `deploy/systemd/` (service + 10-minute timer) | committed; no external monitor needed on those targets                                                              |
| Cloudflare Worker (D1 + Workers AI + durable workflows, crons every 15 min)                | `workers/vantage-ars/wrangler.toml`                                                     | config is real and account-bound; deploys via `deploy-vantage-ars.yml`                                              |

## The increments, in order

### 1. The four switches (no code — configuration only)

1. Host environment: `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
   `AUTONOMY=on`, `CRON_SECRET`, `FOUNDER_EMAIL`. Generate the two secrets
   with `scripts/setup-autonomy.sh` or `openssl rand -base64 32` /
   `openssl rand -hex 32`.
2. GitHub → Settings → Secrets and variables → Actions: `CRON_SECRET`, the
   same value as the host's.
3. Once: `FOUNDER_SETUP_TOKEN`, open `/office`, create the founder account,
   remove the token, redeploy.
4. In-app, the last autonomy switch: `/office/delegations` — save a standing
   delegation. With none, every cost, customer win/loss and handoff stops at
   the founder gate. That is by design.

### 2. Model-driven reasoning for the agents (needs one valid Cloudflare token)

The app's provider layer (`src/lib/office/ai-provider.ts`) already speaks
Cloudflare Workers AI. What is missing is a token Cloudflare accepts.

- Tried on 2026-10-24, twice: `GET /user/tokens/verify` and
  `GET /accounts/<account_id>/tokens/verify` both returned
  `{"success":false,"errors":[{"code":1000,"message":"Invalid API Token"}]}`.
  The values tried are paste-prefixed strings, not dashboard-issued API tokens (a dashboard token carries no such prefix).
- TODO(founder): create a token at My Profile → API Tokens (no prefix) with
  Workers AI permissions, then set `CLOUDFLARE_ACCOUNT_ID` +
  `CLOUDFLARE_API_TOKEN` on the host and run `npm run cf:check`. Every
  autonomous duty already runs without it — the agents decide from office
  records; the model only sharpens drafted text.

### 3. Worker deploy (same token)

`git push` to `main` already triggers `.github/workflows/deploy-vantage-ars.yml`
for changes under `workers/vantage-ars/`. It needs `CLOUDFLARE_API_TOKEN` as a
repository secret with Workers Scripts + D1 edit permissions. The Worker then
serves from `*.workers.dev` (custom-domain attach is deliberately disabled
while Vercel serves the domain — see the comment in `wrangler.toml`).

### 4. Reaching customers (optional, already built)

- Mail: verified implicit-TLS SMTP settings (`SMTP_*`). Legacy Gmail app-password settings remain a fallback.
  Without them every notice is still recorded in the office and read there.
- Founder notices on a second channel: `FOUNDER_WEBHOOK_URL` (Slack/Discord).
- Bank details on quotes/invoices: the five `PAYMENT_*` values, all or none.

### 5. Hardening

- The circuit breaker tells the founder once, by the same mail and webhook path
  as every other office alert, on the tick that crosses the failure limit. A
  clean recovery sends one resume notice. It does not repeat every ten minutes.
- The daily briefing is already mailed from the books. A second weekly digest
  would repeat it.
- `/api/health` remains the public heartbeat. The ten-minute GitHub scheduler
  is the monitor.

## The honest boundary

The code is not the bottleneck. Every autonomous behaviour the roadmap needs —
queue, cadences, gates, delegation, audit, self-halt, self-recovery, catch-up
ticks — is implemented and proven by 243 checks. What stands between here and
an unattended office is four configuration switches and one valid Cloudflare
token.
