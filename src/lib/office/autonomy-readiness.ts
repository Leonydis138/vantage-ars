/**
 * How autonomous is the office, honestly?
 *
 * The office can run every duty while still being unable to earn a cent without
 * the founder, because the last mile — a standing delegation, a connected
 * mailbox, a reachable backup — is a setting rather than code. This module
 * turns those facts into one small readiness document: a level, a score, and a
 * list of gaps, each with the concrete action that closes it.
 *
 * It is a readiness check, not a promise. A green score means the office has
 * the authority and the plumbing to act unattended inside its constitutional
 * envelope; it does not mean every customer, invoice or fault is resolved.
 */
import { gmailSmtpConfig, genericSmtpConfig } from "./smtp-config";

export type AutonomyGapSeverity = "critical" | "warning";

export type AutonomyGap = {
  code: string;
  severity: AutonomyGapSeverity;
  title: string;
  detail: string;
  /** The one next step that closes this gap. */
  action: string;
};

export type AutonomyLevel = "autonomous" | "assisted" | "gated" | "blocked";

export type AutonomyReadiness = {
  level: AutonomyLevel;
  score: number;
  headline: string;
  summary: string;
  gaps: AutonomyGap[];
  nextActions: string[];
};

export type AutonomyReadinessInput = {
  now: string;
  autonomyOn: boolean;
  halted: boolean;
  chainIntact: boolean;
  lastTickAt: string | null;
  consecutiveFailures: number;
  /** The in-process timer. External cron counts separately as "scheduler current". */
  selfSchedulerEnabled: boolean;
  selfSchedulerRunning: boolean;
  delegation: {
    status: string;
    allowCustomerMail: boolean;
    /** True when a live policy has already spent its daily allowance. */
    capExhausted?: boolean;
  } | null;
  mailConnected: boolean;
  aiConfigured: boolean;
  backupConfigured: boolean;
  openWork: number;
  abandonedWork: number;
  pendingApprovals: number;
};

/** The stall threshold used by the health endpoint: three missed ten-minute windows. */
export const AUTONOMY_STALE_MINUTES = 180;

/** Whether a customer mailbox is fully configured, without touching the network. */
export function mailConfiguredFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    genericSmtpConfig(env) || gmailSmtpConfig(env.GMAIL_SMTP_USER, env.GMAIL_SMTP_APP_PASSWORD),
  );
}

/** Whether at least one reasoning provider has a complete credential pair. */
export function aiConfiguredFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = (key: string) => (env[key] ?? "").trim();
  const cloudflare = Boolean(value("CLOUDFLARE_ACCOUNT_ID") && value("CLOUDFLARE_API_TOKEN"));
  const xai = Boolean(value("XAI_API_KEY"));
  const huggingface = Boolean(value("HUGGINGFACE_API_KEY") || value("HF_TOKEN"));
  return cloudflare || xai || huggingface;
}

function minutesSince(now: string, then: string | null): number | null {
  if (!then) return null;
  const elapsed = Date.parse(now) - Date.parse(then);
  return Number.isFinite(elapsed) ? Math.round(elapsed / 60_000) : null;
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function buildAutonomyReadiness(input: AutonomyReadinessInput): AutonomyReadiness {
  const gaps: AutonomyGap[] = [];
  const add = (gap: AutonomyGap) => {
    if (!gaps.some((existing) => existing.code === gap.code)) gaps.push(gap);
  };

  if (input.halted) {
    add({
      code: "halted",
      severity: "critical",
      title: "The office is halted",
      detail: "No duty plans or executes while the office is halted.",
      action: "Resolve the halt in the office, then confirm the audit chain is intact.",
    });
  }
  if (!input.chainIntact) {
    add({
      code: "chain-broken",
      severity: "critical",
      title: "The audit chain does not verify",
      detail: "The office cannot prove what it did, so only SEAL may run.",
      action: "Inspect /office/audit and restore the chain before resuming ordinary work.",
    });
  }
  if (!input.autonomyOn) {
    add({
      code: "autonomy-off",
      severity: "critical",
      title: "Unattended runs are off",
      detail: "Nothing is planned or executed unless the founder presses the button.",
      action: "Set AUTONOMY=on in the host environment and redeploy.",
    });
  }

  const since = minutesSince(input.now, input.lastTickAt);
  if (!input.lastTickAt) {
    if (input.autonomyOn) {
      add({
        code: "scheduler-never-ran",
        severity: "critical",
        title: "The scheduler has never run",
        detail: "Autonomy is on, but no tick has been recorded.",
        action: "Hit /api/health or /api/cron/floor once, then confirm a tick appears in /office.",
      });
    }
  } else if (since !== null && since > AUTONOMY_STALE_MINUTES) {
    add({
      code: "scheduler-stale",
      severity: "critical",
      title: "The scheduler is behind",
      detail: `The last tick was ${since} minutes ago.`,
      action: input.selfSchedulerEnabled
        ? "Check the process is still running; the in-process heartbeat should tick within five minutes."
        : "Keep a heartbeat alive, or set SELF_SCHEDULER=on so the server ticks itself.",
    });
  }
  if (input.consecutiveFailures >= 3) {
    add({
      code: "scheduler-failing",
      severity: "critical",
      title: "The scheduler is failing",
      detail: `${input.consecutiveFailures} consecutive ticks failed. The circuit breaker will stop it at five.`,
      action:
        "Open /office, read the dead-letter queue and the last failing duty, then fix or redrive it.",
    });
  }

  const delegationActive = input.delegation?.status === "active";
  if (!input.delegation) {
    add({
      code: "no-delegation",
      severity: "critical",
      title: "Nothing is delegated",
      detail:
        "The office can classify, draft and file, but every customer win, cost, invoice and customer email still waits for the founder.",
      action:
        "At /office/delegations, save the narrowest standing delegation that matches the work you want unattended.",
    });
  } else if (!delegationActive) {
    add({
      code: "delegation-inactive",
      severity: "critical",
      title: "The delegation is not active",
      detail: `The standing policy is ${input.delegation.status}. It grants no authority until resumed.`,
      action: "Resume the delegation at /office/delegations, or write a new one.",
    });
  } else if (input.delegation.capExhausted) {
    add({
      code: "delegation-cap",
      severity: "warning",
      title: "Today's delegated allowance is spent",
      detail:
        "The caps are real: further delegated actions will be refused until the UTC day rolls over.",
      action: "Review the day's delegated actions; raise the cap only if the spend is intended.",
    });
  }

  if (!input.mailConnected) {
    add({
      code: "mail-missing",
      severity: "warning",
      title: "Customer mail is not connected",
      detail: "Notices and reports are recorded in the office, but nothing reaches the customer.",
      action: "Configure SMTP_HOST/PORT/USER/PASSWORD/FROM, or keep mail intentionally off.",
    });
  }
  if (!input.aiConfigured) {
    add({
      code: "ai-missing",
      severity: "warning",
      title: "No reasoning provider is configured",
      detail: "Every duty still runs from office records; drafted prose is not model-sharpened.",
      action: "Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, or XAI_API_KEY.",
    });
  }
  if (!input.backupConfigured) {
    add({
      code: "backup-missing",
      severity: "warning",
      title: "No offline backup target is configured",
      detail: "The office can export a backup, but no daily copy is written outside the database.",
      action:
        "Set BACKUP_DIR to a secure persistent volume and the office will write a verified daily copy.",
    });
  }
  if (!input.selfSchedulerEnabled && input.autonomyOn) {
    add({
      code: "external-heartbeat",
      severity: "warning",
      title: "The heartbeat is external",
      detail: "The office depends on cron, a sidecar or a monitor to start each tick.",
      action:
        "Leave the external heartbeat in place, or set SELF_SCHEDULER=on where the process stays alive.",
    });
  }
  if (input.abandonedWork > 0) {
    add({
      code: "abandoned-work",
      severity: "warning",
      title: `${input.abandonedWork} work item(s) are dead`,
      detail: "They exhausted their retries and nothing will retry them automatically.",
      action: "Read the error in /office and redrive the item once the cause is fixed.",
    });
  }
  if (input.pendingApprovals > 0) {
    add({
      code: "approvals-pending",
      severity: "warning",
      title: `${input.pendingApprovals} founder decision(s) are waiting`,
      detail: "Those actions are correctly stopped at the gate, not failed.",
      action: "Open /office/approvals and decide them; nothing expires into an approval.",
    });
  }

  let score = 100;
  for (const gap of gaps) score -= gap.severity === "critical" ? 28 : 8;
  if (gaps.some((gap) => ["halted", "chain-broken"].includes(gap.code)))
    score = Math.min(score, 15);
  if (!input.autonomyOn) score = Math.min(score, 20);
  if (gaps.some((gap) => ["no-delegation", "delegation-inactive"].includes(gap.code))) {
    score = Math.min(score, 60);
  }
  score = clamp(score);

  const blocked = gaps.some((gap) => ["halted", "chain-broken"].includes(gap.code));
  const gated =
    !input.autonomyOn ||
    gaps.some((gap) => ["no-delegation", "delegation-inactive"].includes(gap.code));
  const assisted = gaps.length > 0;

  const level: AutonomyLevel = blocked
    ? "blocked"
    : gated
      ? "gated"
      : assisted
        ? "assisted"
        : "autonomous";

  const headline =
    level === "autonomous"
      ? "Fully autonomous inside the constitution"
      : level === "assisted"
        ? "Running unattended, with named gaps"
        : level === "gated"
          ? "Running internally, gated at the customer and the money"
          : "Stopped until the founder resolves a block";

  const summary =
    level === "autonomous"
      ? "The scheduler is current, authority is delegated, mail and backups are connected, and no decision is waiting."
      : level === "assisted"
        ? `The office can act, but ${gaps.length} gap${gaps.length === 1 ? "" : "s"} limit how far it can go without you. Each one has a single next step below.`
        : level === "gated"
          ? "The internal work runs by itself, but every customer win, invoice and customer email still stops at the founder gate. That is the default, not a failure."
          : "A constitutional or integrity block is active. The office is refusing to act, which is the correct behaviour.";

  const nextActions = gaps.map((gap) => gap.action);

  return {
    level,
    score,
    headline,
    summary,
    gaps,
    nextActions: [...new Set(nextActions)],
  };
}
