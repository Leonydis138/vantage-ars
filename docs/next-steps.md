# Vantage-ARS next steps

This is the execution list for taking the project from a verified, founder-governed office into a live commercial operating system.

## Phase 1 — production launch

1. Set all required production variables on the host.
   - DATABASE_URL
   - BETTER_AUTH_SECRET
   - BETTER_AUTH_URL
   - FOUNDER_EMAIL
   - CRON_SECRET
   - AUTONOMY=on
2. Deploy the app and confirm the health endpoint is reachable.
3. Create the founder account once using FOUNDER_SETUP_TOKEN.
4. Remove FOUNDER_SETUP_TOKEN and redeploy.
5. Open /office and save the first standing delegation policy.
6. Verify the office queue and scheduler are active.

## Phase 2 — live operations and monitoring

1. Add uptime monitoring to /api/health.
2. Alert on non-200 responses, scheduler overdue, or chain failures.
3. Set up log capture for the app and queue worker.
4. Configure founder notices via FOUNDER_WEBHOOK_URL or SMTP.
5. Validate that invoices, quotes and customer notices are actually sending.
6. Add a weekly runbook review for approvals, delegated actions and spend.

## Phase 3 — AI and research expansion

1. Configure a primary AI provider.
   - Cloudflare Workers AI
   - xAI
   - Hugging Face free/public model via AI_PROVIDER=huggingface
2. Add a research task type for web lookups and competitor scanning.
3. Add a marketing brief generator with founder approval gate.
4. Add a proposal draft engine for service packages.
5. Add a customer discovery summary from quote and lead history.
6. Add a recurring operations brief for the founder, summarising queue, spend, approvals and pipeline health.

## Phase 4 — marketing and lead generation

1. Turn on the public lead capture flow.
2. Add a landing-page analytics pack by service and campaign.
3. Add lead scoring from enquiry quality, website intent and previous customer signals.
4. Add a campaign calendar with organic and paid content blocks.
5. Add campaign approval gating before spend or customer outreach.
6. Add monthly campaign review and deposit channel reporting.

## Phase 5 — customer conversion and revenue system

1. Publish the rate card and service packages consistently.
2. Add a quote workflow that includes scope, assumptions and owner.
3. Add invoice matching and payment receipt tracking.
4. Add auto-chasing for overdue invoices under founder-approved rules.
5. Add subscription reminders and renewal notices.
6. Add a founder review of monthly recurring revenue and churn risk.

## Phase 6 — operations and trust

1. Add automated backup export for the office ledger and governance record.
2. Capture a verified restore drill for audit readiness.
3. Add a policy review for delegation caps and action classes.
4. Add a monthly governance check on all founder gate actions.
5. Add a live data retention and notice-log review.
6. Add a final human sign-off on any new customer or money movement policy.

## Phase 7 — portfolio and business expansion

1. Package the office as a reusable operating system for service businesses.
2. Add a partner referral and reseller workflow.
3. Add a managed service plan for small office operations.
4. Add a premium founder desk add-on with more monitoring and strategic briefings.
5. Add a multi-brand mode for operating more than one Vantage-aligned company.
6. Add white-label deployment patterns for agencies and service teams.

## Phase 8 — product polish and scale

1. Add an executive dashboard for monthly revenue, sales pipeline and service load.
2. Add a founder-focused business scorecard with risk, cash and operational health.
3. Add customer segmentation and service health summaries.
4. Add document generation templates for quotes, service reports and renewals.
5. Add role-specific views for marketing, service, finance and governance.
6. Add retention and churn forecasting based on usage, billing and service health.

## Phase 9 — autonomous business operations

1. Add a daily founder brief that summarises queue health, spend, approvals, churn risk and outstanding work.
2. Add a weekly operations digest with revenue, conversion and service-load trends.
3. Add a monthly compliance report covering delegation use, spend ceilings and audit integrity.
4. Add a monthly customer health review for at-risk accounts and renewal decisions.
5. Add a proposal generator that drafts service bundles by account history and observed needs.
6. Add a publication pipeline for case studies, service updates and growth content under founder review.

## Phase 10 — commercial expansion and channels

1. Add a partner channel for referrals, managed support bundles and reseller partnerships.
2. Add a formal lead handoff route from outbound marketing to quote and service fulfilment.
3. Add a standard onboarding workflow for new client accounts and service migrations.
4. Add a support plan renewal workflow with evidence-backed recommendations.
5. Add a premium founder-support tier with higher-touch research, approvals and reporting.
6. Add a white-label version of the office for agencies or IT service partners.

## Phase 11 — automation beyond the office

1. Add web monitoring for company mentions, local competitor mentions and price changes.
2. Add a content pipeline that drafts blog posts, email sequences and offers from office records.
3. Add a lead-enrichment pipeline by company, domain and service category.
4. Add a CRM-quality customer timeline with every quote, invoice, site signal and notice.
5. Add a forecasting layer for revenue, support volume and renewals.
6. Add a sales readiness score for every lead or opportunity before it reaches the founder or sales staff.

## Phase 12 — trust, compliance and growth discipline

1. Add a formal review of all public claims against actual service delivery and pricing.
2. Add explicit POPIA and VAT handling checks on customer records and quotes.
3. Add legal and contractual review checkpoints before any new customer commitment.
4. Add an annual policy review for delegation scope, AI usage and founder decisions.
5. Add a customer-communication log showing who was told what and when.
6. Add a steady-state growth review that ensures each new feature increases revenue or lowers operational risk.

## Hard guardrails

- Never allow autonomous spend without a founder gate.
- Never allow customer-facing promises without a governed approval or standing delegation.
- Never expose raw customer, payment or internal security data through public routes.
- Keep every delegated action recorded in the audit chain.
- Treat online research as research only until a founder approves action.

## Immediate next actions

If the goal is to keep momentum without broadening scope too much, the highest-value order is:

1. production environment and deployment
2. founder account and delegation
3. health monitoring and cron verification
4. web-search + research automation
5. marketing brief generation
6. recurring revenue and billing review
7. monthly governance audit
8. founder daily brief and dashboard
9. lead-to-quote conversion automation
10. partner and reseller expansion
11. white-label office mode
12. formal governance and growth review cadence

This is the fastest path to a business that is active, observable, commercially productive and still safe.
