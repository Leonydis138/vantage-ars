import { randomUUID } from "node:crypto";
import { getSql } from "../db";
import { followUpLetter, planFloor, serviceAckLetter, technicalFix } from "./floor";
import { applyProposedAction, readSnapshot } from "./store.server";
import { sendCustomerMail } from "./smtp.server";

/**
 * Customer mail is off by default. Only the authenticated founder-triggered
 * floor run explicitly opts into sending its fixed, reviewed templates.
 */
export async function operateFloor(
  options: { sendMail?: boolean } = {},
): Promise<{ ok: true; briefing: string; executed: number }> {
  const mail = options.sendMail === true;
  const snapshot = await readSnapshot();
  if (snapshot.company.halted) return { ok: true, briefing: "Office is halted.", executed: 0 };
  const tasks = planFloor({
    campaigns: snapshot.campaigns,
    leads: snapshot.leads,
    inbound: snapshot.inbound,
    documents: snapshot.documents,
    tickets: snapshot.tickets,
  });
  let executed = 0;
  const notes: string[] = [];
  for (const task of tasks) {
    if (task.kind === "organic_campaign") {
      const result = await applyProposedAction(
        "signal",
        {
          kind: "activate_campaign",
          title: "Owned site",
          rationale:
            "Organic marketing on vantage-ars.co.za. Budget R0. No media is bought. No customer is offered a private price.",
          confidence: 0.95,
          amountCents: 0,
          payload: { channel: "owned" },
        },
        { source: "floor" },
      );
      if (result.status === "executed") {
        executed += 1;
        notes.push("Marketing is running on the owned site at no cost.");
      }
    }
    if (task.kind === "follow_up") {
      const letter = followUpLetter(task.companyName);
      const sent =
        task.email && mail
          ? await sendCustomerMail(task.email, "Vantage-ARS has your enquiry", letter)
          : { ok: false };
      const sql = await getSql();
      await sql`
        insert into documents (id, title, kind, status, summary, related_id)
        values (
          ${randomUUID()},
          ${`Follow-up · ${task.companyName}`},
          'follow_up',
          ${sent.ok ? "sent" : "draft"},
          ${letter},
          ${task.leadId}
        )
      `;
      executed += 1;
      notes.push(
        sent.ok
          ? `Follow-up sent to ${task.companyName}. It is not a quote.`
          : `Follow-up drafted for ${task.companyName}. It was not emailed.`,
      );
    }
    if (task.kind === "service_ack") {
      const letter = serviceAckLetter(task.companyName);
      const sent =
        task.email && mail
          ? await sendCustomerMail(task.email, "Vantage-ARS has the service request", letter)
          : { ok: false };
      const sql = await getSql();
      await sql`
        insert into documents (id, title, kind, status, summary, related_id)
        values (
          ${randomUUID()},
          ${`Service acknowledgement · ${task.companyName}`},
          'service_ack',
          ${sent.ok ? "sent" : "draft"},
          ${letter},
          ${task.ticketId}
        )
      `;
      executed += 1;
      notes.push(
        sent.ok
          ? `Service acknowledgement sent to ${task.companyName}.`
          : `Service acknowledgement drafted for ${task.companyName}. It was not emailed.`,
      );
    }
    if (task.kind === "diagnose") {
      const result = await applyProposedAction(
        "forge",
        {
          kind: "draft_document",
          title: `Technical plan · ${task.title}`,
          rationale: technicalFix(task.summary),
          confidence: 0.85,
          amountCents: 0,
          relatedId: task.ticketId,
          payload: { kind: "technical_plan" },
        },
        { source: "floor" },
      );
      if (result.status === "executed") {
        executed += 1;
        notes.push(
          `Technical prepared a draft plan for ${task.title}. Founder approval is required before work starts.`,
        );
      } else {
        notes.push(
          `The technical plan for ${task.title} was ${result.status}; no work was started.`,
        );
      }
    }
  }
  if (!notes.length) notes.push("Nothing new to run. No customers were invented.");
  return { ok: true, briefing: notes.join(" "), executed };
}
