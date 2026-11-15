/**
 * The build desk: an in-app coding agent with a real terminal.
 *
 * The founder writes a change request. A model plans it one bounded action at a
 * time (list, read, search, edit); every step is streamed to the terminal. Edits
 * are proposals until the founder applies them — and an apply is only "done"
 * when typecheck and lint pass. If they do not, the files are put back exactly
 * as they were and the run says so.
 *
 * The desk never runs arbitrary shell: the terminal offers a fixed list of
 * read-only and verification commands.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { resolveModelTarget } from "@/lib/office/ai-provider";
import { appendAudit } from "@/lib/office/store.server";
import { BUILD_SYSTEM_PROMPT, describeAction, parseAction, safeRepoPath } from "./agent";
import type { RunView, Step, StepKind } from "./types";

const run = promisify(execFile);
const ROOT = process.cwd();
const MAX_STEPS = 10;
const MAX_OBSERVATION = 6000;
const HISTORY = 12;

type Run = RunView & { origins: Map<string, string> };

const runs = new Map<string, Run>();

function push(target: Run, kind: StepKind, text: string): void {
  target.steps.push({ at: new Date().toISOString(), kind, text: text.slice(0, 4000) });
  target.updatedAt = new Date().toISOString();
}

function view(target: Run): RunView {
  const { origins: _origins, ...rest } = target;
  return { ...rest, steps: [...rest.steps], edits: [...rest.edits] };
}

function remember(target: Run): void {
  runs.set(target.id, target);
  while (runs.size > HISTORY) {
    const oldest = [...runs.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    )[0];
    if (oldest) runs.delete(oldest.id);
  }
}

export function readRun(id: string): RunView | null {
  const target = runs.get(id);
  return target ? view(target) : null;
}

export function listRuns(): RunView[] {
  return [...runs.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(view);
}

// ── Reading the workspace ────────────────────────────────────────────────────

async function listDirectory(relative: string): Promise<string> {
  const entries = await fs.readdir(path.join(ROOT, relative), { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .slice(0, 120)
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${relative}/${entry.name}`)
    .join("\n");
}

async function readFile(relative: string, from = 1, lines = 160): Promise<string> {
  const full = path.join(ROOT, relative);
  const stat = await fs.stat(full);
  if (stat.size > 400_000) return `${relative} is too large to read (${stat.size} bytes).`;
  const content = await fs.readFile(full, "utf8");
  return content.split("\n").slice(from - 1, from - 1 + lines).join("\n").slice(0, MAX_OBSERVATION);
}

async function searchSource(query: string, glob: string): Promise<string> {
  const root = safeRepoPath(glob);
  const base = root.ok ? root.path : "src";
  const needle = query.toLowerCase();
  const hits: string[] = [];
  async function walk(relative: string): Promise<void> {
    if (hits.length >= 40) return;
    const entries = await fs.readdir(path.join(ROOT, relative), { withFileTypes: true });
    for (const entry of entries) {
      if (hits.length >= 40) return;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const next = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(next);
        continue;
      }
      if (!/\.(ts|tsx|css|md)$/.test(entry.name)) continue;
      const content = await fs.readFile(path.join(ROOT, next), "utf8").catch(() => "");
      if (!content.toLowerCase().includes(needle)) continue;
      content.split("\n").forEach((line, index) => {
        if (hits.length < 40 && line.toLowerCase().includes(needle)) {
          hits.push(`${next}:${index + 1}: ${line.trim().slice(0, 160)}`);
        }
      });
    }
  }
  await walk(base);
  return hits.length ? hits.join("\n") : `No match for “${query}” under ${base}.`;
}

// ── The model ────────────────────────────────────────────────────────────────

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function contentOf(payload: unknown): string {
  const data = payload as {
    choices?: { message?: { content?: unknown } }[];
    result?: { response?: unknown };
  };
  const choice = data?.choices?.[0]?.message?.content;
  if (typeof choice === "string") return choice;
  if (Array.isArray(choice)) {
    return choice
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
      .join("");
  }
  const fallback = data?.result?.response;
  return typeof fallback === "string" ? fallback : "";
}

async function askModel(messages: ChatMessage[]): Promise<string> {
  const target = resolveModelTarget(process.env);
  if (!target) throw new Error("No reasoning model is configured for this environment.");
  const response = await fetch(target.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.key}` },
    body: JSON.stringify({
      model: target.model,
      messages,
      temperature: 0.2,
      max_tokens: 1200,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`The model answered ${response.status}. ${detail.slice(0, 300)}`);
  }
  return contentOf(await response.json());
}

// ── The run ──────────────────────────────────────────────────────────────────

function startStep(runId: string, brief: string): Run {
  const now = new Date().toISOString();
  const target: Run = {
    id: runId,
    brief,
    status: "running",
    steps: [],
    edits: [],
    summary: null,
    check: null,
    createdAt: now,
    updatedAt: now,
    origins: new Map(),
  };
  push(target, "request", brief);
  remember(target);
  return target;
}

async function drive(target: Run): Promise<void> {
  const messages: ChatMessage[] = [
    { role: "system", content: BUILD_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "CHANGE_REQUEST:",
        target.brief,
        "",
        "Begin with a list or read action. Files live under src/, public/, docs/, scripts/ and migrations/.",
      ].join("\n"),
    },
  ];

  let misses = 0;
  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const answer = await askModel(messages);
      const action = parseAction(answer);
      push(target, "tool", describeAction(action));

      if (action.action === "invalid") {
        misses += 1;
        push(target, "error", action.error);
        if (misses >= 3) throw new Error("The model kept returning actions the desk will not run.");
        messages.push({ role: "assistant", content: answer.slice(0, 4000) });
        messages.push({
          role: "user",
          content: `OBSERVATION: ${action.error} Reply with one valid JSON action.`,
        });
        continue;
      }

      if (action.action === "done") {
        push(target, "note", action.summary);
        target.summary = action.summary;
        target.status = target.edits.length ? "ready" : "failed";
        if (!target.edits.length) {
          push(target, "error", "The desk finished without proposing an edit.");
        }
        remember(target);
        return;
      }

      if (action.action === "edit") {
        const file = path.join(ROOT, action.path);
        const current = await fs.readFile(file, "utf8");
        const occurrences = current.split(action.find).length - 1;
        if (occurrences !== 1) {
          push(
            target,
            "error",
            `${action.path}: that text appears ${occurrences} time${occurrences === 1 ? "" : "s"}, so the edit was not recorded.`,
          );
          messages.push({ role: "assistant", content: answer.slice(0, 4000) });
          messages.push({
            role: "user",
            content: `OBSERVATION: the find text appears ${occurrences} times in ${action.path}. Read it again and quote text that exists exactly once.`,
          });
          continue;
        }
        target.edits.push({
          id: randomUUID(),
          path: action.path,
          note: action.note ?? "",
          find: action.find,
          replace: action.replace,
          status: "proposed",
        });
        push(target, "edit", `${action.path} — ${action.note || "edit recorded"}`);
        messages.push({ role: "assistant", content: answer.slice(0, 4000) });
        messages.push({
          role: "user",
          content: `OBSERVATION: edit recorded for ${action.path}. Continue, or reply with done.`,
        });
        remember(target);
        continue;
      }

      // Read-only tools.
      let observation = "";
      try {
        if (action.action === "list") observation = await listDirectory(action.path);
        else if (action.action === "read")
          observation = await readFile(action.path, action.from, action.lines);
        else observation = await searchSource(action.query, action.glob ?? "src");
      } catch (reason) {
        observation = reason instanceof Error ? reason.message : "That read failed.";
        push(target, "error", observation);
      }
      messages.push({ role: "assistant", content: answer.slice(0, 4000) });
      messages.push({
        role: "user",
        content: `OBSERVATION (${describeAction(action)}):\n${observation.slice(0, MAX_OBSERVATION)}`,
      });
      remember(target);
    }

    push(target, "note", `Stopped at the ${MAX_STEPS}-action ceiling.`);
    target.status = target.edits.length ? "ready" : "failed";
    if (!target.edits.length) push(target, "error", "No edit was proposed within the ceiling.");
    remember(target);
  } catch (reason) {
    target.status = "failed";
    push(target, "error", reason instanceof Error ? reason.message : "The run stopped unexpectedly.");
    remember(target);
  }
}

export function startRun(brief: string): RunView {
  const target = startStep(randomUUID(), brief.trim().slice(0, 2000));
  void drive(target);
  return view(target);
}

// ── Applying an approved change ──────────────────────────────────────────────

async function check(outputs: string[]): Promise<void> {
  for (const script of outputs) {
    await run("npm", ["run", script, "--silent"], {
      cwd: ROOT,
      timeout: 240_000,
      maxBuffer: 4_000_000,
    });
  }
}

export async function applyRun(id: string): Promise<RunView | null> {
  const target = runs.get(id);
  if (!target) return null;
  if (target.status !== "ready") {
    push(target, "error", "Only a run with proposed edits can be applied.");
    return view(target);
  }
  const proposed = target.edits.filter((edit) => edit.status === "proposed");
  if (!proposed.length) {
    push(target, "error", "There is nothing to apply.");
    return view(target);
  }

  // Validate every edit before writing anything.
  const originals = new Map<string, string>();
  const pending: { path: string; next: string }[] = [];
  for (const edit of proposed) {
    const file = path.join(ROOT, edit.path);
    const current = originals.get(edit.path) ?? (await fs.readFile(file, "utf8"));
    originals.set(edit.path, current);
    const base = pending.find((item) => item.path === edit.path)?.next ?? current;
    const occurrences = base.split(edit.find).length - 1;
    if (occurrences !== 1) {
      edit.status = "failed";
      push(
        target,
        "error",
        `${edit.path}: the text to replace appears ${occurrences} times now. Nothing was written.`,
      );
      target.status = "failed";
      return view(target);
    }
    const next = base.replace(edit.find, edit.replace);
    const existing = pending.find((item) => item.path === edit.path);
    if (existing) existing.next = next;
    else pending.push({ path: edit.path, next });
  }

  target.status = "running";
  push(target, "apply", `Writing ${pending.length} file${pending.length === 1 ? "" : "s"}…`);

  try {
    for (const item of pending) {
      await fs.writeFile(path.join(ROOT, item.path), item.next, "utf8");
    }
    for (const edit of proposed) edit.status = "applied";
    push(target, "check", "Running typecheck and lint…");

    let output = "";
    try {
      await check(["typecheck", "lint"]);
      target.check = { ok: true, output: "typecheck and lint passed." };
      target.status = "applied";
      push(target, "check", "typecheck and lint passed.");
      await appendAudit(
        "build_applied",
        target.brief.slice(0, 140),
        `Build desk applied ${pending.map((item) => item.path).join(", ")}; typecheck and lint passed.`,
        "build-desk",
      ).catch(() => undefined);
    } catch (reason) {
      const failure = reason as { stdout?: string; stderr?: string };
      output = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`.trim().slice(0, 4000);
      for (const [file, content] of originals) {
        await fs.writeFile(path.join(ROOT, file), content, "utf8").catch(() => undefined);
      }
      for (const edit of proposed) edit.status = "reverted";
      target.status = "reverted";
      target.check = { ok: false, output: output || "The check failed." };
      push(target, "error", "The check failed, so every file was put back.");
      if (output) push(target, "check", output);
    }
    return view(target);
  } finally {
    remember(target);
  }
}

// ── The terminal ─────────────────────────────────────────────────────────────

const COMMANDS: Record<
  string,
  { label: string; argv: [string, string[]]; timeout: number }
> = {
  status: { label: "git status", argv: ["git", ["status", "--short"]], timeout: 20_000 },
  diff: { label: "git diff --stat", argv: ["git", ["diff", "--stat"]], timeout: 20_000 },
  log: { label: "git log", argv: ["git", ["log", "--oneline", "-8"]], timeout: 20_000 },
  typecheck: { label: "npm run typecheck", argv: ["npm", ["run", "typecheck", "--silent"]], timeout: 240_000 },
  lint: { label: "npm run lint", argv: ["npm", ["run", "lint", "--silent"]], timeout: 240_000 },
};

export function commandNames(): { name: string; label: string }[] {
  return Object.entries(COMMANDS).map(([name, command]) => ({ name, label: command.label }));
}

export async function runCommand(
  name: string,
): Promise<{ ok: boolean; command: string; output: string }> {
  const command = COMMANDS[name];
  if (!command) {
    return {
      ok: false,
      command: name,
      output: `Unknown command. Try one of: ${Object.keys(COMMANDS).join(", ")}.`,
    };
  }
  try {
    const result = await run(command.argv[0], command.argv[1], {
      cwd: ROOT,
      timeout: command.timeout,
      maxBuffer: 4_000_000,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    return { ok: true, command: command.label, output: output || "No output." };
  } catch (reason) {
    const failure = reason as { stdout?: string; stderr?: string; message?: string };
    const output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim();
    return {
      ok: false,
      command: command.label,
      output: output || failure.message || "The command failed.",
    };
  }
}
