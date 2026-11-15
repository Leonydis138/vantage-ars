/**
 * Reading a spreadsheet export into inbound items.
 *
 * The office only takes in what it can route: one inbound item per row, with a
 * company, a subject and a summary. Anything else is counted as skipped rather
 * than invented, so the founder sees exactly what went in.
 *
 * Pure: no database, no request. The page parses a file, previews the rows and
 * only then asks the server to write them.
 */

export type InboundImportRow = {
  companyName: string;
  subject: string;
  summary: string;
  channel: string;
  intent: string;
};

export type InboundImport =
  | { ok: true; rows: InboundImportRow[]; skipped: number; truncated: number }
  | { ok: false; error: string };

/** A single import is a deliberate act, not a bulk data migration. */
export const MAX_IMPORT_ROWS = 100;

/** Header names the importer understands, so an ordinary export just works. */
const COLUMN_ALIASES: Record<keyof InboundImportRow, string[]> = {
  companyName: ["company", "company name", "companyname", "organisation", "organization", "customer", "account", "name"],
  subject: ["subject", "title", "topic", "reference", "heading"],
  summary: ["summary", "notes", "note", "details", "description", "message", "body"],
  channel: ["channel", "source", "medium", "via"],
  intent: ["intent", "type", "category", "kind", "reason"],
};

/** Split CSV text into rows and cells, honouring quotes and line breaks. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const body = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quoted) {
      if (char === '"') {
        if (body[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

function columnIndex(header: string[], field: keyof InboundImportRow): number {
  const names = COLUMN_ALIASES[field];
  return header.findIndex((cell) => names.includes(cell.trim().toLowerCase()));
}

/** Parse an uploaded CSV into the rows the office can file as inbound items. */
export function parseInboundCsv(text: string): InboundImport {
  const table = parseCsvRows(text);
  if (table.length < 2) {
    return { ok: false, error: "That file needs a header row and at least one row beneath it." };
  }

  const header = table[0];
  const company = columnIndex(header, "companyName");
  const subject = columnIndex(header, "subject");
  if (company < 0 || subject < 0) {
    return {
      ok: false,
      error: "Add a header row with at least a “company” and a “subject” column.",
    };
  }
  const summary = columnIndex(header, "summary");
  const channel = columnIndex(header, "channel");
  const intent = columnIndex(header, "intent");

  const rows: InboundImportRow[] = [];
  let skipped = 0;
  let truncated = 0;

  for (const line of table.slice(1)) {
    const at = (index: number): string => (index >= 0 ? (line[index] ?? "").trim() : "");
    const companyName = at(company);
    const subjectText = at(subject);
    if (!companyName || !subjectText) {
      skipped += 1;
      continue;
    }
    if (rows.length >= MAX_IMPORT_ROWS) {
      truncated += 1;
      continue;
    }
    rows.push({
      companyName: companyName.slice(0, 200),
      subject: subjectText.slice(0, 200),
      summary: (at(summary) || subjectText).slice(0, 600),
      channel: (at(channel) || "import").slice(0, 40),
      intent: (at(intent) || "unclassified").slice(0, 60),
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: "No row had both a company and a subject, so nothing was imported." };
  }
  return { ok: true, rows, skipped, truncated };
}
