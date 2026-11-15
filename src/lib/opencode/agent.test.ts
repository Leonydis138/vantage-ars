import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canEdit, describeAction, parseAction, safeRepoPath } from "./agent.ts";

describe("safeRepoPath", () => {
  it("accepts source paths and manifests", () => {
    assert.deepEqual(safeRepoPath("src/routes/index.tsx"), { ok: true, path: "src/routes/index.tsx" });
    assert.deepEqual(safeRepoPath("./package.json"), { ok: true, path: "package.json" });
  });

  it("refuses traversal, absolute paths, dependencies and secrets", () => {
    for (const path of [
      "../../etc/passwd",
      "/etc/passwd",
      "C:\\Windows\\system32",
      "node_modules/react/index.js",
      ".git/config",
      ".env",
      "src/.env.local",
      "src/lib/secrets.ts",
      "wrangler.jsonc",
    ]) {
      assert.equal(safeRepoPath(path).ok, false, path);
    }
  });

  it("refuses a directory outside the readable roots", () => {
    assert.equal(safeRepoPath("workers/vantage-ars/index.ts").ok, false);
    assert.equal(safeRepoPath("migrations/001.sql").ok, true);
  });
});

describe("canEdit", () => {
  it("allows textual source only", () => {
    assert.equal(canEdit("src/routes/_app.help.tsx"), true);
    assert.equal(canEdit("src/styles.css"), true);
    assert.equal(canEdit("docs/autonomy.md"), true);
    assert.equal(canEdit("package.json"), false);
    assert.equal(canEdit("src/lib/secrets.ts"), false);
  });
});

describe("parseAction", () => {
  it("reads a fenced JSON action with preamble", () => {
    const action = parseAction('Let me look.\n```json\n{"action":"read","path":"src/routes/index.tsx"}\n```');
    assert.equal(action.action, "read");
  });

  it("clamps read ranges", () => {
    const action = parseAction('{"action":"read","path":"src/routes/index.tsx","from":-4,"lines":9000}');
    assert.equal(action.action, "read");
    if (action.action !== "read") return;
    assert.equal(action.from, 1);
    assert.equal(action.lines, 400);
  });

  it("rejects an edit outside the writable set", () => {
    const action = parseAction('{"action":"edit","path":"package.json","find":"a","replace":"b"}');
    assert.equal(action.action, "invalid");
  });

  it("rejects an edit with no find text", () => {
    const action = parseAction('{"action":"edit","path":"src/routes/index.tsx","find":"  ","replace":"b"}');
    assert.equal(action.action, "invalid");
  });

  it("returns invalid for prose", () => {
    assert.equal(parseAction("I would rather not.").action, "invalid");
    assert.equal(parseAction("").action, "invalid");
  });

  it("caps the done summary", () => {
    const action = parseAction(`{"action":"done","summary":"${"x".repeat(4000)}"}`);
    assert.equal(action.action, "done");
    if (action.action !== "done") return;
    assert.equal(action.summary.length, 1200);
  });
});

describe("describeAction", () => {
  it("names the step in one line", () => {
    assert.equal(describeAction({ action: "edit", path: "a.ts", find: "x", replace: "y", note: "why" }), "edit a.ts — why");
    assert.equal(describeAction({ action: "done", summary: "s" }), "done");
  });
});
