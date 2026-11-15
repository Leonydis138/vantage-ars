import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/office/empty-state";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { PageHeader } from "@/components/office/page-header";
import { WorkspaceTime } from "@/components/workspace/workspace-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { chainToCsv } from "@/lib/office/csv";
import { useWorkspacePreferences } from "@/lib/workspace/preferences";

export const Route = createFileRoute("/_app/activity-log")({
  head: () => ({
    meta: [{ title: "Activity log · Vantage-ARS" }, { name: "robots", content: "noindex" }],
  }),
  component: ActivityLogPage,
});

type Event = {
  id: string;
  at: string;
  source: "record" | "decision" | "notice";
  kind: string;
  title: string;
  body: string;
  actor: string;
};

const PAGE = 40;

function downloadCsv(filename: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ActivityLogPage() {
  const snapshot = useOfficeSnapshot();
  const { preferences } = useWorkspacePreferences();
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const events = useMemo<Event[]>(() => {
    const audit = snapshot.audit.map((row) => ({
      id: `audit:${row.id}`,
      at: row.createdAt,
      source: "record" as const,
      kind: row.kind,
      title: row.title,
      body: row.body,
      actor: row.actor,
    }));
    const decisions = snapshot.decisions.map((row) => ({
      id: `decision:${row.id}`,
      at: row.createdAt,
      source: "decision" as const,
      kind: row.actionKind,
      title: row.title,
      body: row.rationale,
      actor: row.agentId,
    }));
    const notices = snapshot.notices.map((row) => ({
      id: `notice:${row.id}`,
      at: row.createdAt,
      source: "notice" as const,
      kind: row.kind,
      title: row.subject,
      body: row.detail,
      actor: row.status === "sent" ? "mail sent" : "mail not delivered",
    }));
    return [...audit, ...decisions, ...notices].sort((left, right) =>
      right.at.localeCompare(left.at),
    );
  }, [snapshot.audit, snapshot.decisions, snapshot.notices]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return events.filter((event) => {
      if (source !== "all" && event.source !== source) return false;
      if (!needle) return true;
      return `${event.title} ${event.body} ${event.actor} ${event.kind}`.toLowerCase().includes(needle);
    });
  }, [events, source, search]);

  return (
    <div className="enter-up mx-auto max-w-4xl">
      <PageHeader
        kicker="Chronological record"
        title="What the desk did, in order."
        description="Every routed item, decision and notice, newest first. Audit records are hash-chained; this page reads them, it never edits them."
        action={
          events.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadCsv("vantage-chain.csv", chainToCsv(snapshot.audit, snapshot.decisions))}
            >
              Export chain CSV
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Input
          placeholder="Search the log"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(PAGE);
          }}
          aria-label="Search the activity log"
        />
        <Select
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setLimit(PAGE);
          }}
          aria-label="Filter by source"
        >
          <option value="all">Every source</option>
          <option value="record">Audit records</option>
          <option value="decision">Decisions</option>
          <option value="notice">Notices</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          body="Once the desk routes an enquiry or acts, the record shows up here in order."
        />
      ) : (
        <>
          <ol className="relative space-y-2 border-l border-border/70 pl-4">
            {filtered.slice(0, limit).map((event) => (
              <li key={event.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[21px] top-3 size-2 rounded-full bg-accent/70"
                />
                <div
                  className={`rounded-xl bg-surface shadow-[var(--shadow-border)] ${
                    preferences.compact ? "p-3" : "p-4"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-fg">{event.title}</p>
                    <span className="font-mono text-[11px] text-subtle">
                      <WorkspaceTime value={event.at} relative={preferences.relativeTime} />
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{event.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={event.source === "decision" ? "accent" : "default"}>
                      {event.source}
                    </Badge>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
                      {event.kind.replaceAll("_", " ")} · {event.actor}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {filtered.length > limit ? (
            <div className="mt-4 text-center">
              <Button type="button" variant="outline" onClick={() => setLimit(limit + PAGE)}>
                Show {Math.min(PAGE, filtered.length - limit)} more
              </Button>
            </div>
          ) : null}
          <p className="mt-3 text-center font-mono text-[11px] text-subtle">
            {Math.min(limit, filtered.length)} of {filtered.length} entries
          </p>
        </>
      )}
    </div>
  );
}
