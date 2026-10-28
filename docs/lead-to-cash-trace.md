# Lead-to-cash record ID trace

Audit date: 2026-10-28. This is a source-level trace for AUD-02. It documents
the record links declared and used by the checked-in application; it does not
verify production data or prove that existing rows are complete.

## Record path

| Stage                  | Primary record                           | Link carried forward                                                                                                                      | Evidence and meaning                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enquiry                | `inbound_items.id`                       | `leads.inbound_id`                                                                                                                        | Public intake creates an inbound item; lead creation stores its inbound ID in `related_id`. The scheduled sales-opening path requires a qualified lead with an inbound ID.                             |
| Lead qualification     | `leads.id`                               | `opportunities.lead_id`                                                                                                                   | Qualification and handoff update the lead by ID. Opening an opportunity links to that lead and moves it to `in_sales`. Some founder handoff paths can create a synthetic lead without an inbound item. |
| Quote                  | `documents.id` (`kind = 'quote'`)        | `documents.related_id = opportunities.id`                                                                                                 | Quote issuance snapshots the rate and amount. `quote_links` separately stores both `document_id` and `opportunity_id`; a customer answer updates the quote status and closes the opportunity.          |
| One-off invoice        | `ledger_entries.id` (`kind = 'invoice'`) | `ledger_entries.related_id = opportunities.id`; invoice document `related_id` is the same opportunity ID                                  | The one-off invoice path writes the ledger row and invoice document together. A partial unique index allows at most one invoice per non-null subject ID.                                               |
| One-off receipt        | `ledger_entries.id` (`kind = 'receipt'`) | Receipt `related_id = invoice ledger ID`; receipt document `related_id` is that invoice's opportunity ID                                  | The receipt updates the invoice and produces a receipt document in the governed transaction. A partial unique index limits one receipt per invoice.                                                    |
| Recurring subscription | `subscriptions.id`                       | `subscriptions.opportunity_id` and `quote_document_id`                                                                                    | The founder starts a subscription for a won opportunity. The subscription retains its originating opportunity and accepted quote IDs.                                                                  |
| Recurring billing      | `billing_cycles.id`                      | `subscription_id`; invoice ledger and invoice document both use the cycle ID as `related_id`; cycle stores `invoice_id` and `document_id` | A unique `(subscription_id, period_start)` index prevents duplicate billing periods. The invoice action claims the pending cycle before creating the invoice.                                          |
| Recurring receipt      | `ledger_entries.id` (`kind = 'receipt'`) | `related_id = invoice ledger ID`; cycle is reached through `billing_cycles.invoice_id`                                                    | Recording the receipt marks the invoice paid and updates any billing cycle carrying that invoice ID.                                                                                                   |

Decision and payment references are separate from business-record IDs. Governed
actions are recorded in `decisions`, and a delegated action may carry a
`delegation_id`. Customer notices retain template-specific document,
subscription, and cycle IDs plus a `related_id`; the latter is the quote,
invoice, receipt, or reminder subject used for deduplication.

## Findings and limits

- The records use generated text UUIDs, but there is no canonical customer or
  contact table and no `customer_id` shared by the lead, opportunity, ledger,
  subscription, or notice records. Customer views group by normalized company
  name; recipient resolution also searches by lowercased company name and takes
  the newest matching subscription, inbound item, or lead. Name variants,
  shared names, or later contact changes can therefore make account grouping
  and recipient attribution ambiguous.
- Most links are plain text columns, not database-enforced foreign keys. The
  `related_id` column is polymorphic: for one-off invoices it means opportunity
  ID, for recurring invoices it means billing-cycle ID, for receipts it means
  invoice-ledger ID, and for several documents it means the parent opportunity
  or cycle. Correct traversal depends on application code knowing the record
  kind and applying the matching joins.
- `quote_links` duplicates the quote's opportunity link. Quote rendering joins
  through the quote document, while the link row also stores an opportunity ID;
  the schema does not enforce that these two references agree.
- The main sales and billing links are explicit and used by the workflow code.
  However, reporting, customer history, and contact resolution are not
  reliably keyed to a durable customer identity, and an orphaned or
  cross-associated text ID is not generally prevented by the database.
- The public quote view follows `quote_links.document_id` to the quote and
  opportunity, but its displayed `amountCents` comes from the mutable
  opportunity value rather than the quote's `documents.amount_cents` snapshot.
  The invoice path does use the quote snapshot. This is a pricing-consistency
  issue for FIN-01, not an ID-link change, and should be covered before relying
  on the customer-facing amount.
- `findInvoiceForReference` matches a customer-provided document reference
  against invoice-document text. It proceeds only when one invoice candidate
  matches; ambiguity or absence does not auto-reconcile a payment.
- This trace does not validate production rows, historical data quality, or
  actual payment and mail delivery. Those require a read-only production data
  review with appropriate access and redaction.

## Recommended follow-up

Before broadening automation, design a stable customer identity and an
incremental migration from name-based joins. Add typed foreign-key or equivalent
database constraints where lifecycle semantics permit, while preserving the
intentional one-off versus recurring invoice subject distinction. Include
backfill checks for orphaned and inconsistent references, and tests for each
one-off and recurring traversal. This is a separate implementation task; AUD-02
records the current shape without changing payment, sales, or customer behavior.

## Source map

- `migrations/0002_office.sql`: inbound, lead, opportunity, ledger, and document
  base tables.
- `migrations/0009_quote_links.sql`: quote-link document and opportunity IDs.
- `migrations/0011_delegation.sql`: subscription, billing-cycle, and customer
  notice IDs and uniqueness rules.
- `migrations/0015_financial_integrity.sql`: quote amount snapshots and
  one-invoice / one-receipt indexes.
- `src/lib/office/intake.ts`: inbound-to-lead and sales handoff.
- `src/lib/office/store.server.ts`: governed writes for leads, opportunities,
  quotes, invoices, receipts, and subscriptions.
- `src/lib/office/duties.ts` and `src/lib/office/duty-runners.server.ts`:
  sales, one-off invoice, and recurring billing planning and execution.
- `src/lib/office/customer-notice.server.ts`: recipient resolution and
  invoice/receipt notice lookups.
- `src/lib/office/customers.ts`: company-name-based account aggregation.
