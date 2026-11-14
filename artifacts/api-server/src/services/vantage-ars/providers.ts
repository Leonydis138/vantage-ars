import { ReplitConnectors } from "@replit/connectors-sdk";

export const BUSINESS_MAIL_QUERY =
  'in:inbox newer_than:90d {quote estimate enquiry inquiry diagnostic voip network support "Vantage ARS" "vantage-ars.co.za"}';

export type ProviderName = "google-mail" | "xai" | "hubspot" | "cloudflare";

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderName,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

async function providerRequest(
  provider: ProviderName,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await new ReplitConnectors().proxy(provider, path, {
      method: options.method ?? "GET",
      ...(options.body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body),
          }),
    });
  } catch {
    throw new ProviderError(
      provider,
      0,
      `${providerLabel(provider)} could not be reached. Check its Replit integration.`,
    );
  }

  if (!response.ok) {
    const providerText = (await response.text()).toLowerCase();
    const invalidXaiKey =
      provider === "xai" &&
      (response.status === 401 ||
        response.status === 403 ||
        /incorrect api key|unauthenticated|invalid.{0,12}api key/.test(
          providerText,
        ));

    const message = invalidXaiKey
      ? "The xAI API key was rejected. Update it in Replit Integrations."
      : response.status === 429
        ? `${providerLabel(provider)} is rate-limiting requests. Try again later.`
        : response.status === 401 || response.status === 403
          ? `${providerLabel(provider)} denied access. Check the connected account permissions.`
          : `${providerLabel(provider)} returned an error (${response.status}).`;

    throw new ProviderError(provider, response.status, message);
  }

  return response;
}

export async function providerJson<T>(
  provider: ProviderName,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await providerRequest(provider, path, options);
  return (await response.json()) as T;
}

function providerLabel(provider: ProviderName): string {
  switch (provider) {
    case "google-mail":
      return "Gmail";
    case "xai":
      return "Grok";
    case "hubspot":
      return "HubSpot";
    case "cloudflare":
      return "Cloudflare";
  }
}

export async function getMailboxEmail(): Promise<string> {
  const profile = await providerJson<{ emailAddress?: string }>(
    "google-mail",
    "/gmail/v1/users/me/profile",
  );
  const email = profile.emailAddress?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new ProviderError(
      "google-mail",
      502,
      "Gmail did not return a usable business mailbox address.",
    );
  }
  return email;
}

type XaiLanguageModel = {
  id?: string;
  input_modalities?: string[];
  output_modalities?: string[];
};

let modelCache: { id: string; expiresAt: number } | null = null;

export async function discoverGrokModel(): Promise<string> {
  if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.id;

  const response = await providerJson<{ models?: XaiLanguageModel[] }>(
    "xai",
    "/v1/language-models",
  );

  const eligible = (response.models ?? []).filter((model) => {
    const id = model.id?.toLowerCase() ?? "";
    return (
      id.includes("grok") &&
      model.input_modalities?.includes("text") === true &&
      model.output_modalities?.includes("text") === true
    );
  });

  if (eligible.length === 0) {
    throw new ProviderError(
      "xai",
      503,
      "xAI returned no text-capable Grok model for enquiry processing.",
    );
  }

  const modelId = eligible[0]?.id;
  if (!modelId) {
    throw new ProviderError(
      "xai",
      503,
      "xAI did not return a usable Grok model identifier.",
    );
  }

  modelCache = { id: modelId, expiresAt: Date.now() + 10 * 60 * 1000 };
  return modelId;
}

export async function checkProviderStatuses() {
  const [gmailResult, grokResult, hubspotResult, cloudflareResult] =
    await Promise.allSettled([
      getMailboxEmail(),
      discoverGrokModel(),
      providerJson<{ results?: unknown[] }>(
        "hubspot",
        "/crm/v3/properties/contacts",
      ),
      providerJson<{
        success?: boolean;
        result?: Array<{ id: string; name: string; status: string }>;
      }>(
        "cloudflare",
        "/v4/zones?name=vantage-ars.co.za&per_page=10",
      ),
    ]);

  const statusFrom = (
    result: PromiseSettledResult<unknown>,
    healthyDetail: string,
  ) =>
    result.status === "fulfilled"
      ? { status: "connected" as const, detail: healthyDetail }
      : {
          status: "attention" as const,
          detail:
            result.reason instanceof Error
              ? result.reason.message
              : "The provider check failed.",
        };

  const cloudflareZone =
    cloudflareResult.status === "fulfilled"
      ? cloudflareResult.value.result?.find(
          (zone) => zone.name.toLowerCase() === "vantage-ars.co.za",
        )
      : undefined;

  return [
    {
      id: "gmail",
      label: "Business inbox",
      ...statusFrom(gmailResult, "Mailbox owner verified"),
    },
    {
      id: "grok",
      label: "Grok AI",
      ...statusFrom(grokResult, "Text model available"),
    },
    {
      id: "hubspot",
      label: "HubSpot CRM",
      ...statusFrom(hubspotResult, "Contact access verified"),
    },
    {
      id: "cloudflare",
      label: "Cloudflare",
      ...(cloudflareResult.status === "fulfilled" && cloudflareZone
        ? {
            status: "connected" as const,
            detail: "Vantage ARS zone found; no DNS changes made",
          }
        : cloudflareResult.status === "fulfilled"
          ? {
              status: "attention" as const,
              detail: "Connected account cannot see the Vantage ARS zone",
            }
          : {
              status: "attention" as const,
              detail:
                cloudflareResult.reason instanceof Error
                  ? cloudflareResult.reason.message
                  : "Cloudflare zone check failed.",
            }),
    },
    {
      id: "phone",
      label: "Phone and VoIP",
      status: "setup_required" as const,
      detail: "Phone provider and inbound numbers are not identified; calls are not routed",
    },
    {
      id: "facebook",
      label: "Facebook",
      status: "setup_required" as const,
      detail: "App ID supplied; Page authorization and publishing permissions are still required",
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      status: "setup_required" as const,
      detail: "A LinkedIn publishing connection is not active",
    },
  ];
}

export async function grokJson<T>(
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  const model = await discoverGrokModel();
  try {
    const response = await providerJson<{
      choices?: Array<{ message?: { content?: string | unknown[] } }>;
    }>("xai", "/v1/chat/completions", {
      method: "POST",
      body: {
        model,
        max_completion_tokens: 1800,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) =>
                part &&
                typeof part === "object" &&
                "text" in part &&
                typeof part.text === "string"
                  ? part.text
                  : "",
              )
              .join("")
          : "";
    if (!content) {
      throw new Error("Grok returned an empty response.");
    }
    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof ProviderError) {
      modelCache = null;
      throw error;
    }
    throw new ProviderError(
      "xai",
      502,
      "Grok returned a response that could not be processed. Retry the enquiry.",
    );
  }
}

