import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/office/empty-state";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { PageHeader } from "@/components/office/page-header";
import { WorkspaceTime } from "@/components/workspace/workspace-time";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatZar } from "@/lib/office/format";
import { useWorkspacePreferences } from "@/lib/workspace/preferences";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({ meta: [{ title: "Projects · Vantage-ARS" }, { name: "robots", content: "noindex" }] }),
  component: ProjectsPage,
});

const STAGE_VARIANT: Record<string, "accent" | "ok" | "warn" | "danger" | "default"> = {
  open: "accent",
  qualified: "accent",
  proposal: "warn",
  negotiation: "warn",
  won: "ok",
  lost: "danger",
};

function ProjectsPage() {
  const snapshot = useOfficeSnapshot();
  const { preferences } = useWorkspacePreferences();
  const [stage, setStage] = useState("active");
  const [search, setSearch] = useState("");

  const stages = useMemo(
    () => [...new Set(snapshot.opportunities.map((row) => row.stage))].sort(),
    [snapshot.opportunities],
  );

  const initiatives = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return snapshot.opportunities
      .filter((row) => {
        if (stage === "active" && (row.stage === "won" || row.stage === "lost")) return false;
        if (stage !== "active" && stage !== "all" && row.stage !== stage) return false;
        if (!needle) return true;
        return `${row.companyName} ${row.summary} ${row.stage}`.toLowerCase().includes(needle);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [snapshot.opportunities, stage, search]);

  const active = snapshot.opportunities.filter((row) => row.stage !== "won" && row.stage !== "lost");
  const pipeline = active.reduce((sum, row) => sum + row.valueCents, 0);
  const planTitles = new Map((snapshot.revenue?.planMix ?? []).map((plan) => [plan.planId, plan.title]));
  const recurring = snapshot.subscriptions
    .filter((row) => row.status === "active" || row.status === "paused")
    .sort((left, right) => left.nextBillingAt.localeCompare(right.nextBillingAt));

  return (
    <div className="enter-up mx-auto max-w-5xl">
      <PageHeader
        kicker="Initiatives"
        title="What is open, and when it is due."
        description="Every initiative is a real office record — an opportunity in the sales book or a recurring plan on the revenue book. Nothing is a placeholder."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Open initiatives" value={String(active.length)} />
        <Figure label="Pipeline" value={formatZar(pipeline)} />
        <Figure label="Recurring plans" value={String(recurring.length)} />
        <Figure
          label="Next billing"
          value={recurring[0] ? formatZar(recurring[0].priceCents) : "—"}
          hint={recurring[0]?.companyName}
        />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Input
          placeholder="Search initiatives"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search initiatives"
        />
        <Select value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Filter by stage">
          <option value="active">Active only</option>
          <option value="all">Every stage</option>
          {stages.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      {initiatives.length === 0 ? (
        <EmptyState
          title="No initiative matches"
          body="The sales book is empty for this filter. Widen the stage or clear the search."
        />
      ) : (
        <ul className="space-y-2">
          {initiatives.map((row) => (
            <li
              key={row.id}
              className={`rounded-xl bg-surface shadow-[var(--shadow-border)] ${
                preferences.compact ? "p-3" : "p-4"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{row.companyName}</p>
                  <p className="mt-1 text-sm text-muted">{row.summary}</p>
                </div>
                <Badge variant={STAGE_VARIANT[row.stage] ?? "default"}>{row.stage}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-subtle">
                <span className="text-fg">{formatZar(row.valueCents)}</span>
                <span>
                  updated <WorkspaceTime value={row.updatedAt} relative={preferences.relativeTime} />
                </span>
                <span>
                  opened <WorkspaceTime value={row.createdAt} relative={preferences.relativeTime} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-8">
        <h2 className="font-serif text-xl">Recurring plans and their deadlines</h2>
        {recurring.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No recurring plan is on the book yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {recurring.map((row) => (
              <li
                key={row.id}
                className={`flex flex-wrap items-center justify-between gap-2 ${
                  preferences.compact ? "py-2" : "py-3"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-fg">{row.companyName}</p>
                  <p className="font-mono text-[11px] text-subtle">
                    {planTitles.get(row.planId) ?? row.planId} · {formatZar(row.priceCents)} / {row.cycle}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-subtle">
                    next <WorkspaceTime value={row.nextBillingAt} relative={preferences.relativeTime} />
                  </span>
                  <Badge variant={row.status === "active" ? "ok" : "warn"}>{row.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl leading-none tabular-nums text-fg">{value}</p>
      {hint ? <p className="mt-1 truncate text-[11px] text-subtle">{hint}</p> : null}
    </div>
  );
}
