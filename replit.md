# Vantage ARS Cognitive Operations

Autonomous owner operations system for Vantage ARS. Grok reviews real customer enquiries from Gmail, prepares rate-card quotes, sends them, requests missing information, resolves known issues, escalates stale work, syncs HubSpot, follows up, records customer acceptance, and reports outcomes. The owner can pause, reprocess, or override any action.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/vantage-ars-ops run dev` — run the operations UI
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate React Query hooks and Zod schemas from OpenAPI
- `pnpm --filter @workspace/db run push` — push DB schema changes (development only)
- API build requires `PORT=5000`
- Frontend build requires `PORT=5173 BASE_PATH=/`

## Required Environment

- `DATABASE_URL`
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- Gmail / Google Mail provider access
- Grok / xAI provider access
- `SESSION_SECRET` protects encrypted bank and webhook settings at rest
- Optional `SCHEDULING_URL` as a fallback for the database-backed scheduling link
- Optional `CORS_ORIGINS` comma-separated browser origins allowed to call the API in production

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval from `lib/api-spec/openapi.yaml`
- Build: esbuild for the API, Vite for the frontend
- UI: React 19, Tailwind CSS, shadcn/ui, Clerk

## Where Things Live

- `artifacts/api-server` — Express API and Vantage ARS services
- `artifacts/vantage-ars-ops` — owner operations UI
- `lib/api-spec/openapi.yaml` — source of truth for the API contract
- `lib/api-client-react` — generated React Query hooks
- `lib/api-zod` — generated Zod and TypeScript schemas
- `lib/db/src/schema/vantage-ars.ts` — database schema
- `artifacts/api-server/src/services/vantage-ars` — Gmail, AI gateway, HubSpot, rates, operations
- `.agents/memory/vantage-ars-autonomy.md` — product and autonomy constraints

## Architecture Decisions

- Gmail is the system of record for customer messages; the app stores triage, quote, and autonomy state.
- No seeded, demo, or simulated customer records are used.
- Grok is the only AI provider; do not add OpenAI or generic AI fallbacks.
- The worker starts when Gmail and Grok are healthy unless the owner has paused it. The owner approved automatic customer messaging.
- The owner can pause the worker, reprocess enquiries, manually send quotes, mark acceptance, sync HubSpot, and change autonomy policy.
- Bank details and webhook signing secrets are encrypted at rest; the API never returns their raw values.
- Scheduling links, SLA hours, follow-up days, and archive days are stored in `vantage_ars_automation_settings`.
- Outbound webhook notifications are HMAC-SHA256 signed when a webhook secret is configured.
- Webhook URLs must resolve to a public address; loopback, private, link-local, metadata, and non-HTTPS production targets are rejected.
- Outbound webhook notifications retry up to 3 times with exponential backoff and jitter; unsafe webhook URLs fail fast with a `400` before any retry.
- Quote replies are linked back to the original quote thread. Clear acceptance and decline phrases update the quote automatically.
- Cloudflare stays read-only; no DNS changes are made by automation.
- Automatic-cycle history is retained for 90 days.

## Product Features

- Live service health and operational counts
- Real Gmail enquiry import and Grok triage
- Rate-card quote preparation and autonomous sending
- Customer clarification, known-issue resolution, SLA escalation, and remote-session scheduling emails
- HubSpot contact sync with automatic retry
- Quote follow-ups, owner digest, anomaly detection, and archiving
- Customer acceptance and decline detection from Gmail replies
- Accepted revenue and quoted pipeline metrics
- Audit trail with filters, search, and expandable detail
- Persistent autonomous-cycle history and per-step run reports
- Configurable autonomy policy and signed outbound webhooks
- CSV export, enquiry search, priority sorting, and archived filtering

## User Preferences

- Real business data only; no demo or seeded records.
- Vantage ARS keeps `vantage-ars.co.za` as its public website.
- Do not change DNS or replace the public site without explicit approval.

## Gotchas

- Run codegen after changing `openapi.yaml`.
- Run DB push after changing the DB schema.
- The API requires `PORT`.
- Frontend builds require `PORT` and `BASE_PATH`.
- Quote states are guarded to prevent duplicate sends; `send_uncertain` requires manual Gmail verification.
- Attachments are not read by the automation and require manual review.
