/**
 * Deterministic operator guidance from the office health document.
 * This module only reports and routes issues; it never mutates office state,
 * approves actions, sends messages, or redrives work.
 */
export type OperationsSignal = {
  code: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
};

export type OperationsHealthInput = {
  halted?: boolean;
  haltReason?: string | null;
  database?: { ok?: boolean; detail?: string };
  chain?: { ok?: boolean; detail?: string };
  scheduler?: {
    autonomyEnabled?: boolean;
    overdue?: boolean;
    consecutiveFailures?: number;
    minutesSinceTick?: number | null;
  };
  queue?: { abandoned?: number };
  pipeline?: { pendingApprovals?: number; openTickets?: number };
  recurringRevenue?: { overduePeriods?: number };
  problems?: string[];
};

const severityRank = { critical: 0, warning: 1, info: 2 } as const;

/** Turn health state into a stable, prioritized founder review list. */
export function buildOperationsSignals(health: OperationsHealthInput): OperationsSignal[] {
  const signals: OperationsSignal[] = [];
  const add = (signal: OperationsSignal) => signals.push(signal);

  if (health.halted) {
    add({
      code: "office-halted",
      severity: "critical",
      title: "Office is halted",
      detail: health.haltReason?.trim() || "No work is planned or executed while halted.",
      href: "/office",
    });
  }
  if (health.database?.ok === false) {
    add({
      code: "database-unavailable",
      severity: "critical",
      title: "Database unavailable",
      detail: health.database.detail || "Office records cannot be read safely.",
      href: "/status",
    });
  }
  if (health.chain?.ok === false) {
    add({
      code: "audit-chain-invalid",
      severity: "critical",
      title: "Audit chain needs review",
      detail: health.chain.detail || "Integrity must be restored before ordinary work resumes.",
      href: "/office/audit",
    });
  }

  if (health.scheduler?.autonomyEnabled && health.scheduler.overdue) {
    add({
      code: "scheduler-overdue",
      severity: "critical",
      title: "Scheduler is overdue",
      detail:
        health.scheduler.minutesSinceTick == null
          ? "No scheduler tick has been recorded."
          : `The most recent tick was ${health.scheduler.minutesSinceTick} minutes ago.`,
      href: "/office",
    });
  }
  const failures = health.scheduler?.consecutiveFailures ?? 0;
  if (failures >= 3) {
    add({
      code: "scheduler-failures",
      severity: "critical",
      title: "Scheduler failure streak",
      detail: `${failures} consecutive ticks failed. Inspect recent runs before taking recovery action.`,
      href: "/office",
    });
  }
  const abandoned = health.queue?.abandoned ?? 0;
  if (abandoned > 0) {
    add({
      code: "dead-letter-work",
      severity: "warning",
      title: "Work needs manual recovery",
      detail: `${abandoned} item(s) exhausted retries. Review the error before a founder redrive.`,
      href: "/office/floor",
    });
  }
  const approvals = health.pipeline?.pendingApprovals ?? 0;
  if (approvals > 0) {
    add({
      code: "pending-approvals",
      severity: "warning",
      title: "Founder approvals are waiting",
      detail: `${approvals} decision(s) remain gated for founder review; none are auto-approved.`,
      href: "/office/approvals",
    });
  }
  const overduePeriods = health.recurringRevenue?.overduePeriods ?? 0;
  if (overduePeriods > 0) {
    add({
      code: "overdue-delivery",
      severity: "warning",
      title: "Recurring-service delivery needs review",
      detail: `${overduePeriods} invoiced period(s) need a report or customer-notice review.`,
      href: "/office/revenue",
    });
  }
  const tickets = health.pipeline?.openTickets ?? 0;
  if (tickets > 0) {
    add({
      code: "open-tickets",
      severity: "info",
      title: "Open service work",
      detail: `${tickets} service ticket(s) remain unresolved.`,
      href: "/office/service",
    });
  }

  const covered = ["Database:", "Audit chain:", "Office is halted:", "The scheduler"];
  for (const problem of health.problems ?? []) {
    if (covered.some((prefix) => problem.startsWith(prefix))) continue;
    if (/exhausted their retries/i.test(problem) && abandoned > 0) continue;
    signals.push({
      code: `health-problem-${signals.length + 1}`,
      severity: "warning",
      title: "Health check reported an issue",
      detail: problem,
      href: "/office",
    });
  }

  return signals.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title),
  );
}
