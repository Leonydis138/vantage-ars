/**
 * The planner and the runner registry must agree.
 *
 * Every duty plans work items by `kind`, and the scheduler executes them by
 * looking that kind up in `RUNNERS`. If a planner emits a kind with no runner,
 * the item is filed, reported as done by the queue, and never actually runs —
 * a silent hole that planner-only unit tests cannot see. This test plans every
 * duty against a busy office and proves every kind it can produce is one a
 * registered runner will actually execute.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DUTY_CADENCE_MINUTES, planDuty, type DutyId, type DutyView } from "./duties";
import { RUNNERS } from "./duty-runners.server";

const NOW = "2026-03-14T09:00:00.000Z";
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

const ALL_DUTIES = Object.keys(DUTY_CADENCE_MINUTES) as DutyId[];

/**
 * A single, comprehensive office state in which every duty has real work to
 * find. If a duty plans nothing here the self-check below fails loudly, so the
 * fixture cannot silently stop exercising a duty.
 */
function busyView(): DutyView {
  return {
    now: NOW,
    halted: false,
    subscriptions: [
      {
        id: "sub1",
        companyName: "Delta",
        planId: "health-watch",
        rateId: "health-watch",
        cycle: "monthly",
        priceCents: 99000,
        status: "active",
        nextBillingAt: daysAgo(10),
        startedAt: daysAgo(40),
        contactEmail: "accounts@delta.example",
      },
    ],
    billingCycles: [
      {
        id: "cy1",
        subscriptionId: "sub1",
        companyName: "Delta",
        planId: "health-watch",
        amountCents: 99000,
        status: "invoiced",
        periodStart: daysAgo(30),
        periodEnd: daysAgo(1),
        invoiceId: "lg2",
        documentId: "dc3",
        reportDocumentId: null,
        notifiedAt: null,
      },
      {
        id: "cy2",
        subscriptionId: "sub1",
        companyName: "Delta",
        planId: "health-watch",
        amountCents: 99000,
        status: "fulfilled",
        periodStart: daysAgo(60),
        periodEnd: daysAgo(31),
        invoiceId: "lg3",
        documentId: "dc4",
        reportDocumentId: "dc5",
        notifiedAt: null,
      },
    ],
    delegation: {
      id: "primary",
      label: "Managed revenue",
      status: "active",
      maxAmountCents: 500000,
      maxActionsPerDay: 20,
      maxActionsPerMonth: 200,
      allowedActions: [
        "open_opportunity",
        "issue_quote",
        "issue_invoice",
        "record_inbound_payment",
        "start_subscription",
        "cancel_subscription",
        "fulfil_service",
        "send_customer_mail",
      ],
      allowedRateIds: [
        "remote-support",
        "onsite-support",
        "after-hours",
        "assessment",
        "survey",
        "network-setup",
        "network-point",
        "voip-diagnosis",
        "pbx-design",
        "pbx-install",
        "infra-assessment",
        "infra-change",
        "managed-support",
        "health-watch",
        "service-report",
        "billing-audit",
        "handover-pack",
        "continuity-plan",
        "sla-review",
        "third-party",
        "travel",
      ],
      allowCustomerMail: true,
      allowAutoReconcile: true,
      requireAcceptedQuote: false,
    },
    inbound: [
      {
        id: "in1",
        channel: "web",
        companyName: "Acme",
        subject: "Need a quote",
        summary: "We need help with our phone system, how much for 20 extensions?",
        intent: "enquiry",
        status: "received",
        createdAt: hoursAgo(6),
      },
      {
        id: "in2",
        channel: "web",
        companyName: "Beta",
        subject: "Payment sent",
        summary: "EFT sent this morning, reference BETA-1.",
        intent: "payment_notice",
        status: "received",
        createdAt: hoursAgo(1),
      },
      {
        id: "in3",
        channel: "web",
        companyName: "Eta",
        subject: "Health and spend watch",
        summary: "Email: ops@eta.example We need a health and spend watch for 15 users.",
        intent: "enquiry",
        status: "received",
        createdAt: hoursAgo(3),
      },
    ],
    leads: [
      {
        id: "ld1",
        companyName: "Acme",
        stage: "engaged",
        score: 40,
        summary: "We need help with our phone system, how much for 20 extensions?",
        inboundId: null,
        updatedAt: hoursAgo(1),
      },
      {
        id: "ld2",
        companyName: "Gamma",
        stage: "nurture",
        score: 15,
        summary: "Asked what a phone system costs but gave no detail.",
        inboundId: null,
        updatedAt: hoursAgo(2),
      },
    ],
    opportunities: [
      {
        id: "op1",
        companyName: "Acme",
        stage: "discovery",
        valueCents: 0,
        summary: "Phone system",
        updatedAt: hoursAgo(1),
      },
      {
        id: "op2",
        companyName: "Delta",
        stage: "proposal",
        valueCents: 320000,
        summary: "Migration",
        updatedAt: hoursAgo(4),
      },
      {
        id: "op4",
        companyName: "Delta",
        stage: "won",
        valueCents: 275000,
        summary: "Managed support plan accepted",
        updatedAt: daysAgo(20),
      },
      {
        id: "op5",
        companyName: "Epsilon",
        stage: "won",
        valueCents: 120000,
        summary: "Cabling signed off, nothing filed",
        updatedAt: daysAgo(9),
      },
      {
        id: "op6",
        companyName: "Zeta",
        stage: "won",
        valueCents: 275000,
        summary: "Managed support plan accepted",
        updatedAt: daysAgo(12),
      },
      {
        id: "op3",
        companyName: "Epsilon",
        stage: "proposal",
        valueCents: 120000,
        summary: "Cabling",
        updatedAt: daysAgo(20),
      },
      {
        id: "op8",
        companyName: "Zeta",
        stage: "won",
        valueCents: 644000,
        summary: "PBX install",
        updatedAt: daysAgo(2),
      },
      {
        id: "op7",
        companyName: "Eta",
        stage: "discovery",
        valueCents: 0,
        summary: "Health and spend watch for 15 users",
        updatedAt: hoursAgo(3),
      },
    ],
    quotes: [
      {
        id: "q1",
        title: "Quote · Delta",
        kind: "quote",
        status: "approved_unsent",
        relatedId: "op2",
        createdAt: daysAgo(3),
      },
      {
        id: "q3",
        title: "Quote · Acme",
        kind: "quote",
        status: "approved_unsent",
        relatedId: "op1",
        createdAt: daysAgo(5),
      },
      {
        id: "q2",
        title: "Quote · Zeta",
        kind: "quote",
        status: "accepted",
        relatedId: "op6",
        createdAt: daysAgo(12),
        // The accepted quote for a recurring plan, so the duty that starts a
        // subscription has a published rate line to read the plan from.
        rateId: "health-watch",
      },
    ],
    tickets: [
      {
        id: "tk1",
        title: "No dial tone",
        severity: "p1",
        status: "open",
        ownerAgent: "forge",
        summary: "No dial tone on the trunk",
        relatedId: null,
        updatedAt: hoursAgo(1),
      },
      {
        id: "tk2",
        title: "Install PBX at Zeta",
        severity: "p2",
        status: "open",
        ownerAgent: "forge",
        summary: "Delivery job for the won deal.",
        relatedId: "op8",
        updatedAt: hoursAgo(2),
      },
      {
        id: "tk5",
        title: "Close Epsilon delivery",
        severity: "p2",
        status: "open",
        ownerAgent: "forge",
        summary: "Delivery job for won work with no accepted quote.",
        relatedId: "op5",
        updatedAt: hoursAgo(4),
      },
      {
        id: "tk3",
        title: "Complaint about billing",
        severity: "p1",
        status: "open",
        ownerAgent: "desk",
        summary: "Customer unhappy with the invoice.",
        relatedId: null,
        updatedAt: daysAgo(1),
      },
      {
        id: "tk4",
        title: "Switch port replaced",
        severity: "p3",
        status: "resolved",
        ownerAgent: "forge",
        summary: "FORGE: replaced the dead port and tested the link.",
        relatedId: null,
        updatedAt: daysAgo(3),
      },
    ],
    ledger: [
      {
        id: "lg1",
        kind: "invoice",
        counterparty: "Delta",
        amountCents: 320000,
        status: "issued",
        relatedId: "op1",
        createdAt: daysAgo(30),
      },
    ],
    documents: [
      {
        id: "dc5",
        title: "Managed support plan · Delta",
        kind: "service_report",
        status: "delivered",
        relatedId: "cy2",
        createdAt: daysAgo(30),
      },
      {
        id: "dc4",
        title: "Invoice · Delta",
        kind: "invoice",
        status: "approved_unsent",
        relatedId: "cy2",
        createdAt: daysAgo(31),
      },
      {
        id: "dc3",
        title: "Invoice · Delta",
        kind: "invoice",
        status: "approved_unsent",
        relatedId: "cy1",
        createdAt: daysAgo(1),
      },
      {
        id: "dc1",
        title: "Quote · Acme",
        kind: "quote",
        status: "approved_unsent",
        relatedId: "op1",
        createdAt: daysAgo(5),
      },
      {
        id: "dc2",
        title: "Quote · Delta",
        kind: "quote",
        status: "approved_unsent",
        relatedId: "op2",
        createdAt: daysAgo(3),
      },
      {
        id: "dc6",
        title: "Quote · Delta",
        kind: "quote",
        status: "accepted",
        relatedId: "op4",
        createdAt: daysAgo(20),
      },
      {
        id: "dc7",
        title: "Quote · Zeta",
        kind: "quote",
        status: "accepted",
        relatedId: "op6",
        createdAt: daysAgo(12),
      },
    ],
    campaigns: [],
    approvalsPending: [
      {
        id: "ap1",
        kind: "sales_handoff",
        title: "Handoff",
        companyName: "Delta",
        createdAt: hoursAgo(1),
      },
      {
        id: "ap2",
        kind: "constraint_margin",
        title: "Unsure about role",
        companyName: "Acme",
        createdAt: hoursAgo(2),
      },
    ],
    staleApprovals: [
      {
        id: "ap3",
        kind: "customer_win",
        title: "Approve customer win",
        companyName: "Delta",
        createdAt: daysAgo(10),
      },
    ],
    staleApprovalCount: 1,
    agents: [{ id: "foyer", callsign: "FOYER", status: "idle", lastHeartbeat: null }],
    siteEvents: [
      { kind: "page_view", path: "/rates", occurredAt: hoursAgo(2) },
      { kind: "page_view", path: "/", occurredAt: hoursAgo(3) },
    ],
    chatThreads: [
      {
        id: "ct1",
        name: "Site chat",
        status: "open",
        updatedAt: hoursAgo(2),
        lastMessageAt: hoursAgo(1),
        unansweredCount: 2,
      },
    ],
    quoteLinks: [],
    notices: [],
    treasuryCents: 100000,
    receivableCents: 50000,
    payableCents: 25000,
    publishedPathCount: 8,
    chainIntact: false,
    work: [
      {
        id: "w1",
        agentId: "signal",
        kind: "qualify_lead",
        status: "open",
        attempts: 1,
        maxAttempts: 3,
        dueAt: daysAgo(1),
        lastError: null,
      },
      {
        id: "w2",
        agentId: "signal",
        kind: "qualify_lead",
        status: "open",
        attempts: 1,
        maxAttempts: 3,
        dueAt: daysAgo(1),
        lastError: null,
      },
      {
        id: "w3",
        agentId: "close",
        kind: "advance_discovery",
        status: "open",
        attempts: 2,
        maxAttempts: 3,
        dueAt: daysAgo(1),
        lastError: "timeout",
      },
      {
        id: "w4",
        agentId: "ledger",
        kind: "report_payables",
        status: "abandoned",
        attempts: 3,
        maxAttempts: 3,
        dueAt: daysAgo(2),
        lastError: "database down",
      },
    ],
  };
}

describe("planner and runner registry agree", () => {
  it("every duty on a busy office produces only work a registered runner executes", () => {
    const busy = busyView();
    const planned = new Map<DutyId, string[]>();
    for (const duty of ALL_DUTIES) {
      planned.set(
        duty,
        planDuty(duty, busy).map((item) => item.kind),
      );
    }

    // Self-check: the fixture must exercise every duty, or this test silently
    // skips the very duty that has a hole.
    const silent = ALL_DUTIES.filter((duty) => (planned.get(duty) ?? []).length === 0);
    assert.deepEqual(
      silent,
      [],
      `these duties planned nothing on the busy fixture: ${silent.join(", ")}`,
    );

    for (const [duty, kinds] of planned) {
      for (const kind of kinds) {
        assert.ok(
          RUNNERS[kind],
          `${duty} plans work of kind "${kind}" but no runner is registered for it`,
        );
      }
    }
  });
});
