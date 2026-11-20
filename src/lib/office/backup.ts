import { sha256Hex, stableStringify } from "./hash.ts";

/**
 * Office backup envelope. Tables are plain row arrays; a SHA-256 over the stable
 * JSON of the tables lets a restore tool (or you) detect a damaged or edited file.
 * Auth tables (user, session, account, verification) are deliberately never exported.
 *
 * `quote_links` is included: without it a restore silently kills every customer
 * quote link that is still open, and those customers can never answer.
 * `rate_hits` is excluded — it is transient throttling state with no business value.
 *
 * The manifest also carries the tables the office grew after the manifest was
 * first written, because a manifest without them drops real business records on
 * every restore:
 *
 *   - `delegations` and `delegation_usage` — the founder's standing authority,
 *     and every action taken under it. Without them a restored office has no
 *     delegation and no memory of what it did under one.
 *   - `subscriptions`, `billing_cycles` and `customer_notices` — the recurring
 *     revenue book, the billing ledger, and the record of what the office said
 *     to a customer. Without them a restored office has no recurring revenue
 *     and cannot tell a customer what it already sent them.
 *   - `decision_episodes`, `gate_records` and `decision_receipts` — the
 *     governance record. These arrive with the governance migration, so an
 *     office that has not migrated yet does not have them: they are listed as
 *     OPTIONAL, and both the export and the restore skip a table this office
 *     does not have instead of failing.
 */

/**
 * Tables that this office may not have yet.
 *
 * The governance tables arrive with a migration that is not applied to every
 * deployment on the day it is written. They belong in the manifest — a backup
 * without them drops the governance record — but their ABSENCE must never
 * break a backup or a restore, or an office that has not migrated yet could not
 * back itself up at all.
 */
export const BACKUP_OPTIONAL_TABLES = [
  "decision_episodes",
  "gate_records",
  "decision_receipts",
] as const;

const OPTIONAL_TABLES = new Set<string>(BACKUP_OPTIONAL_TABLES);

/** Whether the failure is "this relation does not exist", and nothing else. */
function isMissingRelation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (code === "42P01") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /does not exist|no such table|relation .* does not exist/i.test(message);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function";
}

/**
 * The backup manifest.
 *
 * It is an ordinary list of table names, with one tolerance built into the one
 * way the export reads it. The export selects every table in the manifest, and
 * a table that does not exist in this office makes that select fail — which
 * would take the whole backup down with it. So `map` lets a missing OPTIONAL
 * table resolve to no rows rather than throwing.
 *
 * Every other failure still throws. A broken database must never produce a
 * backup that quietly holds nothing and verifies perfectly.
 */
class BackupManifest extends Array<string> {
  override map<T>(callbackfn: (value: string, index: number, array: string[]) => T): T[] {
    return super.map((value, index, array) => {
      const result = callbackfn(value, index, array);
      if (!isPromiseLike(result)) return result as T;
      return result.then(
        (resolved) => resolved,
        (error: unknown) => {
          if (OPTIONAL_TABLES.has(value) && isMissingRelation(error)) return [] as unknown as T;
          throw error;
        },
      ) as unknown as T;
    });
  }
}

export const BACKUP_TABLES = new BackupManifest(
  "company_state",
  "constitution_provisions",
  "agents",
  "inbound_items",
  "leads",
  "opportunities",
  "campaigns",
  "ledger_entries",
  "tickets",
  "documents",
  "approvals",
  "decisions",
  "audit_events",
  // The founder's standing authority, and the record of what was done under it.
  "delegations",
  "delegation_usage",
  // The recurring-revenue book, the billing ledger, and what the office sent.
  "subscriptions",
  "billing_cycles",
  "customer_notices",
  // The governance record: what was decided, what was gated, what was receipted.
  "decision_episodes",
  "gate_records",
  "decision_receipts",
  "founder_notices",
  "chat_threads",
  "chat_messages",
  "quote_links",
  "work_items",
  "agent_runs",
  "office_state",
);

/**
 * Order matters on restore: parents before children.
 *
 * `company_state` first (it holds the audit head), then `audit_events` and
 * `decisions` before the records that reference them, then `delegations`
 * before the `delegation_usage` rows that act under one, `subscriptions`
 * before the `billing_cycles` periods that belong to one, and `documents`
 * before the `customer_notices` that carry them.
 */
export const BACKUP_RESTORE_ORDER: readonly string[] = [
  "company_state",
  "constitution_provisions",
  "agents",
  "inbound_items",
  "leads",
  "opportunities",
  "campaigns",
  "ledger_entries",
  "tickets",
  "documents",
  "approvals",
  "decisions",
  "audit_events",
  "delegations",
  "delegation_usage",
  "subscriptions",
  "billing_cycles",
  "customer_notices",
  "decision_episodes",
  "gate_records",
  "decision_receipts",
  "founder_notices",
  "chat_threads",
  "chat_messages",
  "quote_links",
  "office_state",
  "work_items",
  "agent_runs",
];

export type BackupTables = Record<string, Record<string, unknown>[]>;

export type BackupFile = {
  format: "vantage-ars-backup";
  version: 1;
  exportedAt: string;
  rowCounts: Record<string, number>;
  checksum: string;
  tables: BackupTables;
};

export function buildBackup(
  tables: BackupTables,
  exportedAt: string = new Date().toISOString(),
): BackupFile {
  // Hash exactly what the file will hold. A JSON round trip turns every Date
  // (each table has timestamptz columns) into an ISO string and drops undefined
  // keys, so a checksum taken over the in-memory rows could never match the
  // same rows after the file is written and read back.
  const normalized = JSON.parse(JSON.stringify(tables)) as BackupTables;
  const rowCounts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(normalized)) rowCounts[name] = rows.length;
  return {
    format: "vantage-ars-backup",
    version: 1,
    exportedAt,
    rowCounts,
    checksum: sha256Hex(stableStringify(normalized)),
    tables: normalized,
  };
}

export function verifyBackup(value: unknown): { ok: true } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Not a backup file." };
  const file = value as Partial<BackupFile>;
  if (file.format !== "vantage-ars-backup" || file.version !== 1)
    return { ok: false, error: "Unknown backup format." };
  if (!file.tables || typeof file.tables !== "object" || Array.isArray(file.tables)) {
    return { ok: false, error: "Backup has no tables." };
  }
  for (const [name, rows] of Object.entries(file.tables)) {
    if (!Array.isArray(rows)) return { ok: false, error: `Table ${name} is not a list of rows.` };
    if (file.rowCounts && file.rowCounts[name] !== rows.length) {
      return { ok: false, error: `Row count for ${name} does not match.` };
    }
  }
  if (file.checksum !== sha256Hex(stableStringify(file.tables))) {
    return { ok: false, error: "Checksum mismatch: the backup was changed or damaged." };
  }
  return { ok: true };
}

export const MAX_RESTORE_BYTES = 4_000_000;

export type RestorePlan =
  | {
      ok: true;
      tables: { name: string; rows: Record<string, unknown>[] }[];
      /** Optional tables in the file that this office does not have. */
      skipped?: string[];
    }
  | { ok: false; error: string };

/**
 * Restore only ADDS missing rows. It never deletes or overwrites, so a mistaken or repeated
 * restore cannot destroy current records. Every table must be one we export, and every row
 * key must be a real column of that table, otherwise the whole file is refused before any write.
 *
 * One exception, and only one: an OPTIONAL table the file carries but this office does not
 * have (the governance tables, on an office that has not migrated yet) is skipped. The rest of
 * the office is still worth restoring, and the file stays valid for an office that does have
 * the table. A missing table that is NOT optional is still a refusal: that office is broken.
 */
export function planRestore(value: unknown, columnsByTable: Record<string, string[]>): RestorePlan {
  const verdict = verifyBackup(value);
  if (!verdict.ok) return verdict;
  const file = value as BackupFile;
  const allowed = new Set<string>(BACKUP_TABLES);
  const tables: { name: string; rows: Record<string, unknown>[] }[] = [];
  const skipped: string[] = [];
  for (const [name, rows] of Object.entries(file.tables)) {
    if (!allowed.has(name))
      return { ok: false, error: `Table ${name} is not part of the office backup.` };
    if (rows.length === 0) continue;
    const columns = new Set(columnsByTable[name] ?? []);
    if (columns.size === 0) {
      if (OPTIONAL_TABLES.has(name)) {
        skipped.push(name);
        continue;
      }
      return { ok: false, error: `Table ${name} does not exist in this office.` };
    }
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        return { ok: false, error: `Table ${name} has a bad row.` };
      for (const key of Object.keys(row)) {
        if (!columns.has(key))
          return { ok: false, error: `Table ${name} has an unknown column ${key}.` };
      }
    }
    tables.push({ name, rows });
  }
  return { ok: true, tables, skipped };
}
