# Vantage-ARS

The public website and founder-controlled, AI-staffed office for Vantage-ARS ([vantage-ars.co.za](https://vantage-ars.co.za)): VoIP, networking and IT infrastructure support, South Africa.

Author: Juan-louw Greyling <juanlouw.greyling@gmail.com>

> The live site at vantage-ars.co.za is currently a separate Cloudflare Worker (`vantage-api`). This repository does not deploy to it. Nothing changes there until you point the domain at a deployment of this app.

## Stack
- TanStack Start + React 19, Tailwind CSS 4, Vite 8, Nitro 3
- Postgres: Neon (or any Postgres) when `DATABASE_URL` is set, otherwise embedded PGLite
- Better Auth (founder email and password), pdf-lib for quotes, SMTP for notices
- Nine AI staff on Cloudflare Workers AI or xAI

## What is in it
| Area | Routes |
| --- | --- |
| Public site | `/`, `/services/voip`, `/services/networking`, `/services/it-infrastructure`, `/rates`, `/work`, `/support`, `/terms`, `/privacy` |
| Customer quote link | `/q/<token>`: view, download PDF, accept or decline |
| Founder office (sign-in) | `/office`: inbox, approvals, sales, ledger, chat, audit and more |

## Run locally
Node 22.12 or newer.
```sh
npm ci
cp .env.example .env      # fill in what you need; everything is optional locally
npm run dev               # http://localhost:8080
npm run validate          # typecheck + lint + tests
```

## Environment
All settings are listed in `.env.example`. The important ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres (Neon). Migrations run during `npm run build`. Unset means embedded PGLite. |
| `PGLITE_DATA_DIR` | With PGLite, keep data in this folder. Unset means in-memory, which is lost on restart. |
| `BETTER_AUTH_URL` | The public URL, e.g. `https://vantage-ars.co.za`. |
| `BETTER_AUTH_SECRET` | A long random secret (`openssl rand -base64 32`). Required in production. |
| `FOUNDER_SETUP_TOKEN` | One-time code for creating the founder account (16+ characters). Remove it afterwards. |
| `FOUNDER_EMAIL` | The only account allowed into the office. Defaults to the company email. |
| `GROK_OAUTH` | `off` hides the Grok sign-in button. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` / `XAI_API_KEY` | AI staff provider. With neither set, the staff report that they are unavailable. |
| `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD` | Founder notices and customer mail. |
| `PAYMENT_*` | Bank details on the site and quotes. |
| `AUTO_DRAFTS`, `CRON_SECRET` | Daily draft-only run (see below). |

## Founder setup (once)
1. Set `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `FOUNDER_SETUP_TOKEN` and, if needed, `FOUNDER_EMAIL`. Deploy.
2. Open `/office`. The page offers "Set up the founder account".
3. Enter the founder email, a password of 12+ characters and the setup token.
4. Remove `FOUNDER_SETUP_TOKEN` and redeploy. Sign-up is closed anyway once a founder exists.

## Customer quote links
On Sales (`/office/sales`), each quote has a Customer link panel. Create a link and copy it; it is shown only once and only its hash is stored. Send it to the customer yourself. The link expires after 30 days, and you can replace or withdraw it. When the customer accepts, the opportunity closes as won, you get a notice, and the audit trail records the customer as the actor. A declined quote stays open for you to follow up.

## Deploy
### Vercel + Neon (recommended)
1. Import the GitHub repo in Vercel. The build switches to the Vercel output format by itself.
2. Add a Neon database and set `DATABASE_URL`, then the auth settings above.
3. Deploy. `npm run build` applies migrations, and `vercel.json` adds security headers and the daily cron.

### Docker (any server)
```sh
cp .env.example .env      # set BETTER_AUTH_URL, BETTER_AUTH_SECRET, FOUNDER_SETUP_TOKEN...
docker compose up -d --build
```
The app listens on port 3000. Without `DATABASE_URL`, data lives in PGLite on the `data` volume. With `DATABASE_URL`, migrations run on start-up. Put HTTPS (Caddy, nginx, Cloudflare Tunnel) in front and forward `X-Forwarded-For`.

### Plain Node
```sh
npm ci && npm run build && npm start      # .output/server/index.mjs, PORT defaults to 3000
```

## CI
`.github/workflows/ci.yml` runs typecheck, lint, tests and a production build on every push to `main` and on every pull request.

## Public surface
Enquiry form, payment notices and live chat. All three are rate limited per caller, both in memory and in the database (`rate_hits`, migration 0008), and the database check fails open.

## Money
Amounts are integer cents (ZAR). `ledgerVat()` and `vatBreakdown()` in `src/lib/office/invoice.ts` handle none, standard 15%, VAT-included and zero-rated. Customer-facing text never adds VAT unless a treatment says so.

## Scheduled drafts
`vercel.json` calls `/api/cron/floor` daily at 06:00 UTC (08:00 SAST). It only runs when `AUTO_DRAFTS=on` and the request carries `CRON_SECRET`. It writes follow-up and acknowledgement letters as drafts, starts the free organic campaign and writes technical procedures. It never emails a customer, spends money or quotes. Review and send from the office. Workers AI is not called by this run, so it costs nothing.

## Backup
Governance & audit page: **Download verified backup** exports every business table as JSON with a SHA-256 checksum. It never includes sign-in credentials. It contains customer data, so store it privately. Restore (same page) checks the checksum, refuses anything that is not an office table or has unknown columns, and only adds missing records; it never deletes or overwrites.

## Rotating the Gmail app password
Only you can do this, in your Google account: Security, 2-Step Verification, App passwords. Delete the old app password, create a new one, put it in `GMAIL_SMTP_APP_PASSWORD` (with `GMAIL_SMTP_USER`) in your host's environment settings, redeploy, then delete `.grok/gmail-smtp.json`. The file is git-ignored and left out of every zip I make.

## Docs
- `docs/business-scope-and-competitive-pricing.md`: scope, rates and department boundaries.
- `docs/MERGE.md`: how the earlier projects were combined.
- `CHANGELOG.md`: what changed and when.
- The earlier repository layout, including the v3 Cloudflare Worker source, is preserved at git tag `pre-v4-archive`.

## Governance
Agents act only inside their role. Anything that costs money, risks a customer, or can win one goes to the founder for approval. Every decision is recorded in the audit trail.

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Remixed using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/Leonydis138/vantage-ars)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/Leonydis138/vantage-ars)

- 🎮 [Open the project](https://omgithub.com/Leonydis138/vantage-ars).
- ✨ [Remix this project](https://omgithub.com/?remix=Leonydis138%2Fvantage-ars).
- 💻 [Explore the source](https://github.com/Leonydis138/vantage-ars).
- 🛠️ [Check build runs](https://github.com/Leonydis138/vantage-ars/actions).
- 🐛 [Report an issue](https://github.com/Leonydis138/vantage-ars/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/Leonydis138).
- 🌍 [Create with OMGithub](https://omgithub.com).
- 🧬 [Explore the remix source](https://github.com/leonydis138/vantage-ars/tree/91853668cbc91760ebb2ac0fd0cc2f5e5395d4b6).
<!-- omgithub:readme:end -->
