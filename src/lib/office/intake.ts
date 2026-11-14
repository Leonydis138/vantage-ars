import type { ProposedAction } from "./types";
import { rateAmountLabel } from "./catalogue";

const LINES: { id: string; title: string; words: string[] }[] = [
  {
    id: "voip",
    title: "VoIP & telecoms",
    words: [
      "voip",
      "sip",
      "pbx",
      "pabx",
      "trunk",
      "trunks",
      "handset",
      "handsets",
      "telephony",
      "extension",
      "extensions",
      "call quality",
      "dial tone",
      "3cx",
      "asterisk",
      "freepbx",
      "softphone",
      "ivr",
      "did number",
    ],
  },
  {
    id: "network",
    title: "Networking",
    words: [
      "network",
      "networks",
      "networking",
      "wifi",
      "wi-fi",
      "wlan",
      "vlan",
      "switch",
      "router",
      "routers",
      "cabling",
      "cable",
      "cables",
      "access point",
      "access points",
      "lan",
      "wan",
      "vpn",
      "fibre",
      "fiber",
      "dns",
      "dhcp",
    ],
  },
  {
    id: "infra",
    title: "IT infrastructure",
    words: [
      "server",
      "servers",
      "infrastructure",
      "firewall",
      "backup",
      "backups",
      "active directory",
      "laptop",
      "workstation",
      "nas",
      "hypervisor",
      "proxmox",
      "vmware",
      "hyper-v",
      "virtual machine",
    ],
  },
];

const COMMERCIAL = [
  "quote",
  "quotation",
  "price",
  "pricing",
  "how much",
  "invoice",
  "book",
  "booking",
  "proposal",
  "install",
  "installation",
  "cost",
  "rates",
  "estimate",
];
const SUPPORT = [
  "down",
  "broken",
  "fault",
  "faulty",
  "outage",
  "not working",
  "one-way",
  "no dial",
  "no dial tone",
  "dropping",
  "cannot connect",
  "can't connect",
  "no connection",
];
const RISK = [
  "refund",
  "complaint",
  "unhappy",
  "dispute",
  "cancel",
  "terrible service",
  "chargeback",
  "lawyer",
];

const patternCache = new Map<string, RegExp>();

/** Whole-word / whole-phrase match so "sip" does not fire on "gossip" or "down" on "download". */
export function hasTerm(text: string, term: string): boolean {
  let pattern = patternCache.get(term);
  if (!pattern) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u");
    patternCache.set(term, pattern);
  }
  return pattern.test(text);
}

export type EnquiryClass = {
  lines: string[];
  commercial: boolean;
  support: boolean;
  risk: boolean;
  score: number;
  stage: "qualified" | "engaged" | "needs_detail";
};

export function classifyEnquiry(message: string): EnquiryClass {
  const text = message.toLowerCase();
  const lines = LINES.filter((line) => line.words.some((word) => hasTerm(text, word))).map(
    (line) => line.title,
  );
  const commercial = COMMERCIAL.some((word) => hasTerm(text, word));
  const support = SUPPORT.some((word) => hasTerm(text, word));
  const risk = RISK.some((word) => hasTerm(text, word));
  const stage = lines.length === 0 ? "needs_detail" : commercial ? "qualified" : "engaged";
  const score = lines.length === 0 ? 25 : commercial ? 85 : 60;
  return { lines, commercial, support, risk, score, stage };
}

export function intakeDestination(
  classification: EnquiryClass,
  forceDesk = false,
): "desk" | "signal" {
  if (forceDesk || classification.support || classification.risk) return "desk";
  return "signal";
}

export function safePartyName(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const lower = cleaned.toLowerCase();
  const unsafe = ["ignore", "instruction", "system prompt", "stupid", "hate", "scam"];
  if (!cleaned || unsafe.some((word) => hasTerm(lower, word))) return "the enquirer";
  return cleaned;
}

export function acknowledgementDraft(input: {
  party: string;
  inboundId: string;
  classification: EnquiryClass;
}): string {
  const matched =
    input.classification.lines.length > 0
      ? input.classification.lines.join(", ")
      : "no published service line matched";
  return [
    "INTERNAL DRAFT. This message has not been sent.",
    `Enquiry from ${input.party} on vantage-ars.co.za, record ${input.inboundId}.`,
    `Catalogue match: ${matched}.`,
    "No scope, date, or price is confirmed.",
    `Published labour, only inside a later written quote: remote ${rateAmountLabel("remote-support")} per hour, on-site ${rateAmountLabel("onsite-support")} per hour.`,
    `The managed support plan is offered at ${rateAmountLabel("managed-support")} per month, remote only, with no uptime promise.`,
  ].join(" ");
}

export async function processWebsiteEnquiry(input: {
  inboundId: string;
  name: string;
  message: string;
  desk?: boolean;
  matter?: "fault" | "question" | "complaint";
}): Promise<{ handoff: boolean; ticket: boolean }> {
  const raw = classifyEnquiry(input.message);
  const classification: EnquiryClass = {
    ...raw,
    support: raw.support || input.matter === "fault",
    risk: raw.risk || input.matter === "complaint",
  };
  const party = safePartyName(input.name);
  const { applyProposedAction } = await import("./store.server");
  const observation = { source: "vantage-ars.co.za", inboundId: input.inboundId };

  const destination = intakeDestination(classification, input.desk === true);
  const route: ProposedAction = {
    kind: "route_inbound",
    title: `Route website enquiry`,
    rationale:
      destination === "desk"
        ? `FOYER files website enquiry ${input.inboundId} to customer service. No reply is sent.`
        : `FOYER files website enquiry ${input.inboundId} to marketing. No reply is sent.`,
    confidence: 0.9,
    amountCents: 0,
    companyName: party,
    relatedId: input.inboundId,
    payload: { routedTo: destination },
  };
  await applyProposedAction("foyer", route, observation);

  const draft: ProposedAction = {
    kind: "draft_reply",
    title: `Unsent acknowledgement`,
    rationale: "Reception draft only. Delivery is not configured.",
    confidence: 0.9,
    amountCents: 0,
    companyName: party,
    relatedId: input.inboundId,
    payload: {
      body: acknowledgementDraft({
        party,
        inboundId: input.inboundId,
        classification,
      }),
    },
  };
  await applyProposedAction("foyer", draft, observation);

  const service = input.desk === true || classification.support || classification.risk;
  if (!service || classification.commercial) {
    const lead: ProposedAction = {
      kind: "create_lead",
      title: `Website lead`,
      rationale: `Marketing review for ${party}. Catalogue: ${classification.lines.join(", ") || "unmatched"}.`,
      confidence: 0.86,
      amountCents: 0,
      companyName: party,
      relatedId: input.inboundId,
      payload: { source: "web", stage: classification.stage, score: classification.score },
    };
    await applyProposedAction("signal", lead, observation);
  }

  let ticket = false;
  if (service) {
    ticket = true;
    await applyProposedAction(
      "desk",
      {
        kind: "open_ticket",
        title: "Service case",
        rationale:
          "Customer service owns this conversation. No reply has been sent. No refund, credit, or new sale is included.",
        confidence: 0.9,
        amountCents: 0,
        companyName: party,
        relatedId: input.inboundId,
        payload: { severity: classification.risk ? "p2" : "p3", owner: "desk" },
      },
      observation,
    );
  }
  if (classification.support) {
    ticket = true;
    await applyProposedAction(
      "forge",
      {
        kind: "open_ticket",
        title: "Website fault noted",
        rationale:
          "Technical fault noted from a website enquiry. No purchase and no customer concession.",
        confidence: 0.84,
        amountCents: 0,
        companyName: party,
        relatedId: input.inboundId,
        payload: { severity: "p3", owner: "forge" },
      },
      observation,
    );
  }
  if (classification.risk) {
    await applyProposedAction(
      "desk",
      {
        kind: "escalate_account_risk",
        title: "Account risk",
        rationale:
          "The enquiry uses cancellation, complaint, or refund language. The desk stops. No concession until the founder approves.",
        confidence: 0.9,
        amountCents: 0,
        companyName: party,
        relatedId: input.inboundId,
        payload: {},
      },
      observation,
    );
  }

  let handoff = false;
  if (classification.commercial && classification.lines.length > 0) {
    const { getSql } = await import("../db");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      select id from leads where inbound_id = ${input.inboundId} order by created_at desc limit 1
    `;
    const leadId = rows[0]?.id;
    if (leadId) {
      handoff = true;
      await applyProposedAction(
        "signal",
        {
          kind: "handoff_to_sales",
          title: `Sales handoff`,
          rationale: `${party} asked about paid work on ${classification.lines.join(", ")}. Marketing stops. No offer is made until the founder approves.`,
          confidence: 0.88,
          amountCents: 0,
          companyName: party,
          relatedId: leadId,
          payload: {},
        },
        observation,
      );
    }
  }

  const { operateFloor } = await import("./floor.server");
  await operateFloor({ sendMail: false });
  return { handoff, ticket };
}
