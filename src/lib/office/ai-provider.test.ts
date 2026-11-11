import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveModelTarget } from "./ai-provider.ts";

const ACCOUNT = "0123456789abcdef0123456789abcdef";

describe("model provider", () => {
  it("prefers Cloudflare Workers AI when account and token are set", () => {
    const t = resolveModelTarget({
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
      CLOUDFLARE_API_TOKEN: "tok",
      XAI_API_KEY: "x",
    });
    assert.equal(t?.provider, "workers-ai");
    assert.equal(
      t?.url,
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`,
    );
    assert.equal(t?.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  });
  it("lets AI_PROVIDER=xai override", () => {
    const t = resolveModelTarget({
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
      CLOUDFLARE_API_TOKEN: "tok",
      XAI_API_KEY: "x",
      AI_PROVIDER: "xai",
    });
    assert.equal(t?.provider, "xai");
  });
  it("falls back to xAI, and to nothing when no keys are set", () => {
    assert.equal(resolveModelTarget({ XAI_API_KEY: "x" })?.provider, "xai");
    assert.equal(resolveModelTarget({}), null);
  });
  it("honours the configured xAI model", () => {
    const t = resolveModelTarget({ XAI_API_KEY: "x", XAI_MODEL: "grok-custom" });
    assert.equal(t?.model, "grok-custom");
  });
  it("ignores a malformed account id rather than building a bad URL", () => {
    assert.equal(
      resolveModelTarget({ CLOUDFLARE_ACCOUNT_ID: "../evil", CLOUDFLARE_API_TOKEN: "tok" }),
      null,
    );
  });
  it("honours a model override", () => {
    const t = resolveModelTarget({
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
      CLOUDFLARE_API_TOKEN: "t",
      WORKERS_AI_MODEL: "@cf/x/y",
    });
    assert.equal(t?.model, "@cf/x/y");
  });
  it("uses Hugging Face's OpenAI-compatible router for the selected model", () => {
    const t = resolveModelTarget({
      AI_PROVIDER: "huggingface",
      HUGGINGFACE_MODEL: "Qwen/Qwen2.5-7B-Instruct",
      HUGGINGFACE_API_KEY: "hf_demo",
    });
    assert.equal(t?.provider, "huggingface");
    assert.equal(t?.url, "https://router.huggingface.co/v1/chat/completions");
    assert.equal(t?.model, "Qwen/Qwen2.5-7B-Instruct");
    assert.equal(t?.key, "hf_demo");
  });
  it("defaults to a chat model and accepts HF_TOKEN", () => {
    const t = resolveModelTarget({ HF_TOKEN: "hf_demo" });
    assert.equal(t?.provider, "huggingface");
    assert.equal(t?.model, "Qwen/Qwen2.5-7B-Instruct");
    assert.equal(t?.key, "hf_demo");
  });
  it("does not silently fall back when Hugging Face is explicitly selected without a token", () => {
    const t = resolveModelTarget({
      AI_PROVIDER: "huggingface",
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
      CLOUDFLARE_API_TOKEN: "cf-token",
    });
    assert.equal(t, null);
  });
});
