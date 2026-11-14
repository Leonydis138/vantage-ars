/**
 * The in-process heartbeat.
 *
 * Every deployment target so far needed something *outside* the app to ring the
 * doorbell: GitHub Actions, a Docker sidecar, a systemd timer or a daily Vercel
 * cron. That works, but it means "the office runs itself" is only true while a
 * second system is alive. This module decides whether the server can safely
 * carry its own timer, and the companion `.server.ts` module runs it.
 *
 * The rules are deliberately conservative:
 *
 *   - `AUTONOMY` must be on. A timer cannot create authority.
 *   - serverless runtimes never start one: a function that is frozen between
 *     requests cannot keep an interval, and pretending otherwise would hide a
 *     dead scheduler behind a green light.
 *   - tests and build tooling never start one.
 *   - an explicit `SELF_SCHEDULER=off` always wins, so an operator can keep the
 *     external heartbeat they already trust.
 *
 * The timer is a convenience, not the only trigger: `/api/cron/floor`, the
 * public nudge and the founder's "run now" button all still work, and a lease
 * in Postgres keeps two app instances from ticking over each other.
 */

export type SelfSchedulerConfig = {
  enabled: boolean;
  /** Human-readable reason for the decision, shown in the office. */
  reason: string;
  intervalMs: number;
  startDelayMs: number;
};

/** One minute is the floor. A shorter interval would only burn CPU. */
export const MIN_SELF_SCHEDULER_INTERVAL_MS = 60_000;
/** Five minutes by default: half the advertised ten-minute cadence. */
export const DEFAULT_SELF_SCHEDULER_INTERVAL_MS = 300_000;
/** Give the first request a moment to finish before the first tick. */
export const DEFAULT_SELF_SCHEDULER_START_DELAY_MS = 15_000;
/** A dead instance's lease is available again after this long. */
export const SELF_SCHEDULER_LEASE_MINUTES = 15;

const SERVERLESS_FLAGS = [
  "VERCEL",
  "AWS_LAMBDA_FUNCTION_NAME",
  "CF_PAGES",
  "NETLIFY",
  "FUNCTIONS_WORKER_RUNTIME",
] as const;

function envValue(env: Record<string, string | undefined>, key: string): string {
  return (env[key] ?? "").trim();
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function nonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

function bounded(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Decide whether this process may own an autonomous timer.
 *
 * Pure and injectable, so the policy is unit-tested without starting a timer or
 * reading the real environment.
 */
export function selfSchedulerConfig(
  env: Record<string, string | undefined> = process.env,
): SelfSchedulerConfig {
  const explicit = envValue(env, "SELF_SCHEDULER").toLowerCase();
  const intervalMs = bounded(
    positiveNumber(envValue(env, "SELF_SCHEDULER_INTERVAL_MS"), DEFAULT_SELF_SCHEDULER_INTERVAL_MS),
    MIN_SELF_SCHEDULER_INTERVAL_MS,
    6 * 60 * 60_000,
  );
  const startDelayMs = bounded(
    nonNegativeNumber(
      envValue(env, "SELF_SCHEDULER_START_DELAY_MS"),
      DEFAULT_SELF_SCHEDULER_START_DELAY_MS,
    ),
    0,
    10 * 60_000,
  );

  const off = { enabled: false, intervalMs, startDelayMs } as const;

  if (explicit === "off" || explicit === "false" || explicit === "0") {
    return {
      ...off,
      reason: "SELF_SCHEDULER is switched off. An external heartbeat must tick the floor.",
    };
  }
  if (envValue(env, "AUTONOMY").toLowerCase() !== "on") {
    return { ...off, reason: "AUTONOMY is not on. The in-process heartbeat stays idle." };
  }
  if (envValue(env, "VANTAGE_SKIP_DB_BOOTSTRAP") === "1" || envValue(env, "NODE_ENV") === "test") {
    return { ...off, reason: "Test or bootstrap context. No timer was started." };
  }
  const serverless = SERVERLESS_FLAGS.find((flag) => envValue(env, flag) !== "");
  if (serverless) {
    return {
      ...off,
      reason: `Serverless runtime (${serverless}) cannot keep a timer. Use the schedule or a public nudge.`,
    };
  }

  return {
    enabled: true,
    intervalMs,
    startDelayMs,
    reason: `The server ticks itself every ${Math.round(intervalMs / 60_000)} minute(s).`,
  };
}

/**
 * Files older than the retention window, given names of the form
 * `vantage-ars-backup-<ISO timestamp>.json`.
 *
 * The timestamp is read from the filename rather than the filesystem mtime: a
 * copied or restored directory keeps the backup's own date, which is the date
 * the operator cares about. A file that does not carry our prefix is never
 * touched.
 */
export function backupsToPrune(names: string[], now: Date, retentionDays: number): string[] {
  const cutoff = now.getTime() - Math.max(1, Math.round(retentionDays)) * 86_400_000;
  const pattern = /^vantage-ars-backup-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;
  return names.filter((name) => {
    const match = pattern.exec(name);
    if (!match) return false;
    const [, date, hh, mm, ss, ms] = match;
    const time = Date.parse(`${date}T${hh}:${mm}:${ss}.${ms}Z`);
    return Number.isFinite(time) && time < cutoff;
  });
}

/** A filename for an export, safe on every filesystem we support. */
export function backupFileName(now: Date): string {
  return `vantage-ars-backup-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}
