import type { OfficeSnapshot } from "./types";

export type ReadinessRiskLevel = "healthy" | "watch" | "critical";

export type OperatingReadiness = {
  score: number;
  riskLevel: ReadinessRiskLevel;
  summary: string;
  focus: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function buildOperatingReadiness(snapshot: Partial<OfficeSnapshot> | any): OperatingReadiness {
  const approvals = Array.isArray(snapshot?.approvals) ? snapshot.approvals : [];
  const inbound = Array.isArray(snapshot?.inbound) ? snapshot.inbound : [];
  const tickets = Array.isArray(snapshot?.tickets) ? snapshot.tickets : [];
  const opportunities = Array.isArray(snapshot?.opportunities) ? snapshot.opportunities : [];
  const monthlyRecurringCents = Number(snapshot?.revenue?.monthlyRecurringCents ?? 0);
  const pipelineCents = opportunities
    .filter((opp: any) => opp?.stage !== "lost")
    .reduce((sum: number, opp: any) => sum + Number(opp?.valueCents ?? 0), 0);
  const hardViolations = Number(snapshot?.health?.hardViolations ?? 0);
  const overallHealth = Number(snapshot?.health?.overall ?? 0);

  const pendingApprovals = approvals.filter((item: any) => item?.status === "pending").length;
  const openInbound = inbound.filter((item: any) => item?.status === "received").length;
  const openTickets = tickets.filter((item: any) => item?.status !== "resolved").length;
  const approvedApprovals = approvals.filter((item: any) => item?.status === "approved").length;

  let score = 50;
  score += Math.min(18, approvedApprovals * 3);
  score += Math.min(12, Math.max(0, 6 - pendingApprovals) * 2);
  score += Math.min(10, Math.max(0, 5 - openInbound) * 2);
  score += Math.min(10, Math.max(0, 5 - openTickets) * 2);
  score += Math.min(12, Math.max(0, Math.floor(monthlyRecurringCents / 100000)));
  score += Math.min(14, Math.max(0, Math.floor(pipelineCents / 2000000)));
  score += clamp(Math.round(overallHealth / 2), 0, 18);
  score -= hardViolations * 12;
  score -= snapshot?.company?.halted ? 20 : 0;
  score = clamp(Math.round(score), 0, 100);

  let riskLevel: ReadinessRiskLevel = "healthy";
  if (score < 60) riskLevel = "critical";
  else if (score < 80) riskLevel = "watch";

  const focus: string[] = [];
  if (pendingApprovals > 0) {
    focus.push(`Approve ${pendingApprovals} pending founder action${pendingApprovals === 1 ? "" : "s"}.`);
  }
  if (openInbound > 0) {
    focus.push(`Route ${openInbound} inbound message${openInbound === 1 ? "" : "s"} before they age.`);
  }
  if (openTickets > 0) {
    focus.push(`Review ${openTickets} unresolved ticket${openTickets === 1 ? "" : "s"} in service.`);
  }
  if (hardViolations > 0) {
    focus.push(`The office recorded ${hardViolations} hard governance violation${hardViolations === 1 ? "" : "s"}.`);
  }
  if (focus.length === 0) {
    focus.push("The office is stable, with no active operational blockers to founder attention.");
  }

  const summary =
    score >= 80
      ? "The office is in a strong operating band: sales, governance, and recurring revenue are moving without immediate founder blockers."
      : score >= 60
        ? "The office is stable but needs founder attention in the next review cycle to keep the pipeline and compliance rhythm healthy."
        : "The office needs immediate founder review. Risk is elevated by approvals, backlog, or governance breaches.";

  return {
    score,
    riskLevel,
    summary,
    focus,
  };
}
