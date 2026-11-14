import {
  db,
  vantageAuditEventsTable,
  vantageAutomationSettingsTable,
  vantageInquiriesTable,
  type VantageInquiry as DbInquiry,
  type VantageQuoteLine,
} from "@workspace/db";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type {
  VantageBankDetails,
  VantageInquiry,
  VantageQuote,
  VantageQuotePreview,
} from "@workspace/api-zod";
import { ensureHubSpotContact } from "./hubspot";
import {
  findSentQuoteMessage,
  isProviderError,
  listCandidateGmailMessages,
  readGmailMessage,
  sendQuoteReply,
} from "./gmail";
import { processInquiryWithGrok } from "./ai";
import { formatZar, RATE_SOURCE_URL } from "./rates";
import {
  BUSINESS_MAIL_QUERY,
  checkProviderStatuses,
  discoverGrokModel,
  getMailboxEmail,
  ProviderError,
} from "./providers";

const AUTOMATION_ID = 1;
const POLL_INTERVAL_MINUTES = 10;
let syncPromise: Promise<SyncSummary> | null = null;

type SyncSummary = {
  scanned: number;
  imported: number;
  alreadySeen: number;
  processed: number;
  awaitingGrok: number;
  inquiries: VantageInquiry[];
  message: string;
};

function asPublicInquiry(row: DbInquiry): VantageInquiry {
  const hasQuote =
    row.quoteReference !== null &&
    row.quoteSubtotal !== null &&
    row.quoteCreatedAt !== null;
  return {
    id: row.id,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    subject: row.subject,
    receivedAt: row.receivedAt,
    summary: row.summary,
    category: row.category,
    urgency: row.urgency,
    status: row.status as VantageInquiry["status"],
    missingInformation: row.missingInformation,
    messageBody: row.messageBody,
    hasAttachments: row.hasAttachments,
    hubspotContactId: row.hubspotContactId,
    hubspotSyncStatus:
      row.hubspotSyncStatus as VantageInquiry["hubspotSyncStatus"],
    quote: hasQuote
      ? {
          id: row.id,
          reference: row.quoteReference!,
          status: row.quoteStatus as VantageQuote["status"],
          currency: "ZAR",
          lines: row.quoteLines,
          subtotal: Number(row.quoteSubtotal),
          notes: row.quoteNotes,
          createdAt: row.quoteCreatedAt!,
          sentAt: row.quoteSentAt?.toISOString() ?? null,
        }
      : null,
  };
}

async function getInquiryOrThrow(inquiryId: string) {
  const [row] = await db
    .select()
    .from(vantageInquiriesTable)
    .where(eq(vantageInquiriesTable.id, inquiryId))
    .limit(1);
  if (!row) throw new OperationsError(404, "Enquiry not found.");
  return row;
}

export class OperationsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OperationsError";
  }
}

function cleanBankDetails(value: unknown): VantageBankDetails {
  if (!value || typeof value !== "object") {
    throw new OperationsError(400, "Enter all banking details for this quote.");
  }
  const input = value as Record<string, unknown>;
  const result = {
    accountName: input.accountName,
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    branchCode: input.branchCode,
    accountType: input.accountType,
  };
  for (const [key, entry] of Object.entries(result)) {
    if (
      typeof entry !== "string" ||
      entry.trim().length < (key === "accountNumber" || key === "branchCode" ? 3 : 1) ||
      entry.length > 100 ||
      /[\r\n<>]/.test(entry)
    ) {
      throw new OperationsError(400, "Check the banking details and try again.");
    }
  }
  return {
    accountName: (result.accountName as string).trim(),
    bankName: (result.bankName as string).trim(),
    accountNumber: (result.accountNumber as string).trim(),
    branchCode: (result.branchCode as string).trim(),
    accountType: (result.accountType as string).trim(),
  };
}

function renderQuoteEmail(
  row: DbInquiry,
  bank: VantageBankDetails,
): VantageQuotePreview {
  if (
    row.quoteStatus !== "ready" ||
    !row.quoteReference ||
    !row.quoteSubtotal ||
    row.quoteLines.length === 0
  ) {
    throw new OperationsError(400, "This enquiry does not have a quote ready to send.");
  }

  const lines = row.quoteLines
    .map(
      (line: VantageQuoteLine) =>
        `${line.description}: ${line.quantity} ${line.unit} × ${formatZar(line.unitPrice)} = ${formatZar(line.total)}`,
    )
    .join("\n");
  const plainTextBody = [
    `Hello ${row.customerName},`,
    "",
    `Thank you for contacting Vantage ARS. Please review quote ${row.quoteReference}.`,
    "",
    "QUOTE",
    `Reference: ${row.quoteReference}`,
    `Enquiry: ${row.subject}`,
    "",
    lines,
    "",
    `Subtotal: ${formatZar(Number(row.quoteSubtotal))}`,
    "",
    "Terms",
    ...row.quoteNotes.map((note) => `• ${note}`),
    "",
    "Payment details",
    `Account name: ${bank.accountName}`,
    `Bank: ${bank.bankName}`,
    `Account number: ${bank.accountNumber}`,
    `Branch code: ${bank.branchCode}`,
    `Account type: ${bank.accountType}`,
    "",
    "Please reply to this email to accept or discuss the quote. Work begins only after written acceptance.",
    "",
    "Vantage ARS",
    "https://vantage-ars.co.za",
    "",
    "Banking details are included in this email and will remain in the Gmail Sent folder after sending.",
  ].join("\n");

  return {
    recipientEmail: row.customerEmail,
    subject: /^re:/i.test(row.subject) ? row.subject : `Re: ${row.subject}`,
    plainTextBody,
    plannedActions: [
      `Send this exact message to ${row.customerEmail} from the connected Gmail account.`,
      "After a separate owner approval, create or find this customer in HubSpot without changing an existing contact.",
      "No work is scheduled and no payment is collected by this action.",
    ],
  };
}

async function audit(
  inquiryId: string | null,
  ownerUserId: string,
  eventType: string,
  details: Record<string, string | number | boolean | null> = {},
) {
  await db.insert(vantageAuditEventsTable).values({
    inquiryId,
    ownerUserId,
    eventType,
    details,
  });
}

async function recordLastRun() {
  await db
    .insert(vantageAutomationSettingsTable)
    .values({ id: AUTOMATION_ID, lastRunAt: new Date() })
    .onConflictDoUpdate({
      target: vantageAutomationSettingsTable.id,
      set: { lastRunAt: new Date(), updatedAt: new Date() },
    });
}

async function importAndProcessGmail(): Promise<SyncSummary> {
  const candidates = await listCandidateGmailMessages();
  let imported = 0;
  let alreadySeen = 0;
  let processed = 0;
  let awaitingGrok = 0;

  for (const candidate of candidates) {
    const [alreadyImported] = await db
      .select({ id: vantageInquiriesTable.id })
      .from(vantageInquiriesTable)
      .where(eq(vantageInquiriesTable.gmailMessageId, candidate.id))
      .limit(1);
    if (alreadyImported) {
      alreadySeen += 1;
      continue;
    }
    const message = await readGmailMessage(candidate.id);
    if (!message) continue;
    const [inserted] = await db
      .insert(vantageInquiriesTable)
      .values({
        gmailMessageId: message.id,
        gmailThreadId: message.threadId,
        originalMessageId: message.originalMessageId,
        customerEmail: message.senderEmail,
        customerName: message.senderName,
        subject: message.subject,
        receivedAt: message.receivedAt,
        messageBody: message.messageBody,
        hasAttachments: message.hasAttachments,
      })
      .onConflictDoNothing({ target: vantageInquiriesTable.gmailMessageId })
      .returning();

    if (!inserted) {
      alreadySeen += 1;
      continue;
    }
    imported += 1;
    try {
      await processInquiryWithGrok(inserted);
      processed += 1;
    } catch (error) {
      awaitingGrok += 1;
      await db
        .update(vantageInquiriesTable)
        .set({
          status: "needs_review",
          summary: "Grok could not complete the first review. Retry after the AI connection is restored.",
          missingInformation: ["AI processing failed; review this email manually."],
          processingError:
            error instanceof Error ? error.message.slice(0, 300) : "Grok processing failed.",
          updatedAt: new Date(),
        })
        .where(eq(vantageInquiriesTable.id, inserted.id));
    }
  }

  await recordLastRun();
  const recent = await db
    .select()
    .from(vantageInquiriesTable)
    .orderBy(desc(vantageInquiriesTable.receivedAt))
    .limit(100);

  return {
    scanned: candidates.length,
    imported,
    alreadySeen,
    processed,
    awaitingGrok,
    inquiries: recent.map(asPublicInquiry),
    message:
      candidates.length === 0
        ? "No matching live Gmail enquiries were found."
        : `Scanned ${candidates.length} live messages; imported ${imported}, already seen ${alreadySeen}, reviewed ${processed}.`,
  };
}

export function syncInquiries(): Promise<SyncSummary> {
  if (syncPromise) return syncPromise;
  syncPromise = importAndProcessGmail().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

export async function listInquiries(status: string) {
  const rows =
    status === "all"
      ? await db
          .select()
          .from(vantageInquiriesTable)
          .orderBy(desc(vantageInquiriesTable.receivedAt))
          .limit(200)
      : await db
          .select()
          .from(vantageInquiriesTable)
          .where(eq(vantageInquiriesTable.status, status))
          .orderBy(desc(vantageInquiriesTable.receivedAt))
          .limit(200);
  return rows.map(asPublicInquiry);
}

export async function getDashboard() {
  const [services, [counts], [settings]] = await Promise.all([
    checkProviderStatuses(),
    db
      .select({
        needsReview: sql<number>`count(*) filter (where ${vantageInquiriesTable.status} = 'needs_review')::int`,
        needsInformation: sql<number>`count(*) filter (where ${vantageInquiriesTable.status} = 'needs_information')::int`,
        quotesReady: sql<number>`count(*) filter (where ${vantageInquiriesTable.quoteStatus} = 'ready')::int`,
        quotesSent: sql<number>`count(*) filter (where ${vantageInquiriesTable.quoteStatus} = 'sent')::int`,
        crmSyncNeeded: sql<number>`count(*) filter (where ${vantageInquiriesTable.quoteStatus} = 'sent' and ${vantageInquiriesTable.hubspotSyncStatus} in ('awaiting_approval', 'needs_attention'))::int`,
      })
      .from(vantageInquiriesTable),
    db
      .select()
      .from(vantageAutomationSettingsTable)
      .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID))
      .limit(1),
  ]);

  return {
    services,
    counts: counts ?? {
      needsReview: 0,
      needsInformation: 0,
      quotesReady: 0,
      quotesSent: 0,
      crmSyncNeeded: 0,
    },
    lastSyncAt: settings?.lastRunAt?.toISOString() ?? null,
    rateSourceUrl: RATE_SOURCE_URL,
  };
}

async function automationIsReady() {
  const results = await Promise.allSettled([getMailboxEmail(), discoverGrokModel()]);
  return results.every((result) => result.status === "fulfilled");
}

export async function getAutomationSettings() {
  const [settings, providerReady] = await Promise.all([
    db
      .select()
      .from(vantageAutomationSettingsTable)
      .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID))
      .limit(1),
    automationIsReady(),
  ]);
  return {
    enabled: settings[0]?.enabled ?? false,
    intervalMinutes: POLL_INTERVAL_MINUTES,
    matchingQuery: BUSINESS_MAIL_QUERY,
    providerReady,
    lastRunAt: settings[0]?.lastRunAt?.toISOString() ?? null,
  };
}

export async function setAutomationEnabled(enabled: boolean, ownerUserId: string) {
  if (enabled && !(await automationIsReady())) {
    throw new OperationsError(
      400,
      "Gmail and Grok must both be available before automatic inbox processing can be enabled.",
    );
  }

  await db
    .insert(vantageAutomationSettingsTable)
    .values({ id: AUTOMATION_ID, enabled })
    .onConflictDoUpdate({
      target: vantageAutomationSettingsTable.id,
      set: { enabled, updatedAt: new Date() },
    });
  await audit(null, ownerUserId, enabled ? "automation_enabled" : "automation_paused");
  return getAutomationSettings();
}

export async function getQuotePreview(inquiryId: string, bankInput: unknown) {
  const row = await getInquiryOrThrow(inquiryId);
  return renderQuoteEmail(row, cleanBankDetails(bankInput));
}

export async function decideQuote(
  inquiryId: string,
  ownerUserId: string,
  decision: "approve" | "decline",
  bankInput?: unknown,
) {
  if (decision === "decline") {
    const [updated] = await db
      .update(vantageInquiriesTable)
      .set({
        status: "declined",
        quoteStatus: "declined",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vantageInquiriesTable.id, inquiryId),
          eq(vantageInquiriesTable.quoteStatus, "ready"),
        ),
      )
      .returning();
    if (!updated) {
      const row = await getInquiryOrThrow(inquiryId);
      throw new OperationsError(
        409,
        `This quote is ${row.quoteStatus} and cannot be declined from its current state.`,
      );
    }
    await audit(inquiryId, ownerUserId, "quote_declined");
    return { inquiry: asPublicInquiry(updated), message: "Quote proposal declined." };
  }

  const bank = cleanBankDetails(bankInput);
  const [claimed] = await db
    .update(vantageInquiriesTable)
    .set({ quoteStatus: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(vantageInquiriesTable.id, inquiryId),
        eq(vantageInquiriesTable.quoteStatus, "ready"),
      ),
    )
    .returning();
  if (!claimed) {
    const row = await getInquiryOrThrow(inquiryId);
    throw new OperationsError(
      409,
      `This quote is ${row.quoteStatus}; it cannot be sent again.`,
    );
  }

  const preview = renderQuoteEmail(claimed, bank);
  await audit(inquiryId, ownerUserId, "quote_send_approved", {
    recipient: claimed.customerEmail,
    quoteReference: claimed.quoteReference,
  });

  try {
    const sent = await sendQuoteReply({
      customerEmail: claimed.customerEmail,
      originalSubject: claimed.subject,
      originalThreadId: claimed.gmailThreadId,
      originalMessageId: claimed.originalMessageId,
      quoteReference: claimed.quoteReference!,
      plainTextBody: preview.plainTextBody,
    });
    const [updated] = await db
      .update(vantageInquiriesTable)
      .set({
        status: "quote_sent",
        quoteStatus: "sent",
        quoteSentAt: new Date(),
        gmailSentMessageId: sent.id,
        hubspotSyncStatus: "awaiting_approval",
        updatedAt: new Date(),
      })
      .where(eq(vantageInquiriesTable.id, inquiryId))
      .returning();
    return { inquiry: asPublicInquiry(updated!), message: "Quote sent through Gmail." };
  } catch (error) {
    let sentMessage: { id: string; threadId: string } | null = null;
    try {
      sentMessage = await findSentQuoteMessage({
        customerEmail: claimed.customerEmail,
        quoteReference: claimed.quoteReference!,
      });
    } catch {
      // The write may have succeeded. Preserve the ambiguous state and prevent
      // any duplicate send until the owner checks Gmail.
    }
    if (sentMessage) {
      const [updated] = await db
        .update(vantageInquiriesTable)
        .set({
          status: "quote_sent",
          quoteStatus: "sent",
          quoteSentAt: new Date(),
          gmailSentMessageId: sentMessage.id,
          hubspotSyncStatus: "awaiting_approval",
          updatedAt: new Date(),
        })
        .where(eq(vantageInquiriesTable.id, inquiryId))
        .returning();
      return {
        inquiry: asPublicInquiry(updated!),
        message: "Gmail confirmed the quote was sent.",
      };
    }

    const [updated] = await db
      .update(vantageInquiriesTable)
      .set({ quoteStatus: "send_uncertain", updatedAt: new Date() })
      .where(eq(vantageInquiriesTable.id, inquiryId))
      .returning();
    await audit(inquiryId, ownerUserId, "quote_send_uncertain");
    throw new OperationsError(
      502,
      `${error instanceof Error ? error.message : "Gmail did not confirm the send."} Check the Sent folder before taking further action. The app will not retry this quote automatically.`,
    );
  }
}

export async function syncInquiryToHubSpot(
  inquiryId: string,
  ownerUserId: string,
) {
  const row = await getInquiryOrThrow(inquiryId);
  if (row.quoteStatus !== "sent") {
    throw new OperationsError(400, "A quote must be sent before syncing this customer to HubSpot.");
  }
  if (row.hubspotContactId) {
    return {
      status: "synced" as const,
      contactId: row.hubspotContactId,
      message: "This customer is already linked to HubSpot.",
    };
  }

  await audit(inquiryId, ownerUserId, "hubspot_sync_approved", {
    email: row.customerEmail,
  });
  try {
    const result = await ensureHubSpotContact({
      email: row.customerEmail,
      name: row.customerName,
    });
    await db
      .update(vantageInquiriesTable)
      .set({
        hubspotContactId: result.contactId,
        hubspotSyncStatus: "synced",
        updatedAt: new Date(),
      })
      .where(eq(vantageInquiriesTable.id, inquiryId));
    await audit(inquiryId, ownerUserId, "hubspot_contact_synced", {
      created: result.created,
      contactId: result.contactId,
    });
    return {
      status: "synced" as const,
      contactId: result.contactId,
      message: result.created
        ? "A new HubSpot contact was created."
        : "The existing HubSpot contact was found; it was not changed.",
    };
  } catch (error) {
    await db
      .update(vantageInquiriesTable)
      .set({ hubspotSyncStatus: "needs_attention", updatedAt: new Date() })
      .where(eq(vantageInquiriesTable.id, inquiryId));
    const message = isProviderError(error)
      ? error.message
      : "HubSpot could not confirm the contact sync.";
    return { status: "needs_attention" as const, contactId: null, message };
  }
}

export async function runAutomationPoll() {
  await db
    .update(vantageInquiriesTable)
    .set({ quoteStatus: "send_uncertain", updatedAt: new Date() })
    .where(
      and(
        eq(vantageInquiriesTable.quoteStatus, "sending"),
        lt(
          vantageInquiriesTable.updatedAt,
          new Date(Date.now() - 5 * 60_000),
        ),
      ),
    );
  const [settings] = await db
    .select()
    .from(vantageAutomationSettingsTable)
    .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID))
    .limit(1);
  if (!settings?.enabled) return;
  if (
    settings.lastRunAt &&
    Date.now() - settings.lastRunAt.getTime() < POLL_INTERVAL_MINUTES * 60_000
  ) {
    return;
  }
  if (!(await automationIsReady())) {
    await db
      .update(vantageAutomationSettingsTable)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID));
    return;
  }
  try {
    await syncInquiries();
  } catch (error) {
    const safeMessage =
      error instanceof ProviderError
        ? error.message
        : "Automatic inbox processing failed. Review service connections.";
    console.error(safeMessage);
    await recordLastRun();
  }
}
