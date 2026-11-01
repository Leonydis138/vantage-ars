import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
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

      <div className="mb-6 grid gap-px overflow-hidden rounded-xl bg-border shadow-[var(--shadow-border)] sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Treasury"
          value={formatZar(snapshot.company.treasuryCents)}
          hint="Grows only from receipts"
        />
        <Metric
          label="Waiting on you"
          value={String(pending.length)}
          hint="Founder gates"
          warn={pending.length > 0}
        />
        <Metric
          label="Autonomy health"
          value={snapshot.health.overall.toFixed(2)}
          hint={`${liveAgents} identities live`}
        />
        <Metric
          label="Decisions"
          value={String(snapshot.health.decisionCount)}
          hint={`${Math.round(snapshot.health.autonomousResolution * 100)}% autonomous`}
        />
      </div>

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

      <OperationsPulseBoard snapshot={snapshot} />

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
                    {decision.agentId} · {decision.actionKind} · {formatDateTime(decision.createdAt)}
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

function OperationsPulseBoard({ snapshot }: { snapshot: ReturnType<typeof useOfficeSnapshot> }) {
  const approvalsPending = snapshot.approvals.filter((a) => a.status === "pending").length;
  const blockedDecisions = snapshot.decisions.filter((d) => d.status === "blocked").length;
  const liveAgents = snapshot.agents.filter((a) => a.status !== "halted").length;
  const openWork = snapshot.tickets.filter((t) => t.status !== "resolved").length;
  const incoming = snapshot.inbound.filter((i) => i.status === "received").length;
  const pipelineValue = snapshot.opportunities
    .filter((o) => o.stage !== "lost")
    .reduce((sum, o) => sum + o.valueCents, 0);

  const stageMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of snapshot.opportunities) {
      const key = item.stage ?? "unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [snapshot.opportunities]);

  const workload = [
    { label: "Founder gates", value: approvalsPending, max: Math.max(3, approvalsPending + 2) },
    { label: "Open work", value: openWork, max: Math.max(6, openWork + 4) },
    { label: "Inbound", value: incoming, max: Math.max(4, incoming + 3) },
    { label: "Pipeline", value: Math.round((pipelineValue / 10000) % 250) || 42, max: 120 },
  ];

  const riskPercent = Math.min(
    100,
    Math.round(
      ((blockedDecisions + approvalsPending + Math.max(0, openWork - 2)) /
        Math.max(1, snapshot.decisions.length + snapshot.approvals.length + snapshot.tickets.length)) *
        100,
    ),
  );

  const controlLoop = [
    { label: "Autonomy", value: Math.min(100, Math.round(snapshot.health.autonomousResolution * 100)) },
    { label: "Governance", value: Math.max(20, 100 - riskPercent) },
    { label: "Delivery", value: Math.min(100, Math.round((liveAgents / Math.max(1, snapshot.agents.length)) * 100)) },
  ];

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Mission control</p>
          <h2 className="mt-2 font-serif text-2xl text-fg">Operations pulse</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={riskPercent > 55 ? "warn" : "ok"}>
            {riskPercent > 55 ? "Watchlist" : "Stable"}
          </Badge>
          <Badge variant="default">{liveAgents}/{snapshot.agents.length} agents online</Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PulseStat label="Treasury" value={formatZar(snapshot.company.treasuryCents)} tone="accent" />
          <PulseStat label="Receivable" value={formatZar(snapshot.company.receivableCents)} tone="neutral" />
          <PulseStat label="Pending approvals" value={String(approvalsPending)} tone={approvalsPending > 0 ? "warn" : "ok"} />
          <PulseStat label="Open service" value={String(openWork)} tone={openWork > 0 ? "warn" : "ok"} />
        </div>

        <div className="rounded-2xl border border-border bg-raised/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Control loop</p>
            <span className="font-mono text-xs text-accent">{riskPercent}% risk</span>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div
              className="relative grid place-items-center rounded-full border border-border bg-surface"
              style={{
                width: 102,
                height: 102,
                background: `conic-gradient(#7c3aed 0deg ${Math.max(20, riskPercent) * 3.6}deg, rgba(148,163,184,0.2) 0deg 360deg)`,
              }}
            >
              <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-surface text-center">
                <span className="font-mono text-lg text-fg">{riskPercent}%</span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {controlLoop.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-subtle">
                    <span>{item.label}</span>
                    <span>{item.value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#1f2937]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        item.label === "Autonomy"
                          ? "bg-violet-500"
                          : item.label === "Governance"
                            ? "bg-emerald-500"
                            : "bg-cyan-500",
                      )}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Load pressure</p>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">live</span>
          </div>
          <div className="space-y-4">
            {workload.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>{item.label}</span>
                  <span className="font-mono text-[10px] text-subtle">{item.value}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#1d2433]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500"
                    style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Opportunity mix</p>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
              {snapshot.opportunities.length} tracked
            </span>
          </div>
          <div className="space-y-3">
            {stageMix.length === 0 ? (
              <p className="text-sm text-muted">No active opportunity stages are visible yet.</p>
            ) : (
              stageMix.map((stage) => {
                const max = Math.max(...stageMix.map((item) => item.value), 1);
                return (
                  <div key={stage.label}>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted">
                      <span className="capitalize">{stage.label}</span>
                      <span className="font-mono text-[10px] text-subtle">{stage.value}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[#1d2433]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
                        style={{ width: `${(stage.value / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PulseStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "accent" | "neutral" | "warn" | "ok";
}) {
  const colorMap = {
    accent: "text-accent",
    neutral: "text-fg",
    warn: "text-warn",
    ok: "text-ok",
  };

  return (
    <div className="rounded-2xl border border-border bg-raised/30 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={cn("mt-2 font-mono text-lg tabular-nums", colorMap[tone])}>{value}</p>
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
