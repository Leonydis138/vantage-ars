import {
  getGetVantageArsDashboardQueryKey,
  getListVantageArsInquiriesQueryKey,
  useDecideVantageArsQuote,
  useListVantageArsInquiries,
  usePreviewVantageArsQuote,
  useSyncVantageArsInquiryToHubSpot,
  type VantageBankDetails,
  type VantageInquiry,
  type VantageQuotePreview,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Banknote, Check, ChevronDown, CircleAlert, FileText, LoaderCircle, Mail, ShieldCheck, UserRoundPlus } from "lucide-react";
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
  const inquiries = useListVantageArsInquiries(
    { status: "all" },
    { query: { queryKey: getListVantageArsInquiriesQueryKey({ status: "all" }), refetchOnMount: "always" } },
  );
  const [bankDetails, setBankDetails] = useState<VantageBankDetails>(emptyBank);
  const [approvedBank, setApprovedBank] = useState<VantageBankDetails | null>(null);
  const [preview, setPreview] = useState<VantageQuotePreview | null>(null);

  const refreshData = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: getListVantageArsInquiriesQueryKey() }),
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

  const inquiry = inquiries.data?.find((item) => item.id === inquiryId);
  if (inquiries.isLoading && !inquiries.data) return <div className="loading-block"><div className="loader-mark" />Loading enquiry…</div>;
  if (!inquiry) {
    return <div className="page-error"><CircleAlert size={22} /><div><h2>Enquiry not found</h2><p>This record is not available in the live inbox data.</p></div><Link className="button button-outline" href="/inbox"><ArrowLeft size={15} /> Back to enquiries</Link></div>;
  }

  const quote = inquiry.quote;
  const isReady = quote?.status === "ready";
  const isSent = quote?.status === "sent";
  const isUncertain = quote?.status === "send_uncertain";
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
              <span><small>ATTACHMENTS</small><b>{inquiry.hasAttachments ? "Needs manual review" : "None detected"}</b></span>
            </div>
            {inquiry.missingInformation.length > 0 && <div className="missing-list"><div><CircleAlert size={16} /> More information needed</div><ul>{inquiry.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {inquiry.hasAttachments && <div className="inline-warning"><CircleAlert size={15} /> Attachments are not read by this automation. Review them directly in Gmail before proceeding.</div>}
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
              <div className="panel-heading"><div><span className="section-kicker">OWNER DECISION</span><h2>Review before sending</h2></div><span className="approval-lock"><ShieldCheck size={15} /> NOT SENT</span></div>
              <p className="section-description">Enter the bank details to include in this quote email. They are held only in this page and the request; they are not saved in the application database.</p>
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
                      if (!approvedBank || !window.confirm(`Send this exact quote email to ${preview.recipientEmail}? The bank details will be visible in Gmail Sent.`)) return;
                      decision.mutate({ inquiryId, data: { decision: "approve", bankDetails: approvedBank } });
                    }}>{decision.isPending ? <LoaderCircle className="spin" size={16} /> : <Mail size={16} />}{decision.isPending ? "Sending…" : "Approve and send quote"}</button>
                    <button className="button button-danger-outline" disabled={decision.isPending} onClick={() => {
                      if (!window.confirm(`Decline quote ${quote.reference}? It will not be sent.`)) return;
                      decision.mutate({ inquiryId, data: { decision: "decline" } });
                    }}>Decline quote</button>
                  </div>
                </div>
              )}
              {!preview && <div className="approval-hint"><ShieldCheck size={15} /> Nothing is sent until you review the preview and approve it.</div>}
            </section>
          )}

          {isUncertain && <div className="attention-banner"><CircleAlert size={18} /><div><b>Gmail did not confirm whether this quote was sent</b><span>Check the Gmail Sent folder for reference {quote.reference}. Automatic retry is blocked to prevent duplicate messages.</span><a href="https://mail.google.com" target="_blank" rel="noreferrer">Open Gmail ↗</a></div></div>}
        </div>

        <aside className="detail-aside">
          <section className="panel next-step-panel">
            <span className="section-kicker">NEXT STEP</span>
            {isReady ? <><div className="next-step-icon"><Mail size={19} /></div><h3>Owner approval required</h3><p>Confirm the rate, scope, recipient, and bank details before sending this quote.</p></> :
              isSent ? <><div className="next-step-icon done"><BadgeCheck size={19} /></div><h3>Quote sent</h3><p>The customer was emailed the approved quote. Work must still wait for written customer acceptance.</p></> :
              inquiry.status === "needs_information" ? <><div className="next-step-icon warning"><CircleAlert size={19} /></div><h3>Clarify the request</h3><p>The AI could not prepare a reliable quote from the available information.</p></> :
              <><div className="next-step-icon"><FileText size={19} /></div><h3>Manual review</h3><p>Review the source message and decide what action is appropriate.</p></>}
          </section>
          <section className="panel crm-panel">
            <span className="section-kicker">CUSTOMER RECORD</span>
            <div className="crm-title"><UserRoundPlus size={17} /><b>HubSpot CRM</b></div>
            {inquiry.hubspotContactId ? <div className="crm-connected"><Check size={15} /> Linked to HubSpot</div> :
              isSent ? <><p>Quote sent. Confirm before finding or creating this contact in HubSpot.</p><button className="button button-outline button-full" disabled={crmSync.isPending} onClick={() => {
                if (!window.confirm(`Find or create a HubSpot contact for ${inquiry.customerEmail}? Existing contacts will not be changed.`)) return;
                crmSync.mutate({ inquiryId });
              }}>{crmSync.isPending ? <LoaderCircle className="spin" size={15} /> : <UserRoundPlus size={15} />}{crmSync.isPending ? "Syncing…" : "Approve HubSpot sync"}</button></> :
              <p>HubSpot contact creation is available after the quote is sent and separately approved.</p>}
            {inquiry.hubspotSyncStatus === "needs_attention" && <div className="inline-warning"><CircleAlert size={14} /> Previous CRM sync needs attention. You can retry after reviewing.</div>}
          </section>
          <div className="aside-guard"><ShieldCheck size={16} /><span><b>Owner action boundary</b><small>No payment, booking, DNS, or public marketing action is triggered here.</small></span></div>
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
