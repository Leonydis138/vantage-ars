import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildDeploymentReadiness } from "./deployment-readiness";

describe("deployment readiness", () => {
  it("marks a production-ready office as ready", () => {
    const result = buildDeploymentReadiness({
      DATABASE_URL: "postgres://db",
      BETTER_AUTH_SECRET: "12345678901234567890123456789012",
      BETTER_AUTH_URL: "https://auth.example.com",
      FOUNDER_EMAIL: "founder@example.com",
      AUTONOMY: "on",
      CRON_SECRET: "cron-secret-123456",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "pw",
      SMTP_FROM: "noreply@example.com",
      CLOUDFLARE_ACCOUNT_ID: "cf",
      CLOUDFLARE_API_TOKEN: "token",
    });

    assert.equal(result.ready, true);
    assert.equal(result.score >= 80, true);
    assert.ok(result.summary.length > 0);
    assert.ok(result.focus.some((item) => item.toLowerCase().includes("prerequisites") || item.toLowerCase().includes("autonomy") || item.toLowerCase().includes("mail")));
  });

  it("flags a blocked deployment when required values are missing", () => {
    const result = buildDeploymentReadiness({
      AUTONOMY: "on",
      SMTP_HOST: "smtp.example.com",
    });

    assert.equal(result.ready, false);
    assert.ok(result.score < 70);
    assert.ok(result.focus.some((item) => item.toLowerCase().includes("database") || item.toLowerCase().includes("founder") || item.toLowerCase().includes("cron")));
  });

  it("keeps a blocked deployment below the ready score range even with optional services", () => {
    const result = buildDeploymentReadiness({
      BETTER_AUTH_SECRET: "12345678901234567890123456789012",
      BETTER_AUTH_URL: "https://auth.example.com",
      FOUNDER_EMAIL: "founder@example.com",
      AUTONOMY: "on",
      CRON_SECRET: "cron-secret-123456",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "pw",
      SMTP_FROM: "noreply@example.com",
      XAI_API_KEY: "key",
    });

    assert.equal(result.ready, false);
    assert.ok(result.score < 60);
  });

  it("describes manual launch readiness without implying unattended scheduling", () => {
    const result = buildDeploymentReadiness({
      DATABASE_URL: "postgres://db",
      BETTER_AUTH_SECRET: "12345678901234567890123456789012",
      BETTER_AUTH_URL: "https://auth.example.com",
      FOUNDER_EMAIL: "founder@example.com",
    });

    assert.equal(result.ready, true);
    assert.match(result.summary, /manual/i);
    assert.doesNotMatch(result.summary, /unattended operations are allowed/i);
  });

  it("blocks malformed production values even when every required field is present", () => {
    const result = buildDeploymentReadiness({
      DATABASE_URL: "not-a-database-url",
      BETTER_AUTH_SECRET: "short",
      BETTER_AUTH_URL: "ftp://auth.example.com",
      FOUNDER_EMAIL: "founder-at-example.com",
      AUTONOMY: "on",
      CRON_SECRET: "tiny",
    });

    assert.equal(result.ready, false);
    assert.ok(result.score < 60);
    assert.ok(result.focus.some((item) => item.includes("DATABASE_URL")));
    assert.ok(result.focus.some((item) => item.includes("BETTER_AUTH_SECRET")));
    assert.ok(result.focus.some((item) => item.includes("BETTER_AUTH_URL")));
    assert.ok(result.focus.some((item) => item.includes("FOUNDER_EMAIL")));
    assert.ok(result.focus.some((item) => item.includes("CRON_SECRET")));
  });
});
