import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/office/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  applyBuildRun,
  getBuildDeskInfo,
  getBuildRun,
  runBuildCommand,
  startBuildRun,
} from "@/lib/opencode/api";
import type { RunStatus, RunView, StepKind } from "@/lib/opencode/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/opencode")({
  head: () => ({
    meta: [{ title: "OpenCode · Vantage-ARS" }, { name: "robots", content: "noindex" }],
  }),
  component: OpenCodePage,
});

type Info = Awaited<ReturnType<typeof getBuildDeskInfo>>;
type Line = { at: string; kind: StepKind | "command" | "output"; text: string };

const STATUS: Record<RunStatus, { label: string; variant: "default" | "accent" | "ok" | "warn" | "danger" }> = {
  running: { label: "planning", variant: "accent" },
  ready: { label: "ready to apply", variant: "warn" },
  failed: { label: "stopped", variant: "danger" },
  applied: { label: "applied", variant: "ok" },
  reverted: { label: "reverted", variant: "danger" },
};

const LINE_TONE: Record<Line["kind"], string> = {
  request: "text-accent",
  tool: "text-muted",
  edit: "text-ok",
  note: "text-fg",
  error: "text-danger",
  check: "text-warn",
  apply: "text-accent",
  command: "text-accent",
  output: "text-muted",
};

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour12: false });
}

function OpenCodePage() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [brief, setBrief] = useState("");
  const [run, setRun] = useState<RunView | null>(null);
  const [terminal, setTerminal] = useState<Line[]>([]);
  const [command, setCommand] = useState("typecheck");
  const [starting, setStarting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [runningCommand, setRunningCommand] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getBuildDeskInfo()
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Watch a run the model is still planning.
  useEffect(() => {
    if (run?.status !== "running") return;
    const id = run.id;
    const timer = setInterval(() => {
      getBuildRun({ data: { id } })
        .then((next) => {
          if (next) setRun(next);
        })
        .catch(() => undefined);
    }, 1200);
    return () => clearInterval(timer);
  }, [run?.id, run?.status]);

  const lines: Line[] = [...(run?.steps ?? []), ...terminal].sort((left, right) =>
    left.at.localeCompare(right.at),
  );

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines.length]);

  async function onStart() {
    const request = brief.trim();
    if (request.length < 12 || starting) return;
    setStarting(true);
    try {
      const result = await startBuildRun({ data: { brief: request } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRun(result.run);
      setBrief("");
      setTerminal([]);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The run could not start.");
    } finally {
      setStarting(false);
    }
  }

  async function onCommand() {
    const name = command.trim().toLowerCase();
    if (!name || runningCommand) return;
    setRunningCommand(true);
    const started = new Date().toISOString();
    setTerminal((prev) => [...prev, { at: started, kind: "command", text: `$ ${name}` }]);
    try {
      const result = await runBuildCommand({ data: { name } });
      setTerminal((prev) => [
        ...prev,
        {
          at: new Date().toISOString(),
          kind: "output",
          text: result.output,
        },
      ]);
      if (!result.ok) toast.error(`${result.command} exited non-zero.`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The command could not run.";
      setTerminal((prev) => [...prev, { at: new Date().toISOString(), kind: "error", text: message }]);
      toast.error(message);
    } finally {
      setRunningCommand(false);
    }
  }

  async function onApply() {
    if (!run || run.status !== "ready" || applying) return;
    setApplying(true);
    try {
      const next = await applyBuildRun({ data: { id: run.id } });
      if (!next) {
        toast.error("That run is no longer in memory.");
        return;
      }
      setRun(next);
      if (next.status === "applied") {
        toast.success("Applied. Typecheck and lint passed.");
      } else if (next.status === "reverted") {
        toast.error("The check failed, so every file was put back.");
      } else {
        toast.error("The change could not be applied.");
      }
      await router.invalidate();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The change could not be applied.");
    } finally {
      setApplying(false);
    }
  }

  const status = run ? STATUS[run.status] : null;
  const commands = info?.commands ?? [];

  return (
    <div className="enter-up mx-auto max-w-6xl">
      <PageHeader
        kicker="Build desk"
        title="Change the app from inside it."
        description="Write the change you want. The desk reads the source, plans one step at a time, and shows every step in the terminal. Nothing is written until you apply it — and an apply is only done when typecheck and lint pass."
        action={status ? <Badge variant={status.variant}>{status.label}</Badge> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-4">
          <Card>
            <Label htmlFor="build-brief">Change request</Label>
            <Textarea
              id="build-brief"
              className="mt-2"
              rows={4}
              value={brief}
              placeholder="Add a rates note to the help page explaining that quotes are only valid for 30 days."
              onChange={(event) => setBrief(event.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-subtle">
                {info?.model ? `Model: ${info.model}` : "Reading the model…"}
              </p>
              <Button
                type="button"
                onClick={() => void onStart()}
                disabled={starting || brief.trim().length < 12 || !info?.model}
              >
                {starting ? "Starting…" : "Plan the change"}
              </Button>
            </div>
            {info && !info.model ? (
              <p className="mt-2 text-xs text-danger">
                No reasoning model is configured, so the desk cannot plan a change. The terminal
                checks below still work.
              </p>
            ) : null}
          </Card>

          <Card>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="terminal-command">Terminal</Label>
                <Input
                  id="terminal-command"
                  className="mt-2 font-mono text-xs"
                  value={command}
                  list="build-commands"
                  onChange={(event) => setCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void onCommand();
                  }}
                />
                <datalist id="build-commands">
                  {commands.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.label}
                    </option>
                  ))}
                </datalist>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onCommand()}
                disabled={runningCommand}
              >
                {runningCommand ? "Running…" : "Run"}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {commands.map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  onClick={() => setCommand(entry.name)}
                  className="rounded-full bg-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-accent"
                >
                  {entry.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-subtle">
              A fixed list of read-only and verification commands. The desk never runs arbitrary
              shell.
            </p>
          </Card>

          {run?.edits.length ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-xl">Proposed edits</h2>
                <Badge>{run.edits.length} file{run.edits.length === 1 ? "" : "s"}</Badge>
              </div>
              <ul className="mt-3 space-y-2">
                {run.edits.map((edit) => (
                  <li key={edit.id} className="rounded-lg bg-raised/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-all font-mono text-[11px] text-fg">{edit.path}</p>
                      <Badge
                        variant={
                          edit.status === "applied"
                            ? "ok"
                            : edit.status === "proposed"
                              ? "warn"
                              : "danger"
                        }
                      >
                        {edit.status}
                      </Badge>
                    </div>
                    {edit.note ? <p className="mt-1 text-xs text-muted">{edit.note}</p> : null}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-accent">
                        Show the exact change
                      </summary>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-danger">
{`- ${edit.find}`}
                      </pre>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ok">
{`+ ${edit.replace}`}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => void onApply()}
                  disabled={run.status !== "ready" || applying}
                >
                  {applying ? "Applying and checking…" : "Apply and verify"}
                </Button>
                <span className="text-[11px] text-subtle">
                  Writes the files, then runs typecheck and lint. On a failure every file is put
                  back.
                </span>
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card className="p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Terminal
              </span>
              <span className="font-mono text-[10px] text-subtle">/workspace</span>
            </div>
            <div
              ref={logRef}
              aria-live="polite"
              className="h-80 overflow-y-auto bg-black/50 p-3 font-mono text-[11px] leading-relaxed sm:h-96"
            >
              {lines.length === 0 ? (
                <p className="text-subtle">
                  Waiting. Ask for a change, or run a check — every step lands here.
                </p>
              ) : (
                <ol className="space-y-1">
                  {lines.map((line, index) => (
                    <li key={`${line.at}-${index}`} className="flex gap-2">
                      <span className="shrink-0 text-subtle">{clock(line.at)}</span>
                      <span className={cn("whitespace-pre-wrap break-words", LINE_TONE[line.kind])}>
                        {line.text}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>

          {run?.check ? (
            <Card>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-serif text-xl">Last check</h2>
                <Badge variant={run.check.ok ? "ok" : "danger"}>
                  {run.check.ok ? "passed" : "failed"}
                </Badge>
              </div>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted">
                {run.check.output}
              </pre>
            </Card>
          ) : null}

          <Card>
            <h2 className="font-serif text-xl">This session</h2>
            {info?.runs.length ? (
              <ul className="mt-3 space-y-2">
                {info.runs.slice(0, 6).map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        getBuildRun({ data: { id: entry.id } })
                          .then((next) => {
                            if (next) setRun(next);
                          })
                          .catch(() => toast.error("That run is no longer in memory."))
                      }
                      className="min-w-0 text-left text-xs text-muted hover:text-accent"
                    >
                      <span className="line-clamp-2">{entry.brief}</span>
                    </button>
                    <Badge variant={STATUS[entry.status].variant}>{STATUS[entry.status].label}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No run yet.</p>
            )}
            <p className="mt-3 text-[11px] text-subtle">
              Runs live in this server process. A restart clears the list; applied files stay.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
