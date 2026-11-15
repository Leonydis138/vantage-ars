/**
 * The build desk's agent protocol.
 *
 * The model never touches the filesystem directly. It asks for one bounded
 * action at a time — list, read, search or a find/replace edit — and the runner
 * decides what is safe. This module is the part that can be decided from data:
 * reading the model's answer, and deciding which paths may be read or written.
 */

export type OpenCodeAction =
  | { action: "list"; path: string }
  | { action: "read"; path: string; from?: number; lines?: number }
  | { action: "search"; query: string; glob?: string }
  | { action: "edit"; path: string; find: string; replace: string; note?: string }
  | { action: "done"; summary: string }
  | { action: "invalid"; error: string };

export type EditProposal = {
  path: string;
  find: string;
  replace: string;
  note: string;
};

/** Directories the desk may read. Everything else is out of bounds. */
const READABLE_ROOTS = ["src/", "public/", "docs/", "scripts/", "migrations/"];

/** Directories that may be listed on their own. */
const DIRECTORY_ROOTS = new Set(["src", "public", "docs", "scripts", "migrations"]);

/** Root-level files the desk may read (manifests and notes, never secrets). */
const READABLE_ROOT_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "README.md",
  "README.DEV.md",
  "Agents.md",
  "CHANGELOG.md",
]);

/** Only source it is safe to rewrite with a textual edit. */
const WRITABLE = /\.(ts|tsx|css|md)$/;

/**
 * Normalise a path the model asked for.
 *
 * Rejects absolute paths, traversal, dotfiles, dependency and git directories,
 * and anything that looks like an environment or secret file.
 */
export function safeRepoPath(raw: string): { ok: true; path: string } | { ok: false; error: string } {
  const cleaned = String(raw ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
  if (!cleaned) return { ok: false, error: "A path is required." };
  if (cleaned.length > 240) return { ok: false, error: "That path is too long." };
  if (cleaned.startsWith("/") || /^[a-zA-Z]:/.test(cleaned)) {
    return { ok: false, error: "Use a path relative to the repository root." };
  }
  const segments = cleaned.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment.startsWith("."))) {
    return { ok: false, error: "Dotfiles and parent directories are out of bounds." };
  }
  if (segments.includes("node_modules") || segments.includes(".git")) {
    return { ok: false, error: "Dependencies and git internals are out of bounds." };
  }
  if (/(^|\/)(\.env|\.base44|secrets?)(\.|$|\/)/i.test(cleaned)) {
    return { ok: false, error: "Secret and environment files are out of bounds." };
  }
  if (segments.length === 1) {
    if (DIRECTORY_ROOTS.has(segments[0])) return { ok: true, path: segments[0] };
    if (!READABLE_ROOT_FILES.has(segments[0])) {
      return { ok: false, error: `${segments[0]} is not on the readable list.` };
    }
    return { ok: true, path: segments[0] };
  }
  if (!READABLE_ROOTS.some((root) => cleaned.startsWith(root))) {
    return { ok: false, error: "The desk reads only src, public, docs, scripts and migrations." };
  }
  return { ok: true, path: segments.join("/") };
}

/** A file the desk may rewrite: a textual source file inside the readable roots. */
export function canEdit(path: string): boolean {
  return safeRepoPath(path).ok && WRITABLE.test(path);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Read one action out of the model's answer, tolerating fences and preamble. */
export function parseAction(raw: string): OpenCodeAction {
  const body = String(raw ?? "");
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? body;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { action: "invalid", error: "The model did not return a JSON action." };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return { action: "invalid", error: "The model returned malformed JSON." };
  }

  const action = text(parsed.action).trim().toLowerCase();
  switch (action) {
    case "list": {
      const path = safeRepoPath(text(parsed.path) || "src");
      if (!path.ok) return { action: "invalid", error: path.error };
      return { action: "list", path: path.path };
    }
    case "read": {
      const path = safeRepoPath(text(parsed.path));
      if (!path.ok) return { action: "invalid", error: path.error };
      return {
        action: "read",
        path: path.path,
        from: clampInt(parsed.from, 1, 20000, 1),
        lines: clampInt(parsed.lines, 1, 400, 160),
      };
    }
    case "search": {
      const query = text(parsed.query).trim();
      if (query.length < 2) return { action: "invalid", error: "A search needs a term." };
      return { action: "search", query: query.slice(0, 120), glob: text(parsed.glob).trim() || "src" };
    }
    case "edit": {
      const path = safeRepoPath(text(parsed.path));
      if (!path.ok) return { action: "invalid", error: path.error };
      if (!canEdit(path.path)) {
        return { action: "invalid", error: `${path.path} is not a file the desk may edit.` };
      }
      const find = text(parsed.find);
      const replace = text(parsed.replace);
      if (!find.trim()) return { action: "invalid", error: "An edit needs the exact text to replace." };
      if (find.length > 4000 || replace.length > 6000) {
        return { action: "invalid", error: "That edit is too large; make it smaller." };
      }
      return {
        action: "edit",
        path: path.path,
        find,
        replace,
        note: text(parsed.note).slice(0, 300),
      };
    }
    case "done":
      return { action: "done", summary: text(parsed.summary).slice(0, 1200) };
    default:
      return { action: "invalid", error: `Unknown action “${action || "none"}”.` };
  }
}

/** The short line the terminal shows for an action. */
export function describeAction(action: OpenCodeAction): string {
  switch (action.action) {
    case "list":
      return `list ${action.path}`;
    case "read":
      return `read ${action.path} (from ${action.from ?? 1})`;
    case "search":
      return `search “${action.query}” in ${action.glob ?? "src"}`;
    case "edit":
      return `edit ${action.path}${action.note ? ` — ${action.note}` : ""}`;
    case "done":
      return "done";
    default:
      return `rejected: ${action.error}`;
  }
}

/** The model's own instructions. Kept beside the protocol so they cannot drift. */
export const BUILD_SYSTEM_PROMPT = `You are the build desk inside Vantage-ARS, a TanStack Start + Postgres app whose founder is asking for a change.

Rules you cannot break:
- Make the smallest change that satisfies the request. Never rewrite a file you have not read.
- Stay inside the existing design language and the repo's own conventions (src/routes, src/components, src/lib).
- Do not add dependencies. Do not touch the database schema unless the request is exactly that.
- Do not invent customers, money, metrics or completed work.
- Never claim a change works; the desk verifies with typecheck and lint after you finish.
- Work one action at a time so the founder can watch.

Reply with exactly one JSON object, no markdown:
{"action":"list","path":"src/routes"}
{"action":"read","path":"src/routes/index.tsx","from":1,"lines":120}
{"action":"search","query":"useWorkspacePreferences","glob":"src"}
{"action":"edit","path":"src/routes/_app.help.tsx","find":"exact existing text","replace":"replacement text","note":"why"}
{"action":"done","summary":"what changed and what to check"}

"find" must be text that exists exactly once in the file. Prefer several small edits over one huge one.`;
