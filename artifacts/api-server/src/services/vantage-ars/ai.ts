import { db, vantageInquiriesTable, type VantageInquiry as DbInquiry } from "@workspace/db";
import { eq } from "drizzle-orm";
import { grokJson } from "./providers";
import {
  buildTriagePrompts,
  createQuoteReference,
  quoteNotes,
  validateQuoteLines,
  type GrokTriage,
} from "./rates";

function cleanText(value: unknown, maxLength = 1200) {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").trim().slice(0, maxLength)
    : "";
}

function cleanMissingInformation(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanText(item, 240))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeTriage(value: GrokTriage): GrokTriage {
  return {
    isRelevant: value.isRelevant === true,
    summary: cleanText(value.summary),
    category: cleanText(value.category, 80),
    urgency:
      value.urgency === "high" || value.urgency === "low"
        ? value.urgency
        : "normal",
    sentiment:
      value.sentiment === "positive" ||
      value.sentiment === "negative" ||
      value.sentiment === "urgent"
        ? value.sentiment
        : "neutral",
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? Math.min(1, Math.max(0, value.confidence))
        : 0.5,
    language:
      typeof value.language === "string" && value.language.trim()
        ? value.language.trim().slice(0, 40)
        : "English",
    priorityScore:
      typeof value.priorityScore === "number" && Number.isFinite(value.priorityScore)
        ? Math.min(100, Math.max(0, Math.round(value.priorityScore)))
        : 50,
    tags: cleanMissingInformation(value.tags).slice(0, 8),
    quoteReady: value.quoteReady === true,
    missingInformation: cleanMissingInformation(value.missingInformation),
    quoteItems: Array.isArray(value.quoteItems)
      ? value.quoteItems
          .filter(
            (line) =>
              line &&
              typeof line.rateCode === "string" &&
              typeof line.quantity === "number",
          )
          .slice(0, 12)
      : [],
  };
}

export async function processInquiryWithGrok(inquiry: DbInquiry) {
  if (inquiry.hasAttachments) {
    await db
      .update(vantageInquiriesTable)
      .set({
        status: "needs_review",
        summary:
          "This message includes attachments. They have not been read by the automated workflow.",
        missingInformation: [
          "Review the attachments in Gmail before preparing a quote.",
        ],
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(vantageInquiriesTable.id, inquiry.id));
    return "needs_review" as const;
  }

  if (!inquiry.messageBody.trim()) {
    await db
      .update(vantageInquiriesTable)
      .set({
        status: "needs_review",
        summary: "The message has no readable text body.",
        missingInformation: [
          "Open the original Gmail message and check for image-only content.",
        ],
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(vantageInquiriesTable.id, inquiry.id));
    return "needs_review" as const;
  }

  const prompts = buildTriagePrompts({
    from: inquiry.customerEmail,
    subject: inquiry.subject,
    body: inquiry.messageBody,
  });
  const result = normalizeTriage(
    await grokJson<GrokTriage>(prompts.system, prompts.user),
  );

  if (!result.isRelevant) {
    await db
      .update(vantageInquiriesTable)
      .set({
        summary: result.summary || "Grok did not identify a Vantage ARS enquiry.",
        category: result.category || null,
        urgency: result.urgency,
        sentiment: result.sentiment,
        language: result.language,
        tags: result.tags,
        priorityScore: result.priorityScore,
        aiConfidence: result.confidence.toFixed(3),
        missingInformation: [],
        processingError: null,
        status: "not_relevant",
        quoteStatus: "none",
        quoteLines: [],
        quoteSubtotal: null,
        quoteNotes: [],
        quoteReference: null,
        quoteCreatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(vantageInquiriesTable.id, inquiry.id));
    return "not_relevant" as const;
  }

  const lines = result.quoteReady ? validateQuoteLines(result.quoteItems) : [];
  const validAllItems =
    lines.length > 0 && lines.length === result.quoteItems.length;
  const ready =
    result.quoteReady &&
    result.missingInformation.length === 0 &&
    validAllItems &&
    Boolean(result.summary);

  if (!ready) {
    const missingInformation = [
      ...result.missingInformation,
      ...(result.quoteReady && !validAllItems
        ? ["The proposed line items need owner review against the rate card."]
        : []),
      ...(!result.summary ? ["A clear request summary is not available."] : []),
    ].slice(0, 12);
    await db
      .update(vantageInquiriesTable)
      .set({
        summary: result.summary || "Grok could not prepare a reliable summary.",
        category: result.category || null,
        urgency: result.urgency,
        sentiment: result.sentiment,
        language: result.language,
        tags: result.tags,
        priorityScore: result.priorityScore,
        aiConfidence: result.confidence.toFixed(3),
        missingInformation:
          missingInformation.length > 0
            ? missingInformation
            : ["The request needs manual review before a quote can be prepared."],
        processingError: null,
        status:
          result.missingInformation.length > 0
            ? "needs_information"
            : "needs_review",
        quoteStatus: "none",
        quoteLines: [],
        quoteSubtotal: null,
        quoteNotes: [],
        quoteReference: null,
        quoteCreatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(vantageInquiriesTable.id, inquiry.id));
    return result.missingInformation.length > 0
      ? ("needs_information" as const)
      : ("needs_review" as const);
  }

  const subtotal =
    Math.round(lines.reduce((sum, line) => sum + line.total, 0) * 100) / 100;
  await db
    .update(vantageInquiriesTable)
    .set({
      summary: result.summary,
      category: result.category || null,
      urgency: result.urgency,
      missingInformation: [],
      processingError: null,
      status: "quote_ready",
      quoteStatus: "ready",
      quoteLines: lines,
      quoteSubtotal: subtotal.toFixed(2),
      quoteNotes: quoteNotes(lines),
      quoteReference: createQuoteReference(inquiry.id, new Date()),
      quoteCreatedAt: new Date(),
      quoteSentAt: null,
      gmailSentMessageId: null,
      hubspotSyncStatus: "not_requested",
      updatedAt: new Date(),
    })
    .where(eq(vantageInquiriesTable.id, inquiry.id));

  return "quote_ready" as const;
}

