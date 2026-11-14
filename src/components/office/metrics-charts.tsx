import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";

type ChartDatum = { name: string; value: number };

type MetricsChartsProps = {
  healthBars: ChartDatum[];
  statusBars: ChartDatum[];
};

export default function MetricsCharts({ healthBars, statusBars }: MetricsChartsProps) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2">
      <Card className="h-64">
        <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted">Health dimensions</p>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={healthBars} layout="vertical" margin={{ left: 8, right: 8 }}>
            <CartesianGrid stroke="var(--color-border)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={88}
              tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--color-raised)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                color: "var(--color-fg)",
              }}
            />
            <Bar dataKey="value" fill="var(--color-accent)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card className="h-64">
        <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted">Decision outcomes</p>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={statusBars} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis allowDecimals={false} hide />
            <Tooltip
              cursor={{ fill: "var(--color-raised)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                color: "var(--color-fg)",
              }}
            />
            <Bar dataKey="value" fill="var(--color-ok)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
