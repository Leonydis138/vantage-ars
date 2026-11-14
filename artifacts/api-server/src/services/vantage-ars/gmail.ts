import {
  BUSINESS_MAIL_QUERY,
  providerJson,
  type ProviderError,
} from "./providers";

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
};

type GmailMessageList = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
};

export type ParsedGmailMessage = {
  id: string;
  threadId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  receivedAt: Date;
  messageBody: string;
  originalMessageId: string | null;
  hasAttachments: boolean;
};

function decodeHeader(value: string) {
  return value.replace(
    /=\?([^?]+)\?([bq])\?([^?]+)\?=/gi,
    (_match, _charset: string, encoding: string, content: string) => {
      try {
        if (encoding.toLowerCase() === "b") {
          return Buffer.from(content, "base64").toString("utf8");
        }
        const bytes = content
          .replace(/_/g, " ")
          .replace(/=([0-9a-f]{2})/gi, (_sequence, hex: string) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
        return Buffer.from(bytes, "binary").toString("utf8");
      } catch {
        return content;
      }
    },
  );
}

function getHeader(headers: GmailHeader[] | undefined, name: string) {
  return headers
    ?.find((header) => header.name?.toLowerCase() === name.toLowerCase())
    ?.value?.trim();
}

function decodeBody(data: string | undefined) {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function collectParts(part: GmailPart | undefined) {
  const plain: string[] = [];
  const html: string[] = [];
  let hasAttachments = false;

  const visit = (current: GmailPart | undefined) => {
    if (!current) return;
    if (current.filename || current.body?.attachmentId) hasAttachments = true;

    if (current.parts?.length) {
      current.parts.forEach(visit);
      return;
    }

    const decoded = decodeBody(current.body?.data);
    if (current.mimeType === "text/plain" && decoded) plain.push(decoded);
    if (current.mimeType === "text/html" && decoded) html.push(decoded);
  };

  visit(part);
  const text = plain.join("\n\n").trim() || html.map(stripHtml).join("\n\n");
  return { text: text.slice(0, 20000), hasAttachments };
}

function parseSender(value: string) {
  const decoded = decodeHeader(value);
  const bracketed = decoded.match(/<([^<>]+)>/);
  const senderEmail = (bracketed?.[1] ?? decoded).trim().toLowerCase();
  const senderName = (bracketed
    ? decoded.slice(0, decoded.lastIndexOf("<"))
    : "")
    .replace(/^["\s]+|["\s]+$/g, "")
    .trim();

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderEmail)) return null;
  return { senderEmail, senderName: senderName || senderEmail };
}

export async function listCandidateGmailMessages() {
  const messages: Array<{ id: string; threadId: string }> = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      q: BUSINESS_MAIL_QUERY,
      maxResults: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const result = await providerJson<GmailMessageList>(
      "google-mail",
      `/gmail/v1/users/me/messages?${params.toString()}`,
    );
    messages.push(...(result.messages ?? []));
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  return messages;
}

export async function readGmailMessage(messageId: string): Promise<ParsedGmailMessage | null> {
  const message = await providerJson<GmailMessage>(
    "google-mail",
    `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
  );

  const headers = message.payload?.headers;
  const from = getHeader(headers, "From");
  if (!from) return null;
  const sender = parseSender(from);
  if (!sender) return null;

  const rawSubject = getHeader(headers, "Subject") ?? "(no subject)";
  const dateHeader = getHeader(headers, "Date");
  const receivedAt = dateHeader ? new Date(dateHeader) : new Date(Number(message.internalDate));
  const body = collectParts(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    senderEmail: sender.senderEmail,
    senderName: sender.senderName,
    subject: decodeHeader(rawSubject).replace(/[\r\n]+/g, " ").slice(0, 500),
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    messageBody: body.text,
    originalMessageId: getHeader(headers, "Message-ID") ?? null,
    hasAttachments: body.hasAttachments,
  };
}

function encodeMimeMessage(input: {
  to: string;
  subject: string;
  body: string;
  originalMessageId: string | null;
}) {
  const safeTo = input.to.replace(/[\r\n]/g, "");
  const safeSubject = input.subject.replace(/[\r\n]/g, " ");
  const references = input.originalMessageId
    ? [
        `In-Reply-To: ${input.originalMessageId.replace(/[\r\n]/g, "")}`,
        `References: ${input.originalMessageId.replace(/[\r\n]/g, "")}`,
      ]
    : [];
  const headers = [
    `To: ${safeTo}`,
    `Subject: =?UTF-8?B?${Buffer.from(safeSubject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    ...references,
  ].join("\r\n");
  const encodedBody = Buffer.from(input.body, "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trimEnd();
  return Buffer.from(`${headers}\r\n\r\n${encodedBody}`, "utf8").toString(
    "base64url",
  );
}

export async function sendQuoteReply(input: {
  customerEmail: string;
  originalSubject: string;
  originalThreadId: string;
  originalMessageId: string | null;
  quoteReference: string;
  plainTextBody: string;
}) {
  const subject = /^re:/i.test(input.originalSubject)
    ? input.originalSubject
    : `Re: ${input.originalSubject}`;
  const raw = encodeMimeMessage({
    to: input.customerEmail,
    subject,
    body: input.plainTextBody,
    originalMessageId: input.originalMessageId,
  });

  return providerJson<{ id: string; threadId: string }>(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      body: {
        threadId: input.originalThreadId,
        raw,
      },
    },
  );
}

export async function findSentQuoteMessage(input: {
  customerEmail: string;
  quoteReference: string;
}) {
  const query = `in:sent to:${input.customerEmail} "${input.quoteReference}"`;
  const params = new URLSearchParams({
    q: query,
    maxResults: "5",
  });
  const result = await providerJson<GmailMessageList>(
    "google-mail",
    `/gmail/v1/users/me/messages?${params.toString()}`,
  );
  return result.messages?.[0] ?? null;
}

export function isProviderError(error: unknown): error is ProviderError {
  return (
    error instanceof Error &&
    "provider" in error &&
    "status" in error
  );
}

