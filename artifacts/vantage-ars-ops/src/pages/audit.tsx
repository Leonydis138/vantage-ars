import { getListVantageArsAuditEventsQueryKey, useListVantageArsAuditEvents } from "@workspace/api-client-react";
import { Activity, ArrowRight, ChevronDown, ChevronUp, Filter, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { getErrorMessage, formatDate } from "@/lib/vantage-format";

const categories = [
  { label: "All events", value: "all" },
  { label: "Autonomous", value: "autonomous" },
  { label: "Owner override", value: "owner" },
  { label: "Quotes", value: "quote" },
  { label: "CRM", value: "crm" },
  { label: "Escalations", value: "escalation" },
];

function categoryFor(eventType: string) {
  if (eventType.includes("escalation") || eventType.includes("anomaly")) return "escalation";
  if (eventType.includes("hubspot") || eventType.includes("crm")) return "crm";
  if (eventType.includes("quote")) return "quote";
  if (eventType.startsWith("autonomous_") || eventType.includes("clarification") || eventType.includes("resolution") || eventType.includes("follow_up") || eventType.includes("digest") || eventType.includes("archive") || eventType.includes("customer_reply") || eventType.includes("auto_accept") || eventType.includes("acceptance_confirmation")) return "autonomous";
  return "owner";
}

export function AuditPage() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = useListVantageArsAuditEvents(
    { limit: 200 },
    { query: { queryKey: getListVantageArsAuditEventsQueryKey({ limit: 200 }), refetchOnMount: "always" } },
  );

  const events = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((event) => {
      if (category !== "all" && categoryFor(event.eventType) !== category) return false;
      if (!term) return true;
      return `${event.eventType} ${event.ownerUserId} ${event.inquiryId ?? ""} ${JSON.stringify(event.details)}`.toLowerCase().includes(term);
    });
  }, [query.data, category, search]);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <div className="eyebrow">TRANSPARENCY</div>
          <h1>Audit trail</h1>
          <p>Owner overrides, autonomous actions, and provider events recorded for accountability.</p>
        </div>
      </section>

      <div className="filter-toolbar">
        <div className="filter-title"><Filter size={15} /> FILTER BY</div>
        <div className="filter-tabs" role="group" aria-label="Filter audit events">
          {categories.map((item) => <button key={item.value} onClick={() => setCategory(item.value)} className={category === item.value ? "selected" : ""}>{item.label}</button>)}
        </div>
        <label className="field-label audit-search">
          <Search size={14} />
          <input className="field-input" placeholder="Search events" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>

      <section className="panel inbox-panel">
        {query.isLoading && !query.data ? (
          <div className="loading-block"><div className="loader-mark" />Loading audit events…</div>
        ) : query.isError ? (
          <div className="page-error compact">
            <Activity size={21} />
            <div><h2>Could not load audit events</h2><p>{getErrorMessage(query.error)}</p></div>
            <button className="button button-outline" onClick={() => void query.refetch()}>Retry</button>
          </div>
        ) : events.length ? (
          <div className="inquiry-list">
            {events.map((event) => {
              const isOpen = expanded === event.id;
              const hasDetails = Object.keys(event.details ?? {}).length > 0;
              return (
                <div className="audit-row" key={event.id}>
                  <button className="inquiry-row audit-row-main" onClick={() => hasDetails && setExpanded(isOpen ? null : event.id)} aria-expanded={isOpen}>
                    <span className={`urgency-mark urgency-${categoryFor(event.eventType) === "escalation" ? "high" : "normal"}`} />
                    <div className="inquiry-main">
                      <b>{event.eventType.replaceAll("_", " ")}</b>
                      <span>{event.inquiryId ? `Enquiry ${event.inquiryId}` : "System"} · {event.ownerUserId}</span>
                    </div>
                    <span className={`inquiry-status status-text-${categoryFor(event.eventType) === "escalation" ? "needs_review" : "processing"}`}>{categoryFor(event.eventType)}</span>
                    <time>{formatDate(event.createdAt, true)}</time>
                    {hasDetails ? (isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />) : <ArrowRight className="row-arrow" size={16} />}
                  </button>
                  {isOpen && (
                    <div className="audit-details">
                      <div className="audit-details-head">
                        <span>EVENT DETAILS</span>
                        {event.inquiryId && <Link href={`/inquiries/${event.inquiryId}`}>Open enquiry <ArrowRight size={13} /></Link>}
                      </div>
                      <pre>{JSON.stringify(event.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon"><ShieldCheck size={22} /></div>
            <h3>No matching audit events</h3>
            <p>Owner overrides and autonomous processing will appear here as the worker runs.</p>
            {(category !== "all" || search) && <button className="button button-outline" onClick={() => { setCategory("all"); setSearch(""); }}>Clear filters</button>}
          </div>
        )}
      </section>
      <div className="data-note">Showing up to 200 latest events. Expand an event to inspect its recorded details.</div>
    </div>
  );
}
