# Deploying to Vercel

This takes about twenty minutes and is the last step. Everything else is done and
verified.

## 1. Merge the branch

```sh
git checkout main
git merge opencode/autonomous-office
git push origin main        # this is what triggers the deploy
```

## 2. Set the environment variables

Vercel → your project → **Settings → Environment Variables**. Add each one for
**Production** (and **Preview** if you want previews to behave the same).

### Required — the app will not boot without these

| Variable             | Value                                                 |
| -------------------- | ----------------------------------------------------- |
| `DATABASE_URL`       | Your Neon connection string. Keep `?sslmode=require`. |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` — run it, paste the output. |
| `BETTER_AUTH_URL`    | `https://www.vantage-ars.co.za`                       |
| `CRON_SECRET`        | `openssl rand -hex 32` — a second, different secret.  |

### Required for the office to run by itself

| Variable   | Value |
| ---------- | ----- |
| `AUTONOMY` | `on`  |

Without `AUTONOMY=on` nothing is scheduled: the office only acts when you press
**Run the floor**. With it on, the scheduler acts every ten minutes.

### Required to reach the office at all

| Variable        | Value                                                         |
| --------------- | ------------------------------------------------------------- |
| `FOUNDER_EMAIL` | Your email. This is the only account that can open `/office`. |

Sign-up is closed to everyone else, permanently, in code — not by configuration.

### Recommended

| Variable                                                                                                     | Why                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`                                      | Optional outbound mail over implicit TLS. Use a verified sender and publish the provider's SPF/DKIM DNS records first. Partial settings fail closed. |
| `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`                                                                 | Legacy Gmail fallback when generic SMTP is unset; messages are sent from that Gmail account.                                                         |
| `PAYMENT_BANK_NAME`, `PAYMENT_ACCOUNT_NUMBER`, `PAYMENT_BRANCH_CODE`, `PAYMENT_BENEFICIARY`, `PAYMENT_SWIFT` | Bank details on quotes and invoices. All five or none — an incomplete set is treated as "not configured" rather than shown half-filled.              |
| `DATABASE_POOL_MAX`                                                                                          | Defaults to 4. Only raise it if Neon says you have connections to spare.                                                                             |

### Optional — only for the manual "brief an agent" panel

| Variable                                        | Why                                                    |
| ----------------------------------------------- | ------------------------------------------------------ |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Workers AI. See `docs/cloudflare-workers-ai.md`.       |
| `XAI_API_KEY`                                   | Or xAI instead.                                        |
| `GROK_OAUTH`                                    | Set to `off` unless you want Google/X sign-in buttons. |

**The autonomous duties do not need any of these.** They decide from office
records, not from a language model, which is exactly why they keep working when
the model provider is down.

### One-time, then remove

| Variable              | Why                                                                |
| --------------------- | ------------------------------------------------------------------ |
| `FOUNDER_SETUP_TOKEN` | `openssl rand -hex 16`. Needed only to create the founder account. |

1. Deploy with it set.
2. Open `https://www.vantage-ars.co.za/office`.
3. Press **First-time founder setup**. Enter your email, a password of at least
   12 characters, and the token.
4. **Remove `FOUNDER_SETUP_TOKEN` and redeploy.** Sign-up closes itself once the
   account exists, but do not leave a live creation token in production.

## 3. Create the founder account

Do this within a few minutes of step 1, then remove the token.

## 4. Turning on the standing delegation

The office ships with nothing delegated. Every action that costs money, wins or
loses a customer, or reaches a customer stops at the founder gate and waits for
you. A standing delegation is how you say yes once, in advance, for a bounded
class of work: for these action kinds, at these published prices, up to this
much for any single action and this many times a day and a month, the office may
act without asking you again.

**The delegation needs no environment variable.** It lives in the database, on
one row, and it is edited from the office. The deploy described in this document
does not change because of it.

Set it from `/office/delegations`, which is founder-only like the rest of the
office. Nothing is delegated until you save a policy, and the four presets are
starting points that only fill the form:

| Preset                        | What it permits                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Observe only                  | Nothing. Every action still stops at the founder gate.                                                                 |
| Deliver and tell the customer | The office may fulfil a productised service and email the customer the report. No selling, no money.                   |
| Bill and collect              | The office may invoice a customer whose work was accepted, email the invoice, and match an exact payment to it.        |
| Managed revenue               | Everything above, plus selling the published managed plans to a real enquiry, starting a subscription, and ending one. |

The caps are yours to set: the most any single action may be worth (R5,000.00
by default), how many actions a day (20 by default) and how many a month (200
by default). The monthly limit may not be set below the daily limit. Only the
published rate lines may be charged, and only the ones you tick.

Revocation takes effect on the very next action. The policy is read inside the
same transaction that performs the action, so there is no grace period, no
queued work that survives it, and no auto-approval waiting to fire.

## 5. Recurring revenue in production

The delegation and the recurring-revenue book live in five tables, created by
`migrations/0011_delegation.sql`:

| Table              | What it holds                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delegations`      | The standing authority: the action kinds it covers, the published rate lines it may charge, the per-action cap, and the daily and monthly caps. One row. |
| `delegation_usage` | One row per delegated action, so the caps are counted from records rather than from memory.                                                              |
| `subscriptions`    | A customer on a recurring plan: the plan, the price, the cycle, and the next billing instant.                                                            |
| `billing_cycles`   | One row per billing period of a subscription. The unique index on `(subscription_id, period_start)` is what stops a period being invoiced twice.         |
| `customer_notices` | Every email the office sent a customer, in full, with whether it was delivered.                                                                          |

`npm run build` applies the pending migrations, so a deploy picks them up. The
build runs `vite build && npm run db:migrate`, and the migrator applies each
file in one transaction and records it in `_migrations`, so no file is ever
applied twice.

The migration changes two existing tables as well:

- `decisions` gains a `delegation_id` column, so a single money movement can be
  traced back to the delegation that allowed it.
- `documents` gains a `rate_id` column, so the office can tell a one-off job
  from the start of a recurring plan without reading the wording.

A second migration, `migrations/0012_governance.sql`, adds the governance record
that the delegation sits inside: the tables `decision_episodes`, `gate_records`
and `decision_receipts`, and six columns on `approvals` — the founder's
pre-exposure reasoning, the reason code, the evidence shown, the policy version
in force, and the moments the case was exposed and decided. It is applied in the
same deploy, and it changes nothing about the environment.

The duties that bill a period, produce its deliverable and email the customer
only run when `AUTONOMY=on`. With it off, the office still records everything
the founder does by hand, but it schedules nothing.

## 6. Point the domain

Vercel → **Settings → Domains**. Add `vantage-ars.co.za` and `www.vantage-ars.co.za`.

Both hostnames are served by this app (Vercel); Cloudflare keeps the zone
(DNS, caching, TLS) with DNS set to **DNS only** pointing at the Vercel
records.

The Worker does not serve these hostnames: Vercel's DNS records own them, and a
Worker custom-domain route cannot be attached while they exist (Cloudflare error
100117). The Worker deploys to `vantage-ars.greylingjuanlouw-850.workers.dev`
and keeps its D1, crons and workflow there. To put it in front of the domain
again, delete the Vercel DNS records and uncomment the `[[routes]]` blocks in
`workers/vantage-ars/wrangler.toml`.

## 7. Verify the deploy

```sh
# The site is up and the office is provisioned.
curl -s https://www.vantage-ars.co.za/api/health | jq '{ok, database, chain, scheduler}'

# The audit chain still verifies after the migration.
curl -s https://www.vantage-ars.co.za/api/health | jq '.chain.ok'

# The office is locked to signed-out visitors.
curl -s https://www.vantage-ars.co.za/office | grep -c 'Command centre access'

# The cron endpoint refuses anonymous callers.
curl -s -o /dev/null -w '%{http_code}\n' https://www.vantage-ars.co.za/api/cron/floor   # 401
```

Then, in a browser:

1. Sign in at `/office`. You should see the **Autonomy** panel with
   "Running by itself", 41 duties, and a queue.
2. Press **Run the floor**. It should report what it did.
3. Wait ten minutes and reload. `lastTickAt` should have moved on its own. If
   the GitHub schedule is throttled (it is best-effort on quiet repositories),
   a hit on `/api/health` or a real page view nudges a catch-up tick once the
   last one is over ten minutes old — `lastTickAt` moves then too.
4. Watch `GET /api/health` — `scheduler.overdue` must stay `false`, and
   `chain.ok` must stay `true`.
5. Open `/office/delegations`. Until you grant one in section 4 it must say
   that nothing is delegated.
6. Open `/office/revenue`. It must load the recurring-revenue book. On a fresh
   deploy it is empty — no subscriptions, no billing periods, no customer email
   — and that is the correct result.

## 8. Set up monitoring

Point an uptime check at `https://www.vantage-ars.co.za/api/health` and alert on
a non-200. The endpoint returns 503 when the database is unreachable, the audit
chain fails, the scheduler goes stale, or the office is halted — which are the
four conditions where the business is not actually running even though the pages
still render.

The check is also useful on the way in: each hit restarts a throttled scheduler
(a catch-up tick when the last one is over ten minutes old), so the monitor both
watches the office and keeps its ten-minute cadence honest on free hosting tiers.

## 9. Backups

`/office` → **Governance** → **Audit** → _Download verified backup_. Take one
after the first real deal and then whenever you want a checkpoint.

The export includes live customer quote links, so restoring it does not break an
open quote. Restores are add-only and transactional: they never delete or
overwrite.

## If something goes wrong

**The office is doing something you do not want.** Halt it — the sidebar button,
or `haltOffice` through the office. Nothing plans or executes while halted, and
queued approvals are refused until you resume. If it is acting under a
delegation you granted, revoke it from `/office/delegations`; that takes effect
on the very next action.

**The office will not start.** Check `/api/health`. `problems` names the cause.
The usual one is a missing or unreachable `DATABASE_URL`, which the app reports
loudly at boot instead of failing later inside a request.

**The scheduler stopped.** `/api/health` reports `scheduler.overdue` and
`consecutiveFailures`. Five consecutive failing ticks trip a circuit breaker and
the office refuses to act until a human looks at it. That is deliberate.
