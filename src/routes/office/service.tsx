import { createFileRoute } from "@tanstack/react-router";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { DispatchPanel } from "@/components/office/dispatch-panel";
import { ServiceTimePanel } from "@/components/office/service-time-panel";
import { EmptyState } from "@/components/office/empty-state";
import { PageHeader } from "@/components/office/page-header";
import { Badge } from "@/components/ui/badge";
import { TicketActions } from "@/components/office/ticket-actions";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/office/money";

export const Route = createFileRoute("/office/service")({
  component: ServicePage,
});

function ServicePage() {
  const snapshot = useOfficeSnapshot();
  const cases = snapshot.tickets.filter((ticket) => ticket.ownerAgent === "desk");
  const waiting = snapshot.inbound.filter((item) => item.routedTo === "desk");
  const drafts = snapshot.documents.filter(
    (document) =>
      document.kind === "service_ack" ||
      document.kind === "technical_plan" ||
      document.kind === "correspondence",
  );

  return (
    <div className="enter-up mx-auto max-w-5xl">
      <PageHeader
        kicker="Customer service · DESK"
        title="Founder approval before action."
        description="The office classifies cases and prepares internal drafts. It does not send a reply, start technical work, or mark a fault resolved without your action. Refunds, cancellations, and concessions always wait on you."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <DispatchPanel
          lockedAgent="desk"
          placeholder="Update a service case or draft a reply. Do not sell, refund, or send."
        />
        <Card>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Boundary</p>
          <h2 className="mt-2 font-serif text-2xl">ART-11 / ART-12</h2>
          <p className="mt-2 text-sm text-muted">
            Reception files a fault or complaint to this desk. Marketing still owns a new sale. DESK
            cannot move a company into Sales or book a concession.
          </p>
        </Card>
      </div>

      <ServiceTimePanel />

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-2xl">Cases</h2>
        {cases.length === 0 ? (
          <EmptyState
            title="No service cases"
            body="A fault or complaint from the website lands here. Nothing is invented."
          />
        ) : (
          <ul className="space-y-2">
            {cases.map((ticket) => (
              <li
                key={ticket.id}
                className="flex flex-col gap-2 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm">{ticket.title}</p>
                  <p className="text-xs text-muted">
                    {ticket.summary} · {formatDateTime(ticket.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={ticket.severity === "p2" ? "warn" : "default"}>
                    {ticket.severity}
                  </Badge>
                  <Badge variant={ticket.status === "resolved" ? "ok" : "default"}>
                    {ticket.status}
                  </Badge>
                  <TicketActions id={ticket.id} status={ticket.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-2xl">Drafts for founder review</h2>
        {drafts.length === 0 ? (
          <EmptyState
            title="No drafts"
            body="Acknowledgements and technical plans appear here for review."
          />
        ) : (
          <ul className="space-y-2">
            {drafts.map((document) => (
              <li
                key={document.id}
                className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">{document.title}</p>
                  <Badge variant={document.status === "draft" ? "warn" : "default"}>
                    {document.status}
                  </Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{document.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-2xl">Routed here</h2>
        {waiting.length === 0 ? (
          <EmptyState
            title="No conversations"
            body="Reception has not filed a customer-service matter."
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-surface shadow-[var(--shadow-border)]">
            {waiting.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">{item.subject}</p>
                  <Badge>{item.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {item.companyName} · {formatDateTime(item.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
