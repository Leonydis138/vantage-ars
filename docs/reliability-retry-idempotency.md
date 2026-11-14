# Retry and idempotency trace

Audit date: 2026-10-28. This is a source-level REL-01 review of queue retry,
recovery, and repeated side effects. It describes the checked-in behavior; it
does not validate production traffic or external service outcomes.

## Existing protections

- `work_items` are durable. Enqueue uses a partial unique index on an open
  `dedupe_key`, and claim is an atomic status update that selects one due item.
- Failed work uses bounded exponential backoff and reaches `abandoned` after
  its attempt limit. Stale claims are released by the scheduler; work is only
  redriven by a founder.
- Important business writes use database constraints or state checks: one
  invoice per subject, one receipt per invoice, one billing cycle per
  subscription and period, one subscription per opportunity, and conditional
  claims for billing-cycle invoicing.
- Receipt execution requires a specific issued invoice and its exact full
  amount; the aggregate receivable must also cover the full amount. A partial
  or unattributed receipt is rejected transactionally rather than marking an
  invoice paid.
- Governed money writes and their ledger/balance changes share a transaction
  and the audit-chain lock.
- Service notice attempts are timestamped, and the planner waits six hours
  before retrying a failed cycle notice.

## Findings

1. **Founder redrive and audit were not atomic.** The old path committed the
   work-item reset, then appended the audit record in a separate transaction.
   A process failure between those writes could put work back on the queue
   without the required audit event. REL-01 fixes this by performing both
   writes under the same audit-chain transaction and lock.
2. **Queue completion is separate from runner side effects.** If the runner
   commits an action and the process dies before `completeWork`, the still
   claimed item can be reclaimed and run again. Several financial paths have
   business-level guards, but there is no universal idempotency key tying a
   committed governed action to its work item. Non-financial records and
   external operations need per-action review.
3. **SMTP is not an exactly-once transport.** The office commits a customer
   notice before sending it, then marks it sent after SMTP returns. If the
   process or connection fails after the mail server accepted the message but
   before the sent status is committed, the recorded outcome cannot prove
   whether delivery occurred. Retrying may duplicate a message; not retrying
   may omit one. This needs explicit pending/uncertain-delivery handling and
   operator review rather than a claim of exactly-once delivery.
4. **Stale claims have no fencing token.** A worker running longer than the
   stale-claim threshold can be reclaimed while still active. `completeWork`
   and `failWork` address a work item by ID, not by a claim generation. The
   current runners are bounded, but lease expiry alone does not prove that the
   original worker stopped.
5. **The queue's open-item dedupe does not mean permanent idempotency.** Once
   an item is completed or abandoned, a later planning pass can create another
   item with the same key. This is intentional for recurring duties, but each
   runner must independently guard effects that must happen once.

## Follow-up

REL-01 is partially complete. Keep the existing business-level uniqueness
guards and transaction boundaries. Before claiming general retry safety,
introduce a stable action idempotency key tied to the work item and action
fingerprint, make every runner's action result replayable, and define recovery
for ambiguous SMTP delivery. Add fencing/lease ownership if runners are
allowed to exceed the reclaim interval. Test crash points between committed
actions, runner completion, external send, and delivery-status recording.

These remaining changes can affect whether a customer receives another email
or whether queued work is retried, so they should be implemented with explicit
delivery-state and operator-review behavior rather than inferred from a
network timeout.

## Source map

- `migrations/0010_autonomy.sql`: durable queue, retry counters, and open-item
  dedupe constraint.
- `migrations/0011_delegation.sql`, `migrations/0014_notice_links.sql`, and
  `migrations/0015_financial_integrity.sql`: recurring-cycle, invoice, and
  receipt uniqueness protections.
- `src/lib/office/work-queue.server.ts`: enqueue, claim, failure backoff,
  stale-claim release, and pruning.
- `src/lib/office/scheduler.server.ts`: planning, queue execution, retries,
  and run history.
- `src/lib/office/redrive.server.ts` and `src/lib/office/store.server.ts`:
  founder dead-letter redrive and its atomic audit event.
- `src/lib/office/customer-notice.server.ts`: SMTP delivery and persisted
  status.
- `src/lib/office/duty-runners.server.ts`: billing, receipt, and customer
  notice runners.
