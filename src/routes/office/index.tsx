import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { AutonomyPanel } from "@/components/office/autonomy-panel";
import { CustomerOverview } from "@/components/office/customer-overview";
import { DispatchPanel } from "@/components/office/dispatch-panel";
import { MailNote } from "@/components/office/mail-note";
import { PageHeader } from "@/components/office/page-header";
import { RunFloorButton } from "@/components/office/run-floor";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatZar } from "@/lib/office/money";
import { founderWork } from "@/lib/office/work";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/office/")({
  component: CommandCenter,
});

function CommandCenter() {
  const snapshot = useOfficeSnapshot();
  // Bumped after anything that changes the scheduler, so the autonomy panel
  // re-reads instead of showing the previous run's numbers.
  const [pulse, setPulse] = useState(0);
  const refresh = useCallback(() => setPulse((value) => value + 1), []);
  const pending = snapshot.approvals.filter((a) => a.status === "pending");
  const liveAgents = snapshot.agents.filter((a) => a.status !== "halted").length;
  const unrouted = snapshot.inbound.filter((i) => i.status === "received").length;
  const openTickets = snapshot.tickets.filter((t) => t.status !== "resolved").length;
  const openTechnicalTickets = snapshot.tickets.filter(
    (ticket) =>
      (ticket.ownerAgent === "forge" || ticket.ownerAgent === "keep") &&
      ticket.status !== "resolved",
  ).length;
  const pipeline = snapshot.opportunities
    .filter((o) => o.stage !== "lost")
    .reduce((sum, o) => sum + o.valueCents, 0);
  const work = founderWork(snapshot);

  return (
    <div className="enter-up mx-auto max-w-6xl">
      <PageHeader
        kicker="Command · Johannesburg"
        title="The office is on the floor."
        description="Agents act inside their roles. You approve cost, customer win, customer loss, and every marketing-to-sales handoff."
        action={<RunFloorButton halted={snapshot.company.halted} onDone={refresh} />}
      />
      <MailNote notices={snapshot.notices} mail={snapshot.mail} />

      <section aria-labelledby="operations-pulse" className="mb-6">
        <h2 id="operations-pulse" className="mb-3 font-serif text-2xl">
          Operations pulse
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Business
            </h3>
            <div className="grid gap-px overflow-hidden rounded-xl bg-border shadow-[var(--shadow-border)] sm:grid-cols-3">
              <Metric
                label="Treasury"
                value={formatZar(snapshot.company.treasuryCents)}
                hint="Grows only from receipts"
              />
              <Metric label="Pipeline" value={formatZar(pipeline)} hint="Open opportunities" />
              <Metric
                label="Receivable"
                value={formatZar(snapshot.company.receivableCents)}
                hint="Issued invoices"
              />
            </div>
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Technical
            </h3>
            <div className="grid gap-px overflow-hidden rounded-xl bg-border shadow-[var(--shadow-border)] sm:grid-cols-3">
              <Metric
                label="Autonomy health"
                value={snapshot.health.overall.toFixed(2)}
                hint={`${liveAgents} identities live`}
              />
              <Metric
                label="Open technical tickets"
                value={String(openTechnicalTickets)}
                hint="FORGE · KEEP"
                warn={openTechnicalTickets > 0}
              />
              <Metric
                label="Hard violations"
                value={String(snapshot.health.hardViolations)}
                hint="Target: zero"
                warn={snapshot.health.hardViolations > 0}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap gap-2">
        <SituationChip
          to="/office/inbox"
          label="Unrouted inbound"
          value={unrouted}
          warn={unrouted > 0}
        />
        <SituationChip
          to="/office/service"
          label="Service cases"
          value={
            snapshot.tickets.filter(
              (ticket) => ticket.ownerAgent === "desk" && ticket.status !== "resolved",
            ).length
          }
          warn={snapshot.tickets.some(
            (ticket) => ticket.ownerAgent === "desk" && ticket.status !== "resolved",
          )}
        />
        <SituationChip to="/office/sales" label="Pipeline" value={formatZar(pipeline)} />
        <SituationChip
          to="/office/technical"
          label="Open tickets"
          value={openTickets}
          warn={openTickets > 0}
        />
        <SituationChip
          to="/office/ledger"
          label="Receivable"
          value={formatZar(snapshot.company.receivableCents)}
        />
        <SituationChip
          to="/office/floor"
          label="Blocked"
          value={snapshot.decisions.filter((d) => d.status === "blocked").length}
          warn={snapshot.health.hardViolations > 0}
        />
      </div>

      <section aria-labelledby="approval-queue" className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="approval-queue" className="font-serif text-2xl">
              Approval queue
            </h2>
            <p className="mt-1 text-sm text-muted">
              {pending.length} founder {pending.length === 1 ? "decision" : "decisions"} waiting
            </p>
          </div>
          <Link to="/office/approvals" className="text-sm text-muted hover:text-fg">
            Review approvals
          </Link>
        </div>
        {pending.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
            No approvals are waiting.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
            {pending.slice(0, 5).map((approval) => (
              <li
                key={approval.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm text-fg">{approval.title}</p>
                  <p className="text-xs text-muted">
                    {approval.kind.replaceAll("_", " ")}
                    {approval.companyName ? ` · ${approval.companyName}` : ""}
                    {" · "}
                    {formatDateTime(approval.createdAt)}
                  </p>
                </div>
                <span className="font-mono text-sm tabular-nums text-fg">
                  {formatZar(approval.amountCents)}
                </span>
              </li>
            ))}
            {pending.length > 5 ? (
              <li className="px-4 py-3 text-xs text-muted">
                +{pending.length - 5} more waiting in the approval queue
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <DispatchPanel />
        <Card>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Needs you</p>
          <h2 className="mt-1 font-serif text-2xl text-fg">Your desk</h2>
          <ul className="mt-4 space-y-3">
            {work.slice(0, 6).map((item) => (
              <li key={item.id}>
                <Link to={item.href} className="block rounded-md bg-raised p-3 hover:bg-bg">
                  <p className="text-sm text-fg">{item.title}</p>
                  <p className="mt-1 text-xs text-muted">{item.detail}</p>
                </Link>
              </li>
            ))}
            {work.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing needs you. The fleet is inside its envelope.
              </p>
            ) : null}
          </ul>
          {pending.length > 0 ? (
            <Link
              to="/office/approvals"
              className="mt-4 inline-flex h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
            >
              Open the queue
            </Link>
          ) : null}
        </Card>
      </div>

      <CustomerOverview />

      <div className="mt-6">
        <AutonomyPanel refreshToken={pulse} />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-serif text-2xl">Floor</h2>
          <Link to="/office/floor" className="text-sm text-muted hover:text-fg">
            All identities
          </Link>
        </div>
        <div className="grid gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-2 lg:grid-cols-4">
          {snapshot.agents.map((agent) => (
            <div key={agent.id} className="bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] tracking-[0.16em] text-muted">
                  {agent.callsign}
                </p>
                <span className="sr-only">{agent.status}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    agent.status === "halted"
                      ? "bg-danger"
                      : agent.status === "blocked"
                        ? "bg-warn"
                        : "bg-ok",
                  )}
                />
              </div>
              <p className="mt-2 font-serif text-xl">{agent.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted">
                {agent.currentTask ?? agent.summary}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-2xl">Latest decisions</h2>
        {snapshot.decisions.length === 0 ? (
          <p className="text-sm text-muted">
            No autonomous decisions yet. The scheduler runs them on its own cadence.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
            {snapshot.decisions.slice(0, 8).map((decision) => (
              <li
                key={decision.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm text-fg">{decision.title}</p>
                  <p className="text-xs text-muted">
                    {decision.agentId} · {decision.actionKind} ·{" "}
                    {formatDateTime(decision.createdAt)}
                  </p>
                </div>
                <Badge
                  variant={
                    decision.status === "blocked"
                      ? "danger"
                      : decision.status === "escalated"
                        ? "warn"
                        : "ok"
                  }
                >
                  {decision.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-surface p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={cn("mt-2 font-mono text-2xl tabular-nums", warn ? "text-warn" : "text-fg")}>
        {value}
      </p>
      <p className="mt-1 text-xs text-subtle">{hint}</p>
    </div>
  );
}

function SituationChip({
  to,
  label,
  value,
  warn,
}: {
  to:
    | "/office/inbox"
    | "/office/service"
    | "/office/sales"
    | "/office/technical"
    | "/office/ledger"
    | "/office/floor";
  value: string | number;
  label: string;
  warn?: boolean;
}) {
  return (
    <Link
      to={to}
      className="inline-flex h-11 items-center gap-2 rounded-full bg-raised px-4 text-sm text-muted hover:text-fg"
    >
      <span>{label}</span>
      <span className={cn("font-mono tabular-nums", warn ? "text-warn" : "text-fg")}>{value}</span>
    </Link>
  );
}
