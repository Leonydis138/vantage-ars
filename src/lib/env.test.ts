import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateEnv } from "./env.ts";

describe("environment validation", () => {
  it("blocks autonomous mode without the cron secret and auth secret", () => {
    const result = validateEnv({
      AUTONOMY: "on",
      BETTER_AUTH_URL: "https://example.com",
      FOUNDER_EMAIL: "founder@example.com",
      DATABASE_URL: "postgres://example.db",
      CRON_SECRET: "",
      BETTER_AUTH_SECRET: "",
    });

    assert.ok(result.blocked.some((item) => item.includes("CRON_SECRET")));
    assert.ok(result.blocked.some((item) => item.includes("BETTER_AUTH_SECRET")));
  });

  it("does not block manual mode", () => {
    const result = validateEnv({
      AUTONOMY: "off",
      BETTER_AUTH_URL: "https://example.com",
      FOUNDER_EMAIL: "founder@example.com",
      DATABASE_URL: "postgres://example.db",
    });

    assert.deepEqual(result.blocked, []);
  });
});
