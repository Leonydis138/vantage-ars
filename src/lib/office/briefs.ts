import type { OfficeSnapshot } from "./types";

export type WebResearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type FounderBrief = {
  title: string;
  summary: string;
  metrics: {
    pendingApprovals: number;
    openInbound: number;
    openTickets: number;
    pipelineCents: number;
    monthlyRecurringCents: number;
  };
  actions: string[];
  risks: string[];
  opportunities: FounderImprovement[];
};

export type FounderImprovement = {
  id: string;
  priority: "high" | "normal";
  title: string;
  evidence: string;
  action: string;
  href: FounderOfficePath;
  linkLabel: string;
};

type FounderOfficePath =
  | "/office/audit"
  | "/office/approvals"
  | "/office/revenue"
  | "/office/service"
  | "/office/inbox"
  | "/office/marketing"
  | "/office/catalogue";

export type MarketingBrief = {
  headline: string;
  angle: string;
  channels: string[];
  proofPoints: string[];
  action: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function buildFounderImprovements(snapshot: Partial<OfficeSnapshot> | any): FounderImprovement[] {
  const improvements: FounderImprovement[] = [];
  const approvals = Array.isArray(snapshot?.approvals) ? snapshot.approvals : [];
  const inbound = Array.isArray(snapshot?.inbound) ? snapshot.inbound : [];
  const tickets = Array.isArray(snapshot?.tickets) ? snapshot.tickets : [];
  const campaigns = Array.isArray(snapshot?.campaigns) ? snapshot.campaigns : [];
  const company = snapshot?.company ?? {};
  const health = snapshot?.health ?? {};
  const revenue = snapshot?.revenue ?? {};

  const hardViolations = Number(health.hardViolations ?? 0);
  const pendingApprovals = approvals.filter((item: any) => item?.status === "pending").length;
  const openInbound = inbound.filter((item: any) => item?.status === "received").length;
  const openTickets = tickets.filter((item: any) => item?.status !== "resolved").length;
  const overdueCents = Number(revenue.overdueCents ?? 0);
  const outstandingCents = Math.max(
    Number(revenue.outstandingCents ?? 0),
    Number(company.receivableCents ?? 0),
  );
  const churnRiskCount = Number(revenue.churnRiskCount ?? 0);

  if (hardViolations > 0) {
    improvements.push({
      id: "governance-exceptions",
      priority: "high",
      title: "Resolve governance exceptions before widening authority",
      evidence: `${hardViolations} hard governance exception${hardViolations === 1 ? " is" : "s are"} recorded.`,
      action: "Review the audit and blocked decisions, record the corrective outcome, and keep delegation limits unchanged until resolved.",
      href: "/office/audit",
      linkLabel: "Review audit",
    });
  }
  if (pendingApprovals > 0) {
    improvements.push({
      id: "approval-backlog",
      priority: "high",
      title: "Clear the founder decision queue",
      evidence: `${pendingApprovals} approval${pendingApprovals === 1 ? " is" : "s are"} waiting for a founder decision.`,
      action: "Review the evidence and decide each item in the approval queue before the office proceeds with gated work.",
      href: "/office/approvals",
      linkLabel: "Open approvals",
    });
  }
  if (overdueCents > 0) {
    improvements.push({
      id: "overdue-invoices",
      priority: "high",
      title: "Review overdue invoices",
      evidence: `${formatCurrency(overdueCents)} is marked overdue in the revenue book.`,
      action: "Check invoice ageing and reconcile only exact, verified receipts; customer reminders still require the appropriate approval.",
      href: "/office/revenue",
      linkLabel: "Review revenue",
    });
  } else if (outstandingCents > 0) {
    improvements.push({
      id: "receivables-review",
      priority: "normal",
      title: "Review open receivables",
      evidence: `${formatCurrency(outstandingCents)} remains in open receivables.`,
      action: "Match incoming payment notices to issued invoices and confirm any remaining follow-up through the founder queue.",
      href: "/office/revenue",
      linkLabel: "Review revenue",
    });
  }
  if (churnRiskCount > 0) {
    improvements.push({
      id: "subscription-risk",
      priority: "high",
      title: "Review subscriptions at risk",
      evidence: `${churnRiskCount} active subscription${churnRiskCount === 1 ? " is" : "s are"} flagged for churn risk.`,
      action: "Inspect the renewal and service records, then decide whether a founder-approved customer follow-up is appropriate.",
      href: "/office/revenue",
      linkLabel: "Review renewals",
    });
  }
  if (openTickets > 0) {
    improvements.push({
      id: "service-backlog",
      priority: "high",
      title: "Reduce the open service backlog",
      evidence: `${openTickets} service or technical item${openTickets === 1 ? " remains" : "s remain"} open.`,
      action: "Confirm ownership and verified next steps for each open item, then update its service record.",
      href: "/office/service",
      linkLabel: "Open service desk",
    });
  }
  if (openInbound > 0) {
    improvements.push({
      id: "inbound-routing",
      priority: "normal",
      title: "Route waiting inbound messages",
      evidence: `${openInbound} inbound message${openInbound === 1 ? " is" : "s are"} still unprocessed.`,
      action: "Confirm each message is classified and assigned to the correct desk before it enters sales or service work.",
      href: "/office/inbox",
      linkLabel: "Open inbox",
    });
  }
  if (campaigns.length === 0) {
    improvements.push({
      id: "owned-channel-campaign",
      priority: "normal",
      title: "Test one owned-channel campaign",
      evidence: "No campaign is recorded in the office campaign book.",
      action: "Request an organic draft tied to a published service, then review it before publication or any sales handoff.",
      href: "/office/marketing",
      linkLabel: "Open marketing",
    });
  }
  if (Number(revenue.activeSubscriptions ?? 0) === 0) {
    improvements.push({
      id: "recurring-offer",
      priority: "normal",
      title: "Review the recurring-service offer",
      evidence: "The revenue book has no active subscriptions.",
      action: "Compare current customer demand with published managed-service plans and approve changes to the offer before quoting them.",
      href: "/office/catalogue",
      linkLabel: "Review catalogue",
    });
  }

  return improvements
    .sort((left, right) => Number(right.priority === "high") - Number(left.priority === "high"))
    .slice(0, 5);
}

export function buildFounderBrief(snapshot: Partial<OfficeSnapshot> | any): FounderBrief {
  const approvals = Array.isArray(snapshot?.approvals) ? snapshot.approvals : [];
  const inbound = Array.isArray(snapshot?.inbound) ? snapshot.inbound : [];
  const opportunities = Array.isArray(snapshot?.opportunities) ? snapshot.opportunities : [];
  const tickets = Array.isArray(snapshot?.tickets) ? snapshot.tickets : [];
  const campaigns = Array.isArray(snapshot?.campaigns) ? snapshot.campaigns : [];

  const pendingApprovals = approvals.filter((a: any) => a?.status === "pending").length;
  const openInbound = inbound.filter((i: any) => i?.status === "received").length;
  const openTickets = tickets.filter((t: any) => t?.status !== "resolved").length;
  const pipelineCents = opportunities
    .filter((o: any) => o?.stage !== "lost")
    .reduce((sum: number, o: any) => sum + Number(o?.valueCents ?? 0), 0);
  const monthlyRecurringCents = Number(snapshot?.revenue?.monthlyRecurringCents ?? 0);

  const actions = [
    pendingApprovals > 0 ? `Review ${pendingApprovals} approval${pendingApprovals > 1 ? "s" : ""} before any customer or money action.` : "No approval queue is waiting at the moment.",
    openInbound > 0 ? `${openInbound} inbound message${openInbound > 1 ? "s are" : " is"} waiting to be routed.` : "Inbound traffic is quiet and can be handled on routine cadence.",
    openTickets > 0 ? `There are ${openTickets} open service or technical items to check.` : "There are no open service items requiring a fast review.",
  ];

  const risks = [
    pipelineCents > 0
      ? `The pipeline holds ${formatCurrency(pipelineCents)} worth of active opportunity value.`
      : "There is no active opportunity value in the pipeline right now.",
    monthlyRecurringCents > 0
      ? `The recurring revenue book is at ${formatCurrency(monthlyRecurringCents)} per month.`
      : "Recurring revenue has not started yet.",
    campaigns.length > 0
      ? `${campaigns.length} campaign${campaigns.length > 1 ? "s are" : " is"} in the funnel for review.`
      : "No active campaigns are in motion.",
  ];

  return {
    title: "Daily brief",
    summary:
      pendingApprovals > 0 || openInbound > 0 || openTickets > 0
        ? "The office is live and the next decisions are mainly operational: approvals, inbound routing, and service follow-through. The strongest business move is to decide the next few actions, then let the office resume its cadence."
        : "The office is stable and in its calm rhythm. The best use of founder time is to review the commercial opportunity, increase quality in the recurring book, and keep the campaign pipeline disciplined.",
    metrics: {
      pendingApprovals,
      openInbound,
      openTickets,
      pipelineCents,
      monthlyRecurringCents,
    },
    actions,
    risks,
    opportunities: buildFounderImprovements(snapshot),
  };
}

export function buildMarketingBrief(
  snapshot: Partial<OfficeSnapshot> | any,
  research: WebResearchResult[] = [],
): MarketingBrief {
  const leads = Array.isArray(snapshot?.leads) ? snapshot.leads : [];
  const campaigns = Array.isArray(snapshot?.campaigns) ? snapshot.campaigns : [];
  const opportunities = Array.isArray(snapshot?.opportunities) ? snapshot.opportunities : [];
  const readyLeads = leads.filter((lead: any) => lead?.stage === "ready_for_sales" || lead?.stage === "in_sales").length;
  const pipelineValue = opportunities
    .filter((opp: any) => opp?.stage !== "lost")
    .reduce((sum: number, opp: any) => sum + Number(opp?.valueCents ?? 0), 0);
  const researchAngle = research[0]?.snippet || "Demand for managed IT support, network operations and proactive support remains strong in South Africa.";
  const candidateChannels: string[] = campaigns.length > 0
    ? Array.from(
        new Set(
          campaigns
            .map((c: any) => (typeof c?.channel === "string" ? c.channel : String(c?.channel ?? "")))
            .filter((channel: unknown): channel is string => Boolean(channel)),
        ),
      )
    : [];
  const channels: string[] = candidateChannels.length >= 2
    ? candidateChannels
    : [...new Set([...(candidateChannels || []), "email", "LinkedIn", "case studies"])].slice(0, 4);

  return {
    headline: "Sell clarity and continuity, not just support.",
    angle:
      `The office should position Vantage-ARS around dependable support, network continuity, and visible operational confidence. ${researchAngle}`,
    channels,
    proofPoints: [
      `${readyLeads} lead${readyLeads === 1 ? "" : "s"} are ready for a sales review or handoff.`,
      `The current opportunity book is worth ${formatCurrency(pipelineValue)} in active value.`,
      research.length > 0 ? `Recent public signals point to demand in ${research[0].title}.` : "The offer is grounded in the office’s recorded customer demand and service work.",
    ],
    action:
      "Create a short campaign brief for managed support and proactive operations, keep the offer specific, require founder approval before paid spend or customer promises, and hand off only leads that match the published scope.",
  };
}
