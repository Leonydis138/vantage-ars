export type ModelTarget = {
  provider: "workers-ai" | "xai";
  url: string;
  key: string;
  model: string;
};

/**
 * Chooses the reasoning model. Cloudflare Workers AI (the agreed plan) is used when both
 * CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are set, unless AI_PROVIDER=xai. Otherwise xAI.
 */
export function resolveModelTarget(env: Record<string, string | undefined>): ModelTarget | null {
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const xai = env.XAI_API_KEY?.trim();
  const wanted = env.AI_PROVIDER?.trim().toLowerCase();
  if (wanted !== "xai" && account && token && /^[a-f0-9]{32}$/i.test(account)) {
    return {
      provider: "workers-ai",
      url: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`,
      key: token,
      model: env.WORKERS_AI_MODEL?.trim() || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    };
  }
  if (xai)
    return {
      provider: "xai",
      url: "https://api.x.ai/v1/chat/completions",
      key: xai,
      model: env.XAI_MODEL?.trim() || "grok-4.5",
    };
  return null;
}
