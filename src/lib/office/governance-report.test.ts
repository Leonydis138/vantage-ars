import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { monthInterval } from "./governance-report.ts";

describe("monthly governance report intervals", () => {
  it("returns a half-open UTC interval for a calendar month", () => {
    const interval = monthInterval("2025-11");
    assert.equal(interval.month, "2025-11");
    assert.equal(interval.start.toISOString(), "2025-11-01T00:00:00.000Z");
    assert.equal(interval.end.toISOString(), "2025-12-01T00:00:00.000Z");
  });

  it("uses the next month boundary for leap February", () => {
    const interval = monthInterval("2024-02");
    assert.equal(interval.start.toISOString(), "2024-02-01T00:00:00.000Z");
    assert.equal(interval.end.toISOString(), "2024-03-01T00:00:00.000Z");
  });

  it("rejects malformed or out-of-range months", () => {
    for (const month of ["2025-2", "2025-13", "2025-00", "2025-01-01", "0999-12", "9999-01"]) {
      assert.throws(() => monthInterval(month), /Month/);
    }
  });
});
