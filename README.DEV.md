# Vantage-ARS — developer notes

The product surface is in [`README.md`](README.md); the autonomy rules are in
[`docs/autonomy.md`](docs/autonomy.md). This file is for changing the code.

## Local loop

Node 22.12 or newer.

```bash
npm ci
cp .env.example .env      # nothing here is required to render the site
npm run dev               # http://localhost:8080
```

With no `DATABASE_URL`, the app runs on embedded PGLite. Set
`PGLITE_DATA_DIR=./data` if you want that database to survive a restart; leave
it unset and each process starts clean.

Useful checks, cheapest first:

```bash
npm run typecheck         # tsc --noEmit
npm run lint              # eslint .
npm run format:check      # prettier over source, scripts and deploy config
npm test                  # unit tests, then the real-office verification
npm run check             # typecheck + lint + test
npm run build:ci          # production build without touching a database
npm run validate          # alias for typecheck + lint + test
```

`npm test` caps the Node test runner at four workers. The suite imports enough
WASM and native modules that the default per-core fan-out can segfault an
otherwise green run, and it also skips the eager PGlite bootstrap
(`VANTAGE_SKIP_DB_BOOTSTRAP=1`); any test that actually calls `getSql()` still
starts the database.

`npm run verify:office` is the end-to-end proof: a real office, real embedded
Postgres, real scheduler tick and real agents. It is intentionally not mocked.

## Where things live

| Path                     | What it owns                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`            | File-based TanStack Start routes. Public pages, the founder office and the API routes.                                       |
| `src/components/public/` | Public-site primitives: frame, enquiry form, live field, motion.                                                             |
| `src/components/office/` | Founder-office shell, panels and snapshot context.                                                                           |
| `src/lib/office/`        | The office: store, governor, duties, queue, delegation, revenue, health, backup. Pure policy modules sit beside their tests. |
| `src/lib/opencode/`      | The build desk (`/opencode`). `agent.ts` is the tested agent protocol: which paths may be read or rewritten, and how a model's action is parsed. `runner.server.ts` streams a run to the terminal; nothing is written until the founder applies it, and a failed typecheck/lint reverts every file. Runs live in the server process. |
| `src/lib/workspace/`     | The founder's browser-only workspace preferences (compact lists, relative timestamps, finished work). |
| `src/lib/site/`          | Public-site metadata, tracked paths and SEO helpers.                                                                         |
| `src/lib/auth/`          | Better Auth wiring, founder gate and PGlite dialect.                                                                         |
| `migrations/`            | The single schema source. Both PGLite and Neon apply these files.                                                            |
| `scripts/`               | Migration CLI, test resolver, security/provider checks and the office verifier.                                              |
| `workers/vantage-ars/`   | Optional Cloudflare Worker for the old static surface. Not the app deploy.                                                   |

## Rules that keep it honest

- **Server-only modules end in `.server.ts`.** API route files must not import
  them; call a server function in `src/lib/office/api.ts` instead.
- **The pure/policy half stays pure.** Anything that can be decided from data
  (`risk.ts`, `delegation.ts`, `gate71.ts`, `public-status.ts`, queue timing)
  has no runtime dependency and a colocated test.
- **A price is never typed twice.** Read it from
  `src/lib/office/catalogue.ts` (`rateAmountLabel`, `rateAmount`) so public
  copy, structured data, quotes and invoices cannot disagree.
- **No new schema in server code.** Add a numbered file under `migrations/`.
  Both backends apply the same files, and `pendingMigrations` fixes the order.
- **No customer detail on a public surface.** The public status page receives a
  projection from `public-status.ts`, never the full health document.
- **Every new public route** needs a `pageHead(...)` call, a sitemap entry, and
  a line in `src/lib/site/tracked.ts` if page views should be measured. The
  route test and the sitemap test will fail if these drift.

## Adding a route

1. Create `src/routes/<name>.tsx` with `createFileRoute("/<name>")`.
2. Add SEO with `pageHead` and, where useful, the JSON-LD helpers in
   `src/lib/site/seo.ts`.
3. Add the path to `public/sitemap.xml` and `TRACKED_PATHS` when it is public.
4. Add it to `EXPECTED` in `src/routes/-routes.test.ts`.
5. Run `npm run dev` or `npm run build:ci` once so `routeTree.gen.ts` is
   regenerated, then `npm run check`.

## Founder flows

- First-time setup: `/office` → "First-time founder setup" (requires
  `FOUNDER_SETUP_TOKEN`; remove it after the account exists).
- Forgot password: `/forgot-password` (only the configured founder address is
  accepted).
- Reset password: `/reset-password?token=...` (token comes from the reset email).

## Deploy notes

Vercel is the recommended target (`docs/deploy-vercel.md`). Docker and plain
Node use the same `.output/server/index.mjs`. `vercel.json` carries the edge
security headers; the app itself stays header-neutral so a self-hosted reverse
proxy can own them.
