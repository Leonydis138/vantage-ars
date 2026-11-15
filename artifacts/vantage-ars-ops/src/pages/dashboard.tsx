import {
  getGetVantageArsAutomationQueryKey,
  getGetVantageArsDashboardQueryKey,
  getGetVantageArsMetricsQueryKey,
  getListVantageArsAuditEventsQueryKey,
  getListVantageArsAutomationRunsQueryKey,
  getListVantageArsInquiriesQueryKey,
  useGetVantageArsAutomation,
  useGetVantageArsDashboard,
  useGetVantageArsMetrics,
  useListVantageArsAuditEvents,
  useListVantageArsAutomationRuns,
  useListVantageArsInquiries,
  useSetVantageArsAutomation,
  useSetVantageArsAutomationBankDetails,
  useSetVantageArsAutomationPolicy,
  useTestVantageArsAutomationWebhook,
  useRunVantageArsAutonomousCycle,
  useSyncVantageArsInquiries,
  type RunVantageArsAutonomousCycle200,
  type VantageInquiry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowRight, CheckCircle2, CircleAlert, Clock3, MessageSquare, RefreshCw, Sparkles, ToggleLeft } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { getErrorMessage, formatDate, formatMoney } from "@/lib/vantage-format";
import type { VantageBankDetails } from "@workspace/api-client-react";
import type { ReactNode } from "react";

export function DashboardPage() {
  const cache = useQueryClient();
  const dashboard = useGetVantageArsDashboard({
    query: {
      queryKey: getGetVantageArsDashboardQueryKey(),
      refetchInterval: 120_000,
      refetchOnMount: "always",
    },
  });
  const metrics = useGetVantageArsMetrics({
    query: {
      queryKey: getGetVantageArsMetricsQueryKey(),
      refetchInterval: 120_000,
      refetchOnMount: "always",
    },
  });
  const recentActivity = useListVantageArsAuditEvents(
    { limit: 6 },
    {
      query: {
        queryKey: getListVantageArsAuditEventsQueryKey({ limit: 6 }),
        refetchInterval: 120_000,
        refetchOnMount: "always",
      },
    },
  );
  const runHistory = useListVantageArsAutomationRuns(
    { limit: 6 },
    {
      query: {
        queryKey: getListVantageArsAutomationRunsQueryKey({ limit: 6 }),
        refetchInterval: 120_000,
        refetchOnMount: "always",
      },
    },
  );
  const inquiries = useListVantageArsInquiries(
    { status: "all" },
    {
      query: {
        queryKey: getListVantageArsInquiriesQueryKey({ status: "all" }),
        refetchInterval: 60_000,
        refetchOnMount: "always",
      },
    },
  );
  const automation = useGetVantageArsAutomation({
    query: {
      queryKey: getGetVantageArsAutomationQueryKey(),
      refetchInterval: 120_000,
      refetchOnMount: "always",
    },
  });
  const sync = useSyncVantageArsInquiries({
    mutation: {
      onSuccess: async (result) => {
        toast.success(result.message);
        await Promise.all([
          cache.invalidateQueries({ queryKey: getGetVantageArsDashboardQueryKey() }),
          cache.invalidateQueries({ queryKey: getGetVantageArsMetricsQueryKey() }),
          cache.invalidateQueries({ queryKey: getListVantageArsAuditEventsQueryKey() }),
          cache.invalidateQueries({ queryKey: getListVantageArsInquiriesQueryKey() }),
          cache.invalidateQueries({ queryKey: getGetVantageArsAutomationQueryKey() }),
        ]);
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });
  const automationChange = useSetVantageArsAutomation({
    mutation: {
      onSuccess: async (value) => {
        toast.success(value.enabled ? "Autonomous worker enabled." : "Autonomous worker paused.");
        await cache.invalidateQueries({ queryKey: getGetVantageArsAutomationQueryKey() });
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });

  const [bankDetails, setBankDetails] = useState<VantageBankDetails>({
    accountName: "",
    bankName: "",
    accountNumber: "",
    branchCode: "",
    accountType: "",
  });
  const [autonomousSending, setAutonomousSending] = useState(true);
  const sendingInitialized = useRef(false);
  const bankDetailsMutation = useSetVantageArsAutomationBankDetails({
    mutation: {
      onSuccess: async (value) => {
        toast.success("Autonomous sending configuration saved.");
        setAutonomousSending(value.autonomousSendingEnabled);
        setBankDetails({ accountName: "", bankName: "", accountNumber: "", branchCode: "", accountType: "" });
        await cache.invalidateQueries({ queryKey: getGetVantageArsAutomationQueryKey() });
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });
  const [lastCycle, setLastCycle] = useState<RunVantageArsAutonomousCycle200 | null>(null);
  const [lastCycleAt, setLastCycleAt] = useState<Date | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const lastCycleInitialized = useRef(false);
  const [policy, setPolicy] = useState({
    schedulingUrl: "",
    notificationWebhookUrl: "",
    notificationWebhookSecret: "",
    notificationWebhookSecretConfigured: false,
    clearWebhookSecret: false,
    slaHours: 24,
    followUpDays: 7,
    archiveDays: 30,
  });
  const policyInitialized = useRef(false);
  useEffect(() => {
    if (!lastCycleInitialized.current && automation.data) {
      if (automation.data.lastCycleSteps?.length) {
        setLastCycle({ message: "", steps: automation.data.lastCycleSteps });
        setLastCycleAt(automation.data.lastRunAt ? new Date(automation.data.lastRunAt) : null);
      }
      lastCycleInitialized.current = true;
    }
  }, [automation.data]);
  useEffect(() => {
    if (!sendingInitialized.current && automation.data) {
      setAutonomousSending(automation.data.autonomousSendingEnabled);
      sendingInitialized.current = true;
    }
  }, [automation.data]);
  useEffect(() => {
    if (!policyInitialized.current && automation.data) {
      setPolicy({
        schedulingUrl: automation.data.schedulingUrl ?? "",
        notificationWebhookUrl: automation.data.notificationWebhookUrl ?? "",
        notificationWebhookSecret: "",
        notificationWebhookSecretConfigured:
          automation.data.notificationWebhookSecretConfigured,
        clearWebhookSecret: false,
        slaHours: automation.data.slaHours ?? 24,
        followUpDays: automation.data.followUpDays ?? 7,
        archiveDays: automation.data.archiveDays ?? 30,
      });
      policyInitialized.current = true;
    }
  }, [automation.data]);
  const policyMutation = useSetVantageArsAutomationPolicy({
    mutation: {
      onSuccess: async (value) => {
        toast.success("Autonomy policy saved.");
        setPolicy({
          schedulingUrl: value.schedulingUrl ?? "",
          notificationWebhookUrl: value.notificationWebhookUrl ?? "",
          notificationWebhookSecret: "",
          notificationWebhookSecretConfigured:
            value.notificationWebhookSecretConfigured,
          clearWebhookSecret: false,
          slaHours: value.slaHours,
          followUpDays: value.followUpDays,
          archiveDays: value.archiveDays,
        });
        await cache.invalidateQueries({ queryKey: getGetVantageArsAutomationQueryKey() });
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });
  const webhookTest = useTestVantageArsAutomationWebhook({
    mutation: {
      onSuccess: (result) => toast.success(result.message),
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });
  const autonomousRun = useRunVantageArsAutonomousCycle({
    mutation: {
      onSuccess: async (result) => {
        toast.success(result.message);
        setLastCycle(result);
        setLastCycleAt(new Date());
        await Promise.all([
          cache.invalidateQueries({ queryKey: getGetVantageArsDashboardQueryKey() }),
          cache.invalidateQueries({ queryKey: getGetVantageArsMetricsQueryKey() }),
          cache.invalidateQueries({ queryKey: getListVantageArsAuditEventsQueryKey() }),
          cache.invalidateQueries({ queryKey: getListVantageArsAutomationRunsQueryKey() }),
          cache.invalidateQueries({ queryKey: getListVantageArsInquiriesQueryKey() }),
          cache.invalidateQueries({ queryKey: getGetVantageArsAutomationQueryKey() }),
        ]);
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });

  const rows = inquiries.data ?? [];
  const counts = dashboard.data?.counts;
  const attentionCount =
    dashboard.data?.services.filter((service) => service.status === "attention").length ?? 0;
  const setupCount =
    dashboard.data?.services.filter((service) => service.status === "setup_required").length ?? 0;

  if (dashboard.isLoading && !dashboard.data) {
    return <div className="loading-block"><div className="loader-mark" />Connecting to live business services…</div>;
  }
  if (dashboard.isError && !dashboard.data) {
    return (
      <div className="page-error">
        <CircleAlert size={22} />
        <div><h2>Operations are locked</h2><p>{getErrorMessage(dashboard.error)}</p><span>Sign in with the same email address as the connected business Gmail account.</span></div>
        <button className="button button-outline" onClick={() => void dashboard.refetch()}><RefreshCw size={15} /> Retry</button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <div className="eyebrow">BUSINESS CONTROL PLANE</div>
          <h1>Operations overview</h1>
          <p>Live service health, real customer enquiries, and a self-running operations worker with owner override.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="button button-primary"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            {sync.isPending ? <span className="button-spinner" /> : <RefreshCw size={16} />}
            {sync.isPending ? "Reviewing inbox…" : "Sync business inbox"}
          </button>
          <button
            className="button button-outline"
            onClick={() => autonomousRun.mutate()}
            disabled={autonomousRun.isPending}
          >
            {autonomousRun.isPending ? <span className="button-spinner" /> : <RefreshCw size={16} />}
            {autonomousRun.isPending ? "Running…" : "Run autonomous cycle"}
          </button>
        </div>
      </section>

      {(attentionCount > 0 || setupCount > 0) && (
        <div className="attention-banner">
          <CircleAlert size={18} />
          <div><b>{attentionCount > 0 ? `${attentionCount} connected service${attentionCount === 1 ? "" : "s"} need attention` : `${setupCount} channel${setupCount === 1 ? "" : "s"} still need setup`}</b><span>{attentionCount > 0 && setupCount > 0 ? `${setupCount} other channels are not connected yet. ` : ""}Automation stays limited to live connected services. Phone calls and social publishing are not simulated.</span></div>
        </div>
      )}

      <section className="metric-grid" aria-label="Live operations counts">
        <MetricCard label="QUOTE READY" value={counts?.quotesReady ?? 0} note="Prepared for autonomous sending" icon={<CheckCircle2 />} emphasis />
        <MetricCard label="NEEDS REVIEW" value={counts?.needsReview ?? 0} note="Requires owner judgement" icon={<CircleAlert />} />
        <MetricCard label="NEEDS INFORMATION" value={counts?.needsInformation ?? 0} note="Clarification request handled" icon={<Clock3 />} />
        <MetricCard label="CUSTOMER REPLIES" value={counts?.replyReceived ?? 0} note="Quote replies awaiting review" icon={<MessageSquare />} />
        <MetricCard label="CRM SYNC" value={counts?.crmSyncNeeded ?? 0} note="HubSpot contacts awaiting sync" icon={<ArrowDownToLine />} />
      </section>

      <section className="metric-grid" aria-label="Autonomous operations metrics">
        <MetricCard label="AUTONOMOUS ACTIONS" value={metrics.data?.autonomousActions ?? 0} note="Recorded worker actions" icon={<Sparkles />} emphasis />
        <MetricCard label="AUTONOMOUSLY RESOLVED" value={metrics.data?.resolvedInquiries ?? 0} note="Known issues resolved without owner input" icon={<CheckCircle2 />} />
        <MetricCard label="ESCALATED" value={metrics.data?.escalatedInquiries ?? 0} note="Sent for remote support" icon={<CircleAlert />} />
        <MetricCard label="LEARNED PATTERNS" value={metrics.data?.solutionPatterns ?? 0} note="Reusable fixes captured by the worker" icon={<ArrowDownToLine />} />
        <MetricCard label="ACCEPTED VALUE" value={formatMoney(metrics.data?.acceptedValue ?? 0)} note={`${metrics.data?.acceptedInquiries ?? 0} accepted quotes`} icon={<CheckCircle2 />} emphasis />
        <MetricCard label="QUOTED PIPELINE" value={formatMoney(metrics.data?.quotedValue ?? 0)} note="Sent and accepted quote value" icon={<ArrowDownToLine />} />
      </section>

      {lastCycle && (
        <section className="panel inbox-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">LAST AUTONOMOUS CYCLE</span><h2>Run report</h2></div>
            {lastCycleAt && <span className="live-label">COMPLETED {formatDate(lastCycleAt.toISOString(), true)}</span>}
          </div>
          <div className="inquiry-list">
            {lastCycle.steps.map((step) => (
              <div className="inquiry-row" key={step.key}>
                <span className="urgency-mark urgency-normal" />
                <div className="inquiry-main">
                  <b>{step.label}</b>
                  <span>{step.message}</span>
                </div>
                <CheckCircle2 size={16} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel inbox-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">CYCLE HISTORY</span><h2>Recent autonomous runs</h2></div>
          <span className="live-label">LAST {runHistory.data?.length ?? 0} RUNS</span>
        </div>
        {runHistory.data?.length ? (
          <div className="inquiry-list">
            {runHistory.data.map((run) => {
              const isOpen = expandedRun === run.id;
              return (
                <div className="audit-row" key={run.id}>
                  <button className="inquiry-row audit-row-main" onClick={() => setExpandedRun(isOpen ? null : run.id)} aria-expanded={isOpen}>
                    <span className={`urgency-mark urgency-${run.status === "failed" ? "high" : "normal"}`} />
                    <div className="inquiry-main">
                      <b>{run.status === "failed" ? "Cycle failed" : "Cycle completed"}</b>
                      <span>{run.steps.length} steps · {run.message.slice(0, 90)}</span>
                    </div>
                    <span className={`inquiry-status status-text-${run.status === "failed" ? "needs_review" : "processing"}`}>{run.status}</span>
                    <time>{formatDate(run.completedAt, true)}</time>
                    <span className="run-duration">{Math.max(0, Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000))}s</span>
                  </button>
                  {isOpen && (
                    <div className="audit-details">
                      <div className="autonomy-timeline">
                        {run.steps.map((step) => (
                          <div className="autonomy-timeline-item" key={`${run.id}-${step.key}`}>
                            <span className="timeline-dot" />
                            <div><b>{step.label}</b><small>{step.message}</small></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state"><div className="empty-icon"><Sparkles size={22} /></div><h3>No runs recorded yet</h3><p>Run the autonomous cycle to start building a history of worker outcomes.</p></div>
        )}
      </section>

      <section className="overview-grid">
        <div className="panel service-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">CONNECTED SYSTEMS</span><h2>Service health</h2></div>
            <span className="live-label"><span className="pulse-dot" /> LIVE CHECK</span>
          </div>
          <div className="service-list">
            {dashboard.data?.services.map((service) => (
              <div className="service-row" key={service.id}>
                <span className={`service-icon service-${service.id}`}>{service.id === "grok" ? <Sparkles size={17} /> : service.id === "phone" ? <ToggleLeft size={17} /> : <span>{service.label.slice(0, 1)}</span>}</span>
                <div className="service-copy"><b>{service.label}</b><span>{service.detail}</span></div>
                <span className={`status-pill status-${service.status}`}><i />{service.status.replace("_", " ")}</span>
              </div>
            ))}
          </div>
          <div className="panel-footnote">Provider checks are live. Cloudflare remains read-only; this worker never changes DNS.</div>
        </div>

        <div className="panel automation-panel">
          <div className="automation-orbit"><Sparkles size={19} /></div>
          <span className="section-kicker">AUTONOMOUS WORKER</span>
          <h2>Operations engine</h2>
          <p>Grok scans real business email, sends ready quotes, requests missing information, resolves known issues, escalates overdue work, syncs HubSpot, follows up, and reports outcomes. These controls let you pause or override that autonomy.</p>
          <div className="automation-toggle-row">
            <div><b>{automation.data?.enabled ? "Autonomous operations are on" : automation.data?.pausedByOwner ? "Paused by owner" : "Waiting for live services"}</b><span>{automation.data?.enabled ? automation.data.providerReady ? `Full cycle every ${automation.data.intervalMinutes} minutes` : "Waiting for Gmail and Grok; the worker will resume automatically." : automation.data?.pausedByOwner ? "Resume the worker when you are ready." : "The worker starts automatically when Gmail and Grok are healthy."}</span></div>
            <button
              className={`toggle-control ${automation.data?.enabled ? "checked" : ""}`}
              role="switch"
              aria-checked={automation.data?.enabled ?? false}
              aria-label={automation.data?.enabled ? "Pause autonomous operations worker" : "Enable autonomous operations worker"}
              disabled={automationChange.isPending || !automation.data || (!automation.data.enabled && !automation.data.providerReady)}
              onClick={() => {
                const next = !automation.data?.enabled;
                automationChange.mutate({ data: { enabled: next } });
              }}
            ><span /></button>
          </div>
          <div className="bank-grid" style={{ marginTop: "1rem" }}>
            <BankField label="Account name" value={bankDetails.accountName} onChange={(value) => setBankDetails((current) => ({ ...current, accountName: value }))} />
            <BankField label="Bank name" value={bankDetails.bankName} onChange={(value) => setBankDetails((current) => ({ ...current, bankName: value }))} />
            <BankField label="Account number" value={bankDetails.accountNumber} onChange={(value) => setBankDetails((current) => ({ ...current, accountNumber: value }))} inputMode="numeric" />
            <BankField label="Branch code" value={bankDetails.branchCode} onChange={(value) => setBankDetails((current) => ({ ...current, branchCode: value }))} inputMode="numeric" />
            <BankField label="Account type" value={bankDetails.accountType} onChange={(value) => setBankDetails((current) => ({ ...current, accountType: value }))} />
          </div>
          <label className="field-label" style={{ marginTop: "0.5rem" }}>
            <input type="checkbox" checked={autonomousSending} onChange={(event) => setAutonomousSending(event.target.checked)} /> Autonomous quote sending
          </label>
          <button
            className="button button-outline button-small"
            style={{ marginTop: "0.5rem" }}
            disabled={bankDetailsMutation.isPending}
            onClick={() => bankDetailsMutation.mutate({ data: { bankDetails, autonomousSendingEnabled: autonomousSending } })}
          >
            {bankDetailsMutation.isPending ? <span className="button-spinner" /> : null}
            Save autonomous sending settings
          </button>
          <div className="last-run">Bank details configured: {automation.data?.bankDetailsConfigured ? "yes" : "no"} · encrypted at rest and never shown again after saving</div>
          <div className="panel-heading" style={{ marginTop: "1.2rem" }}>
            <div><span className="section-kicker">AUTONOMY POLICY</span><h2>Timing and escalation</h2></div>
          </div>
          <div className="bank-grid">
            <BankField label="Scheduling link" value={policy.schedulingUrl} onChange={(value) => setPolicy((current) => ({ ...current, schedulingUrl: value }))} />
            <BankField label="Notification webhook" value={policy.notificationWebhookUrl} onChange={(value) => setPolicy((current) => ({ ...current, notificationWebhookUrl: value }))} />
            <BankField label="Webhook secret" value={policy.notificationWebhookSecret} onChange={(value) => setPolicy((current) => ({ ...current, notificationWebhookSecret: value, clearWebhookSecret: false }))} type="password" placeholder="Leave empty to keep the saved secret" />
            <BankField label="SLA hours" value={String(policy.slaHours)} onChange={(value) => setPolicy((current) => ({ ...current, slaHours: Number.parseInt(value || "0", 10) || 0 }))} inputMode="numeric" />
            <BankField label="Follow-up days" value={String(policy.followUpDays)} onChange={(value) => setPolicy((current) => ({ ...current, followUpDays: Number.parseInt(value || "0", 10) || 0 }))} inputMode="numeric" />
            <BankField label="Archive days" value={String(policy.archiveDays)} onChange={(value) => setPolicy((current) => ({ ...current, archiveDays: Number.parseInt(value || "0", 10) || 0 }))} inputMode="numeric" />
          </div>
          {policy.notificationWebhookSecretConfigured && (
            <label className="field-label">
              <input
                type="checkbox"
                checked={policy.clearWebhookSecret}
                onChange={(event) =>
                  setPolicy((current) => ({
                    ...current,
                    clearWebhookSecret: event.target.checked,
                    notificationWebhookSecret: "",
                  }))
                }
              />
              Clear the saved webhook secret
            </label>
          )}
          <button
            className="button button-outline button-small"
            style={{ marginTop: "0.5rem" }}
            disabled={policyMutation.isPending}
            onClick={() => policyMutation.mutate({ data: policy })}
          >
            {policyMutation.isPending ? <span className="button-spinner" /> : null}
            Save autonomy policy
          </button>
          <button
            className="button button-outline button-small"
            style={{ marginTop: "0.5rem", marginLeft: "0.5rem" }}
            disabled={webhookTest.isPending || !policy.notificationWebhookUrl}
            onClick={() => webhookTest.mutate()}
          >
            {webhookTest.isPending ? <span className="button-spinner" /> : <Sparkles size={14} />}
            {webhookTest.isPending ? "Sending…" : "Test webhook"}
          </button>
          {!automation.data?.providerReady && <div className="inline-warning"><CircleAlert size={15} /> Gmail and Grok must be available before the worker can run.</div>}
          {automation.data?.lastRunAt && <div className="last-run">Last inbox check · {formatDate(automation.data.lastRunAt)}</div>}
        </div>
      </section>

      <section className="panel inbox-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">AUTONOMY LOG</span><h2>Recent worker activity</h2></div>
          <Link className="button button-outline button-small" href="/audit">Open audit trail <ArrowRight size={15} /></Link>
        </div>
        {recentActivity.data?.length ? (
          <div className="inquiry-list">
            {recentActivity.data.map((event) => (
              <div className="inquiry-row" key={event.id}>
                <span className="urgency-mark urgency-normal" />
                <div className="inquiry-main">
                  <b>{event.eventType.replaceAll("_", " ")}</b>
                  <span>{event.inquiryId ? `Enquiry ${event.inquiryId.slice(0, 8)}…` : "System event"}</span>
                </div>
                <time>{formatDate(event.createdAt)}</time>
                <ArrowRight className="row-arrow" size={16} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact"><div className="empty-icon"><Sparkles size={22} /></div><h3>No autonomous activity yet</h3><p>Run the worker or sync the inbox to begin building an audit trail.</p></div>
        )}
      </section>

      <section className="panel inbox-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">REAL GMAIL DATA</span><h2>Recent enquiries</h2></div>
          <Link className="button button-outline button-small" href="/inbox">View inbox <ArrowRight size={15} /></Link>
        </div>
        {inquiries.isError && !inquiries.data ? (
          <div className="inline-error">{getErrorMessage(inquiries.error)}</div>
        ) : rows.length === 0 ? (
          <EmptyInbox onSync={() => sync.mutate()} syncing={sync.isPending} />
        ) : (
          <InquiryRows inquiries={rows.slice(0, 6)} />
        )}
      </section>
      <div className="data-note"><ShieldCheckIcon /> Connected data only · Autonomous actions are audited and reversible through owner override.</div>
    </div>
  );
}

function MetricCard({ label, value, note, icon, emphasis = false }: { label: string; value: number | string; note: string; icon: ReactNode; emphasis?: boolean }) {
  return <article className={`metric-card ${emphasis ? "metric-emphasis" : ""}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></article>;
}

export function InquiryRows({ inquiries }: { inquiries: VantageInquiry[] }) {
  const sorted = [...inquiries].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  return (
    <div className="inquiry-list">
      {sorted.map((inquiry) => (
        <Link href={`/inquiries/${inquiry.id}`} className="inquiry-row" key={inquiry.id}>
          <span className={`urgency-mark urgency-${inquiry.urgency || "normal"}`} />
          <div className="inquiry-main">
            <b>{inquiry.customerName || inquiry.customerEmail}</b>
            <span>{inquiry.subject}</span>
          </div>
          <span className={`inquiry-status status-text-${inquiry.status}`}>{prettyStatus(inquiry.status)}</span>
          {inquiry.quote && <span className="inquiry-amount">{formatMoney(inquiry.quote.subtotal)}</span>}
          <time>{formatDate(inquiry.receivedAt, true)}</time>
          <ArrowRight className="row-arrow" size={16} />
        </Link>
      ))}
    </div>
  );
}

export function prettyStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function EmptyInbox({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  return <div className="empty-state"><div className="empty-icon"><InboxIcon /></div><h3>No enquiries imported yet</h3><p>Sync the connected Gmail inbox to check for real Vantage ARS customer enquiries. Nothing will be sent.</p><button className="button button-outline" onClick={onSync} disabled={syncing}>{syncing ? <span className="button-spinner" /> : <RefreshCw size={15} />}{syncing ? "Checking inbox…" : "Check Gmail inbox"}</button></div>;
}

function InboxIcon() {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16l2 11h-6l-2 3h-4l-2-3H2L4 5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M4 13h4l2 3h4l2-3h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

function ShieldCheckIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 18 18" fill="none"><path d="M9 2.2 14.5 4v4.2c0 3.5-2.4 6.1-5.5 7.6-3.1-1.5-5.5-4.1-5.5-7.6V4L9 2.2Z" stroke="currentColor" strokeWidth="1.4" /><path d="m6.7 8.8 1.5 1.5 3.2-3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}


function BankField({ label, value, onChange, inputMode, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; inputMode?: "numeric"; type?: "text" | "password"; placeholder?: string }) {
  const inputId = `bank-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <label className="field-label" htmlFor={inputId}>{label}<input id={inputId} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" spellCheck={false} inputMode={inputMode} type={type} placeholder={placeholder} maxLength={200} /></label>;
}
