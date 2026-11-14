import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildOperatingReadiness } from "./operating-readiness";

describe("operating readiness", () => {
  it("scores a healthy office highly and keeps the founder brief brief", () => {
    const score = buildOperatingReadiness({
      approvals: [{ status: "approved" }, { status: "approved" }],
      inbound: [{ status: "resolved" }, { status: "resolved" }],
      tickets: [{ status: "resolved" }, { status: "resolved" }],
      opportunities: [{ stage: "won", valueCents: 5000000 }, { stage: "in_discussion", valueCents: 1000000 }],
      revenue: { monthlyRecurringCents: 150000 },
      company: { halted: false },
      health: {
        hardViolations: 0,
        overall: 94,
        decisionCount: 12,
        autonomousResolution: 0.7,
      },
    });

    assert.ok(score.score >= 80);
    assert.ok(score.score <= 100);
    assert.ok(score.summary.length > 0);
    assert.ok(score.focus.length > 0);
    assert.ok(score.riskLevel === "healthy" || score.riskLevel === "watch");
  });

  it("flags founder attention and lowers the score when the office is blocked", () => {
    const score = buildOperatingReadiness({
      approvals: [{ status: "pending" }, { status: "pending" }],
      inbound: [{ status: "received" }],
      tickets: [{ status: "open" }],
      opportunities: [{ stage: "proposal", valueCents: 500000 }],
      revenue: { monthlyRecurringCents: 0 },
      company: { halted: false },
      health: {
        hardViolations: 2,
        overall: 45,
        decisionCount: 2,
        autonomousResolution: 0.15,
      },
    });

    assert.ok(score.score < 70);
    assert.ok(score.riskLevel === "critical" || score.riskLevel === "watch");
    assert.ok(score.focus.some((item) => item.toLowerCase().includes("approval") || item.toLowerCase().includes("ticket") || item.toLowerCase().includes("inbound")));
  });
});
