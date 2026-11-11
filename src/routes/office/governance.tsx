import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/office/empty-state";
import { PageHeader } from "@/components/office/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getGovernanceRecord, getMonthlyGovernanceReport } from "@/lib/office/api";
import { formatDateTime, formatZar } from "@/lib/office/format";
import type {
  GateRecordRow,
  GovernanceRecord,
  MonthlyGovernanceReport as MonthlyGovernanceReportData,
} from "@/lib/office/types";

export const Route = createFileRoute("/office/governance")({
  component: GovernancePage,
});

function GovernancePage() {
  const [record, setRecord] = useState<GovernanceRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthlyReport, setMonthlyReport] = useState<MonthlyGovernanceReportData | null>(null);
  const [reportError, setReportError] = useState<{ month: string; message: string } | null>(null);
  const reportLoading = monthlyReport?.month !== reportMonth && reportError?.month !== reportMonth;

  useEffect(() => {
    let cancelled = false;
    getMonthlyGovernanceReport({ data: { month: reportMonth } })
      .then((next) => {
        if (cancelled) return;
        setMonthlyReport(next);
        setReportError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setReportError({
          month: reportMonth,
          message: "The monthly report could not be read from this session.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [reportMonth]);

  useEffect(() => {
    let cancelled = false;
    getGovernanceRecord({ data: { limit: 100 } })
      .then((next) => {
        if (cancelled) return;
        setRecord(next);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("The governance record could not be read from this session.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setRecord(await getGovernanceRecord({ data: { limit: 100 } }));
      setError(null);
    } catch {
      setError("The governance record could not be read from this session.");
    } finally {
      setLoading(false);
    }
  }

  const overdue = record?.gates.filter((gate) => gate.decidedAt === null).length ?? 0;

  return (
    <div className="enter-up mx-auto max-w-5xl">
      <PageHeader
        kicker="Governance record"
        title="The test, the answer and the signature."
        description="Every ruling that carried consequence: the precedent episodes, the POPIA section 71 gate records, and the execution receipts signed against the audit chain."
      />

      <section aria-labelledby="monthly-report-title" className="mb-8 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Monthly governance report
            </p>
            <h2 id="monthly-report-title" className="mt-1 text-xl font-semibold">
              A bounded view of the record
            </h2>
          </div>
          <label className="grid gap-1 text-xs text-muted">
            Report month
            <input
              aria-label="Report month"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg"
              type="month"
              value={reportMonth}
              onChange={(event) => setReportMonth(event.target.value)}
            />
          </label>
        </div>

        {reportLoading ? (
          <Card className="p-4" role="status">
            <p className="text-sm text-muted">Reading the {reportMonth} report…</p>
          </Card>
        ) : null}
        {reportError?.month === reportMonth ? (
          <p role="alert" className="rounded-xl bg-warn/15 px-4 py-3 text-sm text-warn">
            {reportError.message}
          </p>
        ) : null}

        {monthlyReport?.month === reportMonth ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure
                label="Precedent rulings"
                value={String(monthlyReport.records.decisionEpisodes)}
              />
              <Figure
                label="Gate records created"
                value={String(monthlyReport.records.gatesCreated)}
              />
              <Figure
                label="Receipts signed"
                value={String(monthlyReport.records.receiptsSigned)}
              />
              <Figure
                label="Invalid receipt signatures"
                value={String(monthlyReport.records.receiptsWithInvalidSignatures)}
                tone={monthlyReport.records.receiptsWithInvalidSignatures > 0 ? "warn" : undefined}
                note="Checked against the active receipt key"
              />
            </div>

            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Delegation use</h3>
                  <p className="mt-1 text-xs text-muted">
                    {monthlyReport.delegation.policy
                      ? `Compared with current policy: ${monthlyReport.delegation.policy.label} (${monthlyReport.delegation.policy.status}).`
                      : "No current delegation policy is configured."}
                  </p>
                </div>
                {monthlyReport.delegation.exceedsCurrentCeiling ? (
                  <Badge
                    variant={
                      Object.values(monthlyReport.delegation.exceedsCurrentCeiling).some(Boolean)
                        ? "warn"
                        : "ok"
                    }
                  >
                    {Object.values(monthlyReport.delegation.exceedsCurrentCeiling).some(Boolean)
                      ? "above a current ceiling"
                      : "within current ceilings"}
                  </Badge>
                ) : null}
              </div>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Detail
                  label="Recorded actions"
                  value={String(monthlyReport.delegation.usage.actions)}
                />
                <Detail
                  label="Recorded spend"
                  value={formatZar(monthlyReport.delegation.usage.spendCents)}
                />
                <Detail
                  label="Largest action"
                  value={formatZar(monthlyReport.delegation.usage.largestActionCents)}
                />
                <Detail
                  label="Most in one recorded day"
                  value={String(monthlyReport.delegation.usage.maxActionsInRecordedDay)}
                />
              </dl>
              {monthlyReport.delegation.policy ? (
                <p className="mt-4 text-xs text-muted">
                  Current ceilings: {formatZar(monthlyReport.delegation.policy.maxAmountCents)} per
                  action · {monthlyReport.delegation.policy.maxActionsPerDay} actions/day ·{" "}
                  {monthlyReport.delegation.policy.maxActionsPerMonth} actions/month. Historical use
                  is compared with these current ceilings; this does not establish which policy
                  applied when an action occurred.
                </p>
              ) : null}
              {monthlyReport.delegation.usage.daily.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <caption className="mb-2 text-left text-[11px] uppercase tracking-[0.14em] text-muted">
                      Recorded daily use
                    </caption>
                    <thead className="text-muted">
                      <tr>
                        <th className="pb-2 pr-4 font-medium">UTC day</th>
                        <th className="pb-2 pr-4 font-medium">Actions</th>
                        <th className="pb-2 font-medium">Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyReport.delegation.usage.daily.map((day) => (
                        <tr key={day.usageDay} className="border-t border-border">
                          <td className="py-2 pr-4 font-mono">{day.usageDay}</td>
                          <td className="py-2 pr-4 tabular-nums">{day.actions}</td>
                          <td className="py-2 tabular-nums">{formatZar(day.spendCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Audit and decision chain</h3>
                  <p className="mt-1 text-xs text-muted">
                    {monthlyReport.chain.detail} · {monthlyReport.chain.checked} records checked
                  </p>
                </div>
                <Badge variant={monthlyReport.chain.ok ? "ok" : "danger"}>
                  {monthlyReport.chain.ok
                    ? "chain matches stored head"
                    : "chain verification failed"}
                </Badge>
              </div>
              <p className="mt-3 truncate font-mono text-[10px] text-subtle">
                Stored head: {monthlyReport.chain.storedHead}
                {monthlyReport.chain.brokenAt
                  ? ` · problem at ${monthlyReport.chain.brokenAt}`
                  : ""}
              </p>
            </Card>

            <div className="space-y-2 border-l-2 border-border pl-4 text-xs leading-relaxed text-muted">
              <p>
                The report period is {monthlyReport.periodStart} inclusive through{" "}
                {monthlyReport.periodEnd} exclusive (UTC). Counts include decision episodes by{" "}
                <code>decided_at</code>, gate records by <code>created_at</code>, and receipts by{" "}
                <code>signed_at</code>. Delegation use follows its recorded calendar-month field.
                Generated {formatDateTime(monthlyReport.generatedAt)}.
              </p>
              <p>
                Monthly counts are direct database aggregates; the record lists below are bounded
                snapshots (up to 100 rulings, gate records, or receipts each) and may not show every
                row counted here. Chain verification checks the audit/decision rows returned with
                the stored head in one database statement, but is not external anchoring, legal
                certification, or proof of completeness beyond those stored records.
              </p>
            </div>
          </>
        ) : null}
      </section>

      {error ? (
        <p
          role="status"
          className="mb-6 rounded-xl bg-warn/15 px-4 py-3 text-sm text-warn shadow-[var(--shadow-border)]"
        >
          {error}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-3"
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? "Reading…" : "Try again"}
          </Button>
        </p>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Figure label="Precedent rulings" value={String(record?.episodes.length ?? 0)} />
        <Figure
          label="Gate records"
          value={String(record?.gates.length ?? 0)}
          note={overdue > 0 ? `${overdue} still undecided` : "all decided"}
          tone={overdue > 0 ? "warn" : undefined}
        />
        <Figure label="Signed receipts" value={String(record?.receipts.length ?? 0)} />
      </div>

      {record?.receiptKey === "placeholder" ? (
        <p className="mb-6 border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
          Receipts are signed with the local placeholder key. They verify structurally, but they are
          not evidence against a third party until the office runs with a deployment secret.
        </p>
      ) : null}

      {loading && !record ? (
        <Card className="p-4">
          <p className="text-sm text-muted">Reading the record…</p>
        </Card>
      ) : (
        <Tabs defaultValue="episodes">
          <TabsList>
            <TabsTrigger value="episodes">Rulings</TabsTrigger>
            <TabsTrigger value="gates">Section 71 gates</TabsTrigger>
            <TabsTrigger value="receipts">Signed receipts</TabsTrigger>
          </TabsList>

          <TabsContent value="episodes">
            {!record || record.episodes.length === 0 ? (
              <EmptyState
                title="No precedent yet"
                body="A ruling is written here after the founder approves or rejects an action that carries consequence."
              />
            ) : (
              <ol className="space-y-3">
                {record.episodes.map((episode) => (
                  <li
                    key={episode.id}
                    className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {episode.actionKind.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {episode.companyName ?? "No company"} ·{" "}
                          {formatDateTime(episode.decidedAt)}
                        </p>
                      </div>
                      <Badge variant={episode.outcome === "approved" ? "ok" : "danger"}>
                        {episode.outcome}
                      </Badge>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <Detail label="Amount band" value={episode.amountBand ?? "—"} />
                      <Detail label="Stage" value={episode.stage ?? "—"} />
                      <Detail label="Reason code" value={episode.reasonCode} />
                    </dl>
                    <p className="mt-3 border-l-2 border-border pl-3 text-sm text-muted">
                      {episode.reasoning}
                    </p>
                    {episode.exceptionConditions ? (
                      <p className="mt-2 text-sm">
                        <span className="text-muted">Would change the answer: </span>
                        {episode.exceptionConditions}
                      </p>
                    ) : null}
                    {episode.laterOutcome ? (
                      <p className="mt-2 text-sm">
                        <span className="text-muted">Later outcome: </span>
                        {episode.laterOutcome}
                      </p>
                    ) : null}
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
                      {episode.agentId ?? "unknown agent"} · {episode.policyVersion ?? "no policy"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="gates">
            {!record || record.gates.length === 0 ? (
              <EmptyState
                title="No gate records"
                body="A section 71 gate is opened before a decision that reaches a person."
              />
            ) : (
              <ol className="space-y-3">
                {record.gates.map((gate) => (
                  <GateCard key={gate.id} gate={gate} />
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="receipts">
            {!record || record.receipts.length === 0 ? (
              <EmptyState
                title="No receipts"
                body="A signed receipt is written for an execution that carries real consequence."
              />
            ) : (
              <ol className="space-y-3">
                {record.receipts.map((receipt) => (
                  <li
                    key={receipt.id}
                    className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {receipt.actionKind.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {formatDateTime(receipt.signedAt)} ·{" "}
                          {receipt.approvedBy ?? "unattributed"}
                        </p>
                      </div>
                      <Badge variant={receipt.signatureValid ? "ok" : "danger"}>
                        {receipt.signatureValid ? "signature valid" : "signature fails"}
                      </Badge>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <Detail label="Amount" value={formatZar(receipt.amountCents)} />
                      <Detail label="Risk tier" value={receipt.riskTier} />
                      <Detail label="Decision" value={receipt.decisionId.slice(0, 16)} />
                    </dl>
                    <p className="mt-3 truncate font-mono text-[10px] text-subtle">
                      chain {receipt.chainHead.slice(0, 24)}…
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function GateCard({ gate }: { gate: GateRecordRow }) {
  return (
    <li className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Approval {gate.approvalId.slice(0, 16)}</p>
          <p className="mt-1 text-xs text-muted">
            Exposed {formatDateTime(gate.exposureAt)}
            {gate.decidedAt ? ` · decided ${formatDateTime(gate.decidedAt)}` : ""}
          </p>
        </div>
        <Badge variant={gate.decidedAt ? "ok" : "warn"}>
          {gate.decidedAt ? "decided" : "undecided"}
        </Badge>
      </div>
      <p className="mt-2 text-sm">
        {gate.legal ? "This case reaches POPIA section 71." : "This case did not reach section 71."}
      </p>
      <ol className="mt-3 space-y-2">
        {gate.questions.map((answer) => (
          <li key={answer.question} className="flex gap-3 text-sm">
            <span
              className={`mt-0.5 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] ${
                answer.passed ? "text-ok" : "text-danger"
              }`}
            >
              {answer.passed ? "Passed" : "Failed"}
            </span>
            <div>
              <p className="font-mono text-[11px] text-subtle">{answer.question}</p>
              <p className="text-muted">{answer.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {gate.reasoning ? (
        <p className="mt-3 border-l-2 border-border pl-3 text-sm text-muted">{gate.reasoning}</p>
      ) : null}
      {gate.evidenceShown ? (
        <p className="mt-2 text-sm">
          <span className="text-muted">Evidence shown: </span>
          {gate.evidenceShown}
        </p>
      ) : null}
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
        policy {gate.policyVersion}
      </p>
    </li>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "warn";
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={`mt-2 font-mono text-2xl ${tone === "warn" ? "text-warn" : "text-fg"}`}>
        {value}
      </p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-1 truncate">{value}</dd>
    </div>
  );
}
