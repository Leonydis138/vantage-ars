import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_IMPORT_ROWS, parseCsvRows, parseInboundCsv } from "./csv-import.ts";

describe("parseCsvRows", () => {
  it("keeps commas, quotes and line breaks inside quoted cells", () => {
    const rows = parseCsvRows('company,notes\r\n"Acme, Ltd","Line one\nLine two ""quoted"""\r\n');
    assert.deepEqual(rows, [
      ["company", "notes"],
      ["Acme, Ltd", 'Line one\nLine two "quoted"'],
    ]);
  });

  it("drops blank lines and a byte-order mark", () => {
    const rows = parseCsvRows("\uFEFFa,b\n\n1,2\n");
    assert.deepEqual(rows, [
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseInboundCsv", () => {
  it("maps ordinary export headers onto inbound fields", () => {
    const result = parseInboundCsv(
      [
        "Organisation,Title,Details,Source,Category",
        "Acme Ltd,New handset quote,Three phones needed,email,sales",
        "Beta CC,Line fault,,phone,support",
      ].join("\n"),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows[0], {
      companyName: "Acme Ltd",
      subject: "New handset quote",
      summary: "Three phones needed",
      channel: "email",
      intent: "sales",
    });
    // A missing summary falls back to the subject, and missing metadata to defaults.
    assert.equal(result.rows[1].summary, "Line fault");
    assert.equal(result.rows[1].channel, "phone");
  });

  it("defaults channel and intent when the file has no such columns", () => {
    const result = parseInboundCsv("company,subject\nAcme,Hello");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows[0].channel, "import");
    assert.equal(result.rows[0].intent, "unclassified");
  });

  it("counts rows it cannot file instead of inventing data", () => {
    const result = parseInboundCsv("company,subject\n,Missing company\nAcme,Real");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, 1);
    assert.equal(result.skipped, 1);
  });

  it("refuses a file without the columns it needs", () => {
    const result = parseInboundCsv("contact,notes\na@b.co,hello");
    assert.equal(result.ok, false);
  });

  it("stops at the import ceiling and reports the remainder", () => {
    const lines = ["company,subject"];
    for (let index = 0; index < MAX_IMPORT_ROWS + 3; index += 1) {
      lines.push(`Company ${index},Subject ${index}`);
    }
    const result = parseInboundCsv(lines.join("\n"));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, MAX_IMPORT_ROWS);
    assert.equal(result.truncated, 3);
  });

  it("refuses a header-only file", () => {
    assert.equal(parseInboundCsv("company,subject").ok, false);
  });
});
