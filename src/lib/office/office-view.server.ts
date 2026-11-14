/**
 * Read exactly the state the autonomous duties need — no more.
 *
 * `readSnapshot` loads the whole office for the founder's screens. The scheduler
 * runs unattended every few minutes and must not pay for that, so this view
 * issues bounded queries scoped to what duties actually decide on, and carries
 * nothing invented: every field traces to a row.
 */
import { getSql } from "../db";
import { verifyChainLinks } from "./integrity";
import { COMPANY } from "./company";
import type { DutyView } from "./duties";
import { APPROVAL_REMINDER_AGE_DAYS } from "./approvals";
import { TRACKED_PATHS } from "../site/tracked";
import {
  aiConfiguredFromEnv,
  buildAutonomyReadiness,
  mailConfiguredFromEnv,
} from "./autonomy-readiness";
import { SELF_SCHEDULER_LEASE_MINUTES, selfSchedulerConfig } from "./self-scheduler";

const LIST_LIMIT = 120;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function int(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

/** The delegated action kinds, read defensively. */
function parseActions(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/**
 * @param now reference instant. Defaults to the wall clock. Injectable so a
 * scheduler tick and the planning it drives always agree on "now" — otherwise a
 * duty's cadence and its staleness maths could straddle a minute boundary and
 * disagree about whether work is due.
 */
export async function readDutyView(now: string = new Date().toISOString()): Promise<DutyView> {
  const sql = await getSql();

  const [
    companyRow,
    inbound,
    leads,
    opportunities,
    tickets,
    ledger,
    documents,
    approvals,
    staleApprovals,
    agents,
    campaigns,
    siteEvents,
    chatThreads,
    chainRows,
    officeState,
  ] = await Promise.all([
    sql<
      Record<string, unknown>
    >`select halted, treasury_cents, receivable_cents, payable_cents, last_audit_hash from company_state where id = ${COMPANY.id}`,
    sql<
      Record<string, unknown>
    >`select * from inbound_items where status <> 'filed' order by created_at desc limit ${LIST_LIMIT}`,
    sql<Record<string, unknown>>`select * from leads order by updated_at desc limit ${LIST_LIMIT}`,
    sql<
      Record<string, unknown>
    >`select * from opportunities order by updated_at desc limit ${LIST_LIMIT}`,
    sql<
      Record<string, unknown>
    >`select * from tickets order by updated_at desc limit ${LIST_LIMIT}`,
    sql<
      Record<string, unknown>
    >`select * from ledger_entries order by created_at desc limit ${LIST_LIMIT}`,
    sql<
      Record<string, unknown>
    >`select id, title, kind, status, summary, related_id, created_at, rate_id, amount_cents, accepted_at from documents order by created_at desc limit ${LIST_LIMIT}`,
    sql<
      Record<string, unknown>
    >`select id, kind, title, company_name, created_at from approvals where status = 'pending' order by created_at desc limit ${LIST_LIMIT}`,
    sql<Record<string, unknown>>`
      select id, kind, title, company_name, created_at, count(*) over()::int as total_count
      from approvals
      where status = 'pending'
        and created_at <= ${new Date(
          Date.parse(now) - APPROVAL_REMINDER_AGE_DAYS * 86_400_000,
        ).toISOString()}
      order by created_at asc
      limit 100
    `,
    sql<
      Record<string, unknown>
    >`select id, callsign, status, last_heartbeat from agents order by callsign`,
    sql<
      Record<string, unknown>
    >`select * from campaigns order by created_at desc limit ${LIST_LIMIT}`,
    sql<
      Record<string, unknown>
    >`select kind, path, occurred_at from site_events where occurred_at > now() - interval '30 days' order by occurred_at desc limit 2000`,
    sql<Record<string, unknown>>`
      select t.id, t.name, t.status, t.updated_at,
             max(m.created_at) as last_message_at,
               count(*) filter (
                 where m.created_at > coalesce(t.updated_at, t.created_at) and m.role = 'customer'
               )::int as unanswered_count
        from chat_threads t
        left join chat_messages m on m.thread_id = t.id
        where t.status = 'open'
        group by t.id
        order by max(m.created_at) desc nulls last
        limit 40
      `,
    // The whole chain, not a window: a fork can hide anywhere. The stored
    // head rides along in the SAME statement on purpose — read separately, a
    // tick committing an append between the two reads made verification fail
    // spuriously while the office was busy, which would have halted the
    // office through SEAL and tripped every health monitor.
    sql<Record<string, unknown>>`
      select chain.id, chain.previous_hash, chain.record_hash, chain.created_at,
             (select last_audit_hash from company_state where id = ${COMPANY.id}) as head_hash
      from (
        select id, previous_hash, record_hash, created_at, kind, 0 as source from audit_events
        union all
        select id, previous_hash, record_hash, created_at, action_kind as kind, 1 as source from decisions
      ) chain
      order by chain.created_at asc
    `,
    sql<Record<string, unknown>>`
      select last_tick_at, consecutive_failures, scheduler_owner, scheduler_owner_at
      from office_state where id = ${COMPANY.id}
    `,
  ]);

  const company = companyRow[0] ?? {};
  const chain = verifyChainLinks(
    chainRows.map((row) => ({
      id: text(row.id),
      previousHash: text(row.previous_hash),
      recordHash: text(row.record_hash),
      createdAt: iso(row.created_at),
    })),
    text(chainRows.length ? chainRows[0].head_hash : company.last_audit_hash),
  );

  const quoteLinks = await sql<Record<string, unknown>>`
    select distinct on (document_id) document_id, revoked_at, answered_at, expires_at, view_count, created_at, last_viewed_at
    from quote_links
    order by document_id, created_at desc
  `;

  const notices = await sql<Record<string, unknown>>`
    select id, template, status, related_id, company_name, created_at
    from customer_notices
    order by created_at desc
    limit ${LIST_LIMIT}
  `;

  const subscriptions = await sql<Record<string, unknown>>`
    select id, company_name, plan_id, rate_id, cycle, price_cents, status,
           next_billing_at, started_at, contact_email
    from subscriptions
    where status <> 'cancelled'
    order by next_billing_at asc
    limit 200
  `;

  const billingCycles = await sql<Record<string, unknown>>`
    select id, subscription_id, company_name, plan_id, amount_cents, status,
           period_start, period_end, invoice_id, document_id, report_document_id,
           notified_at, last_notice_attempt_at
    from billing_cycles
    where status in ('pending', 'invoiced', 'fulfilled')
    order by created_at asc
    limit 200
  `;

  const delegationRow = await sql<Record<string, unknown>>`
    select id, label, status, max_amount_cents, max_actions_per_day, max_actions_per_month,
           allowed_actions_json, allowed_rate_ids_json, allow_customer_mail,
           allow_auto_reconcile, require_accepted_quote
    from delegations
    where status <> 'revoked'
    order by updated_at desc
    limit 1
  `;

  // Delegated authority that has actually been spent, counted from real rows
  // rather than a counter, so the governance report quotes the same figures the
  // cap enforcement reads.
  const usageRows = await sql<{
    n: number;
    cents: number;
    month_n: number;
    month_cents: number;
  }>`
    select
      count(*) filter (where usage_day = ${now.slice(0, 10)})::int as n,
      coalesce(sum(amount_cents) filter (where usage_day = ${now.slice(0, 10)}), 0)::int as cents,
      count(*) filter (where usage_month = ${now.slice(0, 7)})::int as month_n,
      coalesce(sum(amount_cents) filter (where usage_month = ${now.slice(0, 7)}), 0)::int as month_cents
    from delegation_usage
  `;

  const work = await sql<Record<string, unknown>>`
    select id, agent_id, kind, status, attempts, max_attempts, due_at, last_error
    from work_items
    where status in ('open', 'claimed', 'abandoned')
    order by due_at asc
    limit 200
  `;

  const delegationView = delegationRow.length
    ? {
        id: text(delegationRow[0].id),
        label: text(delegationRow[0].label),
        status: text(delegationRow[0].status),
        maxAmountCents: int(delegationRow[0].max_amount_cents),
        maxActionsPerDay: int(delegationRow[0].max_actions_per_day),
        maxActionsPerMonth: int(delegationRow[0].max_actions_per_month),
        allowedActions: parseActions(delegationRow[0].allowed_actions_json),
        allowedRateIds: parseActions(delegationRow[0].allowed_rate_ids_json),
        allowCustomerMail: delegationRow[0].allow_customer_mail === true,
        allowAutoReconcile: delegationRow[0].allow_auto_reconcile === true,
        requireAcceptedQuote: delegationRow[0].require_accepted_quote !== false,
      }
    : null;

  const workView = work.map((row) => ({
    id: text(row.id),
    agentId: text(row.agent_id),
    kind: text(row.kind),
    status: text(row.status),
    attempts: int(row.attempts),
    maxAttempts: int(row.max_attempts),
    dueAt: iso(row.due_at),
    lastError: row.last_error ? text(row.last_error) : null,
  }));

  const selfConfig = selfSchedulerConfig(process.env);
  const leaseAt = officeState[0]?.scheduler_owner_at
    ? Date.parse(iso(officeState[0].scheduler_owner_at))
    : NaN;
  const leaseFresh =
    Number.isFinite(leaseAt) &&
    Date.now() - leaseAt < SELF_SCHEDULER_LEASE_MINUTES * 60_000 &&
    Boolean(officeState[0]?.scheduler_owner);

  const autonomyReadiness = buildAutonomyReadiness({
    now,
    autonomyOn: (process.env.AUTONOMY ?? "").trim().toLowerCase() === "on",
    halted: company.halted === true,
    chainIntact: chain.ok,
    lastTickAt: officeState[0]?.last_tick_at ? iso(officeState[0].last_tick_at) : null,
    consecutiveFailures: int(officeState[0]?.consecutive_failures),
    selfSchedulerEnabled: selfConfig.enabled,
    selfSchedulerRunning: leaseFresh,
    delegation: delegationView
      ? {
          status: delegationView.status,
          allowCustomerMail: delegationView.allowCustomerMail,
        }
      : null,
    mailConnected: mailConfiguredFromEnv(process.env),
    aiConfigured: aiConfiguredFromEnv(process.env),
    backupConfigured: Boolean((process.env.BACKUP_DIR ?? "").trim()),
    openWork: workView.filter((item) => item.status === "open" || item.status === "claimed").length,
    abandonedWork: workView.filter((item) => item.status === "abandoned").length,
    pendingApprovals: approvals.length,
  });

  return {
    now,
    halted: company.halted === true,
    inbound: inbound.map((row) => ({
      id: text(row.id),
      channel: text(row.channel),
      companyName: text(row.company_name),
      subject: text(row.subject),
      summary: text(row.summary),
      intent: text(row.intent),
      status: text(row.status),
      createdAt: iso(row.created_at),
    })),
    leads: leads.map((row) => ({
      id: text(row.id),
      companyName: text(row.company_name),
      stage: text(row.stage),
      score: int(row.score),
      summary: text(row.summary),
      inboundId: row.inbound_id ? text(row.inbound_id) : null,
      updatedAt: iso(row.updated_at),
    })),
    opportunities: opportunities.map((row) => ({
      id: text(row.id),
      companyName: text(row.company_name),
      stage: text(row.stage),
      valueCents: int(row.value_cents),
      summary: text(row.summary),
      updatedAt: iso(row.updated_at),
    })),
    quotes: documents
      .filter((row) => text(row.kind) === "quote")
      .map((row) => ({
        id: text(row.id),
        title: text(row.title),
        kind: "quote",
        status: text(row.status),
        summary: text(row.summary),
        relatedId: row.related_id ? text(row.related_id) : null,
        createdAt: iso(row.created_at),
        rateId: row.rate_id ? text(row.rate_id) : null,
        amountCents:
          row.amount_cents === null || row.amount_cents === undefined
            ? undefined
            : int(row.amount_cents),
        acceptedAt: row.accepted_at ? iso(row.accepted_at) : null,
      })),
    tickets: tickets.map((row) => ({
      id: text(row.id),
      title: text(row.title),
      severity: text(row.severity),
      status: text(row.status),
      ownerAgent: text(row.owner_agent),
      summary: text(row.summary),
      relatedId: row.related_id ? text(row.related_id) : null,
      updatedAt: iso(row.updated_at),
    })),
    ledger: ledger.map((row) => ({
      id: text(row.id),
      kind: text(row.kind),
      counterparty: text(row.counterparty),
      amountCents: int(row.amount_cents),
      status: text(row.status),
      relatedId: row.related_id ? text(row.related_id) : null,
      createdAt: iso(row.created_at),
    })),
    documents: documents.map((row) => ({
      id: text(row.id),
      title: text(row.title),
      kind: text(row.kind),
      status: text(row.status),
      relatedId: row.related_id ? text(row.related_id) : null,
      createdAt: iso(row.created_at),
    })),
    notices: notices.map((row) => ({
      id: text(row.id),
      template: text(row.template),
      status: text(row.status),
      relatedId: row.related_id ? text(row.related_id) : null,
      companyName: row.company_name ? text(row.company_name) : null,
      createdAt: iso(row.created_at),
    })),
    campaigns: campaigns.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      channel: text(row.channel),
      status: text(row.status),
      budgetCents: int(row.budget_cents),
      spendCents: int(row.spend_cents),
      summary: text(row.summary),
      createdAt: iso(row.created_at),
    })),
    approvalsPending: approvals.map((row) => ({
      id: text(row.id),
      kind: text(row.kind),
      title: text(row.title),
      companyName: row.company_name ? text(row.company_name) : null,
      createdAt: iso(row.created_at),
    })),
    staleApprovals: staleApprovals.map((row) => ({
      id: text(row.id),
      kind: text(row.kind),
      title: text(row.title),
      companyName: row.company_name ? text(row.company_name) : null,
      createdAt: iso(row.created_at),
    })),
    staleApprovalCount: int(staleApprovals[0]?.total_count),
    agents: agents.map((row) => ({
      id: text(row.id),
      callsign: text(row.callsign),
      status: text(row.status),
      lastHeartbeat: row.last_heartbeat ? iso(row.last_heartbeat) : null,
    })),
    siteEvents: siteEvents.map((row) => ({
      kind: text(row.kind),
      path: text(row.path),
      occurredAt: iso(row.occurred_at),
    })),
    chatThreads: chatThreads.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      status: text(row.status),
      updatedAt: iso(row.updated_at),
      lastMessageAt: row.last_message_at ? iso(row.last_message_at) : null,
      unansweredCount: int(row.unanswered_count),
    })),
    quoteLinks: quoteLinks.map((row) => ({
      documentId: text(row.document_id),
      state: row.answered_at
        ? "answered"
        : row.revoked_at
          ? "revoked"
          : Date.parse(iso(row.expires_at)) < Date.now()
            ? "expired"
            : "open",
      viewCount: int(row.view_count),
      createdAt: iso(row.created_at),
      lastViewedAt: row.last_viewed_at ? iso(row.last_viewed_at) : null,
    })),
    subscriptions: subscriptions.map((row) => ({
      id: text(row.id),
      companyName: text(row.company_name),
      planId: text(row.plan_id),
      rateId: text(row.rate_id),
      cycle: text(row.cycle),
      priceCents: int(row.price_cents),
      status: text(row.status),
      nextBillingAt: iso(row.next_billing_at),
      startedAt: iso(row.started_at),
      contactEmail: row.contact_email ? text(row.contact_email) : null,
    })),
    billingCycles: billingCycles.map((row) => ({
      id: text(row.id),
      subscriptionId: text(row.subscription_id),
      companyName: text(row.company_name),
      planId: text(row.plan_id),
      amountCents: int(row.amount_cents),
      status: text(row.status),
      periodStart: iso(row.period_start),
      periodEnd: iso(row.period_end),
      invoiceId: row.invoice_id ? text(row.invoice_id) : null,
      documentId: row.document_id ? text(row.document_id) : null,
      reportDocumentId: row.report_document_id ? text(row.report_document_id) : null,
      notifiedAt: row.notified_at ? iso(row.notified_at) : null,
      lastNoticeAttemptAt: row.last_notice_attempt_at ? iso(row.last_notice_attempt_at) : null,
    })),
    delegation: delegationView,
    delegationUsage: {
      usedToday: int(usageRows[0]?.n),
      spentTodayCents: int(usageRows[0]?.cents),
      usedThisMonth: int(usageRows[0]?.month_n),
      spentThisMonthCents: int(usageRows[0]?.month_cents),
    },
    treasuryCents: int(company.treasury_cents),
    receivableCents: int(company.receivable_cents),
    payableCents: int(company.payable_cents),
    publishedPathCount: TRACKED_PATHS.length,
    chainIntact: chain.ok,
    autonomyReadiness,
    backupConfigured: Boolean((process.env.BACKUP_DIR ?? "").trim()),
    work: workView,
  };
}

/** Record that an agent did something, so liveness is observable. */
export async function heartbeat(agentId: string, task: string): Promise<void> {
  const sql = await getSql();
  await sql`
    update agents
    set last_heartbeat = now(),
        current_task = ${task.slice(0, 200)},
        status = 'idle'
    where id = ${agentId}
  `;
}

/** Record a real visitor event. Called from public routes; never synthesised. */
export async function recordSiteEvent(input: {
  kind: string;
  path: string;
  referrer?: string | null;
  country?: string | null;
  agentFamily?: string | null;
}): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into site_events (id, kind, path, referrer, country, agent_family)
    values (${crypto.randomUUID()}, ${input.kind.slice(0, 40)}, ${input.path.slice(0, 200)},
            ${input.referrer?.slice(0, 300) ?? null}, ${input.country?.slice(0, 80) ?? null},
            ${input.agentFamily?.slice(0, 120) ?? null})
  `;
}
