import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/office/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { importInboundItems } from "@/lib/office/api";
import { MAX_IMPORT_ROWS, parseInboundCsv, type InboundImport } from "@/lib/office/csv-import";

export const Route = createFileRoute("/_app/import-data")({
  head: () => ({
    meta: [{ title: "Import data · Vantage-ARS" }, { name: "robots", content: "noindex" }],
  }),
  component: ImportPage,
});

function ImportPage() {
  const router = useRouter();
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<InboundImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

  async function onFile(file: File | undefined) {
    setImported(null);
    setResult(null);
    setFilename("");
    if (!file) return;
    if (file.size > 2_000_000) {
      setResult({ ok: false, error: "That file is larger than 2 MB." });
      return;
    }
    setFilename(file.name);
    setResult(parseInboundCsv(await file.text()));
  }

  async function runImport() {
    if (!result?.ok || importing) return;
    setImporting(true);
    try {
      const outcome = await importInboundItems({ data: { rows: result.rows } });
      if (!outcome.ok) {
        toast.error(outcome.error);
        return;
      }
      setImported(outcome.imported);
      setResult(null);
      setFilename("");
      toast.success(
        `${outcome.imported} row${outcome.imported === 1 ? "" : "s"} filed as inbound items.`,
        { description: "The office routes them on its next pass." },
      );
      await router.invalidate();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The rows could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="enter-up mx-auto max-w-4xl">
      <PageHeader
        kicker="Bulk intake"
        title="Bring a sheet in, leave the guessing out."
        description="A CSV lands in the same inbox as a website enquiry. The office decides what each row becomes — the importer cannot create leads, quotes or money."
      />

      <Card className="mb-4">
        <h2 className="font-serif text-xl">Upload a CSV</h2>
        <p className="mt-1 text-sm text-muted">
          The first row must be a header. Required columns: <code className="text-fg">company</code> and{" "}
          <code className="text-fg">subject</code>. Optional:{" "}
          <code className="text-fg">summary</code>, <code className="text-fg">channel</code>,{" "}
          <code className="text-fg">intent</code>. Up to {MAX_IMPORT_ROWS} rows per import.
        </p>
        <label
          htmlFor="csv-file"
          className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-raised/40 px-4 py-8 text-center transition-colors hover:border-accent/50"
        >
          <span className="text-sm font-medium text-fg">
            {filename || "Choose a .csv file or drop one here"}
          </span>
          <span className="text-xs text-subtle">Nothing is written until you confirm the preview.</span>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </label>
      </Card>

      {result ? (
        result.ok ? (
          <Card className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-xl">Preview</h2>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="ok">{result.rows.length} ready</Badge>
                {result.skipped > 0 ? <Badge variant="warn">{result.skipped} skipped</Badge> : null}
                {result.truncated > 0 ? (
                  <Badge variant="danger">{result.truncated} over the limit</Badge>
                ) : null}
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead className="font-mono uppercase tracking-[0.12em] text-subtle">
                  <tr>
                    <th className="py-2 pr-3">Company</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2">Intent</th>
                  </tr>
                </thead>
                <tbody className="text-muted">
                  {result.rows.slice(0, 6).map((row, index) => (
                    <tr key={`${row.companyName}-${index}`} className="border-t border-border/60">
                      <td className="py-2 pr-3 text-fg">{row.companyName}</td>
                      <td className="py-2 pr-3">{row.subject}</td>
                      <td className="py-2 pr-3">{row.channel}</td>
                      <td className="py-2">{row.intent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.rows.length > 6 ? (
              <p className="mt-2 text-[11px] text-subtle">
                Showing the first 6 of {result.rows.length} rows.
              </p>
            ) : null}
            {result.skipped > 0 ? (
              <p className="mt-2 text-xs text-warn">
                {result.skipped} row{result.skipped === 1 ? "" : "s"} had no company or subject and will
                not be imported.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => void runImport()} disabled={importing}>
                {importing ? "Importing…" : `Import ${result.rows.length} row${result.rows.length === 1 ? "" : "s"}`}
              </Button>
              <span className="text-[11px] text-subtle">
                Every row is written to the audit chain as a received inbound item.
              </span>
            </div>
          </Card>
        ) : (
          <Card className="mb-4">
            <p className="text-sm text-danger">{result.error}</p>
          </Card>
        )
      ) : null}

      {imported !== null ? (
        <Card>
          <h2 className="font-serif text-xl">Filed</h2>
          <p className="mt-1 text-sm text-muted">
            {imported} inbound item{imported === 1 ? "" : "s"} were written to the inbox.
          </p>
          <p className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link to="/office/inbox" className="font-medium text-accent underline-offset-4 hover:underline">
              Open the inbox
            </Link>
            <Link to="/activity-log" className="font-medium text-accent underline-offset-4 hover:underline">
              See the audit entries
            </Link>
          </p>
        </Card>
      ) : null}
    </div>
  );
}
