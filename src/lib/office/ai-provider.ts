export type ModelTarget = {
  provider: "workers-ai" | "xai" | "huggingface";
  url: string;
  key: string;
  model: string;
};

/**
 * Chooses the reasoning model.
 *
 * The office prefers a configured provider in this order:
 * 1) Cloudflare Workers AI when both host credentials are present
 * 2) xAI when API key + model are configured
 * 3) Hugging Face Inference Providers when the host selects it (limited free-tier credits may apply)
 *
 * The founder controls the actual business actions; these choices only widen the
 * assistant's research and drafting capacity without allowing unattended sales.
 */
export function resolveModelTarget(env: Record<string, string | undefined>): ModelTarget | null {
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const xai = env.XAI_API_KEY?.trim();
  const hfModel = env.HUGGINGFACE_MODEL?.trim();
  const hfToken = env.HUGGINGFACE_API_KEY?.trim() || env.HF_TOKEN?.trim();
  const wanted = env.AI_PROVIDER?.trim().toLowerCase();

  if (wanted === "xai" && xai) {
    return {
      provider: "xai",
      url: "https://api.x.ai/v1/chat/completions",
      key: xai,
      model: env.XAI_MODEL?.trim() || "grok-4.5",
    };
  }

  if (wanted === "huggingface" && hfToken) {
    const model = hfModel || "Qwen/Qwen2.5-7B-Instruct";
    return {
      provider: "huggingface",
      url: "https://router.huggingface.co/v1/chat/completions",
      key: hfToken,
      model,
    };
  }

  // An explicit choice is a hard preference, not permission to silently use a
  // different provider (which may have different billing and data terms).
  if (wanted === "huggingface") return null;

  if (wanted !== "xai" && account && token && /^[a-f0-9]{32}$/i.test(account)) {
    return {
      provider: "workers-ai",
      url: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`,
      key: token,
      model: env.WORKERS_AI_MODEL?.trim() || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    };
  }

  if (xai) {
    return {
      provider: "xai",
      url: "https://api.x.ai/v1/chat/completions",
      key: xai,
      model: env.XAI_MODEL?.trim() || "grok-4.5",
    };
  }

  if (hfToken) {
    const model = hfModel || "Qwen/Qwen2.5-7B-Instruct";
    return {
      provider: "huggingface",
      url: "https://router.huggingface.co/v1/chat/completions",
      key: hfToken,
      model,
    };
  }

  return null;
}
