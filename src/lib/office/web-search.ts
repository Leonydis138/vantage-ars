export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function normalizeText(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

/**
 * A free, no-key web-research helper for the office.
 *
 * It uses DuckDuckGo's public instant-answer API for quick background research,
 * and it deliberately returns only a tiny summary plus a URL so the founder can
 * verify the source before a customer action or a paid campaign is approved.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  const q = normalizeText(query);
  if (!q) return [];

  const url = new URL("https://api.duckduckgo.com/");
  url.search = new URLSearchParams({
    q,
    format: "json",
    no_redirect: "1",
    no_html: "1",
  }).toString();

  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      accept: "application/json",
      "user-agent": "vantage-ars-research/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Web search failed (${response.status})`);
  }

  const data = (await response.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Name?: string }>;
  };

  const sources: WebSearchResult[] = [];

  const abstractText = normalizeText(data.AbstractText);
  const abstractUrl = normalizeText(data.AbstractURL);
  if (abstractText && abstractUrl) {
    sources.push({
      title: "Overview",
      url: abstractUrl,
      snippet: abstractText,
    });
  }

  for (const item of Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []) {
    const title = normalizeText(item.Name) || normalizeText(item.Text)?.split(" - ")[0] || "Result";
    const snippet = normalizeText(item.Text);
    const link = normalizeText(item.FirstURL);
    if (!link || !snippet) continue;
    sources.push({ title, url: link, snippet });
    if (sources.length >= maxResults) break;
  }

  return sources.slice(0, maxResults);
}
