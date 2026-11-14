import { payfastReadiness } from "./office/payfast-readiness.ts";

/**
 * Environment helpers (renamed from `env.server.ts` so the TanStack auth API
 * route can reach the auth server without tripping the client-bundle import
 * protection; content is unchanged). `env()` reads the provided environment map
 * and is only ever CALLED in server contexts.
 */
export function env(
  key: string,
  source: Record<string, string | undefined> = process.env,
): string | undefined {
  const v = source[key]?.trim();
  return v || undefined;
}

/** Environment variables the office cannot run without in production. */
const CRITICAL_ENV = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "FOUNDER_EMAIL",
  "DATABASE_URL",
] as const;

/** Environment variables whose absence degrades the office but does not stop it. */
const ADVISED_ENV = [
  "CRON_SECRET",
  "AUTONOMY",
  "PAYMENT_BANK_NAME",
  "PAYMENT_ACCOUNT_NUMBER",
  "PAYMENT_BRANCH_CODE",
  "PAYMENT_BENEFICIARY",
  "PAYMENT_SWIFT",
  "FOUNDER_WEBHOOK_URL",
] as const;

/**
 * Validate that critical environment variables are present. Logs a clear
 * warning for each missing variable so a misconfigured deploy fails loudly
 * instead of silently rejecting cron runs or auth sessions. When autonomy is
 * turned on, we also fail fast on the missing secrets that make the unattended
 * office impossible to operate.
 */
export function validateEnv(
  source: Record<string, string | undefined> = process.env,
): { missing: string[]; advised: string[]; blocked: string[] } {
  const missing = CRITICAL_ENV.filter((key) => !env(key, source));
  const advised = ADVISED_ENV.filter((key) => !env(key, source));
  const blocked: string[] = [];
  const autonomyEnabled = env("AUTONOMY", source)?.trim().toLowerCase() === "on";

  if (autonomyEnabled && !env("CRON_SECRET", source)) {
    blocked.push("CRON_SECRET is required when AUTONOMY=on.");
  }
  if (autonomyEnabled && !env("BETTER_AUTH_SECRET", source)) {
    blocked.push("BETTER_AUTH_SECRET is required when AUTONOMY=on.");
  }

  const payfast = payfastReadiness(source);
  if (missing.length > 0) {
    console.error(
      `[vantage-ars] Missing critical environment variables: ${missing.join(
        ", ",
      )}. The office will not run correctly until these are set.`,
    );
  }
  if (advised.length > 0) {
    console.warn(
      `[vantage-ars] Advisable environment variables not set: ${advised.join(
        ", ",
      )}. Some office features will be degraded.`,
    );
  }
  if (blocked.length > 0) {
    const detail = blocked.join(" ");
    console.error(`[vantage-ars] Autonomy is enabled but configuration is incomplete: ${detail}`);
  }
  if (payfast.requested) {
    const problems = [...payfast.missing, ...payfast.invalid];
    console.warn(
      problems.length > 0
        ? `[vantage-ars] PayFast checkout was requested but is not configured (${problems.join(", ")}). Checkout remains disabled.`
        : "[vantage-ars] PayFast checkout was requested, but no payment adapter is implemented. Checkout remains disabled.",
    );
  }
  return { missing, advised, blocked };
}

/**
 * Workspace preview vs deployed app. The deployer writes GROK_PROJECT_ID on
 * every publish; the sandbox preview never has it. Single source of truth for
 * the split — gate audience, gate endpoints and connector-token semantics all
 * key off this predicate.
 */
export function isWorkspacePreview(): boolean {
  return !env("GROK_PROJECT_ID");
}
