import {
  getGetVantageArsAutomationQueryKey,
  getGetVantageArsDashboardQueryKey,
  getListVantageArsInquiriesQueryKey,
  useGetVantageArsAutomation,
  useGetVantageArsDashboard,
  useListVantageArsInquiries,
  useSetVantageArsAutomation,
  useSyncVantageArsInquiries,
  type VantageInquiry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowRight, CheckCircle2, CircleAlert, Clock3, RefreshCw, Sparkles, ToggleLeft } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { getErrorMessage, formatDate, formatMoney } from "@/lib/vantage-format";
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
        toast.success(value.enabled ? "Automatic inbox review enabled." : "Automatic inbox review paused.");
        await cache.invalidateQueries({ queryKey: getGetVantageArsAutomationQueryKey() });
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
          <p>Live service status, real customer enquiries, and owner-approved actions.</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          {sync.isPending ? <span className="button-spinner" /> : <RefreshCw size={16} />}
          {sync.isPending ? "Reviewing inbox…" : "Sync business inbox"}
        </button>
      </section>

      {(attentionCount > 0 || setupCount > 0) && (
        <div className="attention-banner">
          <CircleAlert size={18} />
          <div><b>{attentionCount > 0 ? `${attentionCount} connected service${attentionCount === 1 ? "" : "s"} need attention` : `${setupCount} channel${setupCount === 1 ? "" : "s"} still need setup`}</b><span>{attentionCount > 0 && setupCount > 0 ? `${setupCount} other channels are not connected yet. ` : ""}Automation stays limited to live connected services. Phone calls and social publishing are not simulated.</span></div>
        </div>
      )}

      <section className="metric-grid" aria-label="Live operations counts">
        <MetricCard label="QUOTE APPROVALS" value={counts?.quotesReady ?? 0} note="Prepared and awaiting your decision" icon={<CheckCircle2 />} emphasis />
        <MetricCard label="NEEDS REVIEW" value={counts?.needsReview ?? 0} note="Manual attention required" icon={<CircleAlert />} />
        <MetricCard label="NEEDS INFORMATION" value={counts?.needsInformation ?? 0} note="Scope is not clear enough to quote" icon={<Clock3 />} />
        <MetricCard label="CRM APPROVALS" value={counts?.crmSyncNeeded ?? 0} note="HubSpot sync requires your approval" icon={<ArrowDownToLine />} />
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
          <div className="panel-footnote">Provider checks are live. Cloudflare is read-only here; no DNS changes are made.</div>
        </div>

        <div className="panel automation-panel">
          <div className="automation-orbit"><Sparkles size={19} /></div>
          <span className="section-kicker">AI WORKER</span>
          <h2>Inbox review</h2>
          <p>Grok can periodically scan real business email and prepare triage or quote proposals. It cannot send, publish, create CRM contacts, or schedule work.</p>
          <div className="automation-toggle-row">
            <div><b>{automation.data?.enabled ? "Automatic review is on" : "Manual review only"}</b><span>{automation.data?.enabled ? `Runs every ${automation.data.intervalMinutes} minutes` : "No background processing until you enable it"}</span></div>
            <button
              className={`toggle-control ${automation.data?.enabled ? "checked" : ""}`}
              role="switch"
              aria-checked={automation.data?.enabled ?? false}
              aria-label="Enable automatic inbox review"
              disabled={!automation.data?.providerReady || automationChange.isPending || !automation.data}
              onClick={() => {
                const next = !automation.data?.enabled;
                if (next && !window.confirm("Enable automatic inbox review? This only reads and classifies new matching messages; it will never send email or write to HubSpot.")) return;
                automationChange.mutate({ data: { enabled: next } });
              }}
            ><span /></button>
          </div>
          {!automation.data?.providerReady && <div className="inline-warning"><CircleAlert size={15} /> Connect Gmail and Grok before enabling the worker.</div>}
          {automation.data?.lastRunAt && <div className="last-run">Last inbox check · {formatDate(automation.data.lastRunAt)}</div>}
        </div>
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
      <div className="data-note"><ShieldCheckIcon /> Connected data only · Customer messages are private and visible to the verified mailbox owner.</div>
    </div>
  );
}

function MetricCard({ label, value, note, icon, emphasis = false }: { label: string; value: number; note: string; icon: ReactNode; emphasis?: boolean }) {
  return <article className={`metric-card ${emphasis ? "metric-emphasis" : ""}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></article>;
}

export function InquiryRows({ inquiries }: { inquiries: VantageInquiry[] }) {
  return (
    <div className="inquiry-list">
      {inquiries.map((inquiry) => (
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
