import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { PageHeader } from "@/components/office/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatZar } from "@/lib/office/format";

export const Route = createFileRoute("/_app/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Vantage-ARS" }, { name: "robots", content: "noindex" }] }),
  component: AnalyticsPage,
});

const DAYS = 14;
const MONTHS = 6;

const AXIS_TICK = { fill: "var(--color-muted)", fontSize: 11 };
const TOOLTIP_STYLE = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  color: "var(--color-fg)",
  fontSize: 12,
};

function shortDay(iso: string): string {
  return iso.slice(5).replace("-", "/");
}

function shortMonth(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function AnalyticsPage() {
  const snapshot = useOfficeSnapshot();

  const decisionSeries = useMemo(() => {
    const days: string[] = [];
    const today = new Date();
    for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
      const day = new Date(today.getTime() - offset * 86_400_000);
      days.push(day.toISOString().slice(0, 10));
    }
    return days.map((day) => {
      const rows = snapshot.decisions.filter((row) => row.createdAt.slice(0, 10) === day);
      return {
        day: shortDay(day),
        executed: rows.filter((row) => row.status === "executed" || row.status === "authorized").length,
        escalated: rows.filter((row) => row.status === "escalated").length,
        blocked: rows.filter((row) => row.status === "blocked").length,
      };
    });
  }, [snapshot.decisions]);

  const pipelineByStage = useMemo(() => {
    const stages = new Map<string, { count: number; cents: number }>();
    for (const opportunity of snapshot.opportunities) {
      const stage = opportunity.stage || "unclassified";
      const current = stages.get(stage) ?? { count: 0, cents: 0 };
      stages.set(stage, { count: current.count + 1, cents: current.cents + opportunity.valueCents });
    }
    return [...stages.entries()]
      .map(([stage, value]) => ({
        stage: stage.replaceAll("_", " "),
        cents: Math.round(value.cents / 100),
        count: value.count,
      }))
      .sort((left, right) => right.cents - left.cents);
  }, [snapshot.opportunities]);

  const cashSeries = useMemo(() => {
    const months: string[] = [];
    const today = new Date();
    for (let offset = MONTHS - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
      months.push(date.toISOString().slice(0, 10));
    }
    return months.map((month) => {
      const invoiced = snapshot.ledger
        .filter((row) => row.kind === "invoice" && shortMonth(row.createdAt) === shortMonth(month))
        .reduce((sum, row) => sum + row.amountCents, 0);
      const collected = snapshot.ledger
        .filter((row) => row.kind === "receipt" && shortMonth(row.createdAt) === shortMonth(month))
        .reduce((sum, row) => sum + row.amountCents, 0);
      const spent = snapshot.ledger
        .filter((row) => row.kind === "expense" && shortMonth(row.createdAt) === shortMonth(month))
        .reduce((sum, row) => sum + row.amountCents, 0);
      return {
        month: shortMonth(month),
        invoiced: Math.round(invoiced / 100),
        collected: Math.round(collected / 100),
        spent: Math.round(spent / 100),
      };
    });
  }, [snapshot.ledger]);

  const planMix = snapshot.revenue?.planMix ?? [];
  const severity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ticket of snapshot.tickets) {
      if (ticket.status === "resolved") continue;
      counts.set(ticket.severity, (counts.get(ticket.severity) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  }, [snapshot.tickets]);

  const figures = [
    ["Treasury", formatZar(snapshot.company.treasuryCents)],
    ["Receivable", formatZar(snapshot.company.receivableCents)],
    ["Payable", formatZar(snapshot.company.payableCents)],
    ["Monthly recurring", formatZar(snapshot.revenue?.monthlyRecurringCents ?? 0)],
    ["Collected this month", formatZar(snapshot.revenue?.collectedThisMonthCents ?? 0)],
    ["Outstanding", formatZar(snapshot.revenue?.outstandingCents ?? 0)],
    ["Decisions recorded", String(snapshot.decisions.length)],
    ["Autonomy health", snapshot.health.overall.toFixed(3)],
  ] as const;

  return (
    <div className="enter-up mx-auto max-w-6xl">
      <PageHeader
        kicker="Trends"
        title="The record, charted."
        description="Every series is drawn from office records. A flat line on a young desk is the truth, not a gap."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-72">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl">Decisions per day</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              last {DAYS} days
            </span>
          </div>
          <ResponsiveContainer width="100%" height="82%">
            <LineChart data={decisionSeries} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={AXIS_TICK} interval="preserveStartEnd" />
              <YAxis tick={AXIS_TICK} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="executed" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="escalated" stroke="var(--color-warn)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="blocked" stroke="var(--color-danger)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="h-72">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl">Pipeline by stage</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">ZAR</span>
          </div>
          {pipelineByStage.length === 0 ? (
            <p className="text-sm text-muted">No opportunities are open, so there is no pipeline to chart.</p>
          ) : (
            <ResponsiveContainer width="100%" height="82%">
              <BarChart data={pipelineByStage} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="stage" tick={AXIS_TICK} interval={0} />
                <YAxis tick={AXIS_TICK} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--color-raised)" }} />
                <Bar dataKey="cents" radius={[6, 6, 0, 0]}>
                  {pipelineByStage.map((entry) => (
                    <Cell key={entry.stage} fill="var(--color-accent)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="h-72">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl">Invoiced, collected, spent</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              last {MONTHS} months
            </span>
          </div>
          <ResponsiveContainer width="100%" height="82%">
            <BarChart data={cashSeries} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--color-raised)" }} />
              <Legend wrapperStyle={{ color: "var(--color-muted)", fontSize: 11 }} />
              <Bar dataKey="invoiced" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="collected" fill="var(--color-ok)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="spent" fill="var(--color-warn)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="h-72">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl">Recurring plan mix</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">MRR</span>
          </div>
          {planMix.length === 0 ? (
            <p className="text-sm text-muted">No subscription is on a recurring plan yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="82%">
              <BarChart
                data={planMix.map((plan) => ({
                  plan: plan.title,
                  cents: Math.round(plan.monthlyCents / 100),
                }))}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
              >
                <CartesianGrid stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} hide />
                <YAxis type="category" dataKey="plan" width={96} tick={AXIS_TICK} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--color-raised)" }} />
                <Bar dataKey="cents" fill="var(--color-ok)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="font-serif text-xl">Key figures</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {figures.map(([label, value]) => (
              <div key={label}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</dt>
                <dd className="mt-1 font-serif text-xl tabular-nums text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="font-serif text-xl">Open tickets by severity</h2>
          {severity.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No ticket is open.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {severity.map((row) => (
                <li key={row.name} className="flex items-center justify-between gap-3">
                  <span className="text-sm capitalize text-fg">{row.name}</span>
                  <Badge variant={row.name === "critical" || row.name === "high" ? "danger" : "default"}>
                    {row.value}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
