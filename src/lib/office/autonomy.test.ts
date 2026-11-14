import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  autonomyBudget,
  autonomyPosture,
  autonomySignals,
  breakerOpened,
  effectiveCadenceMinutes,
  isAutonomyPosture,
  RECOVERY_COOLDOWN_MINUTES,
  shouldRecoverFromBreaker,
  type AutonomySignals,
} from "./autonomy.ts";
import type { DutyView } from "./duties.ts";

const NOW = new Date("2026-10-21T10:00:00.000Z").toISOString();

function minutesAgo(minutes: number): string {
  return new Date(Date.parse(NOW) - minutes * 60_000).toISOString();
}

function view(overrides: Partial<DutyView> = {}): DutyView {
  return {
    now: NOW,
    halted: false,
    inbound: [],
    leads: [],
    opportunities: [],
    quotes: [],
    tickets: [],
    ledger: [],
    documents: [],
    notices: [],
    campaigns: [],
    approvalsPending: [],
    staleApprovals: [],
    staleApprovalCount: 0,
    agents: [],
    siteEvents: [],
    chatThreads: [],
    quoteLinks: [],
    subscriptions: [],
    billingCycles: [],
    delegation: null,
    delegationUsage: {
      usedToday: 0,
      spentTodayCents: 0,
      usedThisMonth: 0,
      spentThisMonthCents: 0,
    },
    treasuryCents: 0,
    receivableCents: 0,
    payableCents: 0,
    publishedPathCount: 10,
    chainIntact: true,
    autonomyReadiness: {
      level: "autonomous",
      score: 100,
      headline: "Fully autonomous inside the constitution",
      summary: "No gaps.",
      gaps: [],
      nextActions: [],
    },
    backupConfigured: false,
    work: [],
    ...overrides,
  };
}

function signals(overrides: Partial<AutonomySignals> = {}): AutonomySignals {
  return {
    openWork: 0,
    dueWork: 0,
    urgentTickets: 0,
    unansweredInbound: 0,
    waitingChats: 0,
    undeliveredPeriods: 0,
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe("autonomy signals", () => {
  it("reads the queue and the work that is already due", () => {
    const result = autonomySignals(
      view({
        work: [
          {
            id: "w1",
            agentId: "desk",
            kind: "acknowledge_ticket",
            status: "open",
            attempts: 0,
            maxAttempts: 3,
            dueAt: minutesAgo(5),
            lastError: null,
          },
          {
            id: "w2",
            agentId: "desk",
            kind: "draft_chat_reply",
            status: "open",
            attempts: 0,
            maxAttempts: 3,
            dueAt: new Date(Date.parse(NOW) + 300_000).toISOString(),
            lastError: null,
          },
          {
            id: "w3",
            agentId: "desk",
            kind: "acknowledge_ticket",
            status: "done",
            attempts: 1,
            maxAttempts: 3,
            dueAt: minutesAgo(20),
            lastError: null,
          },
        ],
      }),
      2,
    );

    assert.equal(result.openWork, 2);
    assert.equal(result.dueWork, 1);
    assert.equal(result.consecutiveFailures, 2);
  });

  it("counts only live urgent tickets", () => {
    const result = autonomySignals(
      view({
        tickets: [
          {
            id: "t1",
            title: "Down",
            severity: "p1",
            status: "open",
            ownerAgent: "desk",
            summary: "",
            relatedId: null,
            updatedAt: minutesAgo(10),
          },
          {
            id: "t2",
            title: "Fixed",
            severity: "p0",
            status: "resolved",
            ownerAgent: "desk",
            summary: "",
            relatedId: null,
            updatedAt: minutesAgo(10),
          },
          {
            id: "t3",
            title: "Routine",
            severity: "p3",
            status: "open",
            ownerAgent: "desk",
            summary: "",
            relatedId: null,
            updatedAt: minutesAgo(10),
          },
        ],
      }),
      0,
    );

    assert.equal(result.urgentTickets, 1);
  });

  it("counts inbound and chat only once a customer has waited", () => {
    const result = autonomySignals(
      view({
        inbound: [
          {
            id: "i1",
            channel: "web",
            companyName: "Old",
            subject: "",
            summary: "",
            intent: "enquiry",
            status: "received",
            createdAt: minutesAgo(31),
          },
          {
            id: "i2",
            channel: "web",
            companyName: "New",
            subject: "",
            summary: "",
            intent: "enquiry",
            status: "received",
            createdAt: minutesAgo(5),
          },
        ],
        chatThreads: [
          {
            id: "c1",
            name: "Waiting",
            status: "open",
            updatedAt: minutesAgo(40),
            lastMessageAt: minutesAgo(21),
            unansweredCount: 1,
          },
          {
            id: "c2",
            name: "Fresh",
            status: "open",
            updatedAt: minutesAgo(40),
            lastMessageAt: minutesAgo(2),
            unansweredCount: 1,
          },
        ],
      }),
      0,
    );

    assert.equal(result.unansweredInbound, 1);
    assert.equal(result.waitingChats, 1);
  });

  it("counts a billing period that was billed but not delivered", () => {
    const cycle = {
      id: "b1",
      subscriptionId: "s1",
      companyName: "Acme",
      planId: "managed-support",
      amountCents: 275000,
      status: "invoiced",
      periodStart: minutesAgo(60 * 24 * 30),
      periodEnd: NOW,
      invoiceId: "inv1",
      documentId: null,
      reportDocumentId: null,
      notifiedAt: null,
    };
    const result = autonomySignals(
      view({
        billingCycles: [
          cycle,
          { ...cycle, id: "b2", reportDocumentId: "doc1", notifiedAt: minutesAgo(10) },
          { ...cycle, id: "b3", invoiceId: null },
        ],
      }),
      0,
    );

    assert.equal(result.undeliveredPeriods, 1);
  });
});

describe("autonomy posture", () => {
  it("is idle on an empty office", () => {
    assert.equal(autonomyPosture(signals()), "idle");
  });

  it("is steady when ordinary work is waiting", () => {
    assert.equal(autonomyPosture(signals({ openWork: 1, dueWork: 1 })), "steady");
  });

  it("surges for a live urgent ticket", () => {
    assert.equal(autonomyPosture(signals({ urgentTickets: 1 })), "surge");
  });

  it("surges for a customer who has waited too long", () => {
    assert.equal(autonomyPosture(signals({ unansweredInbound: 1 })), "surge");
    assert.equal(autonomyPosture(signals({ waitingChats: 1 })), "surge");
  });

  it("surges for undelivered billed work", () => {
    assert.equal(autonomyPosture(signals({ undeliveredPeriods: 1 })), "surge");
  });

  it("surges when the queue or its due work crosses the line", () => {
    assert.equal(autonomyPosture(signals({ openWork: 12 })), "surge");
    assert.equal(autonomyPosture(signals({ dueWork: 8 })), "surge");
  });

  it("recovers after repeated failures, and during a probe", () => {
    assert.equal(autonomyPosture(signals({ consecutiveFailures: 3 })), "recovery");
    assert.equal(autonomyPosture(signals(), true), "recovery");
  });

  it("does not let a failure below the line slow the office", () => {
    assert.equal(autonomyPosture(signals({ openWork: 1, consecutiveFailures: 2 })), "steady");
  });
});

describe("autonomy budget", () => {
  it("works harder as the pressure rises", () => {
    const idle = autonomyBudget(signals());
    const steady = autonomyBudget(signals({ openWork: 1 }));
    const surge = autonomyBudget(signals({ urgentTickets: 1 }));
    assert.ok(idle.maxItemsTotal < steady.maxItemsTotal);
    assert.ok(steady.maxItemsTotal < surge.maxItemsTotal);
    assert.ok(idle.maxItemsPerAgent < surge.maxItemsPerAgent);
  });

  it("keeps a recovery tick small and does not accelerate it", () => {
    const recovery = autonomyBudget(signals({ consecutiveFailures: 3 }));
    const steady = autonomyBudget(signals({ openWork: 1 }));
    assert.equal(recovery.posture, "recovery");
    assert.ok(recovery.maxItemsTotal <= steady.maxItemsTotal);
    assert.deepEqual(recovery.acceleratedDuties, []);
  });

  it("accelerates only customer-response duties during a surge", () => {
    const surge = autonomyBudget(signals({ urgentTickets: 1 }));
    assert.equal(surge.posture, "surge");
    assert.ok(surge.acceleratedDuties.includes("desk_acknowledge"));
    assert.ok(!surge.acceleratedDuties.includes("signal_draft_campaign"));
    assert.equal(effectiveCadenceMinutes("desk_acknowledge", 30, surge), 15);
    assert.equal(effectiveCadenceMinutes("signal_draft_campaign", 10080, surge), 10080);
  });

  it("never accelerates a duty below five minutes", () => {
    const surge = autonomyBudget(signals({ urgentTickets: 1 }));
    assert.equal(effectiveCadenceMinutes("foyer_intake", 10, surge), 5);
  });

  it("leaves the cadence alone outside a surge", () => {
    const steady = autonomyBudget(signals({ openWork: 1 }));
    assert.equal(effectiveCadenceMinutes("desk_acknowledge", 30, steady), 30);
  });
});

describe("circuit-breaker recovery", () => {
  it("waits for the cooldown", () => {
    assert.equal(shouldRecoverFromBreaker(10, 5, 5), false);
    assert.equal(shouldRecoverFromBreaker(RECOVERY_COOLDOWN_MINUTES, 5, 5), true);
  });

  it("does not probe below the failure limit or without a tick", () => {
    assert.equal(shouldRecoverFromBreaker(999, 4, 5), false);
    assert.equal(shouldRecoverFromBreaker(null, 5, 5), false);
  });

  it("opens the breaker once, on the tick that crosses the limit", () => {
    assert.equal(breakerOpened(4, true, 5), true);
    assert.equal(breakerOpened(5, true, 5), false);
    assert.equal(breakerOpened(4, false, 5), false);
    assert.equal(breakerOpened(0, true, 5), false);
  });

  it("accepts only the four postures", () => {
    for (const value of ["idle", "steady", "surge", "recovery"]) {
      assert.equal(isAutonomyPosture(value), true);
    }
    assert.equal(isAutonomyPosture("busy"), false);
    assert.equal(isAutonomyPosture(null), false);
  });
});
