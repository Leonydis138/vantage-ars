import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { PageHeader } from "@/components/office/page-header";
import { Card } from "@/components/ui/card";
import { formatZar } from "@/lib/office/money";
import type { RevenueMetrics } from "@/lib/office/types";

const MetricsCharts = lazy(() => import("@/components/office/metrics-charts"));

export const Route = createFileRoute("/office/metrics")({
  component: MetricsPage,
});

/** The recurring-revenue figures this page shows, and nothing else. */
type RecurringFigures = Pick<
  RevenueMetrics,
  | "activeSubscriptions"
  | "churnRiskCount"
  | "monthlyRecurringCents"
  | "annualRecurringCents"
  | "collectedThisMonthCents"
  | "outstandingCents"
  | "overdueCents"
>;

/**
 * Read the recurring-revenue figures out of the snapshot.
 *
 * The snapshot is data on the wire, so the block that shows it must not assume
 * it is there. A missing figure counts as zero; a missing block is nothing at
 * all, and the page says no more about revenue than it actually knows.
 */
function readRecurringFigures(value: unknown): RecurringFigures | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const count = (key: string): number => (typeof raw[key] === "number" ? raw[key] : 0);
  return {
    activeSubscriptions: count("activeSubscriptions"),
    churnRiskCount: count("churnRiskCount"),
    monthlyRecurringCents: count("monthlyRecurringCents"),
    annualRecurringCents: count("annualRecurringCents"),
    collectedThisMonthCents: count("collectedThisMonthCents"),
    outstandingCents: count("outstandingCents"),
    overdueCents: count("overdueCents"),
  };
}

function MetricsPage() {
  const snapshot = useOfficeSnapshot();
  const { health, company, decisions } = snapshot;
  const recurring = readRecurringFigures(snapshot.revenue);

  const rows = [
    ["Overall autonomy health", health.overall.toFixed(3), "≥ 0.90"],
    ["Decision quality", health.decisionQuality.toFixed(3), "≥ 0.90"],
    ["Constraint adherence", health.constraintAdherence.toFixed(3), "1.000"],
    ["Governance", health.governance.toFixed(3), "≥ 0.95"],
    ["Self-healing", health.selfHealing.toFixed(3), "≥ 0.90"],
    ["Autonomous resolution", `${(health.autonomousResolution * 100).toFixed(2)}%`, "≥ 99.5%"],
    ["Intervention rate", health.interventionRate.toFixed(5), "< 0.0001"],
    ["Hard constraint violations", String(health.hardViolations), "0"],
    ["Decisions recorded", String(health.decisionCount), "complete audit"],
    ["Pending founder gates", String(health.pendingApprovals), "clear desk"],
    ["Treasury", formatZar(company.treasuryCents), "from receipts only"],
    ["Receivable", formatZar(company.receivableCents), "issued invoices"],
    ["Payable", formatZar(company.payableCents), "approved expenses"],
  ] as const;

  // Aggregate in one pass so dashboard work stays linear without scanning the
  // entire decision history once for each chart category.
  const statusCounts = decisions.reduce(
    (counts, decision) => {
      if (decision.status === "executed" || decision.status === "authorized") {
        counts.executed += 1;
      } else if (decision.status === "escalated") {
        counts.escalated += 1;
      } else if (decision.status === "blocked") {
        counts.blocked += 1;
      }
      return counts;
    },
    { executed: 0, escalated: 0, blocked: 0 },
  );

  const healthBars = [
    { name: "Quality", value: Math.round(health.decisionQuality * 100) },
    { name: "Constraints", value: Math.round(health.constraintAdherence * 100) },
    { name: "Governance", value: Math.round(health.governance * 100) },
    { name: "Healing", value: Math.round(health.selfHealing * 100) },
    { name: "Autonomy", value: Math.round(health.autonomousResolution * 100) },
  ];
  const statusBars = [
    { name: "Executed", value: statusCounts.executed },
    { name: "Escalated", value: statusCounts.escalated },
    { name: "Blocked", value: statusCounts.blocked },
  ];

  const recurringRows = recurring
    ? ([
        ["Monthly recurring revenue", formatZar(recurring.monthlyRecurringCents), "active plans"],
        [
          "Annual recurring revenue",
          formatZar(recurring.annualRecurringCents),
          "run rate, not a forecast",
        ],
        ["Active subscriptions", String(recurring.activeSubscriptions), "on a recurring plan"],
        ["Collected this month", formatZar(recurring.collectedThisMonthCents), "receipts only"],
        ["Outstanding", formatZar(recurring.outstandingCents), "issued, not yet collected"],
        ["Overdue", formatZar(recurring.overdueCents), "past the due date"],
        ["Churn risk", String(recurring.churnRiskCount), "subscriptions at risk"],
      ] as const)
    : [];

  return (
    <div className="enter-up mx-auto max-w-3xl">
      <PageHeader
        kicker="Autonomy health"
        title="Measured, not claimed."
        description="Leading and lagging indicators from live office records. Empty history is a healthy new company, not a simulation."
      />

      <Suspense
        fallback={
          <div className="mb-6 grid gap-4 sm:grid-cols-2" aria-label="Loading metrics charts">
            <Card className="h-64 animate-pulse" />
            <Card className="h-64 animate-pulse" />
          </div>
        }
      >
        <MetricsCharts healthBars={healthBars} statusBars={statusBars} />
      </Suspense>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.14em] text-muted">
            <tr className="border-b border-border">
              <th className="px-5 py-3 font-medium">Metric</th>
              <th className="px-5 py-3 font-medium">Live</th>
              <th className="hidden px-5 py-3 font-medium sm:table-cell">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-b border-border last:border-0">
                <td className="px-5 py-3">{row[0]}</td>
                <td className="px-5 py-3 font-mono tabular-nums">{row[1]}</td>
                <td className="hidden px-5 py-3 text-muted sm:table-cell">{row[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {recurring ? (
        <section className="mt-10">
          <h2 className="mb-3 font-serif text-2xl">Recurring revenue</h2>
          <p className="mb-3 text-sm text-muted">
            The money that arrives on its own, because a customer is on a managed plan. One-off work
            is not counted here.
          </p>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Recurring revenue: monthly and annual run rate, active subscriptions, money
                collected this month, what is still outstanding, what is overdue, and how many
                subscriptions are at risk of lapsing.
              </caption>
              <thead className="text-left text-xs uppercase tracking-[0.14em] text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Metric
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Live
                  </th>
                  <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">
                    Basis
                  </th>
                </tr>
              </thead>
              <tbody>
                {recurringRows.map((row) => (
                  <tr key={row[0]} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">{row[0]}</td>
                    <td className="px-5 py-3 font-mono tabular-nums">{row[1]}</td>
                    <td className="hidden px-5 py-3 text-muted sm:table-cell">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
