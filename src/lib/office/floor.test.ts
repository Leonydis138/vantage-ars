import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emailIn, followUpLetter, planFloor, technicalFix } from "./floor.ts";

describe("floor plan", () => {
  it("starts organic marketing, one follow-up, and a technical procedure", () => {
    const tasks = planFloor({
      campaigns: [],
      leads: [
        {
          id: "lead-1",
          companyName: "Harbour",
          stage: "qualified",
          inboundId: "in-1",
          summary: "VoIP quote",
        },
      ],
      inbound: [
        { id: "in-1", companyName: "Harbour", summary: "Email: ada@harbour.example\nNeed a quote" },
      ],
      documents: [],
      tickets: [
        {
          id: "t-1",
          title: "Website fault noted",
          summary: "One-way audio on the handset.",
          status: "open",
          ownerAgent: "forge",
          relatedId: "in-1",
        },
      ],
    });
    assert.deepEqual(
      tasks.map((task) => task.kind),
      ["organic_campaign", "follow_up", "diagnose"],
    );
    const letter = followUpLetter("Harbour");
    assert.equal(letter.includes("not a quote"), true);
    assert.equal(letter.includes("R690"), true);
    assert.match(letter, /managed support plan is offered at R2,750 per month/);
    assert.equal(emailIn("Email: ada@harbour.example\n"), "ada@harbour.example");
    const fix = technicalFix("One-way audio on the handset.");
    assert.equal(fix.includes("SIP ALG"), true);
    assert.equal(fix.includes("not marked fixed"), true);
  });

  it("does not repeat work that is already filed", () => {
    const tasks = planFloor({
      campaigns: [{ status: "active", budgetCents: 0, channel: "owned" }],
      leads: [
        {
          id: "lead-1",
          companyName: "Harbour",
          stage: "qualified",
          inboundId: "in-1",
          summary: "Quote",
        },
      ],
      inbound: [],
      documents: [{ kind: "follow_up", relatedId: "lead-1" }],
      tickets: [
        {
          id: "t-1",
          title: "Deliver",
          summary: "FORGE: already written.",
          status: "in_progress",
          ownerAgent: "forge",
          relatedId: null,
        },
      ],
    });
    assert.deepEqual(tasks, []);
  });

  it("does not draft the same technical plan twice", () => {
    const tasks = planFloor({
      campaigns: [{ status: "active", budgetCents: 0, channel: "owned" }],
      leads: [],
      inbound: [],
      documents: [{ kind: "technical_plan", relatedId: "t-1" }],
      tickets: [
        {
          id: "t-1",
          title: "No dial tone",
          summary: "No dial tone on the trunk.",
          status: "open",
          ownerAgent: "forge",
          relatedId: null,
        },
      ],
    });
    assert.deepEqual(tasks, []);
  });

  it("plans a technical procedure without changing the open ticket", () => {
    const tasks = planFloor({
      campaigns: [{ status: "active", budgetCents: 0, channel: "owned" }],
      leads: [],
      inbound: [],
      documents: [],
      tickets: [
        {
          id: "t-2",
          title: "No dial tone",
          summary: "No dial tone on the trunk.",
          status: "open",
          ownerAgent: "forge",
          relatedId: null,
        },
      ],
    });
    assert.deepEqual(
      tasks.filter((task) => task.kind === "diagnose"),
      [
        {
          kind: "diagnose",
          ticketId: "t-2",
          title: "No dial tone",
          summary: "No dial tone on the trunk.",
        },
      ],
    );
  });
});
