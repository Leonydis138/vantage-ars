import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { breadcrumbJsonLd, businessJsonLd, offerCatalogJsonLd, pageHead } from "../lib/site/seo.ts";
import { COMPANY } from "../lib/office/company.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** Every file-based route must declare the path matching its filename. */
const EXPECTED: Record<string, string> = {
  "index.tsx": '"/"',
  "_app.tsx": '"/_app"',
  "_app.dashboard.tsx": '"/_app/dashboard"',
  "_app.tasks.tsx": '"/_app/tasks"',
  "_app.opencode.tsx": '"/_app/opencode"',
  "_app.analytics.tsx": '"/_app/analytics"',
  "_app.settings.tsx": '"/_app/settings"',
  "_app.profile.tsx": '"/_app/profile"',
  "_app.activity-log.tsx": '"/_app/activity-log"',
  "_app.projects.tsx": '"/_app/projects"',
  "_app.help.tsx": '"/_app/help"',
  "_app.import-data.tsx": '"/_app/import-data"',
  "_app.notifications.tsx": '"/_app/notifications"',
  "find.tsx": '"/find"',
  "assess.tsx": '"/assess"',
  "automation.tsx": '"/automation"',
  "guides.tsx": '"/guides"',
  "guides.$slug.tsx": '"/guides/$slug"',
  "login.tsx": '"/login"',
  "model.tsx": '"/model"',
  "office.tsx": '"/office"',
  "privacy.tsx": '"/privacy"',
  "q.$token.tsx": '"/q/$token"',
  "rates.tsx": '"/rates"',
  "services.tsx": '"/services"',
  "services.index.tsx": '"/services/"',
  "services.$slug.tsx": '"/services/$slug"',
  "status.tsx": '"/status"',
  "support.tsx": '"/support"',
  "terms.tsx": '"/terms"',
  "tools.email-auth.tsx": '"/tools/email-auth"',
  "tools.network-path.tsx": '"/tools/network-path"',
  "work.tsx": '"/work"',
};

/** Server-only API routes: path must match, and they must stay free of
 * client-bundle violations (no `.server` imports — verified by `npm run build`,
 * asserted structurally here). */
const API_ROUTES: Record<string, string> = {
  "api/auth/$.ts": '"/api/auth/$"',
  "api/cron/floor.ts": '"/api/cron/floor"',
  "api/ai/status.ts": '"/api/ai/status"',
};

describe("route files declare their own path", () => {
  for (const [file, path] of Object.entries(EXPECTED)) {
    it(`${file} declares createFileRoute(${path})`, () => {
      const source = readFileSync(join(here, file), "utf8");
      assert.ok(
        source.includes(`createFileRoute(${path})`),
        `${file} should contain createFileRoute(${path})`,
      );
    });
  }

  it("site-frame exports PublicFrame and declares no route", () => {
    const source = readFileSync(join(here, "../components/public/site-frame.tsx"), "utf8");
    assert.ok(source.includes("export function PublicFrame"));
    assert.ok(!source.includes("createFileRoute"));
  });

  it("does not imply unverified work or active infrastructure automation", () => {
    const work = readFileSync(join(here, "work.tsx"), "utf8");
    const model = readFileSync(join(here, "model.tsx"), "utf8");
    assert.ok(work.includes("No anonymised case notes are published yet."));
    assert.ok(work.includes("present example scenarios as completed work."));
    assert.ok(
      model.includes("Live monitoring and automated fault fixes are not currently offered."),
    );
    assert.ok(!model.includes("without a person in the loop"));
  });

  it("describes the network-path diagnostic without claiming SIP ALG or call-quality testing", () => {
    const tool = readFileSync(join(here, "tools.network-path.tsx"), "utf8");
    assert.ok(tool.includes("does not test SIP ALG, call quality, or packet loss."));
    assert.ok(tool.includes("contacts Google’s STUN service"));
    assert.ok(tool.includes("does not measure call quality, jitter or packet loss."));
  });

  it("ui button exports Button and contains no CSS", () => {
    const source = readFileSync(join(here, "../components/ui/button.tsx"), "utf8");
    assert.ok(source.includes("export { Button"));
    assert.ok(!source.includes("@import"));
  });

  it("pageHead includes social image alt text and canonical URL", () => {
    const { meta, links } = pageHead({
      title: "VoIP, networking & IT infrastructure · Vantage-ARS",
      description: "Worldwide remote VoIP and network support.",
      path: "/services/voip",
      imageAlt: "Vantage-ARS VoIP support preview",
    });

    assert.ok(
      meta.some(
        (item) =>
          item.property === "og:image:alt" && item.content === "Vantage-ARS VoIP support preview",
      ),
    );
    assert.ok(
      meta.some(
        (item) =>
          item.name === "twitter:image:alt" && item.content === "Vantage-ARS VoIP support preview",
      ),
    );
    assert.ok(
      links.some(
        (link) =>
          link.rel === "canonical" && link.href === "https://vantage-ars.co.za/services/voip",
      ),
    );
  });

  it("businessJsonLd includes the public logo for richer schema metadata", () => {
    const json = JSON.parse(String(businessJsonLd().children));
    assert.equal(json.logo, "https://vantage-ars.co.za/favicon.svg");
    assert.equal(json["@type"], "ProfessionalService");
    assert.equal(json.email, "hello@vantage-ars.co.za");
  });

  it("breadcrumbJsonLd numbers the trail from one and uses absolute URLs", () => {
    const json = JSON.parse(
      String(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Rates", path: "/rates" },
        ]).children,
      ),
    );
    assert.equal(json["@type"], "BreadcrumbList");
    assert.deepEqual(
      json.itemListElement.map((item: { position: number; item: string }) => [
        item.position,
        item.item,
      ]),
      [
        [1, "https://vantage-ars.co.za/"],
        [2, "https://vantage-ars.co.za/rates"],
      ],
    );
  });

  it("offerCatalogJsonLd emits only offered lines with a real figure", () => {
    const json = JSON.parse(String(offerCatalogJsonLd().children));
    assert.equal(json["@type"], "OfferCatalog");
    assert.equal(json.numberOfItems, json.itemListElement.length);
    assert.ok(json.itemListElement.length > 0);
    for (const offer of json.itemListElement) {
      assert.equal(offer["@type"], "Offer");
      assert.equal(offer.priceCurrency, "ZAR");
      assert.match(String(offer.price), /^\d+(\.\d+)?$/);
    }
  });

  it("offerCatalogJsonLd narrows to the rate lines a service page shows", () => {
    const json = JSON.parse(
      String(offerCatalogJsonLd({ rateIds: ["remote-support", "managed-support"] }).children),
    );
    assert.equal(json.numberOfItems, 2);
    assert.deepEqual(
      json.itemListElement.map((offer: { name: string }) => offer.name),
      ["Remote technical support", "Managed support plan"],
    );
  });

  it("keeps the package version and the office version in step", () => {
    const pkg = JSON.parse(readFileSync(join(here, "../../package.json"), "utf8")) as {
      version: string;
    };
    assert.equal(COMPANY.version, pkg.version);
  });

  it("publishes a security.txt with a contact, expiry and canonical URL", () => {
    const text = readFileSync(join(here, "../../public/.well-known/security.txt"), "utf8");
    assert.match(text, /^Contact: mailto:/m);
    assert.match(text, /^Expires: \d{4}-\d{2}-\d{2}T/m);
    assert.match(text, /^Canonical: https:\/\/vantage-ars\.co\.za\//m);
  });

  for (const [file, path] of Object.entries(API_ROUTES)) {
    it(`api route ${file} declares its path with server handlers`, () => {
      const source = readFileSync(join(here, file), "utf8");
      assert.ok(source.includes(`createFileRoute(${path})`), `${file} path mismatch`);
      assert.ok(source.includes("server:"), `${file} must use server handlers`);
      assert.ok(source.includes("handlers:"), `${file} must define handlers`);
    });
  }

  it("api routes never import `.server` modules (build would fail)", () => {
    for (const file of Object.keys(API_ROUTES)) {
      const source = readFileSync(join(here, file), "utf8");
      assert.ok(!/\.server["']/.test(source), `${file} must not reference .server modules`);
    }
  });
});
