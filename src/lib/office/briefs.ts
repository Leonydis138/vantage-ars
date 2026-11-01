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
  opportunities: string[];
};

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

  const opportunitiesList = [
    openInbound > 0 ? "Route the newest inbound work to the correct desk before it ages." : "Keep the inbound queue clean and use the next regular desk review.",
    pipelineCents > 0 ? "Check the strongest opportunity and decide whether to move it forward or keep it in the pipeline." : "Look for one clear, service-led growth angle and keep the pipeline focused.",
    monthlyRecurringCents > 0 ? "Review the recurring book for renewals, churn risk and billing drift." : "Build a repeatable offer and consistent pricing around the concrete service mix.",
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
    opportunities: opportunitiesList,
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
