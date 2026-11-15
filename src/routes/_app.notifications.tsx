import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/office/empty-state";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { PageHeader } from "@/components/office/page-header";
import { useWorkQueue } from "@/components/workspace/use-work-queue";
import { WorkspaceTime } from "@/components/workspace/workspace-time";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useWorkspacePreferences } from "@/lib/workspace/preferences";

export const Route = createFileRoute("/_app/notifications")({
  head: () => ({
    meta: [{ title: "Notifications · Vantage-ARS" }, { name: "robots", content: "noindex" }],
  }),
  component: NotificationsPage,
});

type Alert = {
  id: string;
  at: string;
  group: "gate" | "customer" | "desk" | "mail";
  title: string;
  body: string;
  href?: "/office/approvals" | "/office/inbox" | "/office/technical" | "/tasks";
  tone: "accent" | "warn" | "danger" | "ok" | "default";
};

const GROUP_LABEL: Record<Alert["group"], string> = {
  gate: "Founder gate",
  customer: "Customer",
  desk: "Desk",
  mail: "Mail",
};

function NotificationsPage() {
  const snapshot = useOfficeSnapshot();
  const { queue } = useWorkQueue();
  const { preferences } = useWorkspacePreferences();
  const [group, setGroup] = useState("all");

  const alerts = useMemo<Alert[]>(() => {
    const approvals: Alert[] = snapshot.approvals
      .filter((row) => row.status === "pending")
      .map((row) => ({
        id: `approval:${row.id}`,
        at: row.createdAt,
        group: "gate",
        title: row.title,
        body: `${row.kind.replaceAll("_", " ")} · ${row.rationale}`,
        href: "/office/approvals",
        tone: "warn",
      }));

    const tickets: Alert[] = snapshot.tickets
      .filter((row) => row.status !== "resolved" && (row.severity === "high" || row.severity === "critical"))
      .map((row) => ({
        id: `ticket:${row.id}`,
        at: row.createdAt,
        group: "customer",
        title: row.title,
        body: `${row.severity} · ${row.summary}`,
        href: "/office/technical",
        tone: row.severity === "critical" ? "danger" : "warn",
      }));

    const unrouted: Alert[] = snapshot.inbound
      .filter((row) => row.status === "received")
      .map((row) => ({
        id: `inbound:${row.id}`,
        at: row.createdAt,
        group: "customer",
        title: `${row.companyName}: ${row.subject}`,
        body: row.summary,
        href: "/office/inbox",
        tone: "accent",
      }));

    const dead: Alert[] = (queue?.items ?? [])
      .filter((item) => item.status === "failed" || item.status === "abandoned")
      .map((item) => ({
        id: `work:${item.id}`,
        at: item.dueAt,
        group: "desk",
        title: `${item.kind.replaceAll("_", " ")} · ${item.status}`,
        body: item.lastError ?? item.reason,
        href: "/tasks",
        tone: "danger",
      }));

    const mail: Alert[] = snapshot.notices.map((row) => ({
      id: `notice:${row.id}`,
      at: row.createdAt,
      group: "mail",
      title: row.subject,
      body: row.detail,
      tone: row.status === "sent" ? "ok" : "danger",
    }));

    return [...approvals, ...tickets, ...unrouted, ...dead, ...mail].sort((left, right) =>
      right.at.localeCompare(left.at),
    );
  }, [snapshot, queue]);

  const shown = group === "all" ? alerts : alerts.filter((alert) => alert.group === group);

  return (
    <div className="enter-up mx-auto max-w-4xl">
      <PageHeader
        kicker="Alert history"
        title="What the desk wanted you to know."
        description="Gates waiting on you, customer matters at risk, desk failures and the founder mail the office has filed. Newest first."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="warn">{alerts.filter((a) => a.group === "gate").length} gates</Badge>
        <Badge variant="accent">{alerts.filter((a) => a.group === "customer").length} customer</Badge>
        <Badge variant="danger">{alerts.filter((a) => a.group === "desk").length} desk</Badge>
        <Badge>{alerts.filter((a) => a.group === "mail").length} mail</Badge>
        <div className="ml-auto w-40">
          <Select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filter alerts">
            <option value="all">Every alert</option>
            <option value="gate">Founder gates</option>
            <option value="customer">Customer</option>
            <option value="desk">Desk failures</option>
            <option value="mail">Mail</option>
          </Select>
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          body="No alert matches this filter. A quiet list here means the desk is holding its own gates."
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((alert) => (
            <li
              key={alert.id}
              className={`rounded-xl bg-surface shadow-[var(--shadow-border)] ${
                preferences.compact ? "p-3" : "p-4"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{alert.title}</p>
                  <p className="mt-1 text-sm text-muted">{alert.body}</p>
                </div>
                <Badge variant={alert.tone}>{GROUP_LABEL[alert.group]}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-subtle">
                  <WorkspaceTime value={alert.at} relative={preferences.relativeTime} />
                </span>
                {alert.href ? (
                  <Link to={alert.href} className="text-xs font-medium text-accent underline-offset-4 hover:underline">
                    Open
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
