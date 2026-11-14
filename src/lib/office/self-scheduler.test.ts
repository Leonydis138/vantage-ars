import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  backupFileName,
  backupsToPrune,
  DEFAULT_SELF_SCHEDULER_INTERVAL_MS,
  MIN_SELF_SCHEDULER_INTERVAL_MS,
  selfSchedulerConfig,
} from "./self-scheduler.ts";

function env(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return { AUTONOMY: "on", ...overrides };
}

describe("self-scheduler policy", () => {
  it("starts only when autonomy is on", () => {
    assert.equal(selfSchedulerConfig(env()).enabled, true);
    const off = selfSchedulerConfig(env({ AUTONOMY: "off" }));
    assert.equal(off.enabled, false);
    assert.match(off.reason, /AUTONOMY/);
  });

  it("lets an explicit off win over everything else", () => {
    const result = selfSchedulerConfig(env({ SELF_SCHEDULER: "off" }));
    assert.equal(result.enabled, false);
    assert.match(result.reason, /switched off/);
  });

  it("refuses a timer in a serverless runtime", () => {
    for (const flag of ["VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "CF_PAGES", "NETLIFY"]) {
      const result = selfSchedulerConfig(env({ [flag]: "1" }));
      assert.equal(result.enabled, false, flag);
      assert.match(result.reason, /Serverless|serverless/, flag);
    }
  });

  it("never starts in tests or bootstrap", () => {
    assert.equal(selfSchedulerConfig(env({ NODE_ENV: "test" })).enabled, false);
    assert.equal(selfSchedulerConfig(env({ VANTAGE_SKIP_DB_BOOTSTRAP: "1" })).enabled, false);
  });

  it("defaults to five minutes and clamps a hostile interval", () => {
    assert.equal(selfSchedulerConfig(env()).intervalMs, DEFAULT_SELF_SCHEDULER_INTERVAL_MS);
    assert.equal(
      selfSchedulerConfig(env({ SELF_SCHEDULER_INTERVAL_MS: "1" })).intervalMs,
      MIN_SELF_SCHEDULER_INTERVAL_MS,
    );
    assert.equal(
      selfSchedulerConfig(env({ SELF_SCHEDULER_INTERVAL_MS: "not-a-number" })).intervalMs,
      DEFAULT_SELF_SCHEDULER_INTERVAL_MS,
    );
    assert.equal(
      selfSchedulerConfig(env({ SELF_SCHEDULER_INTERVAL_MS: String(9 * 60 * 60_000) })).intervalMs,
      6 * 60 * 60_000,
    );
  });

  it("allows a zero start delay so an operator can tick immediately", () => {
    assert.equal(selfSchedulerConfig(env({ SELF_SCHEDULER_START_DELAY_MS: "0" })).startDelayMs, 0);
    assert.equal(
      selfSchedulerConfig(env({ SELF_SCHEDULER_START_DELAY_MS: "9999999" })).startDelayMs,
      10 * 60_000,
    );
  });
});

describe("backup file housekeeping", () => {
  it("names files with a sortable, filesystem-safe timestamp", () => {
    const name = backupFileName(new Date("2026-11-11T10:11:12.123Z"));
    assert.equal(name, "vantage-ars-backup-2026-11-11T10-11-12-123Z.json");
  });

  it("prunes only expired files that carry our own name", () => {
    const now = new Date("2026-11-11T10:00:00.000Z");
    const names = [
      backupFileName(new Date("2026-11-01T00:00:00.000Z")),
      backupFileName(new Date("2026-11-10T00:00:00.000Z")),
      "someone-elses-backup-2026-01-01.json",
      "vantage-ars-backup-not-a-date.json",
    ];
    const pruned = backupsToPrune(names, now, 7);
    assert.deepEqual(pruned, [names[0]]);
  });

  it("keeps the boundary file and never goes below one day", () => {
    const now = new Date("2026-11-11T10:00:00.000Z");
    const exact = backupFileName(new Date(now.getTime() - 7 * 86_400_000));
    assert.deepEqual(backupsToPrune([exact], now, 7), []);
    assert.deepEqual(backupsToPrune([exact], now, 0), [exact]);
  });
});
