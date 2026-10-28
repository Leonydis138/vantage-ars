/**
 * Redriving dead work.
 *
 * A work item that exhausted its retries waits in the dead-letter queue until
 * somebody looks at it. Redriving is a founder action and never an automatic
 * one: nothing in the scheduler can put an item back, and no tick can.
 *
 * The queue mechanics live in `work-queue.server.ts` and the audit chain lives
 * in `store.server.ts`. This module is the one place where the two meet, so
 * that the redrive and the record of the redrive cannot come apart: the item
 * goes back on the queue and the chain carries the event, or neither happens.
 */
import { redriveWorkWithAudit } from "./store.server";

export type RedriveResult =
  { ok: true; kind: string; agentId: string } | { ok: false; error: string };

/**
 * Put one abandoned item back on the queue, on the founder's instruction.
 *
 * The item comes back due now, with its attempt count reset and its error
 * cleared. The chain records who did it and what was redriven.
 */
export async function redriveAbandonedWork(workId: string): Promise<RedriveResult> {
  return redriveWorkWithAudit(workId);
}
