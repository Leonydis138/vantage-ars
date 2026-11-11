import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  ACCOUNT_RE,
  accountStatus,
  resolveProvider,
  tokenStatus,
  wranglerSecretsCheck,
} from "./cloudflare-check.mjs";

const ACCOUNT = "8501d3eeac693b7ada630058ee5e081a";

describe("cloudflare account id", () => {
  it("accepts the configured 32-hex account id", () => {
    assert.match(ACCOUNT, ACCOUNT_RE);
    assert.equal(accountStatus(ACCOUNT).state, "ok");
  });
  it("rejects missing and malformed ids", () => {
    assert.equal(accountStatus("").state, "missing");
    assert.equal(accountStatus("  ").state, "missing");
    assert.equal(accountStatus("../evil").state, "malformed");
    assert.equal(accountStatus("short").state, "malformed");
  });
  it("never reports token values, only presence", () => {
    assert.equal(tokenStatus("").state, "missing");
    const ok = tokenStatus("super-secret-value");
    assert.equal(ok.state, "ok");
    assert.ok(!ok.detail.includes("super-secret-value"));
  });
});

describe("cloudflare provider resolution", () => {
  it("picks workers-ai when account and token are set", () => {
    const r = resolveProvider({ CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_API_TOKEN: "tok" });
    assert.equal(r.provider, "workers-ai");
    assert.equal(r.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  });
  it("reports none when AI is unwired", () => {
    assert.equal(resolveProvider({}).provider, "none");
    assert.equal(resolveProvider({ CLOUDFLARE_ACCOUNT_ID: ACCOUNT }).provider, "none");
  });
  it("honours the configured xAI model", () => {
    assert.deepEqual(resolveProvider({ XAI_API_KEY: "x", XAI_MODEL: "grok-custom" }), {
      provider: "xai",
      model: "grok-custom",
    });
  });
  it("requires a Hugging Face token and uses the same default model as the app", () => {
    assert.equal(
      resolveProvider({ HUGGINGFACE_MODEL: "Qwen/Qwen2.5-7B-Instruct" }).provider,
      "none",
    );
    assert.deepEqual(resolveProvider({ HF_TOKEN: "hf_demo" }), {
      provider: "huggingface",
      model: "Qwen/Qwen2.5-7B-Instruct",
    });
  });
  it("does not switch providers when Hugging Face is explicitly selected without a token", () => {
    assert.deepEqual(
      resolveProvider({
        AI_PROVIDER: "huggingface",
        CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
        CLOUDFLARE_API_TOKEN: "cf-token",
      }),
      { provider: "none", model: null },
    );
  });
});

describe("wrangler.jsonc secret guard", () => {
  it("holds no secret-bearing keys", () => {
    const root = new URL("..", import.meta.url).pathname;
    assert.equal(wranglerSecretsCheck(root).state, "ok");
  });
  it("would have flagged the previously committed token", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "wrangler-guard-"));
    writeFileSync(
      join(dir, "wrangler.jsonc"),
      '{"vars": {"FOUNDER_SETUP_TOKEN": "J9vR4mX7qL2sW8cN5hT1pK6zB3fD0yG"}}',
    );
    assert.equal(wranglerSecretsCheck(dir).state, "leak");
  });
});
