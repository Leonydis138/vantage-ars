import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFounderBrief, buildMarketingBrief } from "./briefs.ts";

describe("founder brief builders", () => {
  it("builds a practical founder brief from the office snapshot", () => {
    const brief = buildFounderBrief({
      approvals: [
        { id: "ap-1", status: "pending" },
        { id: "ap-2", status: "approved" },
      ],
      inbound: [
        { id: "i-1", status: "received" },
        { id: "i-2", status: "closed" },
      ],
      opportunities: [{ id: "o-1", stage: "qualified", valueCents: 3500_00 }],
      tickets: [{ id: "t-1", status: "open" }],
      campaigns: [{ id: "c-1", status: "draft" }],
      company: { treasuryCents: 1350000, receivableCents: 450000 },
      health: { pendingApprovals: 1, overall: 0.82, decisionQuality: 0.8, constraintAdherence: 0.9, selfHealing: 0.7, governance: 0.85, interventionRate: 0.2, autonomousResolution: 0.76, decisionCount: 5, hardViolations: 0, resolvedApprovals: 2 },
      revenue: { monthlyRecurringCents: 750000, annualRecurringCents: 9000000, overdueCents: 50000, churnRiskCount: 1, upcomingRenewals: [], planMix: [], aging: { currentCents: 0, days8To30Cents: 0, days31To60Cents: 0, over60Cents: 0 }, oneOffPipelineCents: 0, billedThisMonthCents: 0, collectedThisMonthCents: 0, outstandingCents: 0, pausedSubscriptions: 0, cancelledSubscriptions: 0, activeSubscriptions: 1 },
      agents: [],
      provisions: [],
      leads: [],
      ledger: [],
      documents: [],
      decisions: [],
      audit: [],
      notices: [],
      mail: { smtpConnected: false, account: null },
      delegation: null,
      delegationUsage: { usedToday: 0, usedThisMonth: 0, spentTodayCents: 0, spentThisMonthCents: 0 },
      subscriptions: [],
    } as any);

    assert.equal(brief.title.includes("Daily brief"), true);
    assert.ok(brief.summary.length > 0);
    assert.ok(brief.actions.length >= 2);
    assert.ok(brief.risks.length >= 1);
    assert.ok(brief.opportunities.length > 0);
  });

  it("ranks founder improvements from live risk evidence", () => {
    const brief = buildFounderBrief({
      approvals: [{ status: "pending" }],
      inbound: [{ status: "received" }],
      tickets: [{ status: "open" }],
      campaigns: [],
      company: { receivableCents: 82500 },
      health: { hardViolations: 1 },
      revenue: { overdueCents: 42000, churnRiskCount: 1, activeSubscriptions: 0 },
    } as any);

    assert.equal(brief.opportunities[0]?.id, "governance-exceptions");
    assert.equal(brief.opportunities[0]?.priority, "high");
    assert.equal(brief.opportunities[0]?.href, "/office/audit");
    assert.equal(
      brief.opportunities.find((item) => item.id === "approval-backlog")?.href,
      "/office/approvals",
    );
    assert.ok(brief.opportunities.some((item) => item.id === "overdue-invoices"));
    assert.ok(brief.opportunities.some((item) => item.evidence.includes("420")));
    assert.ok(brief.opportunities.length <= 5);
  });

  it("does not invent risk recommendations for an empty office", () => {
    const brief = buildFounderBrief({
      approvals: [],
      inbound: [],
      tickets: [],
      campaigns: [],
      company: { receivableCents: 0 },
      health: { hardViolations: 0 },
      revenue: { overdueCents: 0, churnRiskCount: 0, activeSubscriptions: 0, outstandingCents: 0 },
    } as any);

    assert.ok(brief.opportunities.every((item) => item.priority === "normal"));
    assert.ok(brief.opportunities.every((item) => item.evidence.length > 0));
  });

  it("builds a marketing brief with clear angle and proof points", () => {
    const brief = buildMarketingBrief({
      leads: [
        { id: "l-1", companyName: "Acme IT", score: 86, stage: "ready_for_sales" },
      ],
      campaigns: [{ id: "c-1", status: "draft", name: "Proactive support", channel: "email" }],
      opportunities: [{ id: "o-1", stage: "qualified", valueCents: 600000 }],
      revenue: { upcomingRenewals: [] },
    } as any, [
      { title: "IT support South Africa", url: "https://example.com", snippet: "Demand for managed IT support is growing in South Africa." },
    ]);

    assert.ok(brief.headline.length > 0);
    assert.ok(brief.channels.length >= 2);
    assert.ok(brief.proofPoints.length >= 1);
    assert.ok(brief.action.length > 0);
  });
});
