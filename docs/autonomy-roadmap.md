# Autonomy roadmap — verified state and the ordered increments

Status as of 2026-10-24. Everything in "verified" was checked against the real
systems on that date: the test suite ran green, the Neon database answered,
and the production site was probed over HTTPS. Nothing here is aspirational
wording — each claim names the check that proved it.

## Verified running today

| System                                                                                      | Evidence                                                                                | Result                                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Autonomy engine (nine agents, durable queue, founder gates, delegation, hash-chained audit) | `npm test` + `npm run verify:office`                                                    | 243/243 checks passed, no mocks, no sample data                                                                     |
| Neon database                                                                               | connectivity check against the pooled host                                              | PostgreSQL 18.6 answered; `scripts/migrate.mjs` reports up to date — 16 migrations applied                          |
| Production site                                                                             | `GET https://www.vantage-ars.co.za/` and `/api/health`                                  | both 200; health reports `state: operational`, records and decision-record integrity ok                             |
| Cron endpoint guard                                                                         | `GET /api/cron/floor` without a bearer token                                            | 401 Unauthorized — the endpoint only acts with `CRON_SECRET`                                                        |
| Self-nudge                                                                                  | `src/routes/api/health.ts`, `src/routes/api/site-signal.ts`                             | both call `nudgeScheduler`, so any health probe or real page view starts a catch-up tick when the last one is stale |
| GitHub Actions heartbeat                                                                    | `.github/workflows/office-scheduler.yml`                                                | every 10 minutes, `CRON_SECRET` as a repository secret, loud errors on 401/404/500                                  |
| Docker + systemd paths                                                                      | `docker-compose.yml` (scheduler sidecar), `deploy/systemd/` (service + 10-minute timer) | committed; no external monitor needed on those targets                                                              |
| Cloudflare Worker (D1 + Workers AI + durable workflows, crons every 15 min)                 | `workers/vantage-ars/wrangler.toml`                                                     | config is real and account-bound; deploys via `deploy-vantage-ars.yml`                                              |

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

### 2. Model-driven reasoning for the agents (optional provider credentials)

The app supports Cloudflare Workers AI, xAI, and the Hugging Face Inference
Providers OpenAI-compatible router. Configure `AI_PROVIDER=huggingface` with
`HUGGINGFACE_API_KEY` or `HF_TOKEN` to select Hugging Face explicitly; the
current default model is `Qwen/Qwen2.5-7B-Instruct`. Hugging Face free-tier
credits and availability are limited, not guaranteed unlimited. An explicitly
selected but unavailable provider does not silently fall back to another
provider. `npm run cf:check` reports which configured provider the app will use.

- Historical Cloudflare check on 2026-10-24: `GET /user/tokens/verify` and
  `GET /accounts/<account_id>/tokens/verify` both returned
  `{"success":false,"errors":[{"code":1000,"message":"Invalid API Token"}]}`.
  That result applies to the values tested then; a valid Cloudflare token remains
  an option, but is no longer the only way to enable model-driven reasoning.
- Every autonomous duty runs without a language model — agents decide from
  office records; the model only expands research and drafting capacity.

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
