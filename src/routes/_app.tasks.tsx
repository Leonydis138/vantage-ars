import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { PageHeader } from "@/components/office/page-header";
import { useWorkQueue } from "@/components/workspace/use-work-queue";
import { WorkspaceTime } from "@/components/workspace/workspace-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_BY_ID } from "@/lib/office/agents";
import { dispatchAgent } from "@/lib/office/api";
import { useWorkspacePreferences } from "@/lib/workspace/preferences";

export const Route = createFileRoute("/_app/tasks")({
  head: () => ({ meta: [{ title: "Tasks · Vantage-ARS" }, { name: "robots", content: "noindex" }] }),
  component: TasksPage,
});

type SortKey = "due" | "priority" | "status";

const STATUS_VARIANT = {
  open: "warn",
  claimed: "accent",
  done: "ok",
  failed: "danger",
  abandoned: "danger",
} as const;

function TasksPage() {
  const snapshot = useOfficeSnapshot();
  const router = useRouter();
  const { queue, error, loading, reload } = useWorkQueue();
  const { preferences, update } = useWorkspacePreferences();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [agent, setAgent] = useState("all");
  const [sort, setSort] = useState<SortKey>("due");
  const [agentId, setAgentId] = useState("vantage");
  const [brief, setBrief] = useState("");
  const [dispatching, setDispatching] = useState(false);

  const items = useMemo(() => {
    const all = queue?.items ?? [];
    const needle = search.trim().toLowerCase();
    const filtered = all.filter((item) => {
      if (!preferences.showCompleted && (item.status === "done" || item.status === "abandoned")) {
        return false;
      }
      if (status === "active" && item.status !== "open" && item.status !== "claimed") return false;
      if (status !== "active" && status !== "all" && item.status !== status) return false;
      if (agent !== "all" && item.agentId !== agent) return false;
      if (!needle) return true;
      return `${item.kind} ${item.reason} ${item.agentId} ${item.outcome ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
    return filtered.sort((left, right) => {
      if (sort === "priority") return left.priority - right.priority;
      if (sort === "status") return left.status.localeCompare(right.status);
      return left.dueAt.localeCompare(right.dueAt);
    });
  }, [queue, search, status, agent, sort, preferences.showCompleted]);

  async function addTask() {
    const task = brief.trim();
    if (task.length < 8 || dispatching) return;
    setDispatching(true);
    try {
      const result = await dispatchAgent({ data: { agentId, task } });
      if (!result.ok) {
        toast.error(result.error ?? "The agent could not take that task.");
        return;
      }
      toast.success(
        `${result.executed} act${result.executed === 1 ? "" : "s"} · ${result.escalated} to you · ${result.blocked} blocked`,
        { description: result.briefing },
      );
      setBrief("");
      await reload();
      await router.invalidate();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The task could not be filed.");
    } finally {
      setDispatching(false);
    }
  }

  const counts = queue?.counts;

  return (
    <div className="enter-up mx-auto max-w-5xl">
      <PageHeader
        kicker="Work queue"
        title="Everything the desk owes."
        description="The office files its own work from real records. You can add a brief for any agent, and everything costly or customer-facing still comes back to your gate."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["open", counts?.open ?? 0],
            ["claimed", counts?.claimed ?? 0],
            ["done", counts?.done ?? 0],
            ["failed", counts?.failed ?? 0],
            ["abandoned", counts?.abandoned ?? 0],
          ] as const
        ).map(([label, value]) => (
          <Badge key={label} variant={label === "failed" || label === "abandoned" ? "danger" : "default"}>
            {label} {value}
          </Badge>
        ))}
        <Badge variant="accent">{snapshot.agents.filter((a) => a.status === "working").length} working</Badge>
      </div>

      <Card className="mb-6">
        <h2 className="font-serif text-xl">Add a task</h2>
        <p className="mt-1 text-sm text-muted">
          Write the brief. The agent plans the acts; the governor decides which of them need you.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <div>
            <Label htmlFor="task-agent">Agent</Label>
            <Select
              id="task-agent"
              className="mt-1"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              {snapshot.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.callsign} · {a.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="task-brief">Brief</Label>
            <Textarea
              id="task-brief"
              className="mt-1"
              rows={3}
              value={brief}
              placeholder="Chase the unpaid invoice from Acme Ltd and tell me what you find."
              onChange={(event) => setBrief(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-subtle">At least a sentence. Nothing is sent without your gate.</p>
          <Button
            type="button"
            onClick={() => void addTask()}
            disabled={dispatching || brief.trim().length < 8 || snapshot.company.halted}
          >
            {dispatching ? "Dispatching…" : "Give the task"}
          </Button>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search tasks"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search tasks"
        />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
          <option value="active">Active only</option>
          <option value="all">Every status</option>
          <option value="open">Open</option>
          <option value="claimed">Claimed</option>
          <option value="done">Done</option>
          <option value="failed">Failed</option>
          <option value="abandoned">Abandoned</option>
        </Select>
        <Select value={agent} onChange={(event) => setAgent(event.target.value)} aria-label="Filter by agent">
          <option value="all">Every agent</option>
          {snapshot.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.callsign}
            </option>
          ))}
        </Select>
        <Select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          aria-label="Sort tasks"
        >
          <option value="due">Sort by due</option>
          <option value="priority">Sort by priority</option>
          <option value="status">Sort by status</option>
        </Select>
      </div>

      <label className="mb-6 flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-accent)]"
          checked={preferences.showCompleted}
          onChange={(event) => update({ showCompleted: event.target.checked })}
        />
        Show finished and abandoned work
      </label>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {loading && items.length === 0 ? (
        <p className="text-sm text-muted">Reading the queue…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl bg-raised px-5 py-10 text-center shadow-[var(--shadow-border)]">
          <p className="font-serif text-2xl text-fg">Nothing matches</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            No work item fits these filters. Widen the status filter or clear the search.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{item.kind.replaceAll("_", " ")}</p>
                  <p className={`mt-1 text-sm text-muted ${preferences.compact ? "" : "line-clamp-3"}`}>
                    {item.reason}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[item.status] ?? "default"}>{item.status}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-subtle">
                <span>{AGENT_BY_ID[item.agentId]?.callsign ?? item.agentId}</span>
                <span>priority {item.priority}</span>
                <span>
                  due <WorkspaceTime value={item.dueAt} relative={preferences.relativeTime} />
                </span>
                <span>
                  attempt {item.attempts}/{item.maxAttempts}
                </span>
              </div>
              {item.lastError ? <p className="mt-2 text-xs text-danger">{item.lastError}</p> : null}
              {item.outcome ? <p className="mt-2 text-xs text-muted">{item.outcome}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
