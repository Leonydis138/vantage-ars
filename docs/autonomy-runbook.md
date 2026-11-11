# Autonomy runbook — the switches that make the office run itself

The office is autonomous in code: ten agents, a durable queue, cadenced
duties, founder gates, a hash-chained audit trail. Nothing in this document
changes that design. It lists the configuration that turns the design on, per
deploy target, and the one decision that stays yours.

## The four switches

| #   | Switch              | Where                                                         | Effect                                                                                                    |
| --- | ------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `AUTONOMY=on`       | `.env` / host environment                                     | Arms the scheduled floor run. Anything else and `/api/cron/floor` returns 404; only the button works.     |
| 2   | `CRON_SECRET`       | `.env` (or host env) **and** GitHub Actions repository secret | The bearer token the tick must present. 16+ random characters.                                            |
| 3   | Founder account     | `/office` → "First-time founder setup"                        | Opens the office. Needs `FOUNDER_SETUP_TOKEN` set once, removed after.                                    |
| 4   | Standing delegation | `/office/delegations`                                         | The only switch that is in the app, not in git: it lets agents act at the gates without asking each time. |

A long-lived server also carries its own heartbeat (`SELF_SCHEDULER=on`, the
default), so `CRON_SECRET` is no longer the only way to start a tick. Serverless
targets still need the external schedule and keep the same secret.

Generate both secrets in one line:

```sh
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -hex 32)"
```

or run `scripts/setup-autonomy.sh` from the repository root, which writes them
into a fresh `.env`, enforces `AUTONOMY=on`, and prints the remaining steps.

## What the code already does on its own

- `.github/workflows/office-scheduler.yml` calls
  `GET https://www.vantage-ars.co.za/api/cron/floor` every ten minutes with
  `CRON_SECRET` as a repository secret, and fails loudly with the reason on
  401, 404 and 500.
- `vercel.json` keeps a daily Vercel cron as the last fallback (the Hobby plan
  rejects crons more often than daily).
- The office nudges itself: a hit on `/api/health` or a real page view starts a
  catch-up tick when the last one is over ten minutes old, so an uptime monitor
  doubles as the heartbeat.
- On Docker, systemd or plain Node, the first request starts the app's own
  five-minute timer (`SELF_SCHEDULER=on`). A Postgres lease makes only one
  replica the owner, with a fifteen-minute failover. Serverless is detected and
  never starts a timer.
- With `BACKUP_DIR` set, admin writes one verified offline backup a day and
  prunes only its own expired files.
- SEAL verifies the whole audit chain twice a day and halts the office if it
  fails to verify.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and
  `npm run verify:office` (243 checks, no mocks, no sample data) on every push
  to `main` and every pull request.

## Target A — Vercel + Neon (recommended)

1. Import the GitHub repo in Vercel. Add a Neon database and set `DATABASE_URL`.
2. Set in Vercel (Production environment): `BETTER_AUTH_URL`,
   `BETTER_AUTH_SECRET`, `AUTONOMY=on`, `CRON_SECRET`, `FOUNDER_EMAIL`, and —
   once only — `FOUNDER_SETUP_TOKEN`.
3. Add the **same** `CRON_SECRET` as a GitHub Actions repository secret
   (Settings → Secrets and variables → Actions). GitHub's cron is best-effort
   on quiet repositories; the self-nudge and the daily Vercel cron cover the
   gaps, and an uptime monitor on `/api/health` closes them entirely.
4. Deploy. `npm run build` applies migrations.
5. Open `/office`, create the founder account, then **remove
   `FOUNDER_SETUP_TOKEN` from Vercel and redeploy** — sign-up closes once a
   founder exists.
6. Full walkthrough: [docs/deploy-vercel.md](deploy-vercel.md).

## Target B — Docker (any server)

```sh
cp .env.example .env
scripts/setup-autonomy.sh          # writes the two secrets, sets AUTONOMY=on
docker compose up -d --build
```

The compose file starts a `scheduler` sidecar next to the app. It curls
`/api/cron/floor` every ten minutes with `CRON_SECRET`, so an unattended server
never depends on GitHub Actions cron or an external monitor. The app restarts
unless stopped, keeps PGLite data on the `data` volume (set `DATABASE_URL` to
Neon instead for a managed database), and applies migrations on start.

## Target C — Plain Node + systemd

```sh
npm ci && npm run build            # produces .output/server/index.mjs
sudo cp deploy/systemd/vantage-ars.service /etc/systemd/system/
sudo cp deploy/systemd/vantage-ars-tick.service /etc/systemd/system/
sudo cp deploy/systemd/vantage-ars-tick.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vantage-ars.service vantage-ars-tick.timer
```

The units assume the repository at `/opt/vantage-ars` with settings in
`/opt/vantage-ars/.env` and a dedicated `vantage` user — edit
`WorkingDirectory`, `EnvironmentFile` and `User` if yours differ. The timer
fires every ten minutes and `Persistent=true` catches up a tick missed while
the machine was off.

## The one decision that stays yours

With no delegation the office stops at the founder gate for **every** cost,
every customer win, every customer loss and every marketing-to-sales handoff.
That is deliberate: it ships with no delegation at all.

To run unattended, open **`/office/delegations`** and save a preset. A
delegation answers a whole class of question in advance: which action kinds it
covers, which published rate lines it may charge, the most any single action
may be worth, and how many actions it may take per day and per month. It is
revocable with effect from the very next action, it never overrides a hard
block, it cannot widen an agent's role, permit an unpublished price or a
promise to a customer, and it does not survive a halt. Every action taken under
one is written into the audit chain against the delegation that allowed it.

Mail, if you want the office to reach customers: configure `SMTP_HOST`,
`SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASSWORD` and a provider-verified
`SMTP_FROM`. Publish the provider's SPF and DKIM DNS records first. A legacy
Gmail fallback remains available with `GMAIL_SMTP_USER` and
`GMAIL_SMTP_APP_PASSWORD`, but it sends from the Gmail account. Without mail
settings nothing is emailed; every notice is still recorded in the office.
Add `FOUNDER_WEBHOOK_URL` (Slack or Discord webhook) for founder notices on a
second channel.

Online card checkout is not implemented and remains disabled regardless of
PayFast credentials. See [gateway readiness and blockers](payments-gateway-readiness.md)
before configuring or enabling any online payment provider.

## Verify

| Check         | Command / URL                                                              | Expected                                 |
| ------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| Local proof   | `npm run verify:office`                                                    | 243 checks pass, no mocks                |
| Health        | `GET /api/health`                                                          | 200, `"scheduler": { "overdue": false }` |
| Autonomy      | `/office` autonomy panel, or founder-scope `/api/health`                   | readiness score, level, and named gaps    |
| Backups       | `BACKUP_DIR` after one tick                                                 | one `vantage-ars-backup-*.json`, mode 0600 |
| Public status | `/status`                                                                  | five lines, founder control intact       |
| Office        | `/office`                                                                  | duties with next-due times, live queue   |
| Tick          | GitHub → Actions → office-scheduler, or `docker compose logs -f scheduler` | a tick every ~10 minutes, HTTP 200       |

## Troubleshooting

| Symptom                                      | Cause                                           | Fix                                                                                                  |
| -------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Actions run fails with 401                   | Repo secret does not match host `CRON_SECRET`   | Update one of them                                                                                   |
| 404 with "Autonomy is not on." in the body   | `AUTONOMY` is not `on` in production            | Set it and redeploy                                                                                  |
| 404 on the endpoint, body not about autonomy | Deployment stale                                | Redeploy main                                                                                        |
| 500                                          | Circuit breaker engaged after repeated failures | Inspect `/office`, fix the cause, redrive from there (redrive is a founder action)                   |
| Ticks sparse on GitHub                       | Best-effort cron on quiet repositories          | Rely on the self-nudge, the Docker sidecar, the systemd timer, or an uptime monitor on `/api/health` |
| Nothing ever reaches a customer              | No delegation, or none allowing mail            | Save a delegation at `/office/delegations` that allows mail                                          |
| Founder signed out after every restart       | `BETTER_AUTH_SECRET` unset in production        | Set it — every cold start otherwise mints a new secret and signs you out                             |
