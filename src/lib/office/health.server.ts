/**
 * One health document for the whole office.
 *
 * This is what an operator (or an uptime monitor) checks to answer "is the
 * business running?", not just "is the process up?". It covers the things that
 * actually stop a business working unattended:
 *
 *   - the database is reachable AND has the schema,
 *   - the audit chain verifies (an office that cannot prove what it did must
 *     not be trusted to keep acting),
 *   - the autonomy scheduler has run recently and is not in circuit-break,
 *   - the work queue is draining rather than growing,
 *   - mail is actually delivering — an office that cannot tell the founder
 *     anything is not running, however healthy the rest looks,
 *   - the money position, which is the part nobody else is watching,
 *   - the recurring-revenue book: what the office earns every month, and
 *     whether it has kept the promises it made to the customers on it,
 *   - and the standing delegation: whether the office still has authority to
 *     act today, and whether it believes it can do things it cannot.
 *
 * The document is coarse on purpose. It carries counts, states and the money
 * the office already reports — never a customer's name, never a per-customer
 * amount, never a credential. It is served to unauthenticated callers.
 */
import { databaseHealth, getSql } from "../db";
import { smtpStatus } from "./smtp.server";
import { schedulerStatus } from "./scheduler.server";
import { selfSchedulerStatus, type SelfSchedulerStatus } from "./self-scheduler.server";
import { aiConfiguredFromEnv, buildAutonomyReadiness, type AutonomyReadiness } from "./autonomy-readiness";
import { readDutyView } from "./office-view.server";
import { workCounts } from "./work-queue.server";
import { rateCardIntegrity } from "./duties";
import { COMPANY } from "./company";
import { loadCompanyForHealth } from "./store-health.server";
import { ensureOffice, readDelegation, readDelegationUsage, revenueMetrics } from "./store.server";
import type { DelegationStatus } from "./delegation";

/** The extra, founder-only detail. Explicitly typed so it stays serialisable. */
export type HealthDetail = {
  duties: {
    duty: string;
    owner: string;
    title: string;
    lastRunAt: string | null;
    dueInMinutes: number;
  }[];
  recentRuns: {
    id: string;
    agentId: string;
    duty: string;
    status: string;
    briefing: string;
    durationMs: number;
    startedAt: string;
  }[];
  queue: { open: number; claimed: number; abandoned: number; done: number };
  work: {
    id: string;
    agentId: string;
    kind: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    dueAt: string;
    lastError: string | null;
  }[];
};

/** The scheduler is considered overdue past three missed cadence windows. */
const SCHEDULER_STALE_MINUTES = 180;

/**
 * A period that has been invoiced for longer than this and still has no
 * report is a promise the office has not kept.
 */
const BILLING_PROMISE_HOURS = 48;

/**
 * The problems that mean the business is NOT running.
 *
 * A health document that answers "not OK" for a cosmetic reason teaches the
 * founder to ignore it. These are the ones that matter: the office cannot
 * prove what it did, the scheduler is not running, the office is halted, it
 * has run out of authority for the day, it believes it can email customers
 * and cannot, or it has not kept a promise it made to a customer.
 *
 * A problem that is merely worth knowing (the rate card is out of date, a
 * work item exhausted its retries) is reported in `problems` but leaves the
 * office OK.
 */
const FATAL_PREFIXES = [
  "Database",
  "Audit chain",
  "The scheduler",
  "Autonomy is on",
  "Office is halted",
  "The delegation",
  "Delegation unreadable",
  "Recurring revenue",
];

/** The recurring-revenue picture. Counts and aggregates only — never a customer. */
export type RecurringRevenueHealth = {
  activeSubscriptions: number;
  monthlyRecurringCents: number;
  annualRecurringCents: number;
  /**
   * Billing periods that were invoiced more than 48 hours ago and still have
   * no service report, or a report the customer was never told about.
   */
  overduePeriods: number;
};

/** What the office is allowed to do on its own, and how much of it is left. */
export type DelegationHealth = {
  /** Whether a standing delegation exists at all. */
  exists: boolean;
  status: DelegationStatus | null;
  /** Delegated actions taken today. */
  usedToday: number;
  /** The daily cap the founder set. */
  dailyActionCap: number;
  /** True when the delegation is active and today's allowance is used up. */
  capExhausted: boolean;
  /** Whether the delegation allows the office to email a customer by itself. */
  customerMailAllowed: boolean;
  /** Whether mail is actually connected. */
  mailConnected: boolean;
};

export type OfficeHealth = {
  ok: boolean;
  checkedAt: string;
  company: string;
  version: string;
  halted: boolean;
  haltReason: string | null;
  database: { ok: boolean; source: string; latencyMs: number; detail: string };
  chain: { ok: boolean; detail: string };
  scheduler: {
    autonomyEnabled: boolean;
    lastTickAt: string | null;
    minutesSinceTick: number | null;
    overdue: boolean;
    consecutiveFailures: number;
    posture: "idle" | "steady" | "surge" | "recovery";
    budget: number;
    dutiesDue: number;
    duties: number;
    /** The server's own timer, when this deployment can carry one. */
    selfScheduler: SelfSchedulerStatus;
  };
  queue: { open: number; claimed: number; abandoned: number; done: number };
  mail: { connected: boolean; account: string | null };
  money: { treasuryCents: number; receivableCents: number; payableCents: number };
  pipeline: { openOpportunities: number; pendingApprovals: number; openTickets: number };
  rateCard: { ok: boolean; detail: string };
  recurringRevenue: RecurringRevenueHealth;
  delegation: DelegationHealth;
  /** The honest distance between "running" and "fully autonomous". */
  autonomy: AutonomyReadiness;
  problems: string[];
  full?: HealthDetail;
};

const NO_DELEGATION: DelegationHealth = {
  exists: false,
  status: null,
  usedToday: 0,
  dailyActionCap: 0,
  capExhausted: false,
  customerMailAllowed: false,
  mailConnected: false,
};

const NO_REVENUE: RecurringRevenueHealth = {
  activeSubscriptions: 0,
  monthlyRecurringCents: 0,
  annualRecurringCents: 0,
  overduePeriods: 0,
};

/**
 * Billing periods the office promised and has not delivered.
 *
 * A period is counted when it has been invoiced for longer than the promise
 * window and either has no service report at all, or has a report the
 * customer was never notified about. The invoice's own timestamp is used
 * where there is one, because "invoiced for more than 48 hours" is a claim
 * about the invoice, not about the row.
 */
async function overdueBillingPeriods(): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n
    from billing_cycles c
    left join ledger_entries l on l.id = c.invoice_id
    where c.invoice_id is not null
      and coalesce(l.created_at, c.created_at) < now() - make_interval(hours => ${BILLING_PROMISE_HOURS})
      and (
        c.report_document_id is null
        or (c.notified_at is null and c.notice_document_id is null)
      )
  `;
  return Number(rows[0]?.n ?? 0);
}

export async function officeHealth(options: { full?: boolean } = {}): Promise<OfficeHealth> {
  const checkedAt = new Date().toISOString();
  const problems: string[] = [];
  const selfScheduler = selfSchedulerStatus();

  const database = await databaseHealth();
  if (!database.ok) problems.push(`Database: ${database.detail}`);

  // Provision before reading the company row: on a fresh deployment the health
  // check is often the very first request, and reporting "Office is not
  // provisioned" would be true-but-useless to whoever is watching the monitor.
  if (database.ok) {
    try {
      await ensureOffice();
    } catch (error) {
      problems.push(
        `Provisioning failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  let company: Awaited<ReturnType<typeof loadCompanyForHealth>> | null = null;
  if (database.ok && !problems.some((problem) => problem.startsWith("Provisioning"))) {
    try {
      company = await loadCompanyForHealth();
    } catch (error) {
      problems.push(
        `Company state unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const autonomyEnabled = process.env.AUTONOMY?.trim().toLowerCase() === "on";

  // Everything below needs a working database. Report honestly rather than
  // throwing, so a monitor gets a document it can read.
  if (!database.ok || !company) {
    return {
      ok: false,
      checkedAt,
      company: "Vantage-ARS",
      version: COMPANY.version,
      halted: false,
      haltReason: null,
      database,
      chain: { ok: false, detail: "Not checked: the database is unavailable." },
      scheduler: {
        autonomyEnabled,
        lastTickAt: null,
        minutesSinceTick: null,
        overdue: autonomyEnabled,
        consecutiveFailures: 0,
        posture: "recovery",
        budget: 0,
        dutiesDue: 0,
        duties: 0,
        selfScheduler,
      },
      queue: { open: 0, claimed: 0, abandoned: 0, done: 0 },
      mail: { connected: false, account: null },
      money: { treasuryCents: 0, receivableCents: 0, payableCents: 0 },
      pipeline: { openOpportunities: 0, pendingApprovals: 0, openTickets: 0 },
      rateCard: rateCardIntegrity(),
      recurringRevenue: NO_REVENUE,
      delegation: NO_DELEGATION,
      autonomy: buildAutonomyReadiness({
        now: checkedAt,
        autonomyOn: autonomyEnabled,
        halted: false,
        chainIntact: false,
        lastTickAt: null,
        consecutiveFailures: 0,
        selfSchedulerEnabled: selfScheduler.enabled,
        selfSchedulerRunning: selfScheduler.running,
        delegation: null,
        mailConnected: false,
        aiConfigured: aiConfiguredFromEnv(),
        backupConfigured: Boolean(process.env.BACKUP_DIR?.trim()),
        openWork: 0,
        abandonedWork: 0,
        pendingApprovals: 0,
      }),
      problems,
    };
  }

  const [view, status, queue, mail] = await Promise.all([
    readDutyView(),
    schedulerStatus(),
    workCounts(),
    Promise.resolve(smtpStatus()),
  ]);

  const chainDetail = await chainDetailFor(view.chainIntact);
  if (!view.chainIntact) problems.push(`Audit chain: ${chainDetail}`);

  const minutesSinceTick = status.lastTickAt
    ? Math.round((Date.now() - Date.parse(status.lastTickAt)) / 60_000)
    : null;
  const overdue =
    autonomyEnabled && (minutesSinceTick === null || minutesSinceTick > SCHEDULER_STALE_MINUTES);
  if (autonomyEnabled && minutesSinceTick === null) {
    problems.push("Autonomy is on but the scheduler has never run.");
  } else if (overdue) {
    problems.push(`The scheduler last ran ${minutesSinceTick} minutes ago.`);
  }
  if (status.consecutiveFailures >= 3) {
    problems.push(`The scheduler has failed ${status.consecutiveFailures} ticks in a row.`);
  }
  if (queue.abandoned > 0) {
    problems.push(`${queue.abandoned} work item(s) exhausted their retries.`);
  }
  if (company.halted) {
    problems.push(`Office is halted: ${company.haltReason ?? "no reason recorded"}`);
  }
  if (!mail.smtpConnected) {
    problems.push(
      "Founder notices cannot be delivered by email. They are recorded in the office only.",
    );
  }

  const rateCard = rateCardIntegrity();
  if (!rateCard.ok) problems.push(`Rate card: ${rateCard.detail}`);

  // ── The recurring-revenue book ──────────────────────────────────────────────
  // The office's own revenue numbers, so the health document and the office
  // screens can never disagree about what the business earns each month.
  let recurringRevenue: RecurringRevenueHealth = NO_REVENUE;
  try {
    const revenue = await revenueMetrics();
    recurringRevenue = {
      activeSubscriptions: revenue.activeSubscriptions,
      monthlyRecurringCents: revenue.monthlyRecurringCents,
      annualRecurringCents: revenue.annualRecurringCents,
      overduePeriods: await overdueBillingPeriods(),
    };
  } catch (error) {
    problems.push(
      `Recurring revenue unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (recurringRevenue.overduePeriods > 0) {
    problems.push(
      `Recurring revenue: ${recurringRevenue.overduePeriods} billing period(s) were invoiced more than ${BILLING_PROMISE_HOURS} hours ago and still have no report or no notice. The office has not kept that promise.`,
    );
  }

  // ── The standing delegation ─────────────────────────────────────────────────
  // Whether the office may act on its own today, and whether what it believes
  // about itself is true.
  let delegation: DelegationHealth = { ...NO_DELEGATION, mailConnected: mail.smtpConnected };
  try {
    const policy = await readDelegation();
    const usage = await readDelegationUsage();
    delegation = {
      exists: policy !== null,
      status: policy?.status ?? null,
      usedToday: usage.usedToday,
      dailyActionCap: policy?.maxActionsPerDay ?? 0,
      capExhausted:
        policy?.status === "active" &&
        policy.maxActionsPerDay > 0 &&
        usage.usedToday >= policy.maxActionsPerDay,
      customerMailAllowed: policy?.allowCustomerMail ?? false,
      mailConnected: mail.smtpConnected,
    };
  } catch (error) {
    problems.push(
      `Delegation unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (delegation.capExhausted) {
    problems.push(
      `The delegation has used ${delegation.usedToday} of its ${delegation.dailyActionCap} daily actions. The office has run out of authority for today.`,
    );
  }
  if (
    delegation.status === "active" &&
    delegation.customerMailAllowed &&
    !delegation.mailConnected
  ) {
    problems.push(
      "The delegation allows customer email, but mail is not connected. The office believes it can email customers and cannot.",
    );
  }

  // ── The honest autonomy picture ─────────────────────────────────────────────
  // A readiness document, not a promise. The gaps are the concrete settings
  // between "the duties run" and "the office can earn without the founder".
  const autonomy = buildAutonomyReadiness({
    now: checkedAt,
    autonomyOn: autonomyEnabled,
    halted: company.halted,
    chainIntact: view.chainIntact,
    lastTickAt: status.lastTickAt,
    consecutiveFailures: status.consecutiveFailures,
    selfSchedulerEnabled: selfScheduler.enabled,
    selfSchedulerRunning: selfScheduler.running,
    delegation: delegation.exists
      ? {
          status: delegation.status ?? "unknown",
          allowCustomerMail: delegation.customerMailAllowed,
          capExhausted: delegation.capExhausted,
        }
      : null,
    mailConnected: mail.smtpConnected,
    aiConfigured: aiConfiguredFromEnv(),
    backupConfigured: Boolean(process.env.BACKUP_DIR?.trim()),
    openWork: queue.open + queue.claimed,
    abandonedWork: queue.abandoned,
    pendingApprovals: view.approvalsPending.length,
  });

  const ok = problems.every(
    (problem) => !FATAL_PREFIXES.some((prefix) => problem.startsWith(prefix)),
  );

  const health: OfficeHealth = {
    ok,
    checkedAt,
    company: company.tradingName,
    version: COMPANY.version,
    halted: company.halted,
    haltReason: company.haltReason,
    database,
    chain: { ok: view.chainIntact, detail: chainDetail },
    scheduler: {
      autonomyEnabled,
      lastTickAt: status.lastTickAt,
      minutesSinceTick,
      overdue,
      consecutiveFailures: status.consecutiveFailures,
      posture: status.posture,
      budget: status.budget,
      dutiesDue: status.dueDuties.filter((duty) => duty.dueInMinutes <= 0).length,
      duties: status.dueDuties.length,
      selfScheduler,
    },
    queue,
    mail: { connected: mail.smtpConnected, account: mail.account },
    money: {
      treasuryCents: company.treasuryCents,
      receivableCents: company.receivableCents,
      payableCents: company.payableCents,
    },
    pipeline: {
      openOpportunities: view.opportunities.filter((opp) => !["won", "lost"].includes(opp.stage))
        .length,
      pendingApprovals: view.approvalsPending.length,
      openTickets: view.tickets.filter((ticket) => ticket.status !== "resolved").length,
    },
    rateCard,
    recurringRevenue,
    delegation,
    autonomy,
    problems,
  };

  if (options.full) {
    health.full = {
      duties: status.dueDuties,
      recentRuns: status.recentRuns.slice(0, 20),
      queue,
      work: view.work.slice(0, 50),
    };
  }

  return health;
}

async function chainDetailFor(intact: boolean): Promise<string> {
  if (intact)
    return "Audit chain verified: every record links to the one before it, back to genesis.";
  return "The audit chain does not verify. Autonomous actions are halted until the founder resolves it.";
}
