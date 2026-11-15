import { useListVantageArsInquiries, useSyncVantageArsInquiries, getGetVantageArsDashboardQueryKey, getListVantageArsInquiriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Filter, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ListVantageArsInquiriesStatus } from "@workspace/api-client-react";
import { getErrorMessage } from "@/lib/vantage-format";
import { InquiryRows } from "./dashboard";

const filters: Array<{ label: string; value: ListVantageArsInquiriesStatus }> = [
  { label: "All enquiries", value: "all" },
  { label: "Quotes ready", value: "quote_ready" },
  { label: "Needs review", value: "needs_review" },
  { label: "Needs information", value: "needs_information" },
  { label: "Quotes sent", value: "quote_sent" },
  { label: "Customer replies", value: "reply_received" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
  { label: "Not relevant", value: "not_relevant" },
  { label: "Archived", value: "archived" },
];

export function InboxPage() {
  const [filter, setFilter] = useState<ListVantageArsInquiriesStatus>("all");
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const cache = useQueryClient();
  const query = useListVantageArsInquiries(
    { status: filter, escalated: escalatedOnly, search },
    { query: { queryKey: getListVantageArsInquiriesQueryKey({ status: filter, escalated: escalatedOnly, search }), refetchOnMount: "always" } },
  );
  const sync = useSyncVantageArsInquiries({
    mutation: {
      onSuccess: async (result) => {
        toast.success(result.message);
        await Promise.all([
          cache.invalidateQueries({ queryKey: getListVantageArsInquiriesQueryKey() }),
          cache.invalidateQueries({ queryKey: getGetVantageArsDashboardQueryKey() }),
        ]);
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    },
  });

  const exportParams = new URLSearchParams({ status: filter });
  if (escalatedOnly) exportParams.set("escalated", "true");
  if (search.trim()) exportParams.set("search", search.trim());
  const exportHref = `/api/vantage-ars/export?${exportParams.toString()}`;

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div><div className="eyebrow">CUSTOMER RELATIONSHIPS</div><h1>Enquiries</h1><p>Messages imported from the connected Gmail business inbox. No seeded or sample records.</p></div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="button button-primary" onClick={() => sync.mutate()} disabled={sync.isPending}>{sync.isPending ? <span className="button-spinner" /> : <RefreshCw size={16} />}{sync.isPending ? "Syncing…" : "Sync inbox"}</button>
          <a className="button button-outline" href={exportHref}>Export CSV</a>
        </div>
      </section>

      <div className="filter-toolbar">
        <div className="filter-title"><Filter size={15} /> FILTER BY</div>
        <div className="filter-tabs" role="group" aria-label="Filter enquiries">
          {filters.map((item) => <button key={item.value} onClick={() => setFilter(item.value)} className={filter === item.value ? "selected" : ""}>{item.label}</button>)}
        </div>
        <button className={`filter-toggle ${escalatedOnly ? "selected" : ""}`} onClick={() => setEscalatedOnly((value) => !value)}>Escalated only</button>
        <input className="field-input" placeholder="Search enquiries" value={search} onChange={(event) => setSearch(event.target.value)} style={{ marginLeft: "0.5rem", maxWidth: "220px" }} />
      </div>

      <section className="panel inbox-panel">
        {query.isLoading && !query.data ? <div className="loading-block"><div className="loader-mark" />Loading real enquiries…</div> :
          query.isError ? <div className="page-error compact"><CircleAlert size={21} /><div><h2>Could not load the inbox</h2><p>{getErrorMessage(query.error)}</p></div><button className="button button-outline" onClick={() => void query.refetch()}>Retry</button></div> :
          query.data?.length ? <InquiryRows inquiries={query.data} /> :
          <div className="empty-state"><div className="empty-icon"><Filter size={22} /></div><h3>No enquiries in this view</h3><p>This filter has no matching records from the connected mailbox.</p>{filter !== "all" && <button className="button button-outline" onClick={() => setFilter("all")}>Show all enquiries</button>}</div>}
      </section>
      <div className="data-note">Showing up to 200 latest enquiries. The original messages remain in Gmail.</div>
    </div>
  );
}
