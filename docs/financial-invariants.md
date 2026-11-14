# Financial invariants trace

Audit date: 2026-10-28. This is a source-level FIN-01 review of pricing,
invoicing, receipts, and recurring billing. Production balances, tax status,
and historical data were not inspected.

## Invariants checked

- **Quote amount is the customer commitment.** A quote snapshots its amount in
  `documents.amount_cents`; invoice creation uses that accepted amount rather
  than a later mutable opportunity value. The public quote view now reads the
  same snapshot, with the opportunity amount as a fallback for legacy rows
  without snapshots.
- **Invoice amounts are positive whole cents.** Quote-to-invoice arithmetic
  rejects non-positive/non-integer figures. VAT calculations use integer cents
  and reconcile net, VAT, and gross; the selected VAT treatment is explicit on
  the invoice action.
- **One-off invoices are not duplicated.** A partial unique index allows only
  one non-null invoice subject, and governed writes create the ledger row,
  receivable movement, and invoice document in the action transaction.
- **Receipts settle one full invoice exactly once.** A partial unique index
  allows at most one receipt per invoice. The receipt must name an issued
  invoice, equal its full amount, and be covered by the outstanding receivable.
  Treasury, receivable, invoice state, receipt ledger row, and receipt document
  change together. Partial, unmatched, repeated, or underfunded payments do
  not settle the invoice.
- **Recurring billing is period-specific.** A unique
  `(subscription_id, period_start)` key protects each cycle. Invoice execution
  claims only a pending cycle, writes invoice IDs back to the cycle, and
  advances the subscription only after success.
- **Expense movement is bounded by available treasury.** An expense is marked
  paid only when treasury can cover it; otherwise it is recorded as payable.
  The balance update and ledger write share the governed transaction.

## Findings addressed

1. Public quote links previously showed the mutable opportunity amount while
   the quote and invoice used the snapshotted quote amount. The public view now
   displays `documents.amount_cents`, aligning the page, PDF, customer
   acceptance response, and invoice source.
2. Receipt execution previously capped a payment at aggregate receivables, then
   marked its referenced invoice paid even if the applied amount was partial.
   It also allowed receipts without a specific invoice when some other
   receivable existed. Execution now requires an issued invoice ID and its
   exact full amount, then requires the receivable balance to cover that amount
   before any money or status changes commit.

## Limits and operator review

- Partial payments are not supported by this workflow. A real partial payment
  must remain a payment notice for founder review until an explicit allocation
  model exists; it must not be represented as full settlement.
- This audit does not establish the business's VAT registration, tax
  treatment, or legal correctness of a specific rate card. Those remain
  founder/accountant decisions.
- Reconciliation with an external bank or payment provider is not available in
  source. Automated receipt matching must continue to require a unique invoice
  reference and exact amount.
- Legacy database rows may predate current constraints. Production backfill,
  reconciliation, and balance comparison are still required before relying on
  stored totals.

## Source map

- `migrations/0015_financial_integrity.sql`: quote amount snapshot and invoice /
  receipt uniqueness indexes.
- `migrations/0011_delegation.sql`: recurring subscription and billing-cycle
  uniqueness.
- `src/lib/office/store.server.ts`: public quote reading, invoice issuance,
  receipt execution, and treasury/receivable movements.
- `src/lib/office/invoice.ts`: positive-cent validation and VAT calculations.
- `scripts/verify-office.mjs`: acceptance checks for quote snapshot display,
  full-invoice receipt, underfunded receivable rejection, and money movement.
