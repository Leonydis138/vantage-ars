import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTONOMY_STALE_MINUTES,
  aiConfiguredFromEnv,
  buildAutonomyReadiness,
  mailConfiguredFromEnv,
  type AutonomyReadinessInput,
} from "./autonomy-readiness.ts";

const NOW = "2026-11-11T10:00:00.000Z";
const minutesAgo = (minutes: number) => new Date(Date.parse(NOW) - minutes * 60_000).toISOString();

function ready(overrides: Partial<AutonomyReadinessInput> = {}): AutonomyReadinessInput {
  return {
    now: NOW,
    autonomyOn: true,
    halted: false,
    chainIntact: true,
    lastTickAt: minutesAgo(4),
    consecutiveFailures: 0,
    selfSchedulerEnabled: true,
    selfSchedulerRunning: true,
    delegation: {
      status: "active",
      allowCustomerMail: true,
      capExhausted: false,
    },
    mailConnected: true,
    aiConfigured: true,
    backupConfigured: true,
    openWork: 2,
    abandonedWork: 0,
    pendingApprovals: 0,
    ...overrides,
  };
}

describe("autonomy readiness", () => {
  it("is fully autonomous only when authority and plumbing are both present", () => {
    const result = buildAutonomyReadiness(ready());
    assert.equal(result.level, "autonomous");
    assert.equal(result.score, 100);
    assert.deepEqual(result.gaps, []);
    assert.match(result.headline, /Fully autonomous/);
  });

  it("is gated, not failed, when nothing is delegated", () => {
    const result = buildAutonomyReadiness(ready({ delegation: null }));
    assert.equal(result.level, "gated");
    assert.ok(result.score <= 60);
    const gap = result.gaps.find((item) => item.code === "no-delegation");
    assert.ok(gap);
    assert.equal(gap.severity, "critical");
    assert.match(gap.detail, /founder/);
    assert.ok(result.nextActions.some((action) => action.includes("/office/delegations")));
  });

  it("treats a paused delegation as no authority at all", () => {
    const result = buildAutonomyReadiness(
      ready({ delegation: { status: "paused", allowCustomerMail: true } }),
    );
    assert.equal(result.level, "gated");
    assert.ok(result.gaps.some((gap) => gap.code === "delegation-inactive"));
  });

  it("blocks on a halt or a broken chain, and never reports a green level", () => {
    const halted = buildAutonomyReadiness(ready({ halted: true }));
    assert.equal(halted.level, "blocked");
    assert.ok(halted.score <= 15);
    assert.ok(halted.gaps.some((gap) => gap.code === "halted"));

    const broken = buildAutonomyReadiness(ready({ chainIntact: false }));
    assert.equal(broken.level, "blocked");
    assert.ok(broken.gaps.some((gap) => gap.code === "chain-broken"));
  });

  it("names a stale scheduler and a dead heartbeat", () => {
    const result = buildAutonomyReadiness(
      ready({
        autonomyOn: false,
        lastTickAt: minutesAgo(AUTONOMY_STALE_MINUTES + 5),
      }),
    );
    assert.ok(result.gaps.some((gap) => gap.code === "autonomy-off"));
    assert.ok(result.gaps.some((gap) => gap.code === "scheduler-stale"));
    assert.equal(result.level, "gated");
  });

  it("reports optional gaps without pretending they are authority gaps", () => {
    const result = buildAutonomyReadiness(
      ready({
        mailConnected: false,
        aiConfigured: false,
        backupConfigured: false,
        abandonedWork: 2,
        pendingApprovals: 3,
      }),
    );
    assert.equal(result.level, "assisted");
    for (const code of [
      "mail-missing",
      "ai-missing",
      "backup-missing",
      "abandoned-work",
      "approvals-pending",
    ]) {
      assert.ok(
        result.gaps.some((gap) => gap.code === code),
        `missing ${code}`,
      );
    }
    assert.ok(result.score < 100);
  });

  it("treats a spent daily delegation as a warning, not a broken policy", () => {
    const result = buildAutonomyReadiness(
      ready({ delegation: { status: "active", allowCustomerMail: true, capExhausted: true } }),
    );
    const gap = result.gaps.find((item) => item.code === "delegation-cap");
    assert.ok(gap);
    assert.equal(gap.severity, "warning");
    assert.equal(result.level, "assisted");
  });

  it("reads mail and provider configuration without inventing a connection", () => {
    assert.equal(mailConfiguredFromEnv({}), false);
    assert.equal(
      mailConfiguredFromEnv({
        SMTP_HOST: "smtp.example",
        SMTP_PORT: "465",
        SMTP_USER: "hello@example.co.za",
        SMTP_PASSWORD: "long-enough-password",
        SMTP_FROM: "hello@example.co.za",
      }),
      true,
    );
    assert.equal(
      mailConfiguredFromEnv({ GMAIL_SMTP_USER: "a@b.co", GMAIL_SMTP_APP_PASSWORD: "x" }),
      false,
    );
    assert.equal(aiConfiguredFromEnv({ CLOUDFLARE_ACCOUNT_ID: "a" }), false);
    assert.equal(aiConfiguredFromEnv({ XAI_API_KEY: "k" }), true);
    assert.equal(aiConfiguredFromEnv({ HF_TOKEN: "k" }), true);
  });
});
