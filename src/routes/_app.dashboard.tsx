import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { EmptyState } from "@/components/office/empty-state";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { PageHeader } from "@/components/office/page-header";
import { WorkspaceTime } from "@/components/workspace/workspace-time";
import { useWorkQueue } from "@/components/workspace/use-work-queue";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatZar } from "@/lib/office/format";
import { founderWork } from "@/lib/office/work";
import { useWorkspacePreferences } from "@/lib/workspace/preferences";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard · Vantage-ARS" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const snapshot = useOfficeSnapshot();
  const { queue } = useWorkQueue();
  const { preferences } = useWorkspacePreferences();

  const pendingApprovals = snapshot.approvals.filter((row) => row.status === "pending");
  const openOpportunities = snapshot.opportunities.filter(
    (row) => row.stage !== "lost" && row.stage !== "won",
  );
  const pipeline = openOpportunities.reduce((sum, row) => sum + row.valueCents, 0);
  const openTickets = snapshot.tickets.filter((row) => row.status !== "resolved");
  const liveAgents = snapshot.agents.length - snapshot.agents.filter((a) => a.status === "halted").length;
  const needing = founderWork(snapshot);
  const openWork = (queue?.counts.open ?? 0) + (queue?.counts.claimed ?? 0);

  const recent = useMemo(() => {
    const audit = snapshot.audit.map((row) => ({
      id: `audit:${row.id}`,
      at: row.createdAt,
      actor: row.actor,
      title: row.title,
      body: row.body,
      source: "record",
    }));
    const decisions = snapshot.decisions.map((row) => ({
      id: `decision:${row.id}`,
      at: row.createdAt,
      actor: row.agentId,
      title: row.title,
      body: row.rationale,
      source: "decision",
    }));
    return [...audit, ...decisions]
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, 6);
  }, [snapshot.audit, snapshot.decisions]);

  return (
    <div className="enter-up mx-auto max-w-6xl">
      <PageHeader
        kicker="At a glance"
        title="The desk, in one screen."
        description="Live figures from the office's own records. Nothing here is a forecast."
        action={
          <Link
            to="/analytics"
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            Open analytics
          </Link>
        }
      />

      {snapshot.company.halted ? (
        <div className="mb-6 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          The office is halted: {snapshot.company.haltReason ?? "the founder stopped the desk."}{" "}
          <Link to="/settings" className="underline underline-offset-4">
            Resume it in settings.
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="key-metrics" className="mb-8">
        <h2 id="key-metrics" className="mb-3 font-serif text-2xl">
          Key metrics
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Treasury" value={formatZar(snapshot.company.treasuryCents)} hint="From receipts" />
          <Metric label="Pipeline" value={formatZar(pipeline)} hint={`${openOpportunities.length} open`} />
          <Metric
            label="Receivable"
            value={formatZar(snapshot.company.receivableCents)}
            hint="Issued invoices"
          />
          <Metric label="Your gates" value={String(pendingApprovals.length)} hint="Awaiting you" />
          <Metric label="Open work" value={String(openWork)} hint={`${queue?.counts.failed ?? 0} failed`} />
          <Metric label="Open tickets" value={String(openTickets.length)} hint={`${liveAgents} agents live`} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl">Needs you</h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              {needing.length} item{needing.length === 1 ? "" : "s"}
            </span>
          </div>
          {needing.length === 0 ? (
            <p className="text-sm text-muted">Nothing on your desk. The office is holding its own gates.</p>
          ) : (
            <ul className="space-y-3">
              {needing.slice(0, preferences.compact ? 6 : 4).map((item) => (
                <li key={item.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                  <Link to={item.href} className="text-sm font-medium text-fg hover:text-accent">
                    {item.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted">{item.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl">Desk queue</h2>
            <Link to="/tasks" className="text-xs font-medium text-accent underline-offset-4 hover:underline">
              All tasks
            </Link>
          </div>
          {queue === null ? (
            <p className="text-sm text-muted">Reading the queue…</p>
          ) : queue.items.filter((item) => item.status === "open").length === 0 ? (
            <p className="text-sm text-muted">No open work. The next scheduled pass files what is due.</p>
          ) : (
            <ul className="space-y-3">
              {queue.items
                .filter((item) => item.status === "open")
                .slice(0, preferences.compact ? 8 : 5)
                .map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg">{item.kind.replaceAll("_", " ")}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.reason}</p>
                    </div>
                    <Badge variant="warn">{item.agentId}</Badge>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      <section aria-labelledby="recent-activity" className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="recent-activity" className="font-serif text-2xl">
            Recent activity
          </h2>
          <Link to="/activity-log" className="text-xs font-medium text-accent underline-offset-4 hover:underline">
            Full history
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            title="No activity yet"
            body="The first routed enquiry, decision or ledger write appears here."
          />
        ) : (
          <div className="space-y-2">
            {recent.map((event) => (
              <div
                key={event.id}
                className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-fg">{event.title}</p>
                  <span className="font-mono text-[11px] text-subtle">
                    <WorkspaceTime value={event.at} relative={preferences.relativeTime} />
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{event.body}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
                  {event.source} · {event.actor}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl leading-none text-fg tabular-nums">{value}</p>
      <p className="mt-2 text-[11px] text-subtle">{hint}</p>
    </div>
  );
}
