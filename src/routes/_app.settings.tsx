import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { PageHeader } from "@/components/office/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { haltOffice } from "@/lib/office/api";
import { formatZar } from "@/lib/office/format";
import {
  useWorkspacePreferences,
  type WorkspacePreferences,
} from "@/lib/workspace/preferences";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings · Vantage-ARS" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

const PREFERENCE_ROWS = [
  {
    key: "compact" as const,
    title: "Compact lists",
    body: "Tighten the spacing of task, project, activity and notification rows so more fits on one screen.",
  },
  {
    key: "relativeTime" as const,
    title: "Relative timestamps",
    body: "Show “3h ago” instead of a full date and time. Turn it off for exact figures.",
  },
  {
    key: "showCompleted" as const,
    title: "Show finished work",
    body: "Include done and abandoned work items on the task page.",
  },
];

function SettingsPage() {
  const snapshot = useOfficeSnapshot();
  const router = useRouter();
  const { preferences, update } = useWorkspacePreferences();
  const [working, setWorking] = useState(false);
  const halted = snapshot.company.halted;

  async function toggleHalt() {
    if (working) return;
    setWorking(true);
    try {
      await haltOffice({
        data: {
          halted: !halted,
          reason: halted
            ? "Founder resumed the office from workspace settings."
            : "Founder halted the office from workspace settings.",
        },
      });
      toast.success(halted ? "The office is running again." : "The office is halted.");
      await router.invalidate();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The halt state could not change.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="enter-up mx-auto max-w-4xl">
      <PageHeader
        kicker="Settings"
        title="Your desk, your defaults."
        description="Display preferences for this browser, and the office-wide switches the constitution puts in your hands."
      />

      <Card className="mb-4">
        <h2 className="font-serif text-xl">Personal preferences</h2>
        <p className="mt-1 text-sm text-muted">
          Stored in this browser only. They never change a record the office keeps.
        </p>
        <div className="mt-4 space-y-4">
          {PREFERENCE_ROWS.map((row) => (
            <label
              key={row.key}
              htmlFor={`pref-${row.key}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg bg-raised/50 p-3"
            >
              <input
                id={`pref-${row.key}`}
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
                checked={preferences[row.key]}
                onChange={(event) =>
                  update({ [row.key]: event.target.checked } as Partial<WorkspacePreferences>)
                }
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{row.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{row.body}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl">Application configuration</h2>
          <Badge variant={halted ? "danger" : "ok"}>{halted ? "halted" : "running"}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Row label="Autonomy level" value={snapshot.company.autonomyLevel} />
          <Row label="Constitution" value={`v${snapshot.company.constitutionVersion}`} />
          <Row label="Jurisdiction" value={snapshot.company.jurisdiction} />
          <Row label="Currency" value={`${snapshot.company.currency} · ${snapshot.company.vatRate * 100}% VAT`} />
          <Row label="Treasury" value={formatZar(snapshot.company.treasuryCents)} />
          <Row
            label="Founder mail"
            value={snapshot.mail.smtpConnected ? (snapshot.mail.account ?? "connected") : "not connected"}
          />
        </dl>
        {halted ? (
          <p className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
            Halt reason: {snapshot.company.haltReason ?? "not recorded"}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant={halted ? "default" : "danger"} onClick={() => void toggleHalt()} disabled={working}>
            {working ? "Working…" : halted ? "Resume the office" : "Halt the office"}
          </Button>
          <span className="text-[11px] text-subtle">
            A halt stops every agent and the scheduled pass. Records stay as they are.
          </span>
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-xl">Where the deeper switches live</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(
            [
              ["/office/delegations", "Delegation", "What the desk may do without you, and the caps."],
              ["/office/constitution", "Constitution", "The provisions every act is checked against."],
              ["/office/governance", "Governance record", "Every gate, receipt and episode."],
              ["/office/audit", "Audit and backup", "Verify the chain and download a checked backup."],
              ["/office/metrics", "Autonomy metrics", "The measured health of the desk."],
            ] as const
          ).map(([href, title, body]) => (
            <li key={href}>
              <Link to={href} className="font-medium text-fg hover:text-accent">
                {title}
              </Link>
              <span className="text-muted"> — {body}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{value}</dd>
    </div>
  );
}
