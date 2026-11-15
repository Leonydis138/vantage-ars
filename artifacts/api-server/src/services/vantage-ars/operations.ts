import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  db,
  vantageAuditEventsTable,
  vantageAutomationRunsTable,
  vantageAutomationSettingsTable,
  vantageInquiriesTable,
  vantageSolutionPatternsTable,
  type VantageInquiry as DbInquiry,
  type VantageQuoteLine,
} from "@workspace/db";
import { and, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
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
  sendPlainReply,
  sendQuoteReply,
  sendStandaloneEmail,
} from "./gmail";
import { processInquiryWithGrok } from "./ai";
import { formatZar, RATE_SOURCE_URL } from "./rates";
import { logger } from "../../lib/logger";
import {
  BUSINESS_MAIL_QUERY,
  checkProviderStatuses,
  discoverGrokModel,
  discoverGrokModels,
  grokJson,
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
  repliesLinked: number;
  autoAccepted: number;
  autoDeclined: number;
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
    sentiment: row.sentiment,
    language: row.language,
    tags: row.tags,
    priorityScore: row.priorityScore,
    aiConfidence: row.aiConfidence ? Number(row.aiConfidence) : null,
    clarificationSentAt: row.clarificationSentAt ?? null,
    resolutionAttemptedAt: row.resolutionAttemptedAt ?? null,
    escalatedAt: row.escalatedAt ?? null,
    followUpSentAt: row.followUpSentAt ?? null,
    schedulingEmailSentAt: row.schedulingEmailSentAt ?? null,
    acceptedAt: row.acceptedAt ?? null,
    status: row.status as VantageInquiry["status"],
    missingInformation: row.missingInformation,
    messageBody: row.messageBody,
    hasAttachments: row.hasAttachments,
    hubspotContactId: row.hubspotContactId,
    hubspotSyncStatus:
      (row.hubspotSyncStatus === "awaiting_approval"
        ? "pending"
        : row.hubspotSyncStatus) as VantageInquiry["hubspotSyncStatus"],
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

function settingsEncryptionKey() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new OperationsError(
      503,
      "Secure settings are unavailable. Configure the application session secret.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptStoredSetting(value: string | null) {
  if (value === null) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", settingsEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "enc-v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

function decryptStoredSetting(value: string | null | undefined) {
  if (!value) return "";
  if (!value.startsWith("enc-v1:")) return value;
  const [, ivText, tagText, ciphertextText] = value.split(":");
  if (!ivText || !tagText || !ciphertextText) {
    throw new OperationsError(
      503,
      "A stored secure setting is invalid. Enter it again in the operations dashboard.",
    );
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      settingsEncryptionKey(),
      Buffer.from(ivText, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new OperationsError(
      503,
      "A stored secure setting could not be decrypted. Re-enter it in the operations dashboard.",
    );
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
      "The autonomous worker will find or create this customer in HubSpot without overwriting an existing contact.",
      "No work is scheduled and no payment is collected by this action.",
    ],
  };
}

const WEBHOOK_EVENTS = new Set([
  "quote_sent",
  "quote_send_uncertain",
  "quote_accepted",
  "quote_auto_accepted",
  "escalated_for_remote_session",
  "sla_escalation",
  "anomaly_alert_sent",
  "owner_digest_sent",
  "acceptance_confirmation_sent",
  "inquiries_archived",
]);

function isPrivateAddress(address: string) {
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    return isPrivateAddress(lower.slice("::ffff:".length));
  }
  if (isIP(lower) === 6) {
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower.startsWith("ff")
    );
  }
  if (isIP(lower) !== 4) return true;
  const parts = lower.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

async function assertSafeWebhookUrl(raw: string) {
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new OperationsError(400, "The notification webhook must start with http:// or https://.");
  }
  if (parsed.username || parsed.password) {
    throw new OperationsError(400, "The notification webhook cannot include credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new OperationsError(
      400,
      "Put webhook authentication in the encrypted signing-secret field, not in the URL.",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    parsed.protocol !== "https:"
  ) {
    throw new OperationsError(400, "The production notification webhook must use HTTPS.");
  }
  const hostname = parsed.hostname.toLowerCase();
  const isDevelopmentLocalhost =
    process.env.NODE_ENV !== "production" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1");
  if (isDevelopmentLocalhost) return parsed;
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    throw new OperationsError(400, "The notification webhook must use a public host.");
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true }).catch(() => []);
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isPrivateAddress(entry.address))
  ) {
    throw new OperationsError(400, "The notification webhook must resolve to a public address.");
  }
  return parsed;
}

function webhookHeaders(body: string, secret: string, eventType: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Vantage-Event": eventType,
  };
  if (secret) {
    headers["X-Vantage-Signature"] =
      `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  }
  return headers;
}

async function sendWebhookNotification(
  eventType: string,
  inquiryId: string | null,
  details: Record<string, string | number | boolean | null>,
) {
  const policy = await getAutonomyPolicy();
  if (!policy.notificationWebhookUrl) return;
  try {
    const body = JSON.stringify({
      eventType,
      inquiryId,
      occurredAt: new Date().toISOString(),
      details,
    });
    const target = await assertSafeWebhookUrl(policy.notificationWebhookUrl);
    const response = await fetch(target, {
      method: "POST",
      headers: webhookHeaders(body, policy.notificationWebhookSecret, eventType),
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}.`);
  } catch (error) {
    await db.insert(vantageAuditEventsTable).values({
      inquiryId,
      ownerUserId: "automation",
      eventType: "webhook_notification_failed",
      details: {
        eventType,
        error: error instanceof Error ? error.message.slice(0, 200) : "Webhook failed.",
      },
    });
  }
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
  if (WEBHOOK_EVENTS.has(eventType)) {
    void sendWebhookNotification(eventType, inquiryId, details);
  }
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

function isAcceptanceReply(body: string) {
  const text = body.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return false;
  const negative = /\b(do not|don't|not|never)\s+(accept|approve|proceed|agree)\b|\b(decline|declined|reject|rejected|too expensive|not interested)\b/;
  if (negative.test(text)) return false;
  const positive = /\b(i|we)\s+(accept|approve|confirm|agree)\b|\b(quote|proposal)\b.{0,50}\b(accepted|approved|confirmed)\b|\bgo ahead\b|\bplease proceed\b|\bproceed with (the|this) (quote|work|job)\b/;
  return positive.test(text);
}

function isDeclineReply(body: string) {
  const text = body.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return false;
  return /\b(do not|don't|not|never)\s+(accept|approve|proceed|agree)\b|\b(decline|declined|reject|rejected|too expensive|not interested|no longer interested|went with another)\b/.test(text);
}

async function importAndProcessGmail(): Promise<SyncSummary> {
  const candidates = await listCandidateGmailMessages();
  let imported = 0;
  let alreadySeen = 0;
  let processed = 0;
  let awaitingGrok = 0;
  let repliesLinked = 0;
  let autoAccepted = 0;
  let autoDeclined = 0;

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

    const [handledReply] = await db
      .select({ id: vantageAuditEventsTable.id })
      .from(vantageAuditEventsTable)
      .where(
        and(
          eq(vantageAuditEventsTable.eventType, "customer_reply_received"),
          sql`${vantageAuditEventsTable.details}->>'messageId' = ${message.id}`,
        ),
      )
      .limit(1);
    if (handledReply) {
      alreadySeen += 1;
      continue;
    }

    const [existingQuote] = await db
      .select()
      .from(vantageInquiriesTable)
      .where(
        and(
          eq(vantageInquiriesTable.gmailThreadId, message.threadId),
          inArray(vantageInquiriesTable.quoteStatus, ["sent", "accepted"]),
        ),
      )
      .orderBy(desc(vantageInquiriesTable.createdAt))
      .limit(1);

    if (existingQuote) {
      repliesLinked += 1;
      await audit(existingQuote.id, "automation", "customer_reply_received", {
        messageId: message.id,
        subject: message.subject,
        accepted: false,
      });
      if (existingQuote.quoteStatus === "sent") {
        if (isAcceptanceReply(message.messageBody)) {
          const [accepted] = await db
            .update(vantageInquiriesTable)
            .set({
              status: "accepted",
              quoteStatus: "accepted",
              acceptedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(vantageInquiriesTable.id, existingQuote.id),
                eq(vantageInquiriesTable.quoteStatus, "sent"),
              ),
            )
            .returning();
          if (accepted) {
            autoAccepted += 1;
            await audit(accepted.id, "automation", "quote_auto_accepted", {
              messageId: message.id,
              quoteReference: accepted.quoteReference,
              value: accepted.quoteSubtotal ? Number(accepted.quoteSubtotal) : null,
            });
            await sendAcceptanceConfirmation(accepted, "automation");
          }
        } else if (isDeclineReply(message.messageBody)) {
          const [declined] = await db
            .update(vantageInquiriesTable)
            .set({
              status: "declined",
              quoteStatus: "declined",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(vantageInquiriesTable.id, existingQuote.id),
                eq(vantageInquiriesTable.quoteStatus, "sent"),
              ),
            )
            .returning();
          if (declined) {
            autoDeclined += 1;
            await audit(declined.id, "automation", "quote_auto_declined", {
              messageId: message.id,
              quoteReference: declined.quoteReference,
            });
          }
        } else {
          const [flagged] = await db
            .update(vantageInquiriesTable)
            .set({ status: "reply_received", updatedAt: new Date() })
            .where(
              and(
                eq(vantageInquiriesTable.id, existingQuote.id),
                eq(vantageInquiriesTable.quoteStatus, "sent"),
              ),
            )
            .returning();
          if (flagged) {
            await audit(flagged.id, "automation", "customer_reply_needs_review", {
              messageId: message.id,
              subject: message.subject,
            });
          }
        }
      }
      continue;
    }

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
    repliesLinked,
    autoAccepted,
    autoDeclined,
    inquiries: recent.map(asPublicInquiry),
    message:
      candidates.length === 0
        ? "No matching live Gmail enquiries were found."
        : `Scanned ${candidates.length} live messages; imported ${imported}, already seen ${alreadySeen}, reviewed ${processed}, linked ${repliesLinked} quote repl${repliesLinked === 1 ? "y" : "ies"}, auto-accepted ${autoAccepted}, auto-declined ${autoDeclined}.`,
  };
}

export function syncInquiries(): Promise<SyncSummary> {
  if (syncPromise) return syncPromise;
  syncPromise = importAndProcessGmail().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

export async function listAuditEvents(limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const rows = await db
    .select()
    .from(vantageAuditEventsTable)
    .orderBy(desc(vantageAuditEventsTable.createdAt))
    .limit(safeLimit);
  return rows.map((row) => ({
    ...row,
    details: redactAuditDetails(row.details),
  }));
}

function redactAuditDetails(
  details: Record<string, string | number | boolean | null>,
) {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      /secret|token|password|account.?number|branch.?code|webhook.?url/i.test(key)
        ? "[redacted]"
        : value,
    ]),
  ) as Record<string, string | number | boolean | null>;
}

export async function getInquiry(inquiryId: string) {
  const row = await getInquiryOrThrow(inquiryId);
  return asPublicInquiry(row);
}

export async function listInquiries(status: string, escalated = false, search = "") {
  const conditions = [];
  if (status !== "all") conditions.push(eq(vantageInquiriesTable.status, status));
  if (escalated) conditions.push(isNotNull(vantageInquiriesTable.escalatedAt));
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        sql`${vantageInquiriesTable.customerName} ilike ${term}`,
        sql`${vantageInquiriesTable.customerEmail} ilike ${term}`,
        sql`${vantageInquiriesTable.subject} ilike ${term}`,
        sql`${vantageInquiriesTable.summary} ilike ${term}`,
      )!,
    );
  }
  const rows = await db
    .select()
    .from(vantageInquiriesTable)
    .where(conditions.length ? and(...conditions) : undefined)
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
        replyReceived: sql<number>`count(*) filter (where ${vantageInquiriesTable.status} = 'reply_received')::int`,
        quotesReady: sql<number>`count(*) filter (where ${vantageInquiriesTable.quoteStatus} = 'ready')::int`,
        quotesSent: sql<number>`count(*) filter (where ${vantageInquiriesTable.quoteStatus} = 'sent')::int`,
        crmSyncNeeded: sql<number>`count(*) filter (where ${vantageInquiriesTable.quoteStatus} = 'sent' and ${vantageInquiriesTable.hubspotSyncStatus} in ('pending', 'needs_attention', 'awaiting_approval'))::int`,
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
      replyReceived: 0,
      quotesReady: 0,
      quotesSent: 0,
      crmSyncNeeded: 0,
    },
    lastSyncAt: settings?.lastRunAt?.toISOString() ?? null,
    rateSourceUrl: RATE_SOURCE_URL,
  };
}

async function automationIsReady() {
  const [grokReady, gmailReady] = await Promise.all([
    discoverGrokModels().then(() => true).catch(() => false),
    getMailboxEmail().then(() => true).catch(() => false),
  ]);
  return grokReady && gmailReady;
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
    pausedByOwner: settings[0]?.pausedByOwner ?? false,
    autonomousSendingEnabled: settings[0]?.autonomousSendingEnabled ?? true,
    intervalMinutes: POLL_INTERVAL_MINUTES,
    matchingQuery: BUSINESS_MAIL_QUERY,
    providerReady,
    lastRunAt: settings[0]?.lastRunAt?.toISOString() ?? null,
    schedulingUrl: settings[0]?.schedulingUrl ?? process.env.SCHEDULING_URL ?? "",
    notificationWebhookUrl: settings[0]?.notificationWebhookUrl ?? "",
    notificationWebhookSecretConfigured: Boolean(
      settings[0]?.notificationWebhookSecret,
    ),
    slaHours: settings[0]?.slaHours ?? 24,
    followUpDays: settings[0]?.followUpDays ?? 7,
    archiveDays: settings[0]?.archiveDays ?? 30,
    lastCycleSteps: settings[0]?.lastCycleSummary ?? [],
    bankDetailsConfigured: Boolean(
      (settings[0]?.bankAccountName &&
        settings[0]?.bankName &&
        settings[0]?.bankAccountNumber &&
        settings[0]?.bankBranchCode &&
        settings[0]?.bankAccountType) ||
        (process.env.VANTAGE_BANK_ACCOUNT_NAME &&
          process.env.VANTAGE_BANK_NAME &&
          process.env.VANTAGE_BANK_ACCOUNT_NUMBER &&
          process.env.VANTAGE_BANK_BRANCH_CODE &&
          process.env.VANTAGE_BANK_ACCOUNT_TYPE),
    ),
  };
}

export async function setAutomationBankDetails(
  bankInput: unknown,
  autonomousSendingEnabled: boolean | undefined,
  ownerUserId: string,
) {
  const bank = cleanBankDetails(bankInput);
  await db
    .insert(vantageAutomationSettingsTable)
    .values({
      id: AUTOMATION_ID,
      autonomousSendingEnabled: autonomousSendingEnabled ?? true,
      bankAccountName: encryptStoredSetting(bank.accountName),
      bankName: encryptStoredSetting(bank.bankName),
      bankAccountNumber: encryptStoredSetting(bank.accountNumber),
      bankBranchCode: encryptStoredSetting(bank.branchCode),
      bankAccountType: encryptStoredSetting(bank.accountType),
    })
    .onConflictDoUpdate({
      target: vantageAutomationSettingsTable.id,
      set: {
        autonomousSendingEnabled: autonomousSendingEnabled ?? true,
        bankAccountName: encryptStoredSetting(bank.accountName),
        bankName: encryptStoredSetting(bank.bankName),
        bankAccountNumber: encryptStoredSetting(bank.accountNumber),
        bankBranchCode: encryptStoredSetting(bank.branchCode),
        bankAccountType: encryptStoredSetting(bank.accountType),
        updatedAt: new Date(),
      },
    });
  await audit(null, ownerUserId, "automation_bank_details_updated");
  return getAutomationSettings();
}

export async function testAutomationWebhook(ownerUserId: string) {
  const policy = await getAutonomyPolicy();
  if (!policy.notificationWebhookUrl) {
    throw new OperationsError(400, "Save a notification webhook URL before sending a test.");
  }
  const payload = {
    eventType: "webhook_test",
    inquiryId: null,
    occurredAt: new Date().toISOString(),
    details: { message: "Vantage ARS webhook test." },
  };
  try {
    const body = JSON.stringify(payload);
    const target = await assertSafeWebhookUrl(policy.notificationWebhookUrl);
    const response = await fetch(target, {
      method: "POST",
      headers: webhookHeaders(body, policy.notificationWebhookSecret, "webhook_test"),
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}.`);
    await audit(null, ownerUserId, "webhook_test_sent");
    return { message: "Test notification delivered to the webhook." };
  } catch (error) {
    if (error instanceof OperationsError) throw error;
    const message = error instanceof Error ? error.message : "Webhook test failed.";
    await audit(null, ownerUserId, "webhook_test_failed", { error: message.slice(0, 200) });
    throw new OperationsError(502, message);
  }
}

export async function setAutomationPolicy(policyInput: unknown, ownerUserId: string) {
  if (!policyInput || typeof policyInput !== "object") {
    throw new OperationsError(400, "Enter a valid autonomy policy.");
  }
  const input = policyInput as Record<string, unknown>;
  const rawUrl = typeof input.schedulingUrl === "string" ? input.schedulingUrl.trim() : "";
  const rawWebhook = typeof input.notificationWebhookUrl === "string" ? input.notificationWebhookUrl.trim() : "";
  const rawWebhookSecret = typeof input.notificationWebhookSecret === "string" ? input.notificationWebhookSecret.trim() : "";
  if (
    typeof input.clearWebhookSecret !== "undefined" &&
    typeof input.clearWebhookSecret !== "boolean"
  ) {
    throw new OperationsError(400, "Choose whether to clear the webhook secret.");
  }
  const clearWebhookSecret = input.clearWebhookSecret === true;
  if (rawWebhookSecret.length > 200 || /[\r\n]/.test(rawWebhookSecret)) {
    throw new OperationsError(400, "The webhook signing secret is too long or contains invalid characters.");
  }
  for (const [name, value] of [["scheduling link", rawUrl], ["notification webhook", rawWebhook]] as const) {
    if (value.length === 0) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new OperationsError(400, `The ${name} must be a valid URL.`);
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new OperationsError(400, `The ${name} must start with http:// or https://.`);
    }
    if (value.length > 500) throw new OperationsError(400, `The ${name} is too long.`);
  }
  if (rawWebhook) await assertSafeWebhookUrl(rawWebhook);
  const integer = (value: unknown, name: string, min: number, max: number, fallback: number) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new OperationsError(400, `${name} must be a whole number between ${min} and ${max}.`);
    }
    return value;
  };
  const slaHours = integer(input.slaHours, "SLA hours", 1, 168, 24);
  const followUpDays = integer(input.followUpDays, "Follow-up days", 1, 90, 7);
  const archiveDays = integer(input.archiveDays, "Archive days", 7, 365, 30);
  const [existingSettings] = await db
    .select({ notificationWebhookSecret: vantageAutomationSettingsTable.notificationWebhookSecret })
    .from(vantageAutomationSettingsTable)
    .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID))
    .limit(1);
  const existingWebhookSecret = clearWebhookSecret
    ? ""
    : decryptStoredSetting(existingSettings?.notificationWebhookSecret);
  const webhookSecretToStore = clearWebhookSecret
    ? null
    : encryptStoredSetting(rawWebhookSecret || existingWebhookSecret || null);

  await db
    .insert(vantageAutomationSettingsTable)
    .values({
      id: AUTOMATION_ID,
      schedulingUrl: rawUrl || null,
      notificationWebhookUrl: rawWebhook || null,
      notificationWebhookSecret: webhookSecretToStore,
      slaHours,
      followUpDays,
      archiveDays,
    })
    .onConflictDoUpdate({
      target: vantageAutomationSettingsTable.id,
      set: {
        schedulingUrl: rawUrl || null,
        notificationWebhookUrl: rawWebhook || null,
        notificationWebhookSecret: webhookSecretToStore,
        slaHours,
        followUpDays,
        archiveDays,
        updatedAt: new Date(),
      },
    });
  await audit(null, ownerUserId, "automation_policy_updated", {
    slaHours,
    followUpDays,
    archiveDays,
    schedulingConfigured: Boolean(rawUrl),
    notificationWebhookConfigured: Boolean(rawWebhook),
    notificationWebhookSecretConfigured: Boolean(webhookSecretToStore),
    webhookSecretCleared: clearWebhookSecret,
  });
  return getAutomationSettings();
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
    .values({ id: AUTOMATION_ID, enabled, pausedByOwner: !enabled })
    .onConflictDoUpdate({
      target: vantageAutomationSettingsTable.id,
      set: { enabled, pausedByOwner: !enabled, updatedAt: new Date() },
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
  await audit(inquiryId, ownerUserId, "quote_send_started", {
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
        hubspotSyncStatus: "pending",
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
          hubspotSyncStatus: "pending",
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

export async function reprocessInquiry(inquiryId: string, ownerUserId: string) {
  const row = await getInquiryOrThrow(inquiryId);
  if (
    row.quoteStatus === "sent" ||
    row.quoteStatus === "sending" ||
    row.quoteStatus === "send_uncertain"
  ) {
    throw new OperationsError(
      409,
      "A sent or in-flight quote cannot be reprocessed automatically.",
    );
  }

  await db
    .update(vantageInquiriesTable)
    .set({
      status: "processing",
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(vantageInquiriesTable.id, inquiryId));

  const refreshed = await getInquiryOrThrow(inquiryId);
  const result = await processInquiryWithGrok(refreshed);
  const updated = await getInquiryOrThrow(inquiryId);
  await audit(inquiryId, ownerUserId, "inquiry_reprocessed", { result });
  return {
    inquiry: asPublicInquiry(updated),
    message:
      result === "quote_ready"
        ? "Grok prepared a new quote proposal."
        : result === "not_relevant"
          ? "Grok marked this enquiry as not relevant."
          : "Grok updated the review for this enquiry.",
  };
}

async function sendAcceptanceConfirmation(row: DbInquiry, ownerUserId: string) {
  try {
    const policy = await getAutonomyPolicy();
    const lines = [
      `Hello ${row.customerName},`,
      "",
      `Thank you. We have recorded your acceptance of quote ${row.quoteReference ?? ""}.`,
      "Our team will now prepare to start the work described in the quote.",
    ];
    if (policy.schedulingUrl) {
      lines.push("", "You can schedule the kickoff or remote session here:", policy.schedulingUrl);
    }
    lines.push("", "Vantage ARS", "https://vantage-ars.co.za");
    await sendPlainReply({
      customerEmail: row.customerEmail,
      originalSubject: row.subject,
      originalThreadId: row.gmailThreadId,
      originalMessageId: row.originalMessageId,
      plainTextBody: lines.join("\n"),
    });
    await audit(row.id, ownerUserId, "acceptance_confirmation_sent");
  } catch {
    await audit(row.id, ownerUserId, "acceptance_confirmation_failed");
  }
}

export async function acceptQuote(inquiryId: string, ownerUserId: string) {
  const [updated] = await db
    .update(vantageInquiriesTable)
    .set({
      status: "accepted",
      quoteStatus: "accepted",
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vantageInquiriesTable.id, inquiryId),
        eq(vantageInquiriesTable.quoteStatus, "sent"),
      ),
    )
    .returning();
  if (!updated) {
    const row = await getInquiryOrThrow(inquiryId);
    throw new OperationsError(
      409,
      `This quote is ${row.quoteStatus}; only a sent quote can be marked accepted.`,
    );
  }
  await audit(inquiryId, ownerUserId, "quote_accepted", {
    quoteReference: updated.quoteReference,
    value: updated.quoteSubtotal ? Number(updated.quoteSubtotal) : null,
  });
  await sendAcceptanceConfirmation(updated, ownerUserId);
  return { inquiry: asPublicInquiry(updated), message: "Quote marked as accepted by the customer." };
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

  await audit(inquiryId, ownerUserId, "hubspot_sync_started", {
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

export async function retryFailedInquiries(ownerUserId = "automation") {
  const rows = await db
    .select()
    .from(vantageInquiriesTable)
    .where(
      or(
        isNotNull(vantageInquiriesTable.processingError),
        eq(vantageInquiriesTable.status, "processing"),
      ),
    )
    .orderBy(desc(vantageInquiriesTable.updatedAt))
    .limit(5);

  for (const row of rows) {
    try {
      await reprocessInquiry(row.id, ownerUserId);
    } catch {
      // Keep the failure recorded; the next poll can retry again.
    }
  }
}

async function configuredBankDetails(): Promise<VantageBankDetails | null> {
  const [settings] = await db
    .select()
    .from(vantageAutomationSettingsTable)
    .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID))
    .limit(1);

  const bank = {
    accountName:
      process.env.VANTAGE_BANK_ACCOUNT_NAME?.trim() ||
      decryptStoredSetting(settings?.bankAccountName).trim() ||
      "",
    bankName:
      process.env.VANTAGE_BANK_NAME?.trim() ||
      decryptStoredSetting(settings?.bankName).trim() ||
      "",
    accountNumber:
      process.env.VANTAGE_BANK_ACCOUNT_NUMBER?.trim() ||
      decryptStoredSetting(settings?.bankAccountNumber).trim() ||
      "",
    branchCode:
      process.env.VANTAGE_BANK_BRANCH_CODE?.trim() ||
      decryptStoredSetting(settings?.bankBranchCode).trim() ||
      "",
    accountType:
      process.env.VANTAGE_BANK_ACCOUNT_TYPE?.trim() ||
      decryptStoredSetting(settings?.bankAccountType).trim() ||
      "",
  };
  try {
    return cleanBankDetails(bank);
  } catch {
    return null;
  }
}

export async function autoSendReadyQuotes(ownerUserId = "automation") {
  const [settings] = await db
    .select()
    .from(vantageAutomationSettingsTable)
    .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID))
    .limit(1);
  if (settings && !settings.autonomousSendingEnabled) {
    return { sent: 0, skipped: 0, message: "Autonomous sending is paused." };
  }
  const bank = await configuredBankDetails();
  if (!bank) return { sent: 0, skipped: 0, message: "Bank details are not configured for autonomous sending." };

  const rows = await db
    .select()
    .from(vantageInquiriesTable)
    .where(eq(vantageInquiriesTable.quoteStatus, "ready"))
    .orderBy(desc(vantageInquiriesTable.quoteCreatedAt))
    .limit(10);

  let sent = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await decideQuote(row.id, ownerUserId, "approve", bank);
      await syncInquiryToHubSpot(row.id, ownerUserId);
      sent += 1;
    } catch {
      skipped += 1;
    }
  }
  return {
    sent,
    skipped,
    message: `Autonomous sending complete: ${sent} sent, ${skipped} skipped.`,
  };
}

export async function autoRequestMissingInformation(ownerUserId = "automation") {
  const rows = await db
    .select()
    .from(vantageInquiriesTable)
    .where(
      and(
        eq(vantageInquiriesTable.status, "needs_information"),
        sql`${vantageInquiriesTable.clarificationSentAt} is null`,
      ),
    )
    .orderBy(desc(vantageInquiriesTable.receivedAt))
    .limit(10);

  let sent = 0;
  for (const row of rows) {
    try {
      const missing = row.missingInformation.length
        ? row.missingInformation.map((item) => `- ${item}`).join("\n")
        : "- Please provide the missing project details.";
      const body = [
        `Hello ${row.customerName},`,
        "",
        "Thank you for contacting Vantage ARS. Before we can prepare a quote, please provide the following details:",
        "",
        missing,
        "",
        "Reply to this email with the requested information and we will continue immediately.",
        "",
        "Vantage ARS",
        "https://vantage-ars.co.za",
      ].join("\n");
      await sendPlainReply({
        customerEmail: row.customerEmail,
        originalSubject: row.subject,
        originalThreadId: row.gmailThreadId,
        originalMessageId: row.originalMessageId,
        plainTextBody: body,
      });
      await db
        .update(vantageInquiriesTable)
        .set({ clarificationSentAt: new Date(), updatedAt: new Date() })
        .where(eq(vantageInquiriesTable.id, row.id));
      await audit(row.id, ownerUserId, "clarification_requested");
      sent += 1;
    } catch {
      // Leave the enquiry for the next autonomous cycle.
    }
  }
  return { sent, message: `Requested clarification for ${sent} enquir${sent === 1 ? "y" : "ies"}.` };
}

type ResolutionPlan = {
  canResolveRemotely: boolean;
  steps: string[];
  escalationReason: string | null;
};

export async function autoResolveInquiries(ownerUserId = "automation") {
  const rows = await db
    .select()
    .from(vantageInquiriesTable)
    .where(
      and(
        or(
          eq(vantageInquiriesTable.status, "needs_review"),
          eq(vantageInquiriesTable.status, "needs_information"),
        ),
        sql`${vantageInquiriesTable.resolutionAttemptedAt} is null`,
      ),
    )
    .orderBy(desc(vantageInquiriesTable.receivedAt))
    .limit(10);

  let attempted = 0;
  const patterns = await db
    .select()
    .from(vantageSolutionPatternsTable)
    .orderBy(desc(vantageSolutionPatternsTable.successCount))
    .limit(100);

  for (const row of rows) {
    try {
      const haystack = `${row.category ?? ""} ${row.subject} ${row.summary ?? ""}`.toLowerCase();
      const bestPattern = patterns
        .map((pattern) => ({
          pattern,
          score: pattern.keywords
            .toLowerCase()
            .split(/\s+/)
            .filter((word) => word.length > 3 && haystack.includes(word)).length,
        }))
        .sort((a, b) => b.score - a.score)[0];

      let plan: ResolutionPlan;
      const reusedPattern =
        bestPattern && bestPattern.score > 0 ? bestPattern.pattern : null;
      if (reusedPattern) {
        plan = {
          canResolveRemotely: true,
          steps: reusedPattern.steps,
          escalationReason: null,
        };
      } else {
        plan = await grokJson<ResolutionPlan>(
        [
          "You are Vantage ARS autonomous support.",
          "Given a customer enquiry, propose concrete remote troubleshooting steps that may resolve it without a site visit.",
          "Return only JSON with keys canResolveRemotely (boolean), steps (string array), escalationReason (string or null).",
          "Do not invent facts. If remote resolution is unlikely, set canResolveRemotely=false and explain why.",
        ].join("\n"),
        [
          `Customer: ${row.customerName} <${row.customerEmail}>`,
          `Subject: ${row.subject}`,
          `Summary: ${row.summary ?? ""}`,
          `Category: ${row.category ?? ""}`,
          `Missing information: ${row.missingInformation.join("; ")}`,
          "Message:",
          row.messageBody.slice(0, 8000),
        ].join("\n"),
      );
      }
      const steps = Array.isArray(plan.steps) ? plan.steps.slice(0, 8) : [];
      const body = [
        `Hello ${row.customerName},`,
        "",
        "Vantage ARS reviewed your enquiry and attempted an autonomous resolution.",
        "",
        plan.canResolveRemotely
          ? "Please try the following steps:"
          : "Remote self-service may not fully resolve this, but please try:",
        ...steps.map((step) => `- ${step}`),
        "",
        "Reply to this email with the result and we will continue. If the issue remains, we will schedule a remote support session.",
        "",
        "Vantage ARS",
        "https://vantage-ars.co.za",
      ].join("\n");

      await sendPlainReply({
        customerEmail: row.customerEmail,
        originalSubject: row.subject,
        originalThreadId: row.gmailThreadId,
        originalMessageId: row.originalMessageId,
        plainTextBody: body,
      });

      await db
        .update(vantageInquiriesTable)
        .set({
          resolutionAttemptedAt: new Date(),
          updatedAt: new Date(),
          ...(plan.canResolveRemotely ? {} : {}),
        })
        .where(eq(vantageInquiriesTable.id, row.id));
      if (reusedPattern) {
        await db
          .update(vantageSolutionPatternsTable)
          .set({
            successCount: sql`${vantageSolutionPatternsTable.successCount} + 1`,
          })
          .where(eq(vantageSolutionPatternsTable.id, reusedPattern.id));
      } else if (plan.canResolveRemotely && steps.length > 0) {
        const keywords = `${row.category ?? ""} ${row.subject}`
          .trim()
          .slice(0, 500);
        const [existingPattern] = await db
          .select({ id: vantageSolutionPatternsTable.id })
          .from(vantageSolutionPatternsTable)
          .where(eq(vantageSolutionPatternsTable.keywords, keywords))
          .limit(1);
        if (existingPattern) {
          await db
            .update(vantageSolutionPatternsTable)
            .set({ steps })
            .where(eq(vantageSolutionPatternsTable.id, existingPattern.id));
        } else {
          await db.insert(vantageSolutionPatternsTable).values({
            keywords,
            steps,
          });
        }
      }
      await audit(row.id, ownerUserId, "autonomous_resolution_attempted", {
        canResolveRemotely: plan.canResolveRemotely,
        reusedPattern: Boolean(reusedPattern),
      });

      if (!plan.canResolveRemotely) {
        await db
          .update(vantageInquiriesTable)
          .set({
            status: "needs_review",
            summary: `${row.summary ?? ""} Autonomous resolution unlikely: ${plan.escalationReason ?? "requires human support."}`.trim(),
            updatedAt: new Date(),
          })
          .where(eq(vantageInquiriesTable.id, row.id));
      }
      attempted += 1;
    } catch {
      // Try again in a later cycle.
    }
  }
  return { attempted, message: `Attempted autonomous resolution for ${attempted} enquir${attempted === 1 ? "y" : "ies"}.` };
}

async function getAutonomyPolicy() {
  const [settings] = await db
    .select()
    .from(vantageAutomationSettingsTable)
    .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID))
    .limit(1);
  return {
    schedulingUrl: (settings?.schedulingUrl ?? process.env.SCHEDULING_URL ?? "").trim(),
    notificationWebhookUrl: (settings?.notificationWebhookUrl ?? "").trim(),
    notificationWebhookSecret: decryptStoredSetting(
      settings?.notificationWebhookSecret,
    ).trim(),
    slaHours: settings?.slaHours ?? 24,
    followUpDays: settings?.followUpDays ?? 7,
    archiveDays: settings?.archiveDays ?? 30,
  };
}

export async function escalateStaleResolutions(ownerUserId = "automation") {
  const policy = await getAutonomyPolicy();
  const cutoff = new Date(Date.now() - Math.max(48, policy.slaHours * 2) * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(vantageInquiriesTable)
    .where(
      and(
        eq(vantageInquiriesTable.status, "needs_review"),
        sql`${vantageInquiriesTable.resolutionAttemptedAt} is not null`,
        sql`${vantageInquiriesTable.escalatedAt} is null`,
        lt(vantageInquiriesTable.resolutionAttemptedAt, cutoff),
      ),
    )
    .limit(10);

  let escalated = 0;
  for (const row of rows) {
    const schedulingUrl = policy.schedulingUrl;
    if (schedulingUrl && !row.schedulingEmailSentAt) {
      try {
        await sendStandaloneEmail({
          to: row.customerEmail,
          subject: `Schedule a remote support session - ${row.subject}`,
          plainTextBody: [
            `Hello ${row.customerName},`,
            "",
            "Our automated support could not fully resolve your enquiry remotely.",
            "Please schedule a remote support session at your convenience:",
            schedulingUrl,
            "",
            "Vantage ARS",
          ].join("\n"),
        });
        await sendStandaloneEmail({
          to: await getMailboxEmail(),
          subject: `Schedule remote session - ${row.customerName}`,
          plainTextBody: `Customer ${row.customerName} (${row.customerEmail}) needs a remote session. Scheduling link: ${schedulingUrl}`,
        });
      } catch {
        // Email failure should not block escalation.
      }
    }
    await db
      .update(vantageInquiriesTable)
      .set({
        escalatedAt: new Date(),
        schedulingEmailSentAt: new Date(),
        summary: `${row.summary ?? ""} Escalated for owner remote support session.`.trim(),
        updatedAt: new Date(),
      })
      .where(eq(vantageInquiriesTable.id, row.id));
    await audit(row.id, ownerUserId, "escalated_for_remote_session");
    escalated += 1;
  }
  return { escalated, message: `Escalated ${escalated} enquir${escalated === 1 ? "y" : "ies"} for remote support.` };
}

export async function escalateBySla(ownerUserId = "automation") {
  const policy = await getAutonomyPolicy();
  const highCutoff = new Date(Date.now() - policy.slaHours * 60 * 60 * 1000);
  const normalCutoff = new Date(Date.now() - policy.slaHours * 3 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(vantageInquiriesTable)
    .where(
      and(
        eq(vantageInquiriesTable.status, "needs_review"),
        sql`${vantageInquiriesTable.escalatedAt} is null`,
        or(
          and(
            eq(vantageInquiriesTable.urgency, "high"),
            lt(vantageInquiriesTable.updatedAt, highCutoff),
          ),
          lt(vantageInquiriesTable.updatedAt, normalCutoff),
        ),
      ),
    )
    .limit(20);

  let escalated = 0;
  for (const row of rows) {
    const schedulingUrl = policy.schedulingUrl;
    if (schedulingUrl && !row.schedulingEmailSentAt) {
      try {
        await sendStandaloneEmail({
          to: row.customerEmail,
          subject: `Schedule a remote support session - ${row.subject}`,
          plainTextBody: [
            `Hello ${row.customerName},`,
            "",
            "Our automated support could not fully resolve your enquiry within the service window.",
            "Please schedule a remote support session:",
            schedulingUrl,
            "",
            "Vantage ARS",
          ].join("\n"),
        });
      } catch {
        // Continue escalation even if email fails.
      }
    }
    await db
      .update(vantageInquiriesTable)
      .set({
        escalatedAt: new Date(),
        schedulingEmailSentAt: schedulingUrl ? new Date() : row.schedulingEmailSentAt,
        summary: `${row.summary ?? ""} SLA escalation: schedule a remote support session.`.trim(),
        updatedAt: new Date(),
      })
      .where(eq(vantageInquiriesTable.id, row.id));
    await audit(row.id, ownerUserId, "sla_escalation");
    escalated += 1;
  }
  return { escalated, message: `SLA escalation applied to ${escalated} enquir${escalated === 1 ? "y" : "ies"}.` };
}

export async function getAutonomousMetrics() {
  const [[totals], [patterns], events] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        escalated: sql<number>`count(*) filter (where ${vantageInquiriesTable.escalatedAt} is not null)::int`,
        resolved: sql<number>`count(*) filter (where ${vantageInquiriesTable.resolutionAttemptedAt} is not null)::int`,
        accepted: sql<number>`count(*) filter (where ${vantageInquiriesTable.quoteStatus} = 'accepted')::int`,
        customerReplies: sql<number>`count(*) filter (where ${vantageInquiriesTable.status} = 'reply_received')::int`,
        quotedValue: sql<number>`coalesce(sum(${vantageInquiriesTable.quoteSubtotal}) filter (where ${vantageInquiriesTable.quoteStatus} in ('sent', 'accepted')), 0)::float`,
        acceptedValue: sql<number>`coalesce(sum(${vantageInquiriesTable.quoteSubtotal}) filter (where ${vantageInquiriesTable.quoteStatus} = 'accepted'), 0)::float`,
      })
      .from(vantageInquiriesTable),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(vantageSolutionPatternsTable),
    db
      .select({ eventType: vantageAuditEventsTable.eventType })
      .from(vantageAuditEventsTable),
  ]);

  const autonomousActions = events.filter((event) =>
    event.eventType.startsWith("autonomous_") ||
    event.eventType.includes("escalation") ||
    event.eventType.includes("clarification"),
  ).length;

  return {
    totalInquiries: totals?.total ?? 0,
    escalatedInquiries: totals?.escalated ?? 0,
    resolvedInquiries: totals?.resolved ?? 0,
    solutionPatterns: patterns?.count ?? 0,
    autonomousActions,
    acceptedInquiries: totals?.accepted ?? 0,
    customerReplies: totals?.customerReplies ?? 0,
    quotedValue: totals?.quotedValue ?? 0,
    acceptedValue: totals?.acceptedValue ?? 0,
  };
}

export async function syncHubSpotContacts(ownerUserId = "automation") {
  const rows = await db
    .select()
    .from(vantageInquiriesTable)
    .where(
      and(
        eq(vantageInquiriesTable.quoteStatus, "sent"),
        inArray(vantageInquiriesTable.hubspotSyncStatus, [
          "pending",
          "needs_attention",
          "awaiting_approval",
        ]),
      ),
    )
    .limit(10);

  let synced = 0;
  for (const row of rows) {
    try {
      const result = await syncInquiryToHubSpot(row.id, ownerUserId);
      if (result.status === "synced") synced += 1;
    } catch {
      // Retry in the next cycle.
    }
  }
  return {
    synced,
    message: `Synced ${synced} HubSpot contact${synced === 1 ? "" : "s"}.`,
  };
}

export async function sendQuoteFollowUps(ownerUserId = "automation") {
  const policy = await getAutonomyPolicy();
  const cutoff = new Date(Date.now() - policy.followUpDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(vantageInquiriesTable)
    .where(
      and(
        eq(vantageInquiriesTable.quoteStatus, "sent"),
        eq(vantageInquiriesTable.status, "quote_sent"),
        sql`${vantageInquiriesTable.followUpSentAt} is null`,
        lt(vantageInquiriesTable.quoteSentAt, cutoff),
      ),
    )
    .limit(20);

  let sent = 0;
  for (const row of rows) {
    try {
      const body = [
        `Hello ${row.customerName},`,
        "",
        `Following up on quote ${row.quoteReference ?? ""} sent on ${row.quoteSentAt?.toISOString().slice(0, 10) ?? "recently"}.`,
        "",
        "Please reply to accept, request changes, or ask any questions. Work begins only after written acceptance.",
        "",
        "Vantage ARS",
        "https://vantage-ars.co.za",
      ].join("\n");
      await sendPlainReply({
        customerEmail: row.customerEmail,
        originalSubject: row.subject,
        originalThreadId: row.gmailThreadId,
        originalMessageId: row.originalMessageId,
        plainTextBody: body,
      });
      await db
        .update(vantageInquiriesTable)
        .set({ followUpSentAt: new Date(), updatedAt: new Date() })
        .where(eq(vantageInquiriesTable.id, row.id));
      await audit(row.id, ownerUserId, "quote_follow_up_sent");
      sent += 1;
    } catch {
      // Retry later.
    }
  }
  return { sent, message: `Sent ${sent} quote follow-up${sent === 1 ? "" : "s"}.` };
}

export async function sendOwnerDigest(ownerUserId = "automation") {
  const [settings] = await db
    .select()
    .from(vantageAutomationSettingsTable)
    .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID))
    .limit(1);

  const lastDigest = settings?.lastDigestAt;
  if (lastDigest && Date.now() - lastDigest.getTime() < 7 * 24 * 60 * 60 * 1000) {
    return { sent: false, message: "Owner digest is not due yet." };
  }

  const metrics = await getAutonomousMetrics();
  const mailbox = await getMailboxEmail();
  const body = [
    "Vantage ARS weekly autonomous digest",
    "",
    `Total enquiries: ${metrics.totalInquiries}`,
    `Escalated: ${metrics.escalatedInquiries}`,
    `Autonomously resolved: ${metrics.resolvedInquiries}`,
    `Accepted quotes: ${metrics.acceptedInquiries}`,
    `Customer replies awaiting review: ${metrics.customerReplies}`,
    `Quoted pipeline: ${formatZar(metrics.quotedValue)}`,
    `Accepted value: ${formatZar(metrics.acceptedValue)}`,
    `Solution patterns learned: ${metrics.solutionPatterns}`,
    `Autonomous actions: ${metrics.autonomousActions}`,
    "",
    "Review the operations dashboard for details.",
  ].join("\n");

  await sendStandaloneEmail({
    to: mailbox,
    subject: "Vantage ARS autonomous digest",
    plainTextBody: body,
  });

  await db
    .insert(vantageAutomationSettingsTable)
    .values({ id: AUTOMATION_ID, lastDigestAt: new Date() })
    .onConflictDoUpdate({
      target: vantageAutomationSettingsTable.id,
      set: { lastDigestAt: new Date(), updatedAt: new Date() },
    });
  await audit(null, ownerUserId, "owner_digest_sent");
  return { sent: true, message: "Owner digest sent." };
}

export async function detectAnomalies(ownerUserId = "automation") {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      negative: sql<number>`count(*) filter (where ${vantageInquiriesTable.sentiment} in ('negative', 'urgent'))::int`,
      highPriority: sql<number>`count(*) filter (where ${vantageInquiriesTable.priorityScore} >= 80)::int`,
    })
    .from(vantageInquiriesTable)
    .where(sql`${vantageInquiriesTable.receivedAt} >= ${cutoff}`);

  const anomalies: string[] = [];
  if ((stats?.negative ?? 0) >= 3) anomalies.push(`${stats?.negative} negative/urgent enquiries in 24h`);
  if ((stats?.highPriority ?? 0) >= 5) anomalies.push(`${stats?.highPriority} high-priority enquiries in 24h`);
  if ((stats?.total ?? 0) >= 20) anomalies.push(`${stats?.total} total enquiries in 24h`);

  if (anomalies.length > 0) {
    try {
      const mailbox = await getMailboxEmail();
      await sendStandaloneEmail({
        to: mailbox,
        subject: "Vantage ARS anomaly alert",
        plainTextBody: ["Autonomous anomaly detection triggered:", "", ...anomalies.map((a) => `- ${a}`), "", "Review the dashboard for details."].join("\n"),
      });
      await audit(null, ownerUserId, "anomaly_alert_sent", { anomalies: anomalies.join("; ") });
    } catch {
      // Non-blocking.
    }
  }
  return { anomalies, message: anomalies.length ? `Anomaly alert sent: ${anomalies.join(", ")}` : "No anomalies detected." };
}

export async function autoArchiveResolved(ownerUserId = "automation") {
  const policy = await getAutonomyPolicy();
  const cutoff = new Date(Date.now() - policy.archiveDays * 24 * 60 * 60 * 1000);
  const result = await db
    .update(vantageInquiriesTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        sql`${vantageInquiriesTable.status} in ('quote_sent', 'accepted', 'declined', 'not_relevant')`,
        lt(vantageInquiriesTable.updatedAt, cutoff),
      ),
    )
    .returning({ id: vantageInquiriesTable.id });
  if (result.length > 0) {
    await audit(null, ownerUserId, "inquiries_archived", { count: result.length });
  }
  return { archived: result.length, message: `Archived ${result.length} old enquir${result.length === 1 ? "y" : "ies"}.` };
}

async function recordAutomationRun(input: {
  status: "completed" | "failed";
  message: string;
  steps: Array<{ key: string; label: string; message: string }>;
  startedAt: Date;
}) {
  const completedAt = new Date();
  await db.insert(vantageAutomationRunsTable).values({
    status: input.status,
    message: input.message,
    steps: input.steps,
    startedAt: input.startedAt,
    completedAt,
  });
}

export async function listAutomationRuns(limit = 20) {
  const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 20;
  const rows = await db
    .select()
    .from(vantageAutomationRunsTable)
    .orderBy(desc(vantageAutomationRunsTable.createdAt))
    .limit(safeLimit);
  return rows.map((row) => ({
    id: row.id,
    status: row.status as "completed" | "failed",
    message: row.message,
    steps: row.steps,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }));
}

let cyclePromise: Promise<
  Awaited<ReturnType<typeof performAutonomousCycle>>
> | null = null;

export function runAutonomousCycle(ownerUserId = "automation") {
  if (cyclePromise) return cyclePromise;
  cyclePromise = performAutonomousCycle(ownerUserId).finally(() => {
    cyclePromise = null;
  });
  return cyclePromise;
}

async function performAutonomousCycle(ownerUserId: string) {
  const startedAt = new Date();
  const sync = await syncInquiries();
  await retryFailedInquiries(ownerUserId);
  const clarification = await autoRequestMissingInformation(ownerUserId);
  const resolution = await autoResolveInquiries(ownerUserId);
  const escalation = await escalateStaleResolutions(ownerUserId);
  const sla = await escalateBySla(ownerUserId);
  const followUps = await sendQuoteFollowUps(ownerUserId);
  const sending = await autoSendReadyQuotes(ownerUserId);
  const hubspot = await syncHubSpotContacts(ownerUserId);
  const digest = await sendOwnerDigest(ownerUserId).catch(() => ({ sent: false, message: "Digest skipped." }));
  const anomalies = await detectAnomalies(ownerUserId);
  const archive = await autoArchiveResolved(ownerUserId);
  const steps = [
    { key: "sync", label: "Inbox sync", message: sync.message },
    { key: "clarification", label: "Clarification", message: clarification.message },
    { key: "resolution", label: "Resolution", message: resolution.message },
    { key: "escalation", label: "Stale escalation", message: escalation.message },
    { key: "sla", label: "SLA escalation", message: sla.message },
    { key: "followUps", label: "Quote follow-ups", message: followUps.message },
    { key: "sending", label: "Quote sending", message: sending.message },
    { key: "hubspot", label: "HubSpot sync", message: hubspot.message },
    { key: "digest", label: "Owner digest", message: digest.message },
    { key: "anomalies", label: "Anomaly scan", message: anomalies.message },
    { key: "archive", label: "Archive", message: archive.message },
  ];
  await db
    .insert(vantageAutomationSettingsTable)
    .values({ id: AUTOMATION_ID, lastCycleSummary: steps, lastRunAt: new Date() })
    .onConflictDoUpdate({
      target: vantageAutomationSettingsTable.id,
      set: { lastCycleSummary: steps, lastRunAt: new Date(), updatedAt: new Date() },
    });
  await recordAutomationRun({
    status: "completed",
    message: steps.map((step) => step.message).join(" "),
    steps,
    startedAt,
  });
  await db
    .delete(vantageAutomationRunsTable)
    .where(
      lt(
        vantageAutomationRunsTable.createdAt,
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      ),
    );

  return {
    sync,
    clarification,
    resolution,
    escalation,
    sla,
    hubspot,
    followUps,
    digest,
    anomalies,
    archive,
    sending,
    steps,
    message: steps.map((step) => step.message).join(" "),
  };
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

  if (
    !settings?.enabled &&
    !settings?.pausedByOwner &&
    (await automationIsReady())
  ) {
    await db
      .insert(vantageAutomationSettingsTable)
      .values({ id: AUTOMATION_ID, enabled: true })
      .onConflictDoUpdate({
        target: vantageAutomationSettingsTable.id,
        set: { enabled: true, updatedAt: new Date() },
      });
    await audit(null, "automation", "automation_auto_enabled");
  }

  const [refreshed] = await db
    .select()
    .from(vantageAutomationSettingsTable)
    .where(eq(vantageAutomationSettingsTable.id, AUTOMATION_ID))
    .limit(1);
  if (!refreshed?.enabled || refreshed.pausedByOwner) return;
  if (
    refreshed.lastRunAt &&
    Date.now() - refreshed.lastRunAt.getTime() < POLL_INTERVAL_MINUTES * 60_000
  ) {
    return;
  }
  if (!(await automationIsReady())) return;
  const cycleStartedAt = new Date();
  try {
    await runAutonomousCycle();
  } catch (error) {
    const safeMessage =
      error instanceof ProviderError
        ? error.message
        : "Automatic inbox processing failed. Review service connections.";
    logger.error({ error: safeMessage }, "Automatic inbox cycle failed");
    await recordAutomationRun({
      status: "failed",
      message: safeMessage,
      steps: [{ key: "cycle", label: "Autonomous cycle", message: safeMessage }],
      startedAt: cycleStartedAt,
    });
    await recordLastRun();
  }
}
