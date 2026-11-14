/**
 * End-to-end proof that the office runs itself.
 *
 * This is NOT a mock and NOT sample data: it boots the real application
 * modules against a real embedded Postgres (PGLite), creates only records the
 * public site would really create (a form enquiry, a support request, a chat
 * message), then runs the real scheduler tick and asserts on what the real
 * agents actually did.
 *
 * It is the check that "the office works autonomously" is a fact rather than a
 * claim. Run with:
 *
 *   npm run verify:office
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A real on-disk Postgres so nothing is held in memory between steps.
const dataDir = mkdtempSync(join(tmpdir(), "vantage-office-verify-"));
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
process.env.AUTONOMY = "on";
process.env.FOUNDER_EMAIL = "founder@vantage-ars.co.za";

const checks = [];
let failures = 0;

/**
 * A deterministic clock.
 *
 * Duties keep their own cadence, so the first tick marks them all "just ran"
 * and the second tick correctly finds nothing due. To exercise the office the
 * way a real day does, the harness advances its own reference time instead of
 * sleeping. The records are real; only the clock moves.
 */
const T0 = Date.now();
let minutes = 0;
const at = () => new Date(T0 + minutes * 60_000).toISOString();
/** Advance the clock past every duty cadence, then run the office. */
let advanceAndTick = async (byMinutes) => {
  minutes += byMinutes;
  throw new Error("scheduler not wired");
};

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  checks.push({ name, ok, detail });
  process.stdout.write(
    `${ok ? "  ok  " : " FAIL "} ${name}${detail && !ok ? ` — ${detail}` : ""}\n`,
  );
}

async function main() {
  const { getSql } = await import("../src/lib/db.ts");
  const { ensureOffice, applyProposedAction, readSnapshot, logInboundItem, resolveApproval } =
    await import("../src/lib/office/store.server.ts");
  const { tick, schedulerStatus } = await import("../src/lib/office/scheduler.server.ts");
  advanceAndTick = async (byMinutes) => {
    minutes += byMinutes;
    return tick({ now: at() });
  };
  const { listWork, workCounts, enqueueWork, claimWork, failWork } =
    await import("../src/lib/office/work-queue.server.ts");
  const { redriveAbandonedWork } = await import("../src/lib/office/redrive.server.ts");
  const { officeHealth } = await import("../src/lib/office/health.server.ts");
  const { verifyChainLinks } = await import("../src/lib/office/integrity.ts");
  const { processWebsiteEnquiry } = await import("../src/lib/office/intake.ts");

  const sql = await getSql();

  // ── 1. Provision ────────────────────────────────────────────────────────────
  await ensureOffice();
  const company = await sql`select * from company_state where id = 'vantage-ars'`;
  check("office provisions itself", company.length === 1);
  const agents = await sql`select id, callsign from agents order by callsign`;
  check("ten identities are issued", agents.length === 10, `got ${agents.length}`);

  const firstTick = await tick({ now: at() });
  check("first tick is healthy", firstTick.ok, firstTick.detail);

  // ── 2. Real inbound, exactly as the public form produces it ─────────────────
  const buyingInbound = await logInboundItem({
    channel: "web",
    companyName: "Harbour Point Dental",
    subject: "Replacing a 4-year-old PBX for 18 staff",
    summary: [
      "Email: admin@harbourpoint.example",
      "Source: vantage-ars.co.za enquiry form. No automated reply sent.",
      "",
      "We are a dental practice with 18 staff on an ageing hosted PBX that a provider is retiring.",
      "We would like a quote to migrate to something supported, including handset replacements.",
      "Could you quote for 18 extensions, a migration plan, and what the handsets would cost?",
    ].join("\n"),
    intent: "enquiry",
  });

  const faultInbound = await logInboundItem({
    channel: "web",
    companyName: "Kleinbos Logistics",
    subject: "No dial tone at the main switch since 06:00",
    summary: [
      "Email: ops@kleinbos.example",
      "Source: vantage-ars.co.za customer service desk. No automated reply sent.",
      "Matter: fault",
      "",
      "No dial tone on the main switch since 06:00 and the outbound trunk is down.",
      "This is stopping us from taking orders.",
    ].join("\n"),
    intent: "support",
  });

  check("enquiry and fault are both on file", Boolean(buyingInbound && faultInbound));

  // ── 2b. The exact path the public enquiry form takes ──────────────────────
  // `submitPublicEnquiry` records the inbound item and then calls
  // `processWebsiteEnquiry`. Running the real one proves the public form is
  // wired to the office, not just to a database row.
  const formInbound = await logInboundItem({
    channel: "web",
    companyName: "Beacon Hill Dental",
    subject: "PBX provider retiring in 60 days",
    summary:
      "Email: admin@beaconhill.example\nWe have 14 staff and need a quote to migrate off a retiring PBX.",
    intent: "enquiry",
  });
  const routed = await processWebsiteEnquiry({
    inboundId: formInbound,
    name: "Beacon Hill Dental",
    message:
      "Our hosted PBX provider is retiring in 60 days. We have 14 staff and need a quote to migrate to a supported system, including handsets.",
  });
  check("the public enquiry form reached the office", typeof routed.handoff === "boolean");
  const formRouted =
    await sql`select status, routed_to from inbound_items where id = ${formInbound}`;
  check(
    "the form enquiry was routed by reception",
    formRouted[0]?.status === "routed",
    JSON.stringify(formRouted),
  );

  // ── 3. Run the office. Nothing here is briefed by hand. ────────────────────
  // Enough time for reception's cadence. Marketing's own cadences are longer,
  // and the lead does not exist yet, so it needs its own window below.
  const tick2 = await advanceAndTick(200);
  check("reception classified both items without instruction", tick2.ran.length >= 2, tick2.detail);

  const leads = await sql`select company_name, stage from leads order by company_name`;
  const tickets = await sql`select title, owner_agent, status from tickets`;
  check(
    "the buying enquiry became a real lead",
    leads.some((lead) => lead.company_name === "Harbour Point Dental"),
    JSON.stringify(leads),
  );
  check(
    "the fault became a real service ticket owned by DESK",
    tickets.some((ticket) => ticket.owner_agent === "desk"),
    JSON.stringify(tickets),
  );

  // ── 4. Marketing scores and escalates the real demand ──────────────────────
  // The lead only exists after the previous tick, so marketing needs its own
  // window to see it. Two hours covers the qualifying cadence (180 min).
  const tickMarketing = await advanceAndTick(200);
  check("marketing ran on its own cadence", tickMarketing.ok, tickMarketing.detail);
  const stages = leads.map((lead) => `${lead.company_name}:${lead.stage}`);
  const scored = await sql`select company_name, stage, score from leads`;
  check(
    "the lead was qualified or scored, not left untouched",
    scored.some((lead) => /qualified|nurture|ready_for_sales|in_sales/.test(String(lead.stage))),
    scored.map((lead) => `${lead.company_name}:${lead.stage}(${lead.score})`).join(" | "),
  );
  check(
    "the fault enquiry did not become a sales lead",
    !scored.some(
      (lead) => lead.company_name === "Kleinbos Logistics" && /sales/.test(String(lead.stage)),
    ),
    scored.map((lead) => `${lead.company_name}:${lead.stage}`).join(" | "),
  );
  void stages;

  const handoffs =
    await sql`select id, company_name, status from approvals where kind = 'sales_handoff'`;
  check(
    "buying intent stopped at the founder gate, not past it",
    handoffs.length >= 1 && handoffs.every((row) => row.status === "pending"),
    JSON.stringify(handoffs),
  );
  check(
    "the founder gate names the real company",
    handoffs.some((row) => row.company_name === "Harbour Point Dental"),
    JSON.stringify(handoffs),
  );

  // Marketing must not have created an opportunity itself.
  const earlyOpps = await sql`select company_name, stage from opportunities`;
  check(
    "marketing did not open a sale without the founder",
    earlyOpps.length === 0,
    JSON.stringify(earlyOpps),
  );

  // ── 5. Founder approves the handoff. Sales may now work. ──────────────────
  let approved = null;
  const approvalResults = [];
  for (const row of handoffs) {
    const result = await resolveApproval({
      approvalId: row.id,
      decision: "approved",
      note: "Real demand. Handle it.",
    });
    approvalResults.push(`${row.company_name}: ${JSON.stringify(result)}`);
    if (result.ok) approved = row;
  }
  check("founder approval executed the handoff", Boolean(approved), approvalResults.join(" | "));

  // Both real enquiries produced their own pipeline, so assert per company
  // rather than on a total.
  const opps =
    await sql`select id, company_name, stage, lead_id from opportunities where company_name = 'Harbour Point Dental'`;
  check("an opportunity exists for the approved company", opps.length === 1, JSON.stringify(opps));
  const opp = opps[0];
  check("the opportunity points at a real lead", Boolean(opp?.lead_id));
  const allOpps = await sql`select company_name from opportunities`;
  check(
    "every opportunity has its own company",
    new Set(allOpps.map((row) => row.company_name)).size === allOpps.length,
    JSON.stringify(allOpps),
  );

  // ── 6. Sales does discovery on its own ─────────────────────────────────────
  // Long enough that sales' 240-minute discovery cadence comes round again
  // after the opportunity actually existed.
  const tick3 = await advanceAndTick(300);
  check("the tick that reached sales was clean", tick3.ok, tick3.detail);
  const internalDocs = await sql`select title, kind, status from documents where kind = 'internal'`;
  check(
    "sales wrote a real discovery document without being told to",
    internalDocs.some((doc) => /Discovery/.test(doc.title)),
    JSON.stringify(internalDocs.map((doc) => doc.title)),
  );
  check(
    "the discovery document is a draft, not a customer commitment",
    internalDocs
      .filter((doc) => /Discovery/.test(doc.title))
      .every((doc) => doc.status === "draft"),
    JSON.stringify(internalDocs),
  );
  const discoveryTitles = internalDocs
    .filter((doc) => /Discovery/.test(doc.title))
    .map((doc) => doc.title);
  check(
    "discovery is filed once per company, not on every scheduler tick",
    new Set(discoveryTitles).size === discoveryTitles.length,
    JSON.stringify(discoveryTitles),
  );

  // ── 7. Sales issues a quote at the published rate, founder-gated ───────────
  const quote = await applyProposedAction(
    "close",
    {
      kind: "issue_quote",
      title: "Quote · Harbour Point Dental",
      rationale: "On-site PBX migration labour, priced from the published rate card.",
      confidence: 0.95,
      amountCents: 80500 * 8,
      companyName: "Harbour Point Dental",
      relatedId: opp.id,
      payload: { rateId: "pbx-install", location: "onsite", quantity: 8 },
    },
    { source: "verify" },
  );
  check("a quote always stops at the founder gate", quote.status === "escalated", quote.status);
  check("the founder was asked, not bypassed", Boolean(quote.approvalId));

  const quoteDocs = await sql`select summary, status from documents where kind = 'quote'`;
  check("no customer-facing quote exists yet", quoteDocs.length === 0, JSON.stringify(quoteDocs));

  await resolveApproval({
    approvalId: quote.approvalId,
    decision: "approved",
    note: "Correct rate.",
  });
  const afterQuote = await sql`select summary, status from documents where kind = 'quote'`;
  check(
    "approval produced exactly one quote document",
    afterQuote.length === 1,
    JSON.stringify(afterQuote),
  );
  // formatZar renders "R 6 440,00"; assert on the computed figure so the check
  // tracks the rate card rather than a formatting detail.
  const { formatZar } = await import("../src/lib/office/money.ts");
  const expectedTotal = formatZar(80500 * 8);
  check(
    "the quote text carries the published total, not an invented one",
    afterQuote[0]?.summary.includes(expectedTotal),
    `expected ${expectedTotal} in: ${afterQuote[0]?.summary ?? ""}`,
  );
  check(
    "the quote names the published rate line it came from",
    afterQuote[0]?.summary.includes("VoIP / PBX installation, on-site"),
    afterQuote[0]?.summary ?? "",
  );
  check(
    "the quote states its internal status",
    afterQuote[0]?.summary.includes("INTERNAL QUOTE DRAFT"),
    afterQuote[0]?.summary ?? "",
  );

  // ── 8. Money is safe ───────────────────────────────────────────────────────
  const ledger = await sql`select kind, amount_cents, status from ledger_entries`;
  check("nothing was billed without a won deal", ledger.length === 0, JSON.stringify(ledger));
  const money = await sql`select treasury_cents, receivable_cents from company_state`;
  check(
    "treasury and receivable are still zero",
    Number(money[0].treasury_cents) === 0 && Number(money[0].receivable_cents) === 0,
  );

  // A receipt with nothing owed must not create money.
  const bogus = await applyProposedAction(
    "ledger",
    {
      kind: "record_inbound_payment",
      title: "Receipt with no invoice",
      rationale: "Should be refused: nothing is owed.",
      confidence: 0.99,
      amountCents: 500000,
      companyName: "Nobody",
      payload: {},
    },
    { source: "verify" },
  );
  check("a receipt against nothing is refused", bogus.status !== "executed", bogus.status ?? "");
  const moneyAfter = await sql`select treasury_cents from company_state`;
  check("a refused receipt did not create money", Number(moneyAfter[0].treasury_cents) === 0);

  // ── 9. The customer accepts on their link, and only once ───────────────────
  const { createQuoteLink, answerPublicQuote, readPublicQuote } =
    await import("../src/lib/office/store.server.ts");
  const quoteDoc = await sql`select id from documents where kind = 'quote' limit 1`;
  const link = await createQuoteLink(quoteDoc[0].id);
  check("a customer link can be issued for a waiting quote", link.ok);
  await sql`update opportunities set value_cents = 700000 where id = ${opp.id}`;
  const publicQuote = await readPublicQuote(link.token, false);
  check(
    "the public quote shows its snapshotted figure, not a changed opportunity value",
    publicQuote.ok && publicQuote.amountCents === 644000,
    JSON.stringify(publicQuote),
  );
  await sql`update opportunities set value_cents = 644000 where id = ${opp.id}`;

  const answer = await answerPublicQuote(link.token, {
    outcome: "accepted",
    name: "Dr A. Meyer",
    note: "Please proceed.",
  });
  check("the customer's acceptance closed the deal", answer.ok, JSON.stringify(answer));
  const acceptedSnapshot = await sql`
    select amount_cents, accepted_at from documents where id = ${quoteDoc[0].id}
  `;
  check(
    "the accepted quote keeps the figure the customer agreed to",
    Number(acceptedSnapshot[0]?.amount_cents) === answer.amountCents,
    JSON.stringify(acceptedSnapshot),
  );
  check(
    "the quote records when the customer accepted it",
    Boolean(acceptedSnapshot[0]?.accepted_at),
    JSON.stringify(acceptedSnapshot),
  );

  const second = await answerPublicQuote(link.token, {
    outcome: "accepted",
    name: "Dr A. Meyer",
    note: "",
  });
  check("a second acceptance is refused", second.ok === false, JSON.stringify(second));

  const closed = await sql`select stage, value_cents from opportunities where id = ${opp.id}`;
  check("the opportunity is won", closed[0]?.stage === "won");
  check(
    "the won value is the published figure",
    Number(closed[0]?.value_cents) === 644000,
    String(closed[0]?.value_cents),
  );

  const delivery =
    await sql`select owner_agent, related_id from tickets where related_id = ${opp.id}`;
  check("delivery opened exactly one ticket", delivery.length === 1, JSON.stringify(delivery));

  // ── 10. Ledger books the invoice, then the receipt, once ───────────────────
  const { raiseQuoteInvoice, recordInvoiceReceipt } =
    await import("../src/lib/office/store.server.ts");
  const invoices = await sql`select id, amount_cents from ledger_entries where kind = 'invoice'`;
  check("no invoice before the founder raises it", invoices.length === 0);

  await advanceAndTick(200);
  const nudge = await sql`select kind from work_items where kind = 'nudge_invoice'`;
  check("sales noticed the un-invoiced win by itself", nudge.length >= 1);

  const raised = await raiseQuoteInvoice(opp.id, "none");
  check("the invoice raises cleanly", raised.ok, JSON.stringify(raised));
  const twice = await raiseQuoteInvoice(opp.id, "none");
  check("a second invoice for the same job is refused", twice.ok === false, JSON.stringify(twice));
  const invoiceDocuments = await sql`
    select id, status from documents where kind = 'invoice' and related_id = ${opp.id}
  `;
  check(
    "the unpaid invoice was filed with its ledger entry",
    invoiceDocuments.length === 1 && invoiceDocuments[0].status === "approved_unsent",
    JSON.stringify(invoiceDocuments),
  );

  const afterInvoice = await sql`select treasury_cents, receivable_cents from company_state`;
  check(
    "the invoice raised the receivable",
    Number(afterInvoice[0].receivable_cents) === 644000,
    String(afterInvoice[0].receivable_cents),
  );
  check("the invoice did not touch treasury", Number(afterInvoice[0].treasury_cents) === 0);

  const issuedInvoice = (
    await sql`
    select id, amount_cents from ledger_entries where kind = 'invoice' limit 1
  `
  )[0];
  const partialReceipt = await applyProposedAction(
    "ledger",
    {
      kind: "record_inbound_payment",
      title: "Partial invoice receipt",
      rationale: "A partial amount must not settle a full invoice.",
      confidence: 0.95,
      amountCents: Number(issuedInvoice.amount_cents) - 1,
      companyName: "Harbour Point Dental",
      relatedId: issuedInvoice.id,
      payload: {},
    },
    { source: "verify" },
  );
  check(
    "a partial receipt cannot mark the invoice paid",
    partialReceipt.status === "blocked" && partialReceipt.error?.includes("full invoice amount"),
    JSON.stringify(partialReceipt),
  );
  let invoiceState = await sql`
    select status from ledger_entries where id = ${issuedInvoice.id}
  `;
  check(
    "a refused partial receipt leaves the invoice issued",
    invoiceState[0]?.status === "issued",
  );

  await sql`update company_state set receivable_cents = ${Number(issuedInvoice.amount_cents) - 1}`;
  const underfundedReceipt = await applyProposedAction(
    "ledger",
    {
      kind: "record_inbound_payment",
      title: "Receipt exceeds recorded receivable",
      rationale: "A full invoice receipt cannot exceed the receivable balance.",
      confidence: 0.95,
      amountCents: Number(issuedInvoice.amount_cents),
      companyName: "Harbour Point Dental",
      relatedId: issuedInvoice.id,
      payload: {},
    },
    { source: "verify" },
  );
  check(
    "a receipt is refused when the receivable cannot cover the invoice",
    underfundedReceipt.status === "blocked" &&
      underfundedReceipt.error?.includes("does not cover this full invoice"),
    JSON.stringify(underfundedReceipt),
  );
  invoiceState = await sql`select status from ledger_entries where id = ${issuedInvoice.id}`;
  const underfundedMoney = await sql`select treasury_cents, receivable_cents from company_state`;
  check(
    "a refused underfunded receipt changes no money or invoice state",
    invoiceState[0]?.status === "issued" &&
      Number(underfundedMoney[0].treasury_cents) === 0 &&
      Number(underfundedMoney[0].receivable_cents) === Number(issuedInvoice.amount_cents) - 1,
    JSON.stringify({ invoiceState, underfundedMoney }),
  );
  await sql`update company_state set receivable_cents = ${Number(issuedInvoice.amount_cents)}`;

  await recordInvoiceReceipt(issuedInvoice.id);
  const afterReceipt = await sql`select treasury_cents, receivable_cents from company_state`;
  check(
    "the receipt moved money into treasury",
    Number(afterReceipt[0].treasury_cents) === 644000,
    String(afterReceipt[0].treasury_cents),
  );
  check(
    "the receivable cleared",
    Number(afterReceipt[0].receivable_cents) === 0,
    String(afterReceipt[0].receivable_cents),
  );

  // ── 11. Service desk and technical work ────────────────────────────────────
  await advanceAndTick(60);
  const ackDocuments = await sql`
    select kind, status, title from documents
    where kind = 'service_ack'
       or (kind = 'correspondence' and title like 'Service acknowledgement%')
  `;
  check(
    "the service desk acknowledged the fault on its own",
    ackDocuments.length >= 1,
    "no acknowledgement was ever drafted",
  );
  check(
    "the acknowledgement is a draft, not an email",
    ackDocuments.every((row) => row.status === "draft"),
    JSON.stringify(ackDocuments),
  );

  const procedures = await sql`select summary, status from documents where kind = 'technical_plan'`;
  check(
    "technical wrote a reviewable procedure draft",
    procedures.some((row) => /FORGE:/.test(row.summary)),
    JSON.stringify(
      procedures.map((row) => ({ status: row.status, summary: row.summary.slice(0, 60) })),
    ),
  );
  check(
    "technical drafts did not start customer work",
    procedures.every((row) => row.status === "draft"),
    JSON.stringify(procedures.map((row) => row.status)),
  );
  const procedureTickets = await sql`
    select t.status
    from tickets t
    join documents d on d.related_id = t.id and d.kind = 'technical_plan'
  `;
  check(
    "tickets with technical drafts remain open for founder approval",
    procedureTickets.every((row) => row.status === "open"),
    JSON.stringify(procedureTickets.map((row) => row.status)),
  );

  // ── 12. Nobody emailed a customer ──────────────────────────────────────────
  const sent = await sql`select status, detail from founder_notices`;
  check(
    "founder notices record that mail was unavailable rather than pretending",
    sent.every((row) => row.status !== "sent" || /SMTP/.test(row.detail)),
    JSON.stringify(sent.map((row) => row.status)),
  );

  // ── 13. The chain verifies and the office agrees ───────────────────────────
  const chain = await sql`
    select id, previous_hash, record_hash, created_at from (
      select id, previous_hash, record_hash, created_at from audit_events
      union all
      select id, previous_hash, record_hash, created_at from decisions
    ) c order by created_at asc
  `;
  const head = await sql`select last_audit_hash from company_state`;
  const verdict = verifyChainLinks(
    chain.map((row) => ({
      id: String(row.id),
      previousHash: String(row.previous_hash),
      recordHash: String(row.record_hash),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    String(head[0].last_audit_hash),
  );
  check("the audit chain verifies end to end", verdict.ok, verdict.detail);
  check("the chain is substantial", verdict.checked > 20, `only ${verdict.checked} records`);

  // ── 14. Repeat ticks are idempotent, not amplifying ────────────────────────
  const countsBefore = await workCounts();
  const queueBefore = (await listWork(200)).length;
  await advanceAndTick(10);
  await advanceAndTick(10);
  const queueAfter = (await listWork(200)).length;
  check(
    "repeat ticks do not pile up duplicate work",
    queueAfter - queueBefore <= 1,
    `queue went ${queueBefore} → ${queueAfter} (open was ${countsBefore.open})`,
  );

  const invoices2 = await sql`select id from ledger_entries where kind = 'invoice'`;
  check(
    "repeat ticks never book a second invoice",
    invoices2.length === 1,
    String(invoices2.length),
  );
  const dupQuotes = await sql`select id from documents where kind = 'quote'`;
  check("repeat ticks never duplicate a quote", dupQuotes.length === 1, String(dupQuotes.length));

  // ── 15. Halt is honoured everywhere ────────────────────────────────────────
  const { setOfficeHalt } = await import("../src/lib/office/store.server.ts");
  await setOfficeHalt(true, "Verification halt.");
  const haltedTick = await advanceAndTick(10);
  check(
    "a halted office runs nothing",
    haltedTick.skipped === "halted" && haltedTick.ran.length === 0,
  );
  const blockedApproval = await resolveApproval({
    approvalId:
      (await sql`select id from approvals where status = 'pending' limit 1`)[0]?.id ?? "none",
    decision: "approved",
  });
  check("a halted office refuses queued approvals", blockedApproval.ok === false);
  await setOfficeHalt(false, "Verification resume.");

  // ── 16. Health agrees with reality ─────────────────────────────────────────
  const health = await officeHealth({ full: true });
  check("health reports the database up", health.database.ok, health.database.detail);
  check("health reports the chain intact", health.chain.ok, health.chain.detail);
  check("health reports autonomy enabled", health.scheduler.autonomyEnabled);
  check("health counts the duties", health.scheduler.duties >= 20, String(health.scheduler.duties));
  check(
    "health reports the real balance",
    health.money.treasuryCents === 644000,
    String(health.money.treasuryCents),
  );
  check(
    "health found nothing structurally wrong",
    health.problems.every((p) => p.startsWith("Founder notices")),
    JSON.stringify(health.problems),
  );

  // ── 17. The floor read path still works ────────────────────────────────────
  const snapshot = await readSnapshot();
  check("the office snapshot reads", snapshot.company.tradingName === "Vantage-ARS");
  check(
    "the snapshot carries the real figures",
    snapshot.company.treasuryCents === 644000,
    String(snapshot.company.treasuryCents),
  );
  check(
    "the snapshot carries the decision trail",
    snapshot.decisions.length > 10,
    String(snapshot.decisions.length),
  );
  check(
    "health metrics are real, not constants",
    snapshot.health.constraintAdherence <= 1 && snapshot.health.decisionCount > 0,
  );

  const status = await schedulerStatus();
  check("the scheduler reports its duties", status.dueDuties.length >= 20);
  check(
    "the scheduler recorded runs",
    status.recentRuns.length > 5,
    String(status.recentRuns.length),
  );
  check(
    "the scheduler reports the pace it chose",
    ["idle", "steady", "surge", "recovery"].includes(status.posture) &&
      Number.isFinite(status.budget),
    `${status.posture} / ${status.budget}`,
  );

  // ── 17b. Governance, support time and an explicit skip ─────────────────────
  const { logServiceTime, listServiceTime, readGovernanceRecord, skipApproval } =
    await import("../src/lib/office/store.server.ts");
  const { collectServiceFacts } = await import("../src/lib/office/service-facts.server.ts");

  const logged = await logServiceTime({
    companyName: "Harbour Point Dental",
    minutes: 90,
    note: "Remote session on the handset registration fault.",
  });
  check("support time is recorded against the account", logged.ok, JSON.stringify(logged));
  const recentTime = await listServiceTime(10);
  check(
    "the support-time entry is readable and belongs to the right account",
    recentTime.some((row) => row.companyName === "Harbour Point Dental" && row.minutes === 90),
    JSON.stringify(recentTime),
  );
  const facts = await collectServiceFacts(sql, {
    companyName: "Harbour Point Dental",
    periodStart: new Date(T0 - 86_400_000).toISOString(),
    periodEnd: new Date(T0 + 86_400_000).toISOString(),
  });
  check(
    "a service report uses recorded time instead of the fault estimate",
    facts.hoursBasis === "recorded" && facts.hoursUsed === 1.5 && facts.timeEntries === 1,
    `${facts.hoursBasis} / ${facts.hoursUsed} / ${facts.timeEntries}`,
  );

  const queuedCancel = await applyProposedAction(
    "desk",
    {
      kind: "cancel_subscription",
      title: "Verification cancellation that is never decided",
      rationale: "A customer-loss action used to prove the gate is recorded before a ruling.",
      confidence: 0.9,
      amountCents: 0,
      companyName: "Harbour Point Dental",
      payload: { reason: "Verification only" },
    },
    { source: "verification" },
  );
  check(
    "a customer-loss action waits at the founder gate",
    queuedCancel.status === "escalated" && Boolean(queuedCancel.approvalId),
    JSON.stringify(queuedCancel),
  );
  const gateRow = await sql`
    select legal, decided_at, questions_json from gate_records
    where approval_id = ${queuedCancel.approvalId}
    order by created_at desc limit 1
  `;
  check(
    "the section 71 gate is on record before the founder rules",
    gateRow.length === 1 && gateRow[0].legal === true,
    JSON.stringify(gateRow),
  );
  const skipped = await skipApproval({
    approvalId: queuedCancel.approvalId ?? "none",
    note: "Verification skip. No decision was taken.",
  });
  check("an approval can be skipped without a ruling", skipped.ok, JSON.stringify(skipped));
  const skippedRow = await sql`
    select status, resolved_at, decided_at from approvals where id = ${queuedCancel.approvalId}
  `;
  check(
    "the skipped approval is closed but not recorded as decided",
    skippedRow[0]?.status === "skipped" &&
      Boolean(skippedRow[0]?.resolved_at) &&
      skippedRow[0]?.decided_at === null,
    JSON.stringify(skippedRow),
  );
  const gateAfterSkip = await sql`
    select decided_at from gate_records where approval_id = ${queuedCancel.approvalId}
  `;
  check(
    "skipping leaves the gate visibly undecided",
    gateAfterSkip.length === 1 && gateAfterSkip[0].decided_at === null,
    JSON.stringify(gateAfterSkip),
  );
  const skipAudit = await sql`
    select id from audit_events where kind = 'approval_skipped' limit 1
  `;
  check("the skip itself is in the audit chain", skipAudit.length === 1);

  const governance = await readGovernanceRecord(200);
  check(
    "the governance record carries the founder rulings",
    governance.episodes.length > 0,
    String(governance.episodes.length),
  );
  check(
    "the governance record carries a gate record",
    governance.gates.length > 0,
    String(governance.gates.length),
  );
  check(
    "every execution receipt verifies against the office key",
    governance.receipts.length > 0 && governance.receipts.every((row) => row.signatureValid),
    JSON.stringify(governance.receipts.map((row) => row.signatureValid)),
  );
  check(
    "the receipt key mode is stated honestly",
    governance.receiptKey === "environment" || governance.receiptKey === "placeholder",
    governance.receiptKey,
  );

  // ── 18. Marketing finds demand in the site's own traffic ───────────────────
  // Real visitor records, exactly what the public site writes. Two visits to a
  // buying page, one to the quote page, and several to a page that is not a
  // buying signal.
  const { recordSiteEvent } = await import("../src/lib/office/office-view.server.ts");
  await recordSiteEvent({ kind: "page_view", path: "/rates" });
  await recordSiteEvent({ kind: "page_view", path: "/rates" });
  await recordSiteEvent({ kind: "page_view", path: "/quote" });
  await recordSiteEvent({ kind: "page_view", path: "/" });
  await recordSiteEvent({ kind: "page_view", path: "/" });

  await advanceAndTick(1500); // past the daily prospect cadence — 2490
  await advanceAndTick(200); // qualification's own cadence — 2690

  const prospectLeads = await sql`
    select id, company_name, stage, score, summary from leads where company_name like 'Prospect %'
  `;
  check(
    "repeat visits to a buying page became a prospect lead",
    prospectLeads.some((lead) => lead.company_name === "Prospect · /rates"),
    JSON.stringify(prospectLeads.map((lead) => lead.company_name)),
  );
  check(
    "the prospect carries the site's own evidence and no invented contact",
    prospectLeads.length > 0 &&
      prospectLeads.every(
        (lead) =>
          /recorded visit/.test(String(lead.summary)) && !String(lead.summary).includes("@"),
      ),
    JSON.stringify(prospectLeads.map((lead) => lead.summary)),
  );
  check(
    "a page that is not a buying signal was ignored",
    !prospectLeads.some((lead) => lead.company_name === "Prospect · /"),
    JSON.stringify(prospectLeads.map((lead) => lead.company_name)),
  );
  check(
    "the prospect was qualified out of engaged without being sold",
    prospectLeads.length > 0 &&
      prospectLeads.every((lead) => lead.stage === "nurture" && Number(lead.score) < 45),
    JSON.stringify(
      prospectLeads.map((lead) => `${lead.company_name}:${lead.stage}(${lead.score})`),
    ),
  );
  check(
    "qualification scored the prospect without erasing what the site recorded",
    prospectLeads.every((lead) => /recorded visit/.test(String(lead.summary))),
    JSON.stringify(prospectLeads.map((lead) => String(lead.summary).slice(0, 60))),
  );
  const prospectHandoffs = await sql`
    select id from approvals where kind = 'sales_handoff' and company_name like 'Prospect %'
  `;
  check(
    "anonymous interest never reached the founder as a sale",
    prospectHandoffs.length === 0,
    JSON.stringify(prospectHandoffs),
  );

  // Qualification must stay a one-time transition. It is due every three
  // hours; if it re-scored decided leads the chain would grow duplicates
  // forever while the office looked busy.
  const updateLeadDecisions = async () =>
    Number(
      (await sql`select count(*)::int as n from decisions where action_kind = 'update_lead'`)[0].n,
    );
  const updatesBefore = await updateLeadDecisions();
  await advanceAndTick(1440);
  await advanceAndTick(1440);
  const updatesAfter = await updateLeadDecisions();
  check(
    "qualification runs once per lead, not every three hours",
    updatesAfter === updatesBefore,
    `update_lead decisions went ${updatesBefore} → ${updatesAfter}`,
  );

  // ── 19. The weekly campaign drafts itself, at R0, owned-channel ────────────
  await advanceAndTick(5000); // past the weekly campaign cadence — 10570
  const campaigns = await sql`select name, channel, status, budget_cents, summary from campaigns`;
  const weeklyDrafts = campaigns.filter((c) => /Owned-channel campaign/.test(String(c.name)));
  check(
    "the weekly campaign drafted itself from nurtured demand",
    weeklyDrafts.length >= 1,
    JSON.stringify(campaigns.map((c) => c.name)),
  );
  check(
    "the campaign is an owned-channel draft at R0",
    weeklyDrafts.every(
      (c) => c.channel === "owned" && c.status === "draft" && Number(c.budget_cents) === 0,
    ),
    JSON.stringify(weeklyDrafts),
  );
  check(
    "the campaign names the real nurtured leads it is for",
    weeklyDrafts.some((c) => String(c.summary).includes("Prospect · /rates")),
    JSON.stringify(weeklyDrafts.map((c) => String(c.summary).slice(0, 80))),
  );

  // ── 20. The orchestrator briefs the founder with real figures ──────────────
  const briefings = await sql`
    select subject, status, detail from founder_notices where subject like '%daily briefing%'
  `;
  check(
    "the orchestrator briefed the founder daily",
    briefings.length >= 1,
    JSON.stringify(briefings.map((b) => b.subject)),
  );
  const briefingDecisions = await sql`
    select rationale from decisions where action_kind = 'notify_operator' and title like 'Daily briefing%'
  `;
  check(
    "the briefing reports the real treasury, not a constant",
    briefingDecisions.some((row) =>
      String(row.rationale).includes(`treasury ${formatZar(644000)}`),
    ),
    JSON.stringify(briefingDecisions.map((row) => String(row.rationale).slice(0, 80))),
  );
  check(
    "the briefing carries the queue and the last day's activity",
    briefingDecisions.some(
      (row) =>
        /Queue now:/.test(String(row.rationale)) && /Last 24 hours:/.test(String(row.rationale)),
    ),
    JSON.stringify(briefingDecisions.map((row) => String(row.rationale).slice(0, 80))),
  );
  check(
    "the briefing never claims a customer was emailed",
    briefings.every((row) => row.status !== "sent" || /SMTP/.test(String(row.detail))),
    JSON.stringify(briefings.map((row) => row.status)),
  );

  // ── 21. A week of autonomous marketing kept the chain intact ───────────────
  const chain2 = await sql`
    select id, previous_hash, record_hash, created_at from (
      select id, previous_hash, record_hash, created_at from audit_events
      union all
      select id, previous_hash, record_hash, created_at from decisions
    ) c order by created_at asc
  `;
  const head2 = await sql`select last_audit_hash from company_state`;
  const verdict2 = verifyChainLinks(
    chain2.map((row) => ({
      id: String(row.id),
      previousHash: String(row.previous_hash),
      recordHash: String(row.record_hash),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    String(head2[0].last_audit_hash),
  );
  check(
    "the chain still verifies after a week of autonomous marketing",
    verdict2.ok,
    verdict2.detail,
  );
  check(
    "the week added real decisions to the chain",
    verdict2.checked > verdict.checked,
    `${verdict.checked} → ${verdict2.checked}`,
  );
  // The view reads the chain and the stored head in one statement, so a busy
  // office can never see its own in-flight append as a broken chain — the
  // false positive that would halt the office through SEAL.
  const { readDutyView } = await import("../src/lib/office/office-view.server.ts");
  const busyView = await readDutyView(at());
  check(
    "a busy office still trusts its chain after the tick that wrote it",
    busyView.chainIntact === true,
    "the view reported the chain as broken moments after its own tick appended to it",
  );

  // ── 22. A public surface may nudge a stale scheduler ───────────────────────
  const { kickFloorIfStale } = await import("../src/lib/office/kick.server.ts");
  const freshNudge = await kickFloorIfStale();
  check(
    "a fresh scheduler declines an opportunistic nudge",
    freshNudge.kicked === false && freshNudge.reason === "fresh",
    JSON.stringify(freshNudge),
  );
  await sql`update office_state set last_tick_at = now() - interval '30 minutes'`;
  const staleNudge = await kickFloorIfStale();
  check(
    "a stale scheduler is nudged back on cadence by a public surface",
    staleNudge.kicked === true && /Duties due and planned/.test(String(staleNudge.detail)),
    JSON.stringify(staleNudge).slice(0, 200),
  );
  const afterNudge = await sql`select last_tick_at from office_state`;
  check(
    "the nudge recorded the catch-up tick",
    Date.now() - Date.parse(new Date(afterNudge[0].last_tick_at).toISOString()) < 60_000,
    String(afterNudge[0].last_tick_at),
  );

  // ── 23. Nothing is delegated by default ───────────────────────────────────
  // ART-13 hands the founder a bounded, revocable authority over a class of
  // work. It is not on by default: an office nobody has given one to still
  // stops at the founder gate, and the actions that exist only under a
  // delegation are refused outright rather than escalated.
  const {
    readDelegation,
    readDelegationUsage,
    saveDelegation,
    revokeDelegation,
    startSubscriptionForOpportunity,
    filePaymentNotice,
    listSubscriptions,
    listBillingCycles,
    listCustomerAccounts,
    listSiteSignals,
    revenueMetrics,
    listCustomerNotices,
  } = await import("../src/lib/office/store.server.ts");
  const { delegatableRateIds } = await import("../src/lib/office/delegation.ts");
  const { planById } = await import("../src/lib/office/plans.ts");
  const { customerAccountsToCsv } = await import("../src/lib/office/customers.ts");
  const { addMonths } = await import("../src/lib/office/subscription.ts");

  /** The reason a decision recorded, exactly as the office wrote it down. */
  const decisionReason = async (id) => {
    const rows = await sql`select observation_json from decisions where id = ${id}`;
    try {
      return String(JSON.parse(String(rows[0]?.observation_json ?? "{}")).reason ?? "");
    } catch {
      return "";
    }
  };

  const customer = "Harbour Point Dental";
  const plan = planById("health-watch");
  const planPrice = plan?.priceCents ?? 0;
  const settledInvoice = (
    await sql`select id, amount_cents from ledger_entries where kind = 'invoice' and status = 'paid' limit 1`
  )[0];

  const noDelegation = await readDelegation();
  check(
    "the office has no standing delegation by default",
    noDelegation === null,
    JSON.stringify(noDelegation),
  );

  const autonomousMail = await applyProposedAction(
    "desk",
    {
      kind: "send_customer_mail",
      title: "Autonomous customer email with no delegation",
      rationale: "The office tried to email a customer on its own.",
      confidence: 0.9,
      amountCents: 0,
      companyName: customer,
      payload: { template: "receipt", invoiceId: settledInvoice?.id },
    },
    { source: "scheduler", autonomous: true },
  );
  check(
    "an autonomous customer email is refused without a delegation",
    autonomousMail.status === "blocked",
    autonomousMail.status,
  );
  check(
    "the refusal says the office needs a standing delegation",
    /needs a standing founder delegation/.test(await decisionReason(autonomousMail.decisionId)),
    await decisionReason(autonomousMail.decisionId),
  );

  const autonomousStart = await applyProposedAction(
    "ledger",
    {
      kind: "start_subscription",
      title: "Subscription with no delegation",
      rationale: "The office tried to start a recurring plan on its own.",
      confidence: 0.9,
      amountCents: 0,
      companyName: customer,
      payload: {
        planId: "health-watch",
        rateId: "health-watch",
        cycle: "monthly",
        priceCents: planPrice,
        periodStart: at(),
      },
    },
    { source: "scheduler", autonomous: true },
  );
  check(
    "an autonomous subscription is refused without a delegation",
    autonomousStart.status === "blocked",
    autonomousStart.status,
  );
  const blockedStarts = await sql`select id from subscriptions where company_name = ${customer}`;
  check(
    "the refused subscription left nothing behind",
    blockedStarts.length === 0,
    JSON.stringify(blockedStarts),
  );

  // ── 24. The founder writes the delegation down ─────────────────────────────
  // One policy, written in advance: what may be done, at what price, how many
  // times a day, and which published rate lines it may charge.
  const generous = {
    label: "Managed revenue",
    maxAmountCents: 500000,
    maxActionsPerDay: 50,
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
    allowedRateIds: delegatableRateIds(),
    allowCustomerMail: true,
    allowAutoReconcile: true,
    requireAcceptedQuote: true,
  };
  const saved = await saveDelegation(generous);
  check("the founder's delegation was written down", saved.ok, JSON.stringify(saved));

  const policy = await readDelegation();
  check(
    "the policy reads back with the founder's caps",
    policy?.label === "Managed revenue" &&
      policy.maxAmountCents === 500000 &&
      policy.maxActionsPerDay === 50 &&
      policy.maxActionsPerMonth === 200,
    JSON.stringify(policy),
  );
  check(
    "the policy covers the actions the founder named",
    ["fulfil_service", "send_customer_mail", "issue_invoice", "start_subscription"].every(
      (action) => policy?.allowedActions.includes(action),
    ),
    JSON.stringify(policy?.allowedActions),
  );
  check(
    "the policy may charge only the published rate lines",
    policy?.allowedRateIds.includes("health-watch") &&
      policy.allowedRateIds.every((id) => delegatableRateIds().includes(id)),
    JSON.stringify(policy?.allowedRateIds),
  );
  check(
    "the policy may email the customer and requires an accepted quote",
    policy?.allowCustomerMail === true && policy.requireAcceptedQuote === true,
    JSON.stringify(policy),
  );
  const usageAtStart = await readDelegationUsage();
  check(
    "a fresh delegation has been used zero times",
    usageAtStart.usedToday === 0 && usageAtStart.usedThisMonth === 0,
    JSON.stringify(usageAtStart),
  );
  const delegationAudit = await sql`select kind from audit_events where kind = 'delegation_saved'`;
  check("the delegation is on the audit chain", delegationAudit.length >= 1);

  // ── 25. The office sells a managed plan on its own ─────────────────────────
  // The customer is one the office already has on file, from a real enquiry.
  // Nothing here is invented: the opportunity, the quote and the price all come
  // from the published rate card. The office's agents act through this same
  // path — the duty runners propose an action with `autonomous: true` and the
  // governor decides — so the delegation, the caps and the audit chain are all
  // exercised for real.
  const customerLead = (
    await sql`select id from leads where lower(company_name) = ${customer.toLowerCase()} limit 1`
  )[0];
  const opened = await applyProposedAction(
    "close",
    {
      kind: "open_opportunity",
      title: `Managed support · ${customer}`,
      rationale: "The customer asked for a quote and the published managed plan is the fit.",
      confidence: 0.9,
      amountCents: 0,
      companyName: customer,
      relatedId: customerLead?.id,
      payload: {},
    },
    { source: "scheduler", autonomous: true },
  );
  check(
    "the office opened the sale under the delegation",
    opened.status === "executed",
    opened.status,
  );
  const managedOpp = (
    await sql`select id, lead_id, stage, value_cents from opportunities where company_name = ${customer} and stage = 'discovery' order by created_at desc limit 1`
  )[0];
  check(
    "the sale is on the pipeline with the real company",
    Boolean(managedOpp?.id),
    JSON.stringify(managedOpp),
  );
  check(
    "the sale points at the real lead",
    Boolean(customerLead?.id) && managedOpp?.lead_id === customerLead?.id,
    JSON.stringify({ lead: customerLead?.id, opportunity: managedOpp?.lead_id }),
  );

  const quoted = await applyProposedAction(
    "close",
    {
      kind: "issue_quote",
      title: `Quote · ${customer} · health and spend watch`,
      rationale: "The published health and spend watch plan, priced from the rate card.",
      confidence: 0.95,
      amountCents: planPrice,
      companyName: customer,
      relatedId: managedOpp?.id,
      payload: { rateId: "health-watch", location: "remote", quantity: 1 },
    },
    { source: "scheduler", autonomous: true },
  );
  check(
    "the office quoted the plan without asking the founder",
    quoted.status === "executed",
    quoted.status,
  );
  const quoteRow = (
    await sql`select id, status, summary, rate_id, created_at from documents where kind = 'quote' and related_id = ${managedOpp?.id} order by created_at desc limit 1`
  )[0];
  check(
    "the quote carries the published plan and price",
    quoteRow?.rate_id === "health-watch" &&
      String(quoteRow?.summary).includes(formatZar(planPrice)),
    String(quoteRow?.summary),
  );
  check(
    "the quote did not stop at the founder gate",
    !quoted.approvalId,
    String(quoted.approvalId),
  );
  const quoteDelegation =
    await sql`select delegation_id from decisions where id = ${quoted.decisionId}`;
  check(
    "the quote was issued under the delegation",
    quoteDelegation[0]?.delegation_id === "primary",
    JSON.stringify(quoteDelegation),
  );

  // ── 26. The caps bite ──────────────────────────────────────────────────────
  // The founder tightens the authority: three actions a day, and nothing worth
  // more than R100. The office may still act, but only inside those bounds.
  const tight = await saveDelegation({
    ...generous,
    maxAmountCents: 10000,
    maxActionsPerDay: 3,
    maxActionsPerMonth: 10,
  });
  check("the founder can tighten the delegation at any time", tight.ok, JSON.stringify(tight));

  const overCap = await applyProposedAction(
    "ledger",
    {
      kind: "start_subscription",
      title: "Subscription over the cap",
      rationale: "The office tried to start a plan worth more than the delegation allows.",
      confidence: 0.9,
      amountCents: planPrice,
      companyName: customer,
      payload: {
        planId: "health-watch",
        rateId: "health-watch",
        cycle: "monthly",
        priceCents: planPrice,
        periodStart: at(),
      },
    },
    { source: "scheduler", autonomous: true },
  );
  check(
    "an action over the per-action cap is refused",
    overCap.status === "blocked",
    overCap.status,
  );
  const overCapReason = await decisionReason(overCap.decisionId);
  check(
    "the refusal names the cap",
    /over the delegation's cap of R100\.00/.test(overCapReason),
    overCapReason,
  );
  const usageAfterOverCap = await readDelegationUsage();
  check(
    "a refused action spends nothing of the delegation",
    usageAfterOverCap.usedToday === 2,
    JSON.stringify(usageAfterOverCap),
  );

  // One action inside the caps: the office sends the customer the quote it
  // issued, with a link they can accept on.
  const quoteNotice = await applyProposedAction(
    "close",
    {
      kind: "send_customer_mail",
      title: `Quote · ${customer}`,
      rationale: "The customer has a quote they have not received.",
      confidence: 0.91,
      amountCents: 0,
      companyName: customer,
      relatedId: quoteRow?.id,
      payload: { template: "quote", quoteDocumentId: quoteRow?.id },
    },
    { source: "scheduler", autonomous: true },
  );
  check(
    "an action inside the caps runs under the delegation",
    quoteNotice.status === "executed",
    `${quoteNotice.status} ${quoteNotice.error ?? ""}`,
  );
  const usageAfterOne = await readDelegationUsage();
  check(
    "the delegation records the action it took",
    usageAfterOne.usedToday === 3,
    JSON.stringify(usageAfterOne),
  );
  const delegatedDecision =
    await sql`select delegation_id from decisions where id = ${quoteNotice.decisionId}`;
  check(
    "the decision records the delegation it ran under",
    delegatedDecision[0]?.delegation_id === "primary",
    JSON.stringify(delegatedDecision),
  );
  const quoteNoticeRow = await sql`
    select id, template, recipient, subject, body, status from customer_notices where id = ${quoteNotice.documentId}
  `;
  check(
    "the office wrote to the address the customer is on file at",
    quoteNoticeRow[0]?.template === "quote" &&
      quoteNoticeRow[0]?.recipient === "admin@harbourpoint.example",
    JSON.stringify(quoteNoticeRow),
  );
  check(
    "the customer notice carries the quote and a link they can accept on",
    /\/q\//.test(String(quoteNoticeRow[0]?.body ?? "")) &&
      String(quoteNoticeRow[0]?.body).includes(formatZar(planPrice)),
    String(quoteNoticeRow[0]?.body).slice(0, 200),
  );

  // The daily cap: the next delegated action is refused because the day's
  // budget is spent.
  const secondNotice = await applyProposedAction(
    "close",
    {
      kind: "send_customer_mail",
      title: `Quote again · ${customer}`,
      rationale: "The office tried to email the customer again the same day.",
      confidence: 0.91,
      amountCents: 0,
      companyName: customer,
      relatedId: quoteRow?.id,
      payload: { template: "quote", quoteDocumentId: quoteRow?.id },
    },
    { source: "scheduler", autonomous: true },
  );
  check(
    "the daily cap stops the next delegated action",
    secondNotice.status === "blocked",
    secondNotice.status,
  );
  const dailyReason = await decisionReason(secondNotice.decisionId);
  check(
    "the refusal names the daily cap",
    /already been used \d+ time\(s\) today/.test(dailyReason),
    dailyReason,
  );
  const usageAfterTwo = await readDelegationUsage();
  check(
    "the refused action did not spend the delegation",
    usageAfterTwo.usedToday === 3,
    JSON.stringify(usageAfterTwo),
  );
  const usageRows = await sql`
    select action_kind, amount_cents, company_name from delegation_usage where delegation_id = 'primary' order by created_at asc
  `;
  check(
    "the usage table records exactly the actions that ran",
    usageRows.length === 3 &&
      usageRows[0].action_kind === "open_opportunity" &&
      usageRows[1].action_kind === "issue_quote" &&
      usageRows[2].action_kind === "send_customer_mail" &&
      usageRows.every((row) => row.company_name === customer),
    JSON.stringify(usageRows),
  );
  const blockedUsage = await sql`
    select id from decisions where status = 'blocked' and delegation_id is not null
  `;
  check(
    "a refused action is never recorded as delegated work",
    blockedUsage.length === 0,
    JSON.stringify(blockedUsage),
  );

  // The founder widens it again, and the office carries on.
  const widened = await saveDelegation(generous);
  check("the founder can widen the delegation again", widened.ok, JSON.stringify(widened));

  // ── 27. The customer accepts on their link ─────────────────────────────────
  // The customer accepts on their link, exactly as in section 9.
  const managedLink = await createQuoteLink(quoteRow.id);
  check(
    "the customer gets a link to the managed plan",
    managedLink.ok,
    JSON.stringify(managedLink),
  );
  const managedAnswer = await answerPublicQuote(managedLink.token, {
    outcome: "accepted",
    name: "Dr A. Meyer",
    note: "Please start the plan.",
  });
  check(
    "the customer accepted the managed plan on their link",
    managedAnswer.ok,
    JSON.stringify(managedAnswer),
  );
  const wonOpp =
    await sql`select stage, value_cents from opportunities where id = ${managedOpp.id}`;
  check("the managed plan opportunity is won", wonOpp[0]?.stage === "won", JSON.stringify(wonOpp));
  check(
    "the won figure is the published monthly price",
    Number(wonOpp[0]?.value_cents) === planPrice,
    String(wonOpp[0]?.value_cents),
  );

  // The first period is the quote they accepted and paid for. The founder
  // raises that invoice, exactly as in section 10; the office bills every
  // period after it by itself.
  const firstInvoice = await raiseQuoteInvoice(managedOpp.id, "none");
  check("the first period is invoiced", firstInvoice.ok, JSON.stringify(firstInvoice));
  const firstPeriodInvoice = await sql`
    select id, amount_cents, status from ledger_entries
    where kind = 'invoice' and related_id = ${managedOpp.id}
  `;
  check(
    "the first-period invoice is the published price",
    firstPeriodInvoice.length === 1 && Number(firstPeriodInvoice[0].amount_cents) === planPrice,
    JSON.stringify(firstPeriodInvoice),
  );

  // ── 28. The subscription starts itself ─────────────────────────────────────
  // A customer who accepted a recurring plan has bought a subscription, not a
  // one-off job. The office must notice that on its own.
  await advanceAndTick(300); // past the ledger_start_subscription cadence — 240
  await advanceAndTick(300);
  const officeStarted = await sql`
    select id, plan_id, cycle, price_cents, next_billing_at from subscriptions where company_name = ${customer}
  `;
  check(
    "the office started the subscription on its own",
    officeStarted.length === 1,
    JSON.stringify(officeStarted),
  );
  const startWork = await sql`
    select id, status, outcome from work_items where kind = 'start_subscription_cycle'
  `;
  const startRun = await sql`
    select status, briefing from agent_runs where duty = 'start_subscription_cycle'
    order by started_at desc limit 1
  `;
  check(
    "the office filed the work that starts the subscription",
    startWork.length >= 1 || startRun.length >= 1,
    JSON.stringify({ work: startWork, run: startRun }),
  );

  // The founder's own path still works, so the rest of the run can prove what
  // the office does with a subscription once it has one.
  if (!officeStarted.length) {
    const byHand = await startSubscriptionForOpportunity(managedOpp.id, "health-watch");
    check("the founder can start the subscription by hand", byHand.ok, JSON.stringify(byHand));
  }
  const subscription =
    (await listSubscriptions()).find((row) => row.companyName === customer) ?? null;
  check(
    "the subscription is on the recurring-revenue book",
    Boolean(subscription),
    JSON.stringify(subscription),
  );
  check(
    "the subscription carries the published plan, price and cycle",
    subscription?.planId === "health-watch" &&
      subscription.priceCents === planPrice &&
      subscription.cycle === "monthly",
    JSON.stringify(subscription),
  );
  const acceptedQuote = await sql`
    select coalesce(accepted_at, created_at) as accepted_at
    from documents where id = ${quoteRow.id}
  `;
  const acceptedAt = new Date(acceptedQuote[0].accepted_at).toISOString();
  check(
    "the subscription bills one cycle after the acceptance",
    Boolean(subscription) &&
      Date.parse(subscription.nextBillingAt) === Date.parse(addMonths(acceptedAt, 1)),
    `${subscription?.nextBillingAt} vs ${addMonths(acceptedAt, 1)}`,
  );
  check(
    "the subscription carries the address the customer is on file at",
    subscription?.contactEmail === "admin@harbourpoint.example",
    String(subscription?.contactEmail),
  );

  // ── 29. The next period is billed, once ────────────────────────────────────
  const receivableBefore = Number(
    (await sql`select receivable_cents from company_state`)[0].receivable_cents,
  );
  const minutesToBilling = subscription
    ? Math.ceil((Date.parse(subscription.nextBillingAt) - Date.parse(at())) / 60_000) + 10
    : 0;
  await advanceAndTick(minutesToBilling);
  await advanceAndTick(120);
  const cycles = await listBillingCycles();
  const cycle = cycles.find((row) => row.subscriptionId === subscription?.id);
  check("the next period is on the billing ledger", Boolean(cycle), JSON.stringify(cycles));
  check(
    "the period is billed at the published price",
    cycle?.amountCents === planPrice && cycle.planId === "health-watch",
    JSON.stringify(cycle),
  );
  const receivableAfter = Number(
    (await sql`select receivable_cents from company_state`)[0].receivable_cents,
  );
  check(
    "the receivable went up by exactly the published price",
    receivableAfter - receivableBefore === planPrice,
    `${receivableBefore} → ${receivableAfter}`,
  );
  const billingDecision = await sql`
    select delegation_id, status from decisions
    where action_kind = 'issue_invoice' and action_json like ${`%${cycle?.id}%`}
  `;
  check(
    "the office billed the customer under the delegation",
    billingDecision[0]?.status === "executed" && billingDecision[0]?.delegation_id === "primary",
    JSON.stringify(billingDecision),
  );
  const periodIndex = await sql`
    select indexdef from pg_indexes
    where tablename = 'billing_cycles' and indexname = 'billing_cycles_period_idx'
  `;
  check(
    "one invoice per period is guaranteed by a unique index",
    periodIndex.length === 1 && /UNIQUE/.test(String(periodIndex[0].indexdef)),
    JSON.stringify(periodIndex),
  );

  // Advancing the clock again must not bill the same period twice.
  await advanceAndTick(120);
  const cyclesAgain = await listBillingCycles();
  check(
    "the same period is never billed twice",
    cyclesAgain.filter((row) => row.subscriptionId === subscription?.id).length === 1,
    JSON.stringify(cyclesAgain.map((row) => `${row.periodStart}:${row.status}`)),
  );
  const periodRows = await sql`
    select period_start, count(*)::int as n from billing_cycles
    where subscription_id = ${subscription?.id ?? "none"} group by period_start
  `;
  check(
    "there is exactly one billing cycle row per period",
    periodRows.every((row) => Number(row.n) === 1),
    JSON.stringify(periodRows),
  );

  // ── 30. The office matches the payment on its own ──────────────────────────
  // The customer says they paid, quoting the reference on the invoice. With
  // the delegation in place, the office matches it to the cent by itself.
  const cycleInvoiceDoc = await sql`
    select summary from documents where id = ${cycle?.documentId ?? "none"} limit 1
  `;
  const cycleReference = /Reference:\s*(VA-[A-Z0-9]+)/.exec(
    String(cycleInvoiceDoc[0]?.summary ?? ""),
  )?.[1];
  check(
    "the recurring invoice carries a payment reference",
    Boolean(cycleReference),
    String(cycleInvoiceDoc[0]?.summary),
  );
  const paymentNotice = await filePaymentNotice({
    name: customer,
    email: "admin@harbourpoint.example",
    reference: String(cycleReference),
    amount: (planPrice / 100).toFixed(2),
  });
  check("the customer filed a payment notice", paymentNotice.ok, JSON.stringify(paymentNotice));
  const treasuryBeforeMatch = Number(
    (await sql`select treasury_cents from company_state`)[0].treasury_cents,
  );
  await advanceAndTick(150); // past the ledger_payment_notices cadence — 120
  await advanceAndTick(120);
  const paidCycle = (await listBillingCycles()).find((row) => row.id === cycle?.id);
  check(
    "the office matched the payment to the invoice",
    paidCycle?.status === "paid",
    JSON.stringify(paidCycle),
  );
  const paidInvoiceRow = await sql`
    select status from ledger_entries where kind = 'invoice' and related_id = ${cycle?.id ?? "none"}
  `;
  check(
    "the recurring invoice is marked paid",
    paidInvoiceRow[0]?.status === "paid",
    JSON.stringify(paidInvoiceRow),
  );
  const treasuryAfterMatch = Number(
    (await sql`select treasury_cents from company_state`)[0].treasury_cents,
  );
  check(
    "the matched payment reached the treasury",
    treasuryAfterMatch - treasuryBeforeMatch === planPrice,
    `${treasuryBeforeMatch} → ${treasuryAfterMatch}`,
  );

  // ── 31. The deliverable is produced from the office's own records ──────────
  await advanceAndTick(120);
  await advanceAndTick(120);
  const reportRows = await sql`
    select id, title, status, summary, related_id from documents where kind = 'service_report'
  `;
  const report = reportRows.find((row) => row.related_id === cycle?.id);
  check(
    "a service report exists for the period",
    Boolean(report),
    JSON.stringify(reportRows.map((row) => row.title)),
  );
  check(
    "the report names the customer it was produced for",
    String(report?.title).includes(customer),
    String(report?.title),
  );
  check(
    "the report names the period it covers",
    String(report?.summary).includes(String(cycle?.periodStart).slice(0, 10)),
    String(report?.summary).slice(0, 160),
  );
  // The report states what happened. The one place it may name a promise is
  // the footer, where it denies it: "is not a guarantee of future performance".
  const reportBody = String(report?.summary)
    .split("is not a guarantee of future performance")
    .join("");
  check(
    "the report promises the customer nothing",
    !/guarantee|24\/7|uptime|\bSLA\b|we will (restore|resolve|fix)/i.test(reportBody),
    reportBody.slice(0, 200),
  );
  const fulfilmentDecision = await sql`
    select delegation_id, status from decisions where action_kind = 'fulfil_service' order by created_at desc limit 1
  `;
  check(
    "the office delivered the service under the delegation",
    fulfilmentDecision[0]?.status === "executed" &&
      fulfilmentDecision[0]?.delegation_id === "primary",
    JSON.stringify(fulfilmentDecision),
  );

  // ── 32. The customer notice is prepared and recorded ───────────────────────
  await advanceAndTick(120);
  await advanceAndTick(120);
  const noticeRows = await sql`
    select id, template, recipient, subject, body, status, detail
    from customer_notices where cycle_id = ${cycle?.id ?? "none"}
  `;
  const noticeWork = await sql`
    select id, status, attempts, last_error, outcome from work_items
    where kind = 'send_service_notice' order by created_at desc limit 1
  `;
  const noticeRun = await sql`
    select status, briefing from agent_runs where duty = 'send_service_notice'
    order by started_at desc limit 1
  `;
  const noticeTrace = JSON.stringify({
    work: noticeWork[0] ?? null,
    run: noticeRun[0] ?? null,
  });
  check(
    "a customer notice was prepared for the period",
    noticeRows.length === 1,
    `${JSON.stringify(noticeRows.map((row) => `${row.template}:${row.status}`))} ${noticeTrace}`,
  );
  check(
    "the notice is the service report template",
    noticeRows[0]?.template === "service_report",
    String(noticeRows[0]?.template),
  );
  check(
    "the notice went to the address the customer is on file at",
    noticeRows[0]?.recipient === "admin@harbourpoint.example",
    String(noticeRows[0]?.recipient),
  );
  check(
    "the notice carries the report",
    String(noticeRows[0]?.body).includes(String(report?.summary).slice(0, 60)),
    String(noticeRows[0]?.body).slice(0, 160),
  );
  check(
    "the notice is not recorded as sent, because nothing was sent",
    noticeRows[0]?.status !== "sent" &&
      ["approved_unsent", "not_delivered"].includes(String(noticeRows[0]?.status)),
    String(noticeRows[0]?.status),
  );
  check(
    "the office wrote down why the customer was not emailed",
    /not sent|not promise|SMTP|mail/i.test(
      String(noticeWork[0]?.outcome ?? noticeRun[0]?.briefing ?? ""),
    ),
    noticeTrace,
  );
  const claimedSent = await sql`
    select count(*)::int as n from customer_notices where status = 'sent'
  `;
  check(
    "the office never claims to have emailed a customer it did not email",
    Number(claimedSent[0].n) === 0,
    JSON.stringify(claimedSent),
  );
  const noticeBook = (await listCustomerNotices()).filter(
    (notice) => notice.companyName === customer,
  );
  check(
    "the office keeps a record of every notice it prepared",
    noticeBook.length >= 1 &&
      noticeBook.every((notice) => notice.recipient === "admin@harbourpoint.example") &&
      noticeBook.every((notice) => notice.status !== "sent"),
    JSON.stringify(
      noticeBook.map((notice) => `${notice.template}:${notice.status}:${notice.recipient}`),
    ),
  );

  // ── 33. Revocation takes effect immediately ───────────────────────────────
  const revoked = await revokeDelegation("The founder ended the standing authority.");
  check("the delegation was revoked", revoked.ok, JSON.stringify(revoked));
  const afterRevocation = await readDelegation();
  check(
    "the policy reads back as revoked",
    afterRevocation?.status === "revoked",
    JSON.stringify(afterRevocation),
  );
  const afterRevokeAction = await applyProposedAction(
    "desk",
    {
      kind: "send_customer_mail",
      title: `Managed plan started · ${customer}`,
      rationale: "The office tried to tell the customer after the founder revoked the delegation.",
      confidence: 0.92,
      amountCents: 0,
      companyName: customer,
      relatedId: subscription?.id,
      payload: { template: "subscription_started", subscriptionId: subscription?.id },
    },
    { source: "scheduler", autonomous: true },
  );
  check(
    "a delegated action is refused the moment the delegation is revoked",
    afterRevokeAction.status === "blocked",
    afterRevokeAction.status,
  );
  check(
    "the refusal names the revocation",
    /revoked/.test(await decisionReason(afterRevokeAction.decisionId)),
    await decisionReason(afterRevokeAction.decisionId),
  );
  const revocationAudit = await sql`
    select kind, body from audit_events where kind = 'delegation_revoked'
  `;
  check(
    "the revocation is on the audit chain",
    revocationAudit.length === 1 && revocationAudit[0].body.includes("standing delegation"),
    JSON.stringify(revocationAudit),
  );

  // ── 34. The founder's own path is unaffected ───────────────────────────────
  // A delegation exists so the office can act alone. It must never stop the
  // founder from acting, and it must never spend the office's own budget.
  const usageBeforeFounder = await readDelegationUsage();
  const founderAction = await applyProposedAction(
    "desk",
    {
      kind: "send_customer_mail",
      title: `Managed plan started · ${customer}`,
      rationale: "The founder asked for this to be sent by hand.",
      confidence: 0.98,
      amountCents: 0,
      companyName: customer,
      relatedId: subscription?.id,
      payload: { template: "subscription_started", subscriptionId: subscription?.id },
    },
    { source: "founder" },
  );
  check(
    "the founder can still act without a delegation",
    founderAction.status === "executed",
    founderAction.status,
  );
  const usageAfterFounder = await readDelegationUsage();
  check(
    "a founder action does not spend the delegation",
    usageAfterFounder.usedToday === usageBeforeFounder.usedToday,
    `${usageBeforeFounder.usedToday} → ${usageAfterFounder.usedToday}`,
  );
  const founderDecision =
    await sql`select delegation_id from decisions where id = ${founderAction.decisionId}`;
  check(
    "the founder's action is not recorded as delegated work",
    founderDecision[0]?.delegation_id === null,
    JSON.stringify(founderDecision),
  );

  // ── 35. The recurring-revenue numbers are real ─────────────────────────────
  const revenue = await revenueMetrics();
  check(
    "the revenue book counts the active subscription",
    revenue.activeSubscriptions === 1,
    JSON.stringify(revenue),
  );
  check(
    "the monthly recurring revenue is the published monthly price",
    revenue.monthlyRecurringCents === planPrice,
    String(revenue.monthlyRecurringCents),
  );
  check(
    "the annual figure is consistent with the monthly one",
    revenue.annualRecurringCents === planPrice * 12,
    String(revenue.annualRecurringCents),
  );
  check(
    "the plan mix names the plan and its price",
    revenue.planMix.some((row) => row.planId === "health-watch" && row.monthlyCents === planPrice),
    JSON.stringify(revenue.planMix),
  );
  const subscriptionBook = await listSubscriptions();
  check(
    "the recurring-revenue book holds the real subscription",
    subscriptionBook.length === 1 &&
      subscriptionBook[0].companyName === customer &&
      subscriptionBook[0].priceCents === planPrice,
    JSON.stringify(subscriptionBook),
  );

  const customerBook = await listCustomerAccounts();
  const account = customerBook.accounts.find(
    (row) => row.companyName.toLowerCase() === customer.toLowerCase(),
  );
  check(
    "the customer book assembles the real account from its records",
    account?.status === "client" &&
      account.activeSubscriptions === 1 &&
      account.monthlyRecurringCents === planPrice &&
      account.planIds.includes("health-watch"),
    JSON.stringify(account),
  );
  check(
    "the customer book summary agrees with the recurring-revenue book",
    customerBook.summary.clients >= 1 &&
      customerBook.summary.activeSubscriptions === revenue.activeSubscriptions &&
      customerBook.summary.monthlyRecurringCents === revenue.monthlyRecurringCents,
    JSON.stringify(customerBook.summary),
  );
  check(
    "the ageing buckets account for every issued invoice",
    revenue.aging.currentCents +
      revenue.aging.days8To30Cents +
      revenue.aging.days31To60Cents +
      revenue.aging.over60Cents ===
      revenue.outstandingCents,
    JSON.stringify(revenue.aging),
  );
  check(
    "the customer CSV carries the account and its plan",
    customerAccountsToCsv(customerBook.accounts).includes(customer) &&
      customerAccountsToCsv(customerBook.accounts).includes(plan.title),
    customerAccountsToCsv(customerBook.accounts).slice(0, 300),
  );

  const signals = await listSiteSignals(30);
  check(
    "the site-signal panel reads the real recorded visits",
    signals.pageViews >= 5 && signals.totalEvents >= 5,
    JSON.stringify({ pageViews: signals.pageViews, totalEvents: signals.totalEvents }),
  );
  check(
    "the site-signal panel ranks the pages that were actually visited",
    signals.topPages.some((row) => row.label === "/" && row.count >= 2),
    JSON.stringify(signals.topPages),
  );

  // ── 36. The chain still verifies, and the office still agrees ──────────────
  const chain3 = await sql`
    select id, previous_hash, record_hash, created_at from (
      select id, previous_hash, record_hash, created_at from audit_events
      union all
      select id, previous_hash, record_hash, created_at from decisions
    ) c order by created_at asc
  `;
  const head3 = await sql`select last_audit_hash from company_state`;
  const verdict3 = verifyChainLinks(
    chain3.map((row) => ({
      id: String(row.id),
      previousHash: String(row.previous_hash),
      recordHash: String(row.record_hash),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    String(head3[0].last_audit_hash),
  );
  check("the chain still verifies after the delegation ran", verdict3.ok, verdict3.detail);
  check(
    "the delegation added real decisions to the chain",
    verdict3.checked > verdict2.checked,
    `${verdict2.checked} → ${verdict3.checked}`,
  );

  const healthAfterDelegation = await officeHealth({ full: true });
  check(
    "health still reports the chain intact",
    healthAfterDelegation.chain.ok,
    healthAfterDelegation.chain.detail,
  );
  const books = await sql`select treasury_cents, receivable_cents from company_state`;
  check(
    "health reports the money the books hold",
    healthAfterDelegation.money.treasuryCents === Number(books[0].treasury_cents) &&
      healthAfterDelegation.money.receivableCents === Number(books[0].receivable_cents),
    JSON.stringify(healthAfterDelegation.money),
  );
  check(
    "health found no audit or halt problem",
    healthAfterDelegation.problems.every(
      (problem) =>
        !problem.startsWith("Audit chain") &&
        !problem.startsWith("Office is halted") &&
        !problem.startsWith("The scheduler"),
    ),
    JSON.stringify(healthAfterDelegation.problems),
  );
  const snapshotAfterDelegation = await readSnapshot();
  check(
    "the snapshot carries the delegation the founder wrote",
    snapshotAfterDelegation.delegation?.status === "revoked",
    JSON.stringify(snapshotAfterDelegation.delegation),
  );
  check(
    "the snapshot carries the recurring revenue",
    snapshotAfterDelegation.revenue?.monthlyRecurringCents === planPrice,
    JSON.stringify(snapshotAfterDelegation.revenue),
  );

  // ── 37. Dead work waits for the founder, and only the founder ─────────────
  // A duty that keeps failing must stop being retried, and it must not
  // disappear either: it waits in the dead-letter queue with its error
  // attached. Nothing in the scheduler may put it back. The button in the
  // autonomy panel calls the same function this section calls.
  const deadKind = "verify_dead_letter";
  await enqueueWork({
    // Its own agent id, so the claim below cannot pick up somebody else's item.
    agentId: "verify",
    kind: deadKind,
    reason: "A duty that cannot succeed, filed to prove the dead-letter queue is real.",
    maxAttempts: 1,
    dedupeKey: "verify-dead-letter",
  });
  const filed = (await listWork(500)).find((item) => item.kind === deadKind);
  check("the test item is on the queue", Boolean(filed), JSON.stringify(filed));
  const claimed = await claimWork("verify");
  check("the item was claimed for an attempt", claimed?.id === filed.id);
  await failWork(filed.id, "the vendor portal was unreachable", 1);
  const dead = (await listWork(500)).find((item) => item.id === filed.id);
  check("the item is abandoned, not retried forever", dead.status === "abandoned", dead.status);
  check(
    "the error is kept for whoever reads the queue",
    String(dead.lastError ?? "").includes("vendor portal"),
    String(dead.lastError ?? ""),
  );
  const deadRow = await sql`
    select finished_at, due_at from work_items where id = ${filed.id}
  `;
  check(
    "the abandoned item is stamped as finished",
    Boolean(deadRow[0]?.finished_at),
    JSON.stringify(deadRow[0]),
  );
  const backoffMinutes = Math.round((Date.parse(String(deadRow[0].due_at)) - Date.now()) / 60_000);
  check(
    "the retry backoff is minutes, not seconds",
    backoffMinutes >= 1 && backoffMinutes <= 3,
    `${backoffMinutes} minute(s)`,
  );

  // A tick must leave it alone. If the office could redrive its own dead
  // work, a permanently broken duty would loop forever and the founder would
  // never be told.
  const tickDuringDead = await advanceAndTick(10);
  check(
    "the office still ticks with a dead item in the queue",
    tickDuringDead.ok,
    tickDuringDead.detail,
  );
  const stillDead = (await listWork(500)).find((item) => item.id === filed.id);
  check("no tick redrives dead work", stillDead.status === "abandoned", stillDead.status);

  // A queue item with a missing runner is a software/registration failure,
  // not completed work. Keep it retryable and visible in the dead-letter path.
  const missingRunnerKind = "verify_missing_runner";
  await enqueueWork({
    agentId: "vantage",
    kind: missingRunnerKind,
    reason: "A runner was deliberately omitted to verify scheduler recovery.",
    priority: 0,
    maxAttempts: 1,
    dedupeKey: "verify-missing-runner",
  });
  const missingRunnerTick = await advanceAndTick(10);
  const missingRunnerItem = (await listWork(500)).find((item) => item.kind === missingRunnerKind);
  const missingRunnerRuns = await sql`
    select status, briefing
    from agent_runs
    where work_item_id = ${missingRunnerItem?.id}
    order by started_at asc
  `;
  check(
    "an unregistered runner is counted as a failed scheduler run",
    missingRunnerTick.failed >= 1 &&
      missingRunnerTick.ran.some((entry) => entry.note.includes(missingRunnerKind)),
    missingRunnerTick.detail,
  );
  check(
    "missing-runner work is abandoned for founder review, not marked done",
    missingRunnerItem?.status === "abandoned" &&
      missingRunnerItem.attempts === 1 &&
      missingRunnerItem.lastError?.includes(missingRunnerKind),
    JSON.stringify(missingRunnerItem),
  );
  check(
    "missing-runner failure is kept in the agent run history",
    missingRunnerRuns.length === 1 &&
      missingRunnerRuns[0]?.status === "error" &&
      String(missingRunnerRuns[0]?.briefing).includes(missingRunnerKind),
    JSON.stringify(missingRunnerRuns),
  );

  // The founder's own path: the same call the redrive button makes.
  const redriven = await redriveAbandonedWork(filed.id);
  check("the founder can redrive a dead item", redriven.ok, JSON.stringify(redriven));
  const duplicateRedrive = await redriveAbandonedWork(filed.id);
  check(
    "a redrive cannot be applied twice",
    !duplicateRedrive.ok,
    JSON.stringify(duplicateRedrive),
  );
  const back = (await listWork(500)).find((item) => item.id === filed.id);
  check("the redriven item is open again", back.status === "open", back.status);
  check("its attempt count is reset", back.attempts === 0, String(back.attempts));
  check("its error is cleared", back.lastError === null, String(back.lastError));
  check("it is due now", Date.parse(back.dueAt) <= Date.now() + 5_000, back.dueAt);

  const redriveEvents = await sql`
    select kind, body, actor from audit_events where kind = 'work_redriven'
  `;
  check(
    "the redrive is on the audit chain",
    redriveEvents.length === 1,
    JSON.stringify(redriveEvents),
  );
  check(
    "the chain names what was redriven",
    String(redriveEvents[0]?.body ?? "").includes(deadKind),
    String(redriveEvents[0]?.body ?? ""),
  );
  check(
    "the chain says the founder did it",
    redriveEvents[0]?.actor === "founder",
    String(redriveEvents[0]?.actor ?? ""),
  );

  const chain4 = await sql`
    select id, previous_hash, record_hash, created_at from (
      select id, previous_hash, record_hash, created_at from audit_events
      union all
      select id, previous_hash, record_hash, created_at from decisions
    ) c order by created_at asc
  `;
  const head4 = await sql`select last_audit_hash from company_state`;
  const verdict4 = verifyChainLinks(
    chain4.map((row) => ({
      id: String(row.id),
      previousHash: String(row.previous_hash),
      recordHash: String(row.record_hash),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    String(head4[0].last_audit_hash),
  );
  check("the chain still verifies after the redrive", verdict4.ok, verdict4.detail);

  // ── 23. A broken scheduler recovers itself after a clean probe ─────────────
  await sql`
    update office_state
    set consecutive_failures = 5, last_tick_at = now() - interval '40 minutes'
    where id = 'vantage-ars'
  `;
  const recoveryTick = await tick({ now: at() });
  check("a cooled-down breaker allows a recovery tick", recoveryTick.ok, recoveryTick.detail);
  check("the recovery is marked as such", recoveryTick.recovered, String(recoveryTick.recovered));
  check(
    "the recovery tick runs at the recovery pace",
    recoveryTick.posture === "recovery",
    String(recoveryTick.posture),
  );
  const recoveredState = await sql`
    select consecutive_failures, last_posture, last_budget
    from office_state where id = 'vantage-ars'
  `;
  check(
    "the breaker is cleared after a clean probe",
    Number(recoveredState[0]?.consecutive_failures ?? 99) < 5,
    String(recoveredState[0]?.consecutive_failures),
  );
  check(
    "the recovery pace is visible to the founder",
    recoveredState[0]?.last_posture === "recovery" && Number(recoveredState[0]?.last_budget) === 18,
    `${recoveredState[0]?.last_posture} / ${recoveredState[0]?.last_budget}`,
  );
  const recoveryEvents = await sql`
    select kind, body, actor from audit_events where kind = 'scheduler_recovered'
  `;
  check(
    "the recovery is on the audit chain",
    recoveryEvents.length === 1,
    String(recoveryEvents.length),
  );
  check(
    "the chain records the failures that triggered recovery",
    String(recoveryEvents[0]?.body ?? "").includes("5 ticks"),
    String(recoveryEvents[0]?.body ?? ""),
  );
  check(
    "the chain says the office recovered itself",
    recoveryEvents[0]?.actor === "vantage",
    String(recoveryEvents[0]?.actor ?? ""),
  );

  const chain5 = await sql`
    select id, previous_hash, record_hash, created_at from (
      select id, previous_hash, record_hash, created_at from audit_events
      union all
      select id, previous_hash, record_hash, created_at from decisions
    ) c order by created_at asc
  `;
  const head5 = await sql`select last_audit_hash from company_state`;
  const verdict5 = verifyChainLinks(
    chain5.map((row) => ({
      id: String(row.id),
      previousHash: String(row.previous_hash),
      recordHash: String(row.record_hash),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    String(head5[0].last_audit_hash),
  );
  check("the chain still verifies after self-recovery", verdict5.ok, verdict5.detail);

  const withinMarketingCap = await applyProposedAction(
    "signal",
    {
      kind: "activate_campaign",
      title: "Verification paid campaign at monthly cap",
      rationale: "Verification-only check of the paid media ceiling.",
      confidence: 0.95,
      amountCents: 30000,
      payload: { channel: "paid_search" },
    },
    { source: "verification" },
  );
  check(
    "paid campaign at the monthly cap still waits for founder approval",
    withinMarketingCap.status === "escalated",
    `${withinMarketingCap.status} ${withinMarketingCap.error ?? ""}`,
  );

  const minimalMarketingSpend = await applyProposedAction(
    "signal",
    {
      kind: "activate_campaign",
      title: "Verification minimal paid campaign",
      rationale: "Verification-only check that approved campaign spend is recorded.",
      confidence: 0.95,
      amountCents: 1,
      payload: { channel: "paid_search" },
    },
    { source: "verification" },
  );
  check(
    "a minimal paid campaign also waits for founder approval",
    minimalMarketingSpend.status === "escalated",
    `${minimalMarketingSpend.status} ${minimalMarketingSpend.error ?? ""}`,
  );
  const minimalApproval = minimalMarketingSpend.approvalId;
  const minimalApproved = minimalApproval
    ? await resolveApproval({
        approvalId: minimalApproval,
        decision: "approved",
        note: "Verification-only minimal campaign expense.",
      })
    : { ok: false, error: "No campaign approval was filed." };
  check(
    "founder approval records the minimal paid campaign spend",
    minimalApproved.ok,
    minimalApproved.error ?? "",
  );

  const staleMarketingApproval = withinMarketingCap.approvalId
    ? await resolveApproval({
        approvalId: withinMarketingCap.approvalId,
        decision: "approved",
        note: "Verification-only stale campaign approval.",
      })
    : { ok: false, error: "No campaign approval was filed." };
  check(
    "approval rechecks the R300 ceiling after another campaign spends",
    !staleMarketingApproval.ok &&
      /R300 monthly paid-campaign cap/.test(staleMarketingApproval.error ?? ""),
    staleMarketingApproval.error ?? "Unexpected approval result",
  );
  const staleCampaignApproval =
    await sql`select status from approvals where id = ${withinMarketingCap.approvalId}`;
  check(
    "over-budget approval stays pending and unexecuted",
    staleCampaignApproval[0]?.status === "pending",
    JSON.stringify(staleCampaignApproval),
  );

  const overMarketingCap = await applyProposedAction(
    "signal",
    {
      kind: "activate_campaign",
      title: "Verification paid campaign over monthly cap",
      rationale: "Verification-only check of the paid media ceiling.",
      confidence: 0.95,
      amountCents: 30001,
      payload: { channel: "paid_search" },
    },
    { source: "verification" },
  );
  check(
    "paid campaign activation over R300 is blocked by the real transaction path",
    overMarketingCap.status === "blocked",
    `${overMarketingCap.status} ${overMarketingCap.error ?? ""}`,
  );
  const overMarketingCapReason = await decisionReason(overMarketingCap.decisionId);
  check(
    "paid campaign refusal names the monthly ceiling",
    /R300 monthly cap/.test(overMarketingCapReason),
    overMarketingCapReason,
  );
  const uncreatedCampaign =
    await sql`select id from campaigns where name = 'Verification paid campaign over monthly cap'`;
  const unrecordedExpense =
    await sql`select id from ledger_entries where memo = 'Verification-only check of the paid media ceiling.'`;
  check(
    "blocked paid campaign creates no campaign or spend record",
    uncreatedCampaign.length === 0 && unrecordedExpense.length === 0,
    JSON.stringify({ uncreatedCampaign, unrecordedExpense }),
  );
  const finalChain = await sql`
    select id, previous_hash, record_hash, created_at from (
      select id, previous_hash, record_hash, created_at from audit_events
      union all
      select id, previous_hash, record_hash, created_at from decisions
    ) c order by created_at asc
  `;
  const finalHead = await sql`select last_audit_hash from company_state`;
  const finalVerdict = verifyChainLinks(
    finalChain.map((row) => ({
      id: String(row.id),
      previousHash: String(row.previous_hash),
      recordHash: String(row.record_hash),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    String(finalHead[0].last_audit_hash),
  );
  check(
    "the audit chain verifies after the marketing cap checks",
    finalVerdict.ok,
    finalVerdict.detail,
  );

  // ── Result ─────────────────────────────────────────────────────────────────
  const passed = checks.length - failures;
  process.stdout.write(`\n${passed}/${checks.length} checks passed.\n`);
  if (failures) {
    process.stdout.write(
      `\nFAILED:\n${checks
        .filter((c) => !c.ok)
        .map((c) => ` - ${c.name}`)
        .join("\n")}\n`,
    );
  }
  void randomUUID;
  process.exit(failures ? 1 : 0);
}

main()
  .catch((error) => {
    process.stderr.write(`\nVerification crashed: ${error?.stack ?? error}\n`);
    process.exit(1);
  })
  .finally(() => {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup of the temporary database.
    }
  });
