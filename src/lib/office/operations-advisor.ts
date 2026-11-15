/**
 * Deterministic operator guidance built from the office's existing health
 * document. This module has no network, model, database, or mutation access:
 * it ranks issues and points a founder to the existing control surface.
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
    posture?: string;
  };
  queue?: { open?: number; claimed?: number; abandoned?: number };
  pipeline?: { pendingApprovals?: number; openTickets?: number };
  recurringRevenue?: { overduePeriods?: number };
  problems?: string[];
};

const PRIORITY: Record<OperationsSignal["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Convert a health projection into a concise, stable, founder-facing action
 * list. This only recommends review; it never retries work, decides approvals,
 * resumes a halt, sends mail, or changes delegation.
 */
export function buildOperationsSignals(health: OperationsHealthInput): OperationsSignal[] {
  const signals: OperationsSignal[] = [];
  const add = (signal: OperationsSignal) => signals.push(signal);

  if (health.halted) {
    add({
      code: "office-halted",
      severity: "critical",
      title: "Office is halted",
      detail: health.haltReason?.trim() || "The scheduler will not plan or execute work while halted.",
      href: "/office",
    });
  }
  if (health.database?.ok === false) {
    add({
      code: "database-unavailable",
      severity: "critical",
      title: "Database unavailable",
      detail: health.database.detail || "Office records cannot be read or safely updated.",
      href: "/status",
    });
  }
  if (health.chain?.ok === false) {
    add({
      code: "audit-chain-invalid",
      severity: "critical",
      title: "Audit chain needs review",
      detail: health.chain.detail || "Ordinary autonomous work must remain stopped until integrity is restored.",
      href: "/office/audit",
    });
  }

  const scheduler = health.scheduler;
  if (scheduler?.autonomyEnabled && scheduler.overdue) {
    add({
      code: "scheduler-overdue",
      severity: "critical",
      title: "Scheduler is overdue",
      detail:
        scheduler.minutesSinceTick == null
          ? "No scheduler tick has been recorded yet."
          : `The most recent tick was ${scheduler.minutesSinceTick} minutes ago.`,
      href: "/office",
    });
  }
  if ((scheduler?.consecutiveFailures ?? 0) >= 3) {
    add({
      code: "scheduler-failures",
      severity: "critical",
      title: "Scheduler failure streak",
      detail: `${scheduler?.consecutiveFailures} consecutive ticks failed; inspect recent runs before redriving work.`,
      href: "/office",
    });
  }

  if ((health.queue?.abandoned ?? 0) > 0) {
    add({
      code: "dead-letter-work",
      severity: "warning",
      title: "Work needs manual recovery",
      detail: `${health.queue?.abandoned} item(s) exhausted retries. Review the error and cause before a founder redrive.`,
      href: "/office/floor",
    });
  }
  if ((health.pipeline?.pendingApprovals ?? 0) > 0) {
    add({
      code: "pending-approvals",
      severity: "warning",
      title: "Founder approvals are waiting",
      detail: `${health.pipeline?.pendingApprovals} decision(s) are gated for founder review; none are auto-approved.`,
      href: "/office/approvals",
    });
  }
  if ((health.recurringRevenue?.overduePeriods ?? 0) > 0) {
    add({
      code: "overdue-delivery",
      severity: "warning",
      title: "A recurring-service promise may be overdue",
      detail: `${health.recurringRevenue?.overduePeriods} invoiced period(s) need a report or customer notice review.`,
      href: "/office/revenue",
    });
  }
  if ((health.pipeline?.openTickets ?? 0) > 0) {
    add({
      code: "open-tickets",
      severity: "info",
      title: "Open service work",
      detail: `${health.pipeline?.openTickets} service ticket(s) remain unresolved.`,
      href: "/office/service",
    });
  }

  // Avoid double-presenting a condition already captured with a precise action.
  const coveredPrefixes = ["Database:", "Audit chain:", "Office is halted:", "The scheduler"];
  for (const problem of health.problems ?? []) {
    if (coveredPrefixes.some((prefix) => problem.startsWith(prefix))) continue;
    if (/exhausted their retries/i.test(problem) && signals.some((s) => s.code === "dead-letter-work"))
      continue;
    add({
      code: `health-${signals.length + 1}`,
      severity: "warning",
      title: "Health check reported an issue",
      detail: problem,
      href: "/office",
    });
  }

  return signals.sort(
    (a, b) => PRIORITY[a.severity] - PRIORITY[b.severity] || a.title.localeCompare(b.title),
  );
}
