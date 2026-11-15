import {
  getGetVantageArsDashboardQueryKey,
  getGetVantageArsInquiryQueryKey,
  getListVantageArsInquiriesQueryKey,
  useAcceptVantageArsQuote,
  useDecideVantageArsQuote,
  useGetVantageArsInquiry,
  useListVantageArsInquiries,
  usePreviewVantageArsQuote,
  useReprocessVantageArsInquiry,
  useSyncVantageArsInquiryToHubSpot,
  type VantageBankDetails,
  type VantageInquiry,
  type VantageQuotePreview,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Banknote, Check, ChevronDown, CircleAlert, FileText, LoaderCircle, Mail, RefreshCw, ShieldCheck, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { getErrorMessage, formatDate, formatMoney } from "@/lib/vantage-format";
import { prettyStatus } from "./dashboard";

const emptyBank: VantageBankDetails = {
  accountName: "",
  bankName: "",
  accountNumber: "",
  branchCode: "",
  accountType: "",
};

export function InquiryPage({ inquiryId }: { inquiryId: string }) {
  const cache = useQueryClient();
  const inquiryQuery = useGetVantageArsInquiry(inquiryId, {
    query: { queryKey: getGetVantageArsInquiryQueryKey(inquiryId), refetchOnMount: "always" },
  });
  const [bankDetails, setBankDetails] = useState<VantageBankDetails>(emptyBank);
  const [approvedBank, setApprovedBank] = useState<VantageBankDetails | null>(null);
  const [preview, setPreview] = useState<VantageQuotePreview | null>(null);

  const refreshData = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: getListVantageArsInquiriesQueryKey() }),
      cache.invalidateQueries({ queryKey: getGetVantageArsInquiryQueryKey(inquiryId) }),
      cache.invalidateQueries({ queryKey: getGetVantageArsDashboardQueryKey() }),
    ]);
  };
  const quotePreview = usePreviewVantageArsQuote({
    mutation: {
      onSuccess: (result) => {
        setPreview(result);
        setApprovedBank({ ...bankDetails });
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });
  const decision = useDecideVantageArsQuote({
    mutation: {
      onSuccess: async (result) => {
        toast.success(result.message);
        setPreview(null);
        setApprovedBank(null);
        setBankDetails({ ...emptyBank });
        await refreshData();
      },
      onError: async (error) => {
        toast.error(getErrorMessage(error));
        await refreshData();
      },
    },
  });
  const crmSync = useSyncVantageArsInquiryToHubSpot({
    mutation: {
      onSuccess: async (result) => {
        result.status === "synced" ? toast.success(result.message) : toast.error(result.message);
        await refreshData();
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });

  const reprocess = useReprocessVantageArsInquiry({
    mutation: {
      onSuccess: async (result) => {
        toast.success(result.message);
        await refreshData();
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });

  const acceptQuote = useAcceptVantageArsQuote({
    mutation: {
      onSuccess: async (result) => {
        toast.success(result.message);
        await refreshData();
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });

  const inquiry = inquiryQuery.data;
  if (inquiryQuery.isLoading && !inquiry) return <div className="loading-block"><div className="loader-mark" />Loading enquiry…</div>;
  if (!inquiry) {
    return <div className="page-error"><CircleAlert size={22} /><div><h2>Enquiry not found</h2><p>This record is not available in the live inbox data.</p></div><Link className="button button-outline" href="/inbox"><ArrowLeft size={15} /> Back to enquiries</Link></div>;
  }

  const quote = inquiry.quote;
  const isReady = quote?.status === "ready";
  const isSent = quote?.status === "sent";
  const isAccepted = quote?.status === "accepted";
  const isUncertain = quote?.status === "send_uncertain";
  const timeline = [
    { label: "Enquiry received", at: inquiry.receivedAt },
    { label: "Clarification requested", at: inquiry.clarificationSentAt },
    { label: "Autonomous resolution attempted", at: inquiry.resolutionAttemptedAt },
    { label: "Escalated for remote support", at: inquiry.escalatedAt },
    { label: "Scheduling email sent", at: inquiry.schedulingEmailSentAt },
    { label: "Quote sent", at: inquiry.quote?.sentAt },
    { label: "Customer accepted", at: inquiry.acceptedAt },
    { label: "Follow-up sent", at: inquiry.followUpSentAt },
  ].filter((item): item is { label: string; at: string } => Boolean(item.at));
  const updateBank = (field: keyof VantageBankDetails, value: string) => {
    setBankDetails((current) => ({ ...current, [field]: value }));
    setApprovedBank(null);
    setPreview(null);
    quotePreview.reset();
  };

  return (
    <div className="page-stack">
      <div className="detail-back"><Link href="/inbox"><ArrowLeft size={15} /> All enquiries</Link><span>/</span><span>{inquiry.subject}</span></div>
      <section className="detail-heading">
        <div>
          <div className="eyebrow">CUSTOMER ENQUIRY · {formatDate(inquiry.receivedAt)}</div>
          <h1>{inquiry.subject}</h1>
          <div className="customer-line"><span className="customer-avatar">{(inquiry.customerName || inquiry.customerEmail).slice(0, 1).toUpperCase()}</span><div><b>{inquiry.customerName}</b><a href={`mailto:${inquiry.customerEmail}`}>{inquiry.customerEmail}</a></div><span className={`inquiry-status status-text-${inquiry.status}`}>{prettyStatus(inquiry.status)}</span></div>
        </div>
        {inquiry.urgency === "high" && <span className="urgency-badge"><CircleAlert size={14} /> High urgency</span>}
      </section>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel analysis-panel">
            <div className="panel-heading"><div><span className="section-kicker">GROK REVIEW</span><h2>Enquiry assessment</h2></div><span className="ai-label"><span className="ai-spark">✳</span> AI PREPARED</span></div>
            <p className="summary-text">{inquiry.summary || "No summary has been prepared for this enquiry yet."}</p>
            <div className="analysis-meta">
              <span><small>CATEGORY</small><b>{inquiry.category || "Unclassified"}</b></span>
              <span><small>URGENCY</small><b className={`urgency-text urgency-${inquiry.urgency || "normal"}`}>{inquiry.urgency || "Not assessed"}</b></span>
              <span><small>SENTIMENT</small><b>{inquiry.sentiment || "Not assessed"}</b></span>
              <span><small>AI CONFIDENCE</small><b>{inquiry.aiConfidence != null ? `${Math.round(inquiry.aiConfidence * 100)}%` : "Not assessed"}</b></span>
              <span><small>LANGUAGE</small><b>{inquiry.language || "Not assessed"}</b></span>
              <span><small>PRIORITY</small><b>{inquiry.priorityScore ?? "Not assessed"}</b></span>
              <span><small>ATTACHMENTS</small><b>{inquiry.hasAttachments ? "Needs manual review" : "None detected"}</b></span>
            </div>
            {inquiry.tags && inquiry.tags.length > 0 && (
              <div className="tag-row" aria-label="AI enquiry tags">
                {inquiry.tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}
              </div>
            )}
            {inquiry.missingInformation.length > 0 && <div className="missing-list"><div><CircleAlert size={16} /> More information needed</div><ul>{inquiry.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {inquiry.hasAttachments && <div className="inline-warning"><CircleAlert size={15} /> Attachments are not read by this automation. Review them directly in Gmail before proceeding.</div>}
                      {(inquiry.status === "needs_review" || inquiry.status === "needs_information" || inquiry.status === "not_relevant" || inquiry.status === "processing") && (
            <button className="button button-outline" disabled={reprocess.isPending} onClick={() => reprocess.mutate({ inquiryId })}>
              {reprocess.isPending ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
              {reprocess.isPending ? "Re-running Grok…" : "Reprocess with Grok"}
            </button>
          )}

<details className="source-message"><summary><span><Mail size={15} /> View original email text</span><ChevronDown size={15} /></summary><pre>{inquiry.messageBody || "No readable message text was available."}</pre></details>
          </section>

          {quote && (
            <section className="panel quote-panel">
              <div className="panel-heading"><div><span className="section-kicker">QUOTE PROPOSAL</span><h2>{quote.reference}</h2></div><span className={`status-pill status-${quote.status === "send_uncertain" ? "attention" : quote.status === "sent" ? "connected" : quote.status === "declined" ? "not_connected" : "setup_required"}`}><i /> {prettyStatus(quote.status)}</span></div>
              <div className="quote-table">
                <div className="quote-table-head"><span>DESCRIPTION</span><span>QTY</span><span>RATE</span><span>AMOUNT</span></div>
                {quote.lines.map((line, index) => <div className="quote-table-line" key={`${line.code}-${index}`}><span><b>{line.description}</b><small>{line.code.replaceAll("_", " ")}</small></span><span>{line.quantity} {line.unit}</span><span>{formatMoney(line.unitPrice)}</span><strong>{formatMoney(line.total)}</strong></div>)}
                <div className="quote-total"><span>Subtotal · ZAR</span><strong>{formatMoney(quote.subtotal)}</strong></div>
              </div>
              <div className="quote-terms"><b>QUOTE TERMS</b>{quote.notes.map((note) => <p key={note}><Check size={14} /> {note}</p>)}</div>
              <div className="quote-foot">Prepared {formatDate(quote.createdAt)}{quote.sentAt ? ` · Sent ${formatDate(quote.sentAt)}` : ""}</div>
            </section>
          )}

          {isReady && (
            <section className="panel approval-panel">
              <div className="panel-heading"><div><span className="section-kicker">OWNER OVERRIDE</span><h2>Manual quote control</h2></div><span className="approval-lock"><ShieldCheck size={15} /> AUTONOMY READY</span></div>
              <p className="section-description">The autonomous worker sends ready quotes automatically when sending is enabled and bank details are configured. Use this preview to inspect the exact message or send it manually now.</p>
              <div className="bank-grid">
                <BankField label="Account name" value={bankDetails.accountName} onChange={(value) => updateBank("accountName", value)} />
                <BankField label="Bank name" value={bankDetails.bankName} onChange={(value) => updateBank("bankName", value)} />
                <BankField label="Account number" value={bankDetails.accountNumber} onChange={(value) => updateBank("accountNumber", value)} inputMode="numeric" />
                <BankField label="Branch code" value={bankDetails.branchCode} onChange={(value) => updateBank("branchCode", value)} inputMode="numeric" />
                <BankField label="Account type" value={bankDetails.accountType} onChange={(value) => updateBank("accountType", value)} />
              </div>
              <div className="bank-privacy"><Banknote size={15} /> Gmail will retain the included bank details in Sent after sending.</div>
              <button className="button button-outline" onClick={() => quotePreview.mutate({ inquiryId, data: { bankDetails } })} disabled={quotePreview.isPending || !isBankComplete(bankDetails)}>
                {quotePreview.isPending ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />}
                {quotePreview.isPending ? "Preparing exact preview…" : "Preview exact email"}
              </button>

              {preview && (
                <div className="email-preview">
                  <div className="email-preview-head"><span><Mail size={16} /> EXACT GMAIL MESSAGE</span><span>To: <b>{preview.recipientEmail}</b></span></div>
                  <div className="email-subject"><small>SUBJECT</small><b>{preview.subject}</b></div>
                  <pre className="email-body">{preview.plainTextBody}</pre>
                  <div className="planned-actions"><b>WHAT APPROVAL WILL DO</b>{preview.plannedActions.map((action) => <p key={action}><Check size={14} /> {action}</p>)}</div>
                  <div className="approval-actions">
                    <button className="button button-primary" disabled={decision.isPending || !approvedBank} onClick={() => {
                      if (!approvedBank || !window.confirm(`Send this exact quote email to ${preview.recipientEmail} now? The autonomous worker may also handle it, so confirm this quote is still unsent.`)) return;
                      decision.mutate({ inquiryId, data: { decision: "approve", bankDetails: approvedBank } });
                    }}>{decision.isPending ? <LoaderCircle className="spin" size={16} /> : <Mail size={16} />}{decision.isPending ? "Sending…" : "Approve and send quote"}</button>
                    <button className="button button-danger-outline" disabled={decision.isPending} onClick={() => {
                      if (!window.confirm(`Decline quote ${quote.reference}? It will not be sent.`)) return;
                      decision.mutate({ inquiryId, data: { decision: "decline" } });
                    }}>Decline quote</button>
                  </div>
                </div>
              )}
              {!preview && <div className="approval-hint"><ShieldCheck size={15} /> The worker may send this quote autonomously. Previewing here gives you a manual override.</div>}
            </section>
          )}

          {isUncertain && <div className="attention-banner"><CircleAlert size={18} /><div><b>Gmail did not confirm whether this quote was sent</b><span>Check the Gmail Sent folder for reference {quote.reference}. Automatic retry is blocked to prevent duplicate messages.</span><a href="https://mail.google.com" target="_blank" rel="noreferrer">Open Gmail ↗</a></div></div>}
        </div>

        <aside className="detail-aside">
          <section className="panel next-step-panel">
            <span className="section-kicker">AUTONOMY TIMELINE</span>
            <div className="autonomy-timeline">
              {timeline.map((item) => (
                <div className="autonomy-timeline-item" key={`${item.label}-${item.at}`}>
                  <span className="timeline-dot" />
                  <div><b>{item.label}</b><small>{formatDate(item.at)}</small></div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel next-step-panel">
            <span className="section-kicker">NEXT STEP</span>
            {isReady ? <><div className="next-step-icon"><Mail size={19} /></div><h3>Autonomous quote ready</h3><p>The worker can send this quote automatically. Review or override it here if needed.</p></> :
              isAccepted ? <><div className="next-step-icon done"><BadgeCheck size={19} /></div><h3>Quote accepted</h3><p>Revenue is recorded. The worker will archive this enquiry after the configured archive window.</p></> :
              inquiry.status === "reply_received" ? <><div className="next-step-icon warning"><CircleAlert size={19} /></div><h3>Customer replied</h3><p>The customer replied to the quote. Review the Gmail thread and respond or mark the quote accepted.</p></> :
              isSent ? <><div className="next-step-icon done"><BadgeCheck size={19} /></div><h3>Quote sent</h3><p>The customer was emailed the quote. Mark it accepted once written acceptance is received.</p></> :
              inquiry.status === "needs_information" ? <><div className="next-step-icon warning"><CircleAlert size={19} /></div><h3>Clarify the request</h3><p>The AI could not prepare a reliable quote from the available information.</p></> :
              <><div className="next-step-icon"><FileText size={19} /></div><h3>Autonomous review</h3><p>The worker will triage this enquiry automatically. You can reprocess or intervene at any time.</p></>}
            {isSent && (
              <button
                className="button button-outline button-full"
                style={{ marginTop: "0.9rem" }}
                disabled={acceptQuote.isPending}
                onClick={() => {
                  if (!window.confirm(`Mark quote ${quote?.reference} as accepted by ${inquiry.customerName}?`)) return;
                  acceptQuote.mutate({ inquiryId });
                }}
              >
                {acceptQuote.isPending ? <LoaderCircle className="spin" size={15} /> : <BadgeCheck size={15} />}
                {acceptQuote.isPending ? "Recording…" : "Mark customer accepted"}
              </button>
            )}
          </section>
          <section className="panel crm-panel">
            <span className="section-kicker">CUSTOMER RECORD</span>
            <div className="crm-title"><UserRoundPlus size={17} /><b>HubSpot CRM</b></div>
            {inquiry.hubspotContactId ? <div className="crm-connected"><Check size={15} /> Linked to HubSpot</div> :
              isSent ? <><p>Quote sent. The worker syncs HubSpot automatically; use this control to retry immediately.</p><button className="button button-outline button-full" disabled={crmSync.isPending} onClick={() => {
                if (!window.confirm(`Sync ${inquiry.customerEmail} to HubSpot now? Existing contacts will not be overwritten.`)) return;
                crmSync.mutate({ inquiryId });
              }}>{crmSync.isPending ? <LoaderCircle className="spin" size={15} /> : <UserRoundPlus size={15} />}{crmSync.isPending ? "Syncing…" : "Sync HubSpot now"}</button></> :
              <p>HubSpot sync runs automatically after the quote is sent. This manual control is available as an override.</p>}
            {inquiry.hubspotSyncStatus === "needs_attention" && <div className="inline-warning"><CircleAlert size={14} /> Previous CRM sync needs attention. You can retry after reviewing.</div>}
          </section>
          <div className="aside-guard"><ShieldCheck size={16} /><span><b>Automation boundary</b><small>No payment, booking, DNS, or public marketing action is triggered here.</small></span></div>
        </aside>
      </div>
    </div>
  );
}

function BankField({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode?: "numeric" }) {
  const inputId = `bank-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <label className="field-label" htmlFor={inputId}>{label}<input id={inputId} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" spellCheck={false} inputMode={inputMode} maxLength={100} /></label>;
}

function isBankComplete(details: VantageBankDetails) {
  return Object.values(details).every((value) => value.trim().length > 0);
}
