import { rateAmountLabel } from "./catalogue";

export type FloorTask =
  | { kind: "organic_campaign" }
  | {
      kind: "follow_up";
      leadId: string;
      companyName: string;
      email: string | null;
      summary: string;
    }
  | {
      kind: "service_ack";
      ticketId: string;
      companyName: string;
      email: string | null;
    }
  | { kind: "diagnose"; ticketId: string; title: string; summary: string };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function emailIn(summary: string): string | null {
  const found = summary.match(/Email:\s*([^\s]+)/i)?.[1] ?? summary.match(EMAIL)?.[0] ?? "";
  const email = found.replace(/[),.;]+$/, "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}

export function followUpLetter(companyName: string): string {
  const name = companyName.trim() || "there";
  return [
    `Hello ${name},`,
    "Vantage-ARS has your enquiry.",
    "This email is not a quote and it does not confirm scope or a start date.",
    `Published labour, only if a later written quote uses it: remote ${rateAmountLabel("remote-support")} per hour, on-site ${rateAmountLabel("onsite-support")} per hour.`,
    `A quote is sent only after it is approved. The managed support plan is offered at ${rateAmountLabel("managed-support")} per month, remote only, with no uptime promise.`,
  ].join("\n");
}

export function serviceAckLetter(companyName: string): string {
  const name = companyName.trim() || "there";
  return [
    `Hello ${name},`,
    "Vantage-ARS has the service request.",
    "This email does not refund, cancel, credit, or quote anything.",
    "Technical work is recorded against the fault. We do not claim a fix on equipment we have not been given access to.",
  ].join("\n");
}

export function technicalFix(report: string): string {
  const text = report.toLowerCase();
  let steps =
    "Confirm the device, the site, and the last change. Test one path. Record what changed.";
  if (
    text.includes("one-way") ||
    text.includes("one way") ||
    text.includes("rtp") ||
    text.includes("no audio")
  ) {
    steps =
      "On the PBX, confirm the RTP port range and that NAT rewrites the media address. On the router, disable SIP ALG. On the handset, match the codec to the trunk. Place one test call and check whether audio is now both ways.";
  } else if (
    text.includes("dial tone") ||
    text.includes("no dial") ||
    text.includes("register") ||
    text.includes("sip")
  ) {
    steps =
      "Check the handset registration, the SIP password, and that the PBX can reach the trunk. Restart registration once. Do not change the dial plan until registration is up.";
  } else if (
    text.includes("wifi") ||
    text.includes("wi-fi") ||
    text.includes("access point") ||
    text.includes("wireless")
  ) {
    steps =
      "Check the access point power, the SSID, and the channel overlap. Reconnect one client. If that client stays up, the fault is not the whole site.";
  } else if (text.includes("vlan") || text.includes("switch") || text.includes("network")) {
    steps =
      "Check the port VLAN, the uplink, and whether the gateway answers. Do not widen a VLAN to make a device appear.";
  } else if (text.includes("backup") || text.includes("server") || text.includes("disk")) {
    steps =
      "Check that the last backup job finished and that the disk is mounted. Do not delete data to free space.";
  }
  return `FORGE: ${steps} Customer equipment was not accessed from this office, so the fault is not marked fixed. Reported: ${report.trim()}`;
}

export function planFloor(input: {
  campaigns: { status: string; budgetCents: number; channel: string }[];
  leads: {
    id: string;
    companyName: string;
    stage: string;
    inboundId: string | null;
    summary: string;
  }[];
  inbound: { id: string; summary: string; companyName: string }[];
  documents: { kind: string; relatedId: string | null }[];
  tickets: {
    id: string;
    title: string;
    summary: string;
    status: string;
    ownerAgent: string;
    relatedId: string | null;
  }[];
}): FloorTask[] {
  const tasks: FloorTask[] = [];
  const organic = input.campaigns.some(
    (item) => item.channel === "owned" && item.status === "active" && item.budgetCents === 0,
  );
  if (!organic) tasks.push({ kind: "organic_campaign" });

  const followed = new Set(
    input.documents
      .filter((item) => item.kind === "follow_up" && item.relatedId)
      .map((item) => item.relatedId),
  );
  const acked = new Set(
    input.documents
      .filter((item) => item.kind === "service_ack" && item.relatedId)
      .map((item) => item.relatedId),
  );
  const planned = new Set(
    input.documents
      .filter((item) => item.kind === "technical_plan" && item.relatedId)
      .map((item) => item.relatedId),
  );
  const leadInbound = new Set(
    input.leads.map((lead) => lead.inboundId).filter((id): id is string => Boolean(id)),
  );
  const inboundById = new Map(input.inbound.map((item) => [item.id, item]));

  for (const lead of input.leads) {
    if (followed.has(lead.id) || lead.stage === "lost") continue;
    const source = lead.inboundId ? inboundById.get(lead.inboundId) : undefined;
    tasks.push({
      kind: "follow_up",
      leadId: lead.id,
      companyName: lead.companyName,
      email: source ? emailIn(source.summary) : emailIn(lead.summary),
      summary: lead.summary,
    });
  }

  for (const ticket of input.tickets) {
    if (ticket.ownerAgent !== "desk" || ticket.status === "resolved" || acked.has(ticket.id))
      continue;
    if (ticket.relatedId && leadInbound.has(ticket.relatedId)) continue;
    const source = ticket.relatedId ? inboundById.get(ticket.relatedId) : undefined;
    tasks.push({
      kind: "service_ack",
      ticketId: ticket.id,
      companyName: source?.companyName ?? "Customer",
      email: source ? emailIn(source.summary) : null,
    });
  }

  for (const ticket of input.tickets) {
    if ((ticket.ownerAgent !== "forge" && ticket.ownerAgent !== "keep") || ticket.status !== "open")
      continue;
    if (ticket.summary.startsWith("FORGE:") || planned.has(ticket.id)) continue;
    tasks.push({
      kind: "diagnose",
      ticketId: ticket.id,
      title: ticket.title,
      summary: ticket.summary,
    });
  }

  return tasks;
}
