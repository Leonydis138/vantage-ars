import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACKUP_TABLES, buildBackup, verifyBackup } from "./backup.ts";

const tables = { leads: [{ id: "a", name: "Harbour & Co" }], approvals: [] };

describe("backup", () => {
  it("verifies a file it just built, even after a JSON round trip", () => {
    const file = buildBackup(tables, "2026-10-05T00:00:00.000Z");
    assert.deepEqual(file.rowCounts, { leads: 1, approvals: 0 });
    assert.deepEqual(verifyBackup(JSON.parse(JSON.stringify(file))), { ok: true });
  });
  it("verifies after a round trip when rows carry timestamps", () => {
    // Every office table has timestamptz columns, which PGLite returns as Date
    // objects. A backup that only verified with plain strings never verified a
    // real export.
    const withDates = {
      leads: [{ id: "a", created_at: new Date("2026-10-05T09:30:00.000Z") }],
    };
    const file = buildBackup(withDates);
    const roundTripped = JSON.parse(JSON.stringify(file));
    assert.deepEqual(verifyBackup(roundTripped), { ok: true });
    assert.equal(roundTripped.tables.leads[0].created_at, "2026-10-05T09:30:00.000Z");
  });
  it("detects an edited row", () => {
    const file = JSON.parse(JSON.stringify(buildBackup(tables)));
    file.tables.leads[0].name = "Someone Else";
    assert.equal(verifyBackup(file).ok, false);
  });
  it("detects a changed row count and rejects other formats", () => {
    const file = JSON.parse(JSON.stringify(buildBackup(tables)));
    file.rowCounts.leads = 5;
    assert.equal(verifyBackup(file).ok, false);
    assert.equal(verifyBackup({ format: "other" }).ok, false);
    assert.equal(verifyBackup(null).ok, false);
  });
  it("never exports credential tables", () => {
    for (const name of ["user", "session", "account", "verification"]) {
      assert.equal((BACKUP_TABLES as readonly string[]).includes(name), false);
    }
  });
});

import { planRestore } from "./backup.ts";

describe("restore plan", () => {
  const cols = { leads: ["id", "name"] };
  const file = () =>
    JSON.parse(JSON.stringify(buildBackup({ leads: [{ id: "a", name: "x" }], approvals: [] })));
  it("accepts a verified file whose columns exist", () => {
    const plan = planRestore(file(), cols);
    assert.equal(plan.ok, true);
    if (plan.ok)
      assert.deepEqual(
        plan.tables.map((t) => t.name),
        ["leads"],
      );
  });
  it("refuses tables we do not export, such as credentials", () => {
    const f = buildBackup({ session: [{ id: "a" }] });
    assert.equal(planRestore(JSON.parse(JSON.stringify(f)), { session: ["id"] }).ok, false);
  });
  it("refuses unknown columns and damaged files before any write", () => {
    const f = file();
    f.tables.leads[0].evil = 1;
    f.checksum = buildBackup(f.tables).checksum;
    assert.equal(planRestore(f, cols).ok, false);
    const g = file();
    g.tables.leads[0].name = "changed";
    assert.equal(planRestore(g, cols).ok, false);
  });
});
