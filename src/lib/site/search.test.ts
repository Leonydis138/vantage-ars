import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SEARCH_INDEX, searchSite } from "./search.ts";
import { SERVICE_PAGES } from "./services.ts";

describe("public site search", () => {
  it("finds the VoIP service by name and by symptom", () => {
    assert.equal(
      searchSite("voip").some((item) => item.href === "/services/voip"),
      true,
    );
    assert.equal(
      searchSite("one-way audio").some((item) => item.href === "/services/voip"),
      true,
    );
  });

  it("finds cloud, security and backup services", () => {
    for (const slug of ["cloud-email", "security", "backup-recovery"]) {
      assert.equal(
        searchSite(slug.replace("-", " ")).some((item) => item.href === `/services/${slug}`),
        true,
        `${slug} is not searchable`,
      );
    }
  });

  it("indexes every published service page", () => {
    for (const page of SERVICE_PAGES) {
      assert.equal(
        SEARCH_INDEX.some((item) => item.id === `service-${page.slug}`),
        true,
        `${page.slug} is missing from the search index`,
      );
    }
  });

  it("finds a published rate", () => {
    const results = searchSite("managed support");
    assert.equal(
      results.some((item) => item.kind === "rate" && item.title === "Managed support plan"),
      true,
    );
  });

  it("finds a guide by its subject", () => {
    assert.equal(
      searchSite("one-way audio").some((item) => item.kind === "guide"),
      true,
    );
    assert.equal(
      searchSite("rollback").some((item) => item.href === "/guides/change-without-rollback"),
      true,
    );
  });

  it("finds the service finder from a natural phrase", () => {
    assert.equal(
      searchSite("which service").some((item) => item.href === "/find"),
      true,
    );
  });

  it("finds the IT readiness assessment", () => {
    assert.equal(
      searchSite("IT readiness").some((item) => item.href === "/assess"),
      true,
    );
  });

  it("finds the AI automation opportunity assessment", () => {
    assert.equal(
      searchSite("AI workflow automation").some((item) => item.href === "/automation"),
      true,
    );
  });

  it("finds the browser network-path diagnostic", () => {
    assert.equal(
      searchSite("STUN NAT").some((item) => item.href === "/tools/network-path"),
      true,
    );
  });

  it("finds an answer and a fixed page", () => {
    assert.equal(searchSite("vat").length > 0, true);
    assert.equal(
      searchSite("privacy").some((item) => item.href === "/privacy"),
      true,
    );
  });

  it("finds hyphenated terms however they are typed", () => {
    for (const query of ["wifi", "wi-fi", "Wi Fi", "WIFI"]) {
      assert.equal(
        searchSite(query).some((item) => item.href === "/services/networking"),
        true,
        `"${query}" did not find the networking service`,
      );
      assert.equal(
        searchSite(query).some((item) => item.kind === "guide"),
        true,
        `"${query}" did not find the Wi-Fi guide`,
      );
    }
  });

  it("does not match a short word inside a longer one", () => {
    assert.deepEqual(searchSite("lan"), []);
  });

  it("matches regardless of case and punctuation", () => {
    const plain = searchSite("backup review");
    const noisy = searchSite("  BACKUP, review!  ");
    assert.deepEqual(
      noisy.map((item) => item.id),
      plain.map((item) => item.id),
    );
  });

  it("requires every word to match", () => {
    assert.deepEqual(searchSite("voip quantum"), []);
  });

  it("returns nothing for an empty or punctuation-only query", () => {
    assert.deepEqual(searchSite(""), []);
    assert.deepEqual(searchSite("   ?!  "), []);
  });

  it("never returns more than the limit", () => {
    assert.equal(searchSite("the", 3).length <= 3, true);
  });

  it("only links to public paths", () => {
    for (const item of SEARCH_INDEX) {
      assert.equal(item.href.startsWith("/"), true, `${item.id} has a non-local link`);
      assert.equal(item.href.startsWith("/office"), false, `${item.id} links into the office`);
    }
  });
});
