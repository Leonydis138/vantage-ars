import { useEffect, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { founderMiddleware } from "@/lib/office/founder-gate";
import { redriveWork } from "@/lib/office/api";
import { formatRelative } from "@/lib/office/format";
import { cn } from "@/lib/utils";

/**
 * The autonomy panel: what the office is doing by itself, right now.
 *
 * This is the founder's proof that "it runs itself" is true rather than claimed.
 * It shows three things honestly:
 *   - the scheduler's own state (when it last ran, whether it is failing),
 *   - every duty, its owning agent, and when it is next due,
 *   - the live queue and the last runs, so a stuck duty is visible.
 *
 * It never shows a green light the office has not earned: if the scheduler is
 * off, overdue, or in circuit-break, it says so in words.
 */

const readAutonomy = createServerFn({ method: "GET" })
  .middleware([founderMiddleware])
  .handler(async () => {
    const { schedulerStatus } = await import("@/lib/office/scheduler.server");
    const { selfSchedulerStatus } = await import("@/lib/office/self-scheduler.server");
    const { listWork, workCounts } = await import("@/lib/office/work-queue.server");
    const { readDutyView } = await import("@/lib/office/office-view.server");
    const { readDelegation, readDelegationUsage } = await import("@/lib/office/store.server");
    const { smtpStatus } = await import("@/lib/office/smtp.server");
    const { aiConfiguredFromEnv, buildAutonomyReadiness } =
      await import("@/lib/office/autonomy-readiness");
    const [status, items, counts, view, policy, usage] = await Promise.all([
      schedulerStatus(),
      listWork(40),
      workCounts(),
      readDutyView(),
      readDelegation(),
      readDelegationUsage(),
    ]);
    const selfScheduler = selfSchedulerStatus();
    const mail = smtpStatus();
    const described = items.map((item) => ({
      id: item.id,
      agentId: item.agentId,
      kind: item.kind,
      title: item.kind.replace(/_/g, " "),
      reason: item.reason,
      status: item.status,
      attempts: item.attempts,
      maxAttempts: item.maxAttempts,
      dueAt: item.dueAt,
      lastError: item.lastError,
    }));
    const dead = described.filter(
      (item) => item.status === "abandoned" || item.status === "failed",
    );
    const overdueMinutes = status.lastTickAt
      ? Math.max(0, Math.round((Date.now() - Date.parse(status.lastTickAt)) / 60_000))
      : null;
    const readiness = buildAutonomyReadiness({
      now: new Date().toISOString(),
      autonomyOn: process.env.AUTONOMY?.trim().toLowerCase() === "on",
      halted: view.halted,
      chainIntact: view.chainIntact,
      lastTickAt: status.lastTickAt,
      consecutiveFailures: status.consecutiveFailures,
      selfSchedulerEnabled: selfScheduler.enabled,
      selfSchedulerRunning: selfScheduler.running,
      delegation: policy
        ? {
            status: policy.status,
            allowCustomerMail: policy.allowCustomerMail,
            capExhausted:
              policy.status === "active" &&
              policy.maxActionsPerDay > 0 &&
              usage.usedToday >= policy.maxActionsPerDay,
          }
        : null,
      mailConnected: mail.smtpConnected,
      aiConfigured: aiConfiguredFromEnv(),
      backupConfigured: Boolean(process.env.BACKUP_DIR?.trim()),
      openWork: counts.open + counts.claimed,
      abandonedWork: counts.abandoned,
      pendingApprovals: view.approvalsPending.length,
    });
    return {
      lastTickAt: status.lastTickAt,
      overdueMinutes,
      consecutiveFailures: status.consecutiveFailures,
      posture: status.posture,
      budget: status.budget,
      autonomyOn: process.env.AUTONOMY?.trim().toLowerCase() === "on",
      dueDuties: status.dueDuties,
      selfScheduler,
      readiness,
      recentRuns: status.recentRuns.slice(0, 8).map((run) => ({
        id: run.id,
        agentId: run.agentId,
        duty: run.duty,
        status: run.status,
        briefing: run.briefing,
        startedAt: run.startedAt,
        durationMs: run.durationMs,
      })),
      // The dead-letter queue is listed on its own, because it is the one list
      // the founder is meant to act on.
      deadLetters: dead.slice(0, 8),
      items: described
        .filter((item) => item.status !== "abandoned" && item.status !== "failed")
        .slice(0, 12),
      counts,
    };
  });

const triggerRun = createServerFn({ method: "POST" })
  .middleware([founderMiddleware])
  .handler(async () => {
    const { runNow } = await import("@/lib/office/scheduler.server");
    return runNow();
  });

type Autonomy = Awaited<ReturnType<typeof readAutonomy>>;

const POSTURE_LABEL: Record<Autonomy["posture"], string> = {
  idle: "Idle",
  steady: "Steady",
  surge: "Surge",
  recovery: "Recovery",
};

export function AutonomyPanel({ refreshToken }: { refreshToken?: number }) {
  const [data, setData] = useState<Autonomy | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [redriving, setRedriving] = useState("");

  useEffect(() => {
    let cancelled = false;
    readAutonomy()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError("");
        }
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Could not read the scheduler.");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  async function runNow() {
    if (running) return;
    setRunning(true);
    setError("");
    try {
      await triggerRun();
      setData(await readAutonomy());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The run failed.");
    } finally {
      setRunning(false);
    }
  }

  /**
   * Put a dead item back on the queue.
   *
   * Redriving is a founder action and never an automatic one. The server
   * function is behind the founder gate and writes the redrive to the audit
   * chain, so what the office did here is on the record like everything else.
   */
  async function redrive(workId: string) {
    if (redriving) return;
    setRedriving(workId);
    try {
      const result = await redriveWork({ data: { workId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Back on the queue. The redrive is on the audit chain.");
      setData(await readAutonomy());
    } catch {
      toast.error("The item could not be redriven.");
    } finally {
      setRedriving("");
    }
  }

  if (error && !data) {
    return (
      <Card>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Autonomy</p>
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Autonomy</p>
        <p className="mt-2 text-sm text-muted">Reading the scheduler…</p>
      </Card>
    );
  }

  const dueNow = data.dueDuties.filter((duty) => duty.dueInMinutes <= 0);
  const overdueMinutes = data.overdueMinutes;
  const stale = data.autonomyOn && (overdueMinutes === null || overdueMinutes > 180);
  const broken = data.consecutiveFailures >= 3;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Autonomy</p>
          <h2 className="mt-1 font-serif text-2xl text-fg">
            {data.autonomyOn ? "Running by itself" : "Manual only"}
          </h2>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={running} onClick={runNow}>
          {running ? "Running…" : "Run now"}
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        <Stat
          label="Last run"
          value={data.lastTickAt ? formatRelative(data.lastTickAt) : "never"}
          warn={stale}
        />
        <Stat
          label="Pace"
          value={POSTURE_LABEL[data.posture]}
          hint={data.budget > 0 ? `${data.budget} items` : undefined}
          warn={data.posture === "recovery"}
        />
        <Stat label="Queued" value={String(data.counts.open)} />
        <Stat
          label="Duties due"
          value={String(dueNow.length)}
          hint={`of ${data.dueDuties.length}`}
        />
        <Stat label="Failed runs" value={String(data.consecutiveFailures)} warn={broken} />
      </dl>

      <div className="mt-5 rounded-lg border border-border bg-raised/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
              Autonomy readiness
            </p>
            <h3 className="mt-1 text-base font-semibold text-fg">{data.readiness.headline}</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              {data.readiness.summary}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "font-mono text-2xl tabular-nums",
                data.readiness.score >= 85
                  ? "text-ok"
                  : data.readiness.score >= 55
                    ? "text-warn"
                    : "text-danger",
              )}
            >
              {data.readiness.score}
              <span className="text-sm text-subtle">/100</span>
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
              {data.readiness.level}
            </p>
          </div>
        </div>

        {data.readiness.gaps.length ? (
          <ul className="mt-4 space-y-2">
            {data.readiness.gaps.map((gap) => (
              <li
                key={gap.code}
                className={cn(
                  "rounded-md border px-3 py-2",
                  gap.severity === "critical"
                    ? "border-danger/30 bg-danger/5"
                    : "border-warn/30 bg-warn/5",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={gap.severity === "critical" ? "danger" : "warn"}>
                    {gap.severity}
                  </Badge>
                  <p className="text-xs font-medium text-fg">{gap.title}</p>
                </div>
                <p className="mt-1 text-[11px] text-muted">{gap.detail}</p>
                <p className="mt-1 text-[11px] text-accent">Next: {gap.action}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-xs text-ok">
            No gaps found. The office can act, deliver and bill inside its delegation without you.
          </p>
        )}

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              In-process heartbeat
            </dt>
            <dd className="mt-1 text-xs text-fg">
              {data.selfScheduler.enabled
                ? data.selfScheduler.running
                  ? `On · every ${Math.round(data.selfScheduler.intervalMs / 60_000)}m`
                  : "Enabled, timer not started yet"
                : "Off"}
              <span className="mt-1 block text-[11px] text-muted">{data.selfScheduler.reason}</span>
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Self-ticks
            </dt>
            <dd className="mt-1 font-mono text-xs tabular-nums text-fg">
              {data.selfScheduler.ticks}
              <span className="mt-1 block font-sans text-[11px] text-muted">
                {data.selfScheduler.lastRunAt
                  ? `Last ${formatRelative(data.selfScheduler.lastRunAt)}`
                  : "None from this process yet"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              External heartbeat
            </dt>
            <dd className="mt-1 text-xs text-fg">
              {data.lastTickAt ? formatRelative(data.lastTickAt) : "never"}
              <span className="mt-1 block text-[11px] text-muted">
                Cron, sidecar or public nudge, whichever is configured.
              </span>
            </dd>
          </div>
        </dl>

        {data.readiness.nextActions.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              What would close every gap
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px] text-muted">
              {data.readiness.nextActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>

      {!data.autonomyOn ? (
        <p className="mt-4 border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          Unattended runs are off. Set <code className="font-mono">AUTONOMY=on</code> in the host
          environment for the office to act without you pressing anything.
        </p>
      ) : stale ? (
        <p
          role="alert"
          className="mt-4 border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
        >
          The scheduler has not run in{" "}
          {overdueMinutes === null ? "this deployment" : `${overdueMinutes} minutes`}. Nothing will
          be planned or executed until it does.
        </p>
      ) : null}

      {data.posture === "recovery" ? (
        <p className="mt-4 border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          Recovery pace: the office is limiting itself after repeated failures. It probes its
          database, chain and halt state again after a cooldown, and resumes only if they are clean.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Duties</h3>
          <ul className="mt-2 divide-y divide-border">
            {data.dueDuties.map((duty) => (
              <li key={duty.duty} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{duty.title}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
                    {duty.owner}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] tabular-nums",
                    duty.dueInMinutes <= 0 ? "text-accent" : "text-subtle",
                  )}
                >
                  {duty.dueInMinutes <= 0 ? "due" : `${formatDuration(duty.dueInMinutes)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            What it did last
          </h3>
          {data.recentRuns.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No autonomous run yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.recentRuns.map((run) => (
                <li key={run.id} className="rounded-md bg-raised px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-fg">{run.duty.replace(/_/g, " ")}</p>
                    <Badge variant={run.status === "ok" ? "ok" : "danger"}>{run.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted">{run.briefing}</p>
                  <p className="mt-1 font-mono text-[10px] text-subtle">
                    {run.agentId} · {formatRelative(run.startedAt)} · {run.durationMs}ms
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {data.deadLetters.length ? (
        <section className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-danger">
              Dead-letter queue
            </h3>
            <p className="text-[11px] text-muted">
              These exhausted their retries. Nothing retries them again on its own.
            </p>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {data.deadLetters.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-fg">{item.reason}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
                    {item.agentId} · {item.kind} · {item.status} {item.attempts}/{item.maxAttempts}
                  </p>
                  {item.lastError ? (
                    <p className="mt-1 text-[11px] text-danger">Last error: {item.lastError}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={Boolean(redriving)}
                  onClick={() => void redrive(item.id)}
                >
                  {redriving === item.id ? "Redriving…" : "Redrive"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.items.length ? (
        <section className="mt-5">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Work in the queue
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {data.items.map((item) => (
              <li key={item.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-fg">{item.reason}</p>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[10px] uppercase",
                      item.status === "abandoned" ? "text-danger" : "text-subtle",
                    )}
                  >
                    {item.status}
                    {item.attempts > 1 ? ` ${item.attempts}/${item.maxAttempts}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className={cn("mt-1 font-mono text-sm tabular-nums", warn ? "text-danger" : "text-fg")}>
        {value}
        {hint ? <span className="ml-1 text-subtle">{hint}</span> : null}
      </dd>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `in ${minutes}m`;
  if (minutes < 1440) return `in ${Math.round(minutes / 60)}h`;
  return `in ${Math.round(minutes / 1440)}d`;
}
