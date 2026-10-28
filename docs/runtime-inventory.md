# Runtime and deployment inventory

Inventory date: 2026-10-28. This is a repository-level audit for AUD-01 from
the autonomous-company implementation plan. It describes what the checked-in
code and configuration declare; it is not proof that production secrets,
services, schedules, or integrations are currently live.

The local real-office verifier passed 245/245 checks on this date. It uses
embedded PGlite and does not verify production credentials, live customer
traffic, provider access, or deployed configuration.

## Application and deployment map

| Surface                            | Source and trigger                                                                                                     | Identity / guard                                                                         | What is known                                                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main public app and founder office | TanStack Start routes in `src/routes/`; deployed as the Node/Nitro app                                                 | Better Auth founder gate for office writes; public routes validate and rate-limit intake | README recommends Vercel; Docker and plain Node are also supported. No main-app deployment workflow is checked in, so host and deployment wiring are not verified here.                                 |
| Autonomous scheduler               | `GET /api/cron/floor`, normally called every 10 minutes by `.github/workflows/office-scheduler.yml`                    | Bearer `CRON_SECRET`, `AUTONOMY=on`, halt and integrity checks                           | Workflow and endpoint are present. The configured repository secret, production environment values, and last successful production tick are unknown from source.                                        |
| Catch-up scheduler                 | `/api/health`, `/api/site-signal`, and the founder office can nudge a stale scheduler                                  | Existing autonomy gate, in-flight throttle, and wait limits                              | These are opportunistic nudges, not a replacement for the scheduled heartbeat. Public calls do not receive private health data.                                                                         |
| Companion Cloudflare Worker        | `workers/vantage-ars/`; separate D1 schema, Workers AI binding, Durable Workflow and 15-minute cron in `wrangler.toml` | `CLOUDFLARE_API_TOKEN` in the Worker deployment workflow; Worker admin has its own token | `.github/workflows/deploy-vantage-ars.yml` deploys it on Worker-path changes. The Worker custom-domain routes are commented out; its current live status is unknown. It is not the main app deployment. |
| CI                                 | `.github/workflows/ci.yml`                                                                                             | Both jobs explicitly grant only `contents: read` to `GITHUB_TOKEN`                       | Runs typecheck, lint, formatting, unit tests, real-office verification, build, dependency audit, and tracked-secret checks.                                                                             |

## Agent registry

The registry below is `AGENT_DEFS` in `src/lib/office/agents.ts`. Agent
permissions are these action-kind allowlists, not direct access to customer
systems or unrestricted credentials. Model-proposed actions are normalized to
the allowlist and evaluated by the constitutional governor. Some legacy floor
paths write internal draft documents directly; those paths need explicit
idempotency and audit coverage in REL-01.

| Agent                   | Owned duties                                                                                                                                                        | Permitted action kinds                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VANTAGE — Orchestrator  | `vantage_liveness`, `vantage_backlog`, `vantage_briefing`, `vantage_approval_watch`                                                                                 | `notify_operator`, `route_inbound`, `open_ticket`, `draft_document`, `create_lead`                                                                       |
| FOYER — Reception       | `foyer_intake`, `foyer_stale_intake`                                                                                                                                | `route_inbound`, `draft_reply`, `create_lead`, `notify_operator`, `open_ticket`                                                                          |
| SIGNAL — Marketing      | `signal_site_signals`, `signal_content_brief`, `signal_draft_campaign`, `signal_prospect`, `signal_qualify_leads`, `signal_handoff`                                 | `create_lead`, `update_lead`, `draft_campaign`, `activate_campaign`, `handoff_to_sales`, `notify_operator`                                               |
| CLOSE — Sales           | `close_discovery`, `close_quote`, `close_quote_followup`, `close_stale_proposal`, `close_win_handoff`, `close_quote_notice`                                         | `open_opportunity`, `advance_opportunity`, `issue_quote`, `propose_close_won`, `propose_close_lost`, `send_customer_mail`, `notify_operator`             |
| LEDGER — Finance        | `ledger_chase_invoice`, `ledger_payment_notices`, `ledger_payables`, `ledger_subscription_billing`, `ledger_dunning`, `ledger_billing`, `ledger_start_subscription` | `issue_invoice`, `record_expense`, `record_inbound_payment`, `start_subscription`, `send_customer_mail`, `notify_operator`, `draft_document`             |
| DESK — Customer service | `desk_acknowledge`, `desk_sla_watch`, `desk_chat_reply`, `desk_service_fulfilment`, `desk_service_notice`                                                           | `draft_reply`, `open_ticket`, `update_ticket`, `notify_operator`, `escalate_account_risk`, `fulfil_service`, `cancel_subscription`, `send_customer_mail` |
| FORGE — Technical       | `forge_diagnose`, `forge_knowledge`                                                                                                                                 | `open_ticket`, `update_ticket`, `draft_document`, `notify_operator`                                                                                      |
| KEEP — Administration   | `keep_records`, `keep_subscription_review`                                                                                                                          | `draft_document`, `notify_operator`, `open_ticket`                                                                                                       |
| SEAL — Compliance       | `seal_chain_verify`, `seal_scope_audit`                                                                                                                             | `notify_operator`, `draft_document`, `open_ticket`                                                                                                       |
| KEY — Token keeper      | `key_token_watch`                                                                                                                                                   | `notify_operator`                                                                                                                                        |

There are ten defined agents and 38 duties. The exact owner, cadence, purpose,
and planner behavior for each duty are documented in [autonomy.md](./autonomy.md)
and implemented by `DUTY_OWNER`, `DUTY_CADENCE_MINUTES`, and `planDuty` in
`src/lib/office/duties.ts`. Work is executed by the matching runner in
`src/lib/office/duty-runners.server.ts`.

## Workflow, data, and controls

- The main app uses PostgreSQL when `DATABASE_URL` is configured and embedded
  PGlite otherwise. Numbered migrations are the schema source for both.
- `work_items` is the durable queue. Dedupe keys are enforced by a database
  constraint; claims are atomic; failures back off and eventually become
  abandoned work for founder review. Redrive is a founder action.
- The office's customer book is assembled from inbound, leads, opportunities,
  invoices, receipts, and subscriptions. It is not a canonical customer table
  or a tenant-isolated customer portal.
- Quote acceptance is recorded through signed-token links. Payment notices are
  matched to invoices in the office; there is no checkout adapter or external
  accounting integration in this build. PayFast settings are readiness-only.
- Public support submissions are stored and routed into internal records.
  Office agents can prepare internal acknowledgement and technical-plan
  drafts. They do not access customer equipment; tickets remain open until the
  founder starts work, and the public intake path does not send customer mail.
- SMTP and the optional founder webhook are outbound channels. Customer mail
  sent by autonomous duties is subject to the applicable mail delegation.
  The authenticated founder-triggered floor run is an explicit send-capable
  action; its button warns that it may email customers.
- Decisions and audit events share a hash-chained record. The scheduler checks
  database and chain health, respects the office halt, and uses a circuit
  breaker after repeated failing ticks.

## AI and external integrations

| Capability                  | Repository behavior                                                                                                                                                                                               | Production evidence needed                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model-backed agent dispatch | `proposeActions` can use Cloudflare Workers AI or xAI. Model output is normalized to the selected agent's allowed action kinds, then governed. Cost admission is checked before a provider call.                  | Whether a supported model key is configured, accepted, within budget, and producing useful results.                                               |
| Scheduled duties            | Most planner and runner logic makes decisions from office records and deterministic policy. Scheduled duties continue when no model key is configured. The repository does not establish that every duty uses AI. | Decide which duties benefit from model reasoning and evaluate them before enabling model-backed actions.                                          |
| Customer IT diagnostics     | The current technical plan is an internal, rules-based draft. No customer network, endpoint, PBX, or cloud account connector is present in the main app.                                                          | Customer authorization, scoped credentials, read-only adapters, monitoring evidence, safety tests, and an approval policy before any integration. |
| Email                       | SMTP settings or the legacy Gmail app-password settings are supported. Founder notifications may also use an HTTPS webhook.                                                                                       | Host configuration, sender authentication, deliverability, and real send/receipt evidence.                                                        |
| Payments                    | Bank instructions and manual payment notices are supported. PayFast checkout is explicitly disabled/readiness-only.                                                                                               | A payment provider adapter, webhook verification, reconciliation rules, and end-to-end staging evidence.                                          |

## Evidence gaps and next audit work

Source inspection cannot establish whether the following production settings are
present or healthy: host and database, `AUTONOMY`, cron secret, founder
identity, mail account, model credentials, Worker admin token, deployment
permissions, backups, monitoring, and last successful runs. The founder setup
token was previously committed and is treated as exposed; repository evidence
does not establish that it was revoked or removed from production. Verify the
founder account exists, revoke the exposed value, remove
`FOUNDER_SETUP_TOKEN` from every host environment after setup, and verify those
changes in the host secret manager. Do not copy secret values into this
inventory; use redacted operational evidence only.

AUD-01, AUD-02, and the repository-side SEC-01 permission changes are complete
for the checked-in source. SEC-01 production verification remains outstanding:
confirm the historical founder setup token was revoked and removed after
founder setup, and verify the Cloudflare token's account/resource scope in
Cloudflare. The AUD-02 lead-to-cash ID trace and its data-integrity gaps are documented in
[`lead-to-cash-trace.md`](./lead-to-cash-trace.md). Production verification is
still outstanding for runtime configuration. REL-01 is partially complete:
founder redrive and its audit event now share one transaction; the remaining
retry/idempotency gaps are documented in
[`reliability-retry-idempotency.md`](./reliability-retry-idempotency.md).
FIN-01's source-level financial invariant fixes and limitations are documented
in [`financial-invariants.md`](./financial-invariants.md); production ledger
reconciliation remains outstanding. OPS-01 is implemented in the founder
command centre: it surfaces business/technical KPIs, the pending approval
queue, recent failed runs, and dead-letter work. AI-01 is implemented as a
credential-free test suite in `src/lib/office/ai-evaluation.test.ts`, covering
representative proposals, prompt injection, action normalization, and role
boundaries; the normal `npm test` command discovers it. The remaining backlog
item is OBS-01 (workflow correlation and actionable errors).
