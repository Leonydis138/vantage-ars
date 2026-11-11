#!/usr/bin/env node
/**
 * Offline Cloudflare Workers AI setup check for Vantage-ARS.
 *
 * Validates environment wiring WITHOUT network access and WITHOUT printing
 * secrets: account-id shape, token presence (never its value), model default,
 * and which provider `resolveModelTarget()` would pick. Also guards
 * `wrangler.jsonc` against committed secrets (regression test for the leaked
 * FOUNDER_SETUP_TOKEN removed in 4.2.0).
 *
 * Usage:
 *   node scripts/cloudflare-check.mjs            # report, exit 0 always
 *   node scripts/cloudflare-check.mjs --strict   # exit 1 when AI is unusable
 *   npm run cf:check
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ACCOUNT_RE = /^[a-f0-9]{32}$/i;
export const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Quoted key names only (not prose): catches `"CLOUDFLARE_API_TOKEN": ...`
// while ignoring words like "secrets" in comments.
const SECRET_KEY_RE =
  /"[^"]*(API_TOKEN|SETUP_TOKEN|APP_PASSWORD|PRIVATE_KEY|BETTER_AUTH_SECRET)[^"]*"\s*:/gi;

export function accountStatus(value) {
  const v = (value ?? "").trim();
  if (!v) return { state: "missing", detail: "CLOUDFLARE_ACCOUNT_ID is not set." };
  if (!ACCOUNT_RE.test(v))
    return {
      state: "malformed",
      detail: "CLOUDFLARE_ACCOUNT_ID must be 32 hex chars (Dashboard URL segment).",
    };
  return { state: "ok", detail: `Account id shape ok (…${v.slice(-4)}).` };
}

export function tokenStatus(value) {
  const v = (value ?? "").trim();
  if (!v) return { state: "missing", detail: "CLOUDFLARE_API_TOKEN is not set." };
  return { state: "ok", detail: `Token present (${v.length} chars, value hidden).` };
}

export function resolveProvider(env) {
  const account = (env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const token = (env.CLOUDFLARE_API_TOKEN ?? "").trim();
  const xai = (env.XAI_API_KEY ?? "").trim();
  const hfModel = (env.HUGGINGFACE_MODEL ?? "").trim();
  const hfToken = (env.HUGGINGFACE_API_KEY ?? "").trim() || (env.HF_TOKEN ?? "").trim();
  const wanted = (env.AI_PROVIDER ?? "").trim().toLowerCase();

  if (wanted === "xai" && xai) {
    return { provider: "xai", model: (env.XAI_MODEL ?? "").trim() || "grok-4.5" };
  }
  if (wanted === "huggingface" && hfToken) {
    return { provider: "huggingface", model: hfModel || "Qwen/Qwen2.5-7B-Instruct" };
  }
  if (wanted === "huggingface") return { provider: "none", model: null };
  if (wanted !== "xai" && account && token && ACCOUNT_RE.test(account))
    return { provider: "workers-ai", model: (env.WORKERS_AI_MODEL ?? "").trim() || DEFAULT_MODEL };
  if (xai) return { provider: "xai", model: (env.XAI_MODEL ?? "").trim() || "grok-4.5" };
  if (hfToken) return { provider: "huggingface", model: hfModel || "Qwen/Qwen2.5-7B-Instruct" };
  return { provider: "none", model: null };
}

/** Fails if wrangler.jsonc embeds anything secret-like. Secrets live in host env, never in git. */
export function wranglerSecretsCheck(rootDir) {
  const path = join(rootDir, "wrangler.jsonc");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { state: "missing", detail: "wrangler.jsonc not found." };
  }
  const hits = [...text.matchAll(SECRET_KEY_RE)].map((m) => m[0].trim());
  const unique = [...new Set(hits)];
  if (unique.length)
    return {
      state: "leak",
      detail: `wrangler.jsonc embeds secret-bearing keys (${unique.join("; ")}). Move them to host env.`,
    };
  return { state: "ok", detail: "wrangler.jsonc holds no secret-bearing keys." };
}

export function check(env, rootDir) {
  const account = accountStatus(env.CLOUDFLARE_ACCOUNT_ID);
  const token = tokenStatus(env.CLOUDFLARE_API_TOKEN);
  const provider = resolveProvider(env);
  const wrangler = wranglerSecretsCheck(rootDir);
  const usable = provider.provider !== "none";
  return { account, token, provider, wrangler, usable };
}

export function formatReport(result) {
  const line = (label, s) => `  [${s.state.toUpperCase()}] ${label}: ${s.detail}`;
  return [
    "Cloudflare Workers AI setup check (offline, secrets hidden):",
    line("account ", result.account),
    line("token   ", result.token),
    `  [${result.provider.provider.toUpperCase()}] provider: ${result.provider.provider}${result.provider.model ? ` (${result.provider.model})` : " — AI staff will report unavailable"}`,
    line("wrangler", result.wrangler),
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = check(process.env, root);
  console.log(formatReport(result));
  if (process.argv.includes("--strict") && (!result.usable || result.wrangler.state === "leak"))
    process.exit(1);
}
