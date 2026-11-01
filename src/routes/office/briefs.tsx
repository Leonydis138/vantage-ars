import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getFounderMarketResearch, getFounderOperationsReport } from "@/lib/office/api";
import { buildFounderBrief, buildMarketingBrief } from "@/lib/office/briefs";

export const Route = createFileRoute("/office/briefs")({
  loader: () => getFounderOperationsReport(),
  component: FounderBriefsPage,
});

function FounderBriefsPage() {
  const snapshot = useOfficeSnapshot();
  const report = Route.useLoaderData();
  const brief = useMemo(() => buildFounderBrief(snapshot), [snapshot]);
  const [research, setResearch] = useState(report?.research ?? []);
  const [loading, setLoading] = useState(false);
  const marketing = useMemo(() => buildMarketingBrief(snapshot, research), [snapshot, research]);

  async function refreshResearch() {
    setLoading(true);
    try {
      setResearch(await getFounderMarketResearch());
    } catch {
      setResearch([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="enter-up mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Founder brief</p>
        <h1 className="mt-2 font-serif text-4xl">{brief.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{brief.summary}</p>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Pending approvals" value={String(brief.metrics.pendingApprovals)} />
        <Metric label="Inbound" value={String(brief.metrics.openInbound)} />
        <Metric label="Open tickets" value={String(brief.metrics.openTickets)} />
        <Metric label="Pipeline" value={new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(brief.metrics.pipelineCents / 100)} />
        <Metric label="Monthly recurring" value={new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(brief.metrics.monthlyRecurringCents / 100)} />
      </div>

      {report ? (
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl">Automatic diagnostics</h2>
            <p className="mt-2 text-sm text-muted">
              Live checks run when this report loads. Only a stale scheduler receives an automatic,
              guarded nudge; other repairs stay with the founder.
            </p>
          </div>
          <Badge variant={report.health.ok ? "ok" : "warn"}>
            {report.health.ok ? "Healthy" : "Review needed"}
          </Badge>
        </div>
        {report.recovery.attempted ? (
          <p className="mt-4 text-sm text-muted">
            {report.recovery.kicked
              ? "A stale scheduler tick was nudged automatically."
              : `Automatic scheduler recovery response: ${report.recovery.reason}`}
          </p>
        ) : null}
        {report.health.problems.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {report.health.problems.map((problem) => (
              <li key={problem} className="py-3 text-sm text-muted first:pt-0 last:pb-0">
                {problem}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No active operational errors were found.</p>
        )}
        {(report.health.full?.queue.abandoned ?? 0) > 0 ? (
          <p className="mt-4 border-t border-border pt-3 text-sm text-muted">
            {report.health.full?.queue.abandoned} work item(s) exhausted retries. They are not
            redriven automatically because retrying may repeat a business action.
          </p>
        ) : null}
      </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-2xl">Priority actions</h2>
            <Badge>Founder queue</Badge>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-muted">
            {brief.actions.map((item) => (
              <li key={item} className="rounded-lg border border-border bg-raised p-3">
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-2xl">Commercial risks</h2>
            <Badge variant="warn">Monitor</Badge>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-muted">
            {brief.risks.map((item) => (
              <li key={item} className="rounded-lg border border-border bg-raised p-3">
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section className="mt-6 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-2xl">Marketing brief</h2>
            <Button type="button" variant="secondary" onClick={refreshResearch} disabled={loading}>
              {loading ? "Researching…" : "Refresh market research"}
            </Button>
          </div>

          <h3 className="mt-4 text-xl font-semibold text-fg">{marketing.headline}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">{marketing.angle}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {marketing.channels.map((channel) => (
              <Badge key={channel}>{channel}</Badge>
            ))}
          </div>

          <ul className="mt-5 space-y-3 text-sm text-muted">
            {marketing.proofPoints.map((item) => (
              <li key={item} className="rounded-lg border border-border bg-raised p-3">
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="font-serif text-2xl">Next opportunities</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted">
            {brief.opportunities.map((item) => (
              <li key={item} className="rounded-lg border border-border bg-raised p-3">
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-lg border border-border bg-raised p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Founder action</p>
            <p className="mt-2 text-sm leading-relaxed text-fg">{marketing.action}</p>
          </div>
        </Card>
      </section>

      {research.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 font-serif text-2xl">External signal</h2>
          <div className="grid gap-3">
            {research.map((item) => (
              <a
                key={`${item.url}-${item.title}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border bg-surface p-4 text-left transition hover:border-accent/40 hover:bg-raised"
              >
                <p className="text-sm font-semibold text-fg">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.snippet}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
                  {item.url}
                </p>
              </a>
            ))}
          </div>
        </section>
      ) : (
        <p className="mt-6 text-sm text-muted">
          No current external results are available; the marketing brief is based on office records.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl text-fg">{value}</p>
    </div>
  );
}
