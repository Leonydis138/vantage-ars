/**
 * The durable work queue every agent works from.
 *
 * The office runs itself because it keeps its own to-do list in Postgres rather
 * than in memory: a scheduled tick reads the real state of the business, decides
 * what genuinely needs doing, and files work items. Agents then drain their own
 * queue. Nothing is invented — an item only exists because a real record needed
 * a real thing done to it.
 *
 * Design rules:
 *   - **Deduplicated.** A recurring duty must never stack two open items for the
 *     same record. `dedupe_key` carries a partial unique index, so a duplicate is
 *     rejected by the database rather than by a check-then-insert race.
 *   - **Claimed atomically.** Two ticks (or two serverless instances) cannot run
 *     the same item: claiming is a conditional `update ... where status = 'open'`.
 *   - **Bounded.** Every item has a max attempt count and a backoff, so a
 *     permanently failing duty degrades to "reported" rather than a hot loop.
 */
import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db";
import { pruneKeepDays, retryBackoffMinutes, staleClaimMinutes } from "./queue-timing";

export type WorkStatus = "open" | "claimed" | "done" | "failed" | "abandoned";

export type WorkItem = {
  id: string;
  agentId: string;
  kind: string;
  reason: string;
  payload: Record<string, unknown>;
  priority: number;
  status: WorkStatus;
  attempts: number;
  maxAttempts: number;
  dueAt: string;
  outcome: string | null;
  lastError: string | null;
};

export type EnqueueInput = {
  agentId: string;
  kind: string;
  reason: string;
  payload?: Record<string, unknown>;
  priority?: number;
  dueInMinutes?: number;
  maxAttempts?: number;
  /** Stable identity for "one open item per thing". */
  dedupeKey?: string;
};

export type EnqueueResult = "enqueued" | "duplicate";

/**
 * File work. Returns `duplicate` when an open item with the same dedupe key
 * already exists, so a duty can call this freely on every tick.
 */
export async function enqueueWork(input: EnqueueInput): Promise<EnqueueResult> {
  const sql = await getSql();
  const id = randomUUID();
  const dueMinutes = Math.max(0, input.dueInMinutes ?? 0);
  const inserted = await sql<{ id: string }>`
    insert into work_items (
      id, agent_id, kind, reason, payload_json, priority, status,
      max_attempts, dedupe_key, due_at
    ) values (
      ${id}, ${input.agentId}, ${input.kind}, ${input.reason.slice(0, 600)},
      ${JSON.stringify(input.payload ?? {})}, ${Math.round(input.priority ?? 50)},
      'open', ${Math.max(1, input.maxAttempts ?? 3)}, ${input.dedupeKey ?? null},
      now() + make_interval(mins => ${dueMinutes})
    )
    on conflict do nothing
    returning id
  `;
  return inserted.length ? "enqueued" : "duplicate";
}

/** Re-arm a dedupe key that has finished, so the next tick can file fresh work. */
export async function reopenWork(dedupeKey: string, dueInMinutes = 0): Promise<EnqueueResult> {
  const sql = await getSql();
  const reopened = await sql<{ id: string }>`
    update work_items
    set status = 'open',
        due_at = now() + make_interval(mins => ${Math.max(0, dueInMinutes)}),
        attempts = 0,
        last_error = null,
        updated_at = now()
    where dedupe_key = ${dedupeKey} and status in ('done', 'failed', 'abandoned')
    returning id
  `;
  return reopened.length ? "enqueued" : "duplicate";
}

/**
 * Atomically take the most urgent due item for one agent.
 *
 * `skip locked` means a second concurrent claim skips the row the first worker
 * is already updating instead of blocking on it.
 */
export async function claimWork(agentId: string): Promise<WorkItem | null> {
  const sql = await getSql();
  const claimed = await sql<Record<string, unknown>>`
    update work_items w
    set status = 'claimed',
        started_at = now(),
        attempts = attempts + 1,
        updated_at = now()
    where w.id = (
      select id from work_items
      where agent_id = ${agentId} and status = 'open' and due_at <= now()
      order by priority asc, due_at asc
      limit 1
      for update skip locked
    )
    returning *
  `;
  return claimed.length ? mapWork(claimed[0]) : null;
}

export async function completeWork(id: string, outcome: string): Promise<void> {
  const sql = await getSql();
  await sql`
    update work_items
    set status = 'done', outcome = ${outcome.slice(0, 2000)},
        finished_at = now(), last_error = null, updated_at = now()
    where id = ${id}
  `;
}

/**
 * Record a failure. The item is retried with a backoff until `max_attempts`, at
 * which point it is abandoned and the failure is surfaced rather than retried
 * forever.
 *
 * The backoff is `min(60, 2 ** attempts)` minutes: two minutes after the first
 * failure, four after the second, eight after the third, and never more than an
 * hour. The delay is built with `make_interval`, so it is minutes of real
 * time and not a number of seconds.
 */
export async function failWork(id: string, error: string, maxAttempts: number): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ attempts: number }>`select attempts from work_items where id = ${id}`;
  const attempts = Number(rows[0]?.attempts ?? 1);
  const exhausted = attempts >= maxAttempts;
  const backoffMinutes = retryBackoffMinutes(attempts);
  await sql`
    update work_items
    set status = ${exhausted ? "abandoned" : "open"},
        last_error = ${error.slice(0, 2000)},
        due_at = now() + make_interval(mins => ${backoffMinutes}),
        finished_at = case when ${exhausted}::boolean then now() else null end,
        updated_at = now()
    where id = ${id}
  `;
}

/** Give up on anything left claimed by a process that died mid-run. */
export async function releaseStaleWork(staleAfterMinutes = 30): Promise<number> {
  const sql = await getSql();
  const staleMinutes = staleClaimMinutes(staleAfterMinutes);
  const released = await sql<{ id: string }>`
    update work_items
    set status = case when attempts >= max_attempts then 'abandoned' else 'open' end,
        last_error = 'Worker did not finish; reclaimed by the scheduler.',
        due_at = now(),
        updated_at = now()
    where status = 'claimed' and started_at < now() - make_interval(mins => ${staleMinutes})
    returning id
  `;
  return released.length;
}

export async function listWork(limit = 100): Promise<WorkItem[]> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`
    select * from work_items
    order by (status = 'open') desc, due_at asc, priority asc
    limit ${Math.max(1, Math.min(500, limit))}
  `;
  return rows.map(mapWork);
}

export async function workCounts(): Promise<{
  open: number;
  claimed: number;
  failed: number;
  abandoned: number;
  done: number;
}> {
  const sql = await getSql();
  const rows = await sql<{ status: string; n: number }>`
    select status, count(*)::int as n from work_items group by status
  `;
  const counts = { open: 0, claimed: 0, failed: 0, abandoned: 0, done: 0 };
  for (const row of rows) {
    const key = String(row.status) as keyof typeof counts;
    if (key in counts) counts[key] = Number(row.n);
  }
  return counts;
}

function mapWork(row: Record<string, unknown>): WorkItem {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.payload_json ?? "{}"));
    if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    kind: String(row.kind),
    reason: String(row.reason),
    payload,
    priority: Number(row.priority ?? 50),
    status: String(row.status) as WorkStatus,
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    dueAt: new Date(String(row.due_at)).toISOString(),
    outcome: row.outcome ? String(row.outcome) : null,
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

/**
 * Purge finished work so the table stays a queue rather than a log. `agent_runs`
 * is the durable history; this is working state.
 */
export async function pruneWork(keepDays = 30): Promise<number> {
  const sql: Sql = await getSql();
  const keep = pruneKeepDays(keepDays);
  const removed = await sql<{ id: string }>`
    delete from work_items
    where status in ('done', 'abandoned') and updated_at < now() - make_interval(days => ${keep})
    returning id
  `;
  return removed.length;
}
