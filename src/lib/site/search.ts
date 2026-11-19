/**
 * The public site's searchable record.
 *
 * Search is a reader convenience, not an index of the office. It contains
 * only copy the site already publishes: service pages, published rates,
 * common questions and the fixed public pages. Nothing here reads the
 * database, a customer record or an unpublished draft.
 */
import { PUBLISHED_RATES } from "@/lib/office/catalogue";
import { GUIDES } from "@/lib/site/guides";
import { SERVICE_PAGES } from "@/lib/site/services";

export type SearchKind = "page" | "service" | "rate" | "answer" | "guide";

export type SearchItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  kind: SearchKind;
  /** Extra words a reader might type that are not in the title or copy. */
  keywords?: string[];
};

const PAGES: SearchItem[] = [
  {
    id: "page-home",
    title: "Vantage-ARS",
    description:
      "Worldwide remote VoIP, networking and IT infrastructure support with published ZAR rates.",
    href: "/",
    kind: "page",
    keywords: ["home", "contact", "enquiry", "quote"],
  },
  {
    id: "page-services",
    title: "Service lines",
    description:
      "Published service lines for VoIP, networking, IT infrastructure, managed support, cloud and email, security, backup recovery and AI workflow automation.",
    href: "/services",
    kind: "page",
    keywords: ["services", "all services", "what do you do", "departments"],
  },
  {
    id: "page-find",
    title: "Find your service",
    description:
      "Answer three questions about the symptom and get the closest published service line, relevant guides and an enquiry checklist.",
    href: "/find",
    kind: "page",
    keywords: ["finder", "which service", "starting point", "help me choose"],
  },
  {
    id: "page-assess",
    title: "IT readiness self-assessment",
    description:
      "Review seven practical IT operations questions. Identify practices to verify and relevant services; answers stay in your browser.",
    href: "/assess",
    kind: "page",
    keywords: ["assessment", "readiness", "IT review", "business continuity", "risk"],
  },
  {
    id: "page-email-auth-check",
    title: "Email authentication DNS check",
    description: "Check public SPF, DKIM and DMARC DNS records for a domain.",
    href: "/tools/email-auth",
    kind: "page",
    keywords: ["SPF", "DKIM", "DMARC", "email deliverability", "DNS diagnostic"],
  },
  {
    id: "page-network-path-check",
    title: "Browser network-path check",
    description:
      "Gather browser WebRTC ICE candidates through a public STUN server. Does not test SIP ALG or call quality.",
    href: "/tools/network-path",
    kind: "page",
    keywords: ["NAT", "STUN", "WebRTC", "SIP ALG", "VoIP network diagnostic"],
  },
  {
    id: "page-automation",
    title: "AI automation opportunity assessment",
    description:
      "A private browser-only checklist to identify workflows that may suit a bounded AI automation pilot and where human review should remain.",
    href: "/automation",
    kind: "page",
    keywords: ["AI", "agents", "workflow", "automation", "autonomous business", "readiness"],
  },
  {
    id: "page-rates",
    title: "Published rates",
    description:
      "Labour, quoted work and managed services with the published price and the basis for each line.",
    href: "/rates",
    kind: "page",
    keywords: ["price", "pricing", "cost", "hourly", "monthly"],
  },
  {
    id: "page-work",
    title: "How work runs",
    description:
      "Diagnose remotely first, quote in writing, then configure and test against agreed checks.",
    href: "/work",
    kind: "page",
    keywords: ["process", "method", "steps"],
  },
  {
    id: "page-model",
    title: "How the office runs",
    description:
      "Ten agents, the path from enquiry to a confirmed receipt, and the actions that still wait for the founder.",
    href: "/model",
    kind: "page",
    keywords: ["autonomous", "agents", "office", "diagram", "governor"],
  },
  {
    id: "page-support",
    title: "Customer service desk",
    description: "Log a fault, ask about work in progress, or record a complaint.",
    href: "/support",
    kind: "page",
    keywords: ["ticket", "fault", "complaint", "support"],
  },
  {
    id: "page-status",
    title: "Public readiness",
    description: "A live readiness check of the office records, decision chain and scheduled work.",
    href: "/status",
    kind: "page",
    keywords: ["health", "status", "availability", "ready"],
  },
  {
    id: "page-terms",
    title: "Terms",
    description: "The terms that apply to work, quotes, payment and use of this site.",
    href: "/terms",
    kind: "page",
    keywords: ["contract", "legal", "conditions"],
  },
  {
    id: "page-privacy",
    title: "Privacy",
    description: "What this site records, why it records it, and the choices a person has.",
    href: "/privacy",
    kind: "page",
    keywords: ["POPIA", "data", "personal information", "cookies"],
  },
];

const SERVICE_ITEMS: SearchItem[] = SERVICE_PAGES.map((page) => ({
  id: `service-${page.slug}`,
  title: page.title,
  description: `${page.lead} ${page.symptoms.join(" ")}`,
  href: `/services/${page.slug}`,
  kind: "service",
  keywords: [page.metaTitle, ...page.approach.map((item) => item.title)],
}));

const RATE_ITEMS: SearchItem[] = PUBLISHED_RATES.filter((rate) => rate.offered).map((rate) => ({
  id: `rate-${rate.id}`,
  title: rate.title,
  description: `${rate.scope} ${rate.price}. ${rate.basis}`,
  href: "/rates",
  kind: "rate",
  keywords: [rate.id.replace(/-/g, " "), rate.price],
}));

const GUIDE_ITEMS: SearchItem[] = GUIDES.map((guide) => ({
  id: `guide-${guide.slug}`,
  title: guide.title,
  description: guide.summary,
  href: `/guides/${guide.slug}`,
  kind: "guide",
  keywords: guide.sections.map((section) => section.heading),
}));

const SERVICE_ANSWERS: SearchItem[] = SERVICE_PAGES.flatMap((page) =>
  page.faqs.map((faq, index) => ({
    id: `answer-${page.slug}-${index + 1}`,
    title: faq.q,
    description: faq.a,
    href: `/services/${page.slug}`,
    kind: "answer" as const,
    keywords: [page.title],
  })),
);

const GENERAL_ANSWERS: SearchItem[] = [
  {
    id: "answer-new-work",
    title: "How do I ask for a quote?",
    description:
      "Use the enquiry form on the home page. A written quote states the scope, hours, travel, VAT treatment and the checks the work will be judged against.",
    href: "/",
    kind: "answer",
    keywords: ["quote", "enquiry", "new job"],
  },
  {
    id: "answer-existing-work",
    title: "How do I raise a problem with work already agreed?",
    description:
      "Use the service desk. It records the matter for review and does not create a refund, cancellation or price change.",
    href: "/support",
    kind: "answer",
    keywords: ["fault", "complaint", "existing customer"],
  },
  {
    id: "answer-uptime",
    title: "Is there an uptime promise or a contractual service level?",
    description:
      "No. The site publishes working targets and measures the office against them, but sells no uptime promise and no contractual service level.",
    href: "/work",
    kind: "answer",
    keywords: ["SLA", "uptime", "guarantee", "24/7"],
  },
  {
    id: "answer-monitoring",
    title: "Do you monitor our systems?",
    description:
      "No. The managed reports are built from the office's own records of faults, invoices and response times. They are not live monitoring of your estate.",
    href: "/services/managed-support",
    kind: "answer",
    keywords: ["monitoring", "watch", "alerts"],
  },
  {
    id: "answer-vat",
    title: "How is VAT handled?",
    description:
      "VAT is added only where the written quote or invoice states it. The recurring managed invoice does not state it.",
    href: "/rates",
    kind: "answer",
    keywords: ["tax", "VAT", "price"],
  },
  {
    id: "answer-worldwide",
    title: "Can you help outside South Africa?",
    description:
      "Remote work is available worldwide. On-site work is by arrangement, with travel and local costs quoted before booking.",
    href: "/work",
    kind: "answer",
    keywords: ["international", "remote", "onsite", "travel"],
  },
];

export const SEARCH_INDEX: SearchItem[] = [
  ...PAGES,
  ...SERVICE_ITEMS,
  ...RATE_ITEMS,
  ...GUIDE_ITEMS,
  ...SERVICE_ANSWERS,
  ...GENERAL_ANSWERS,
];

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Indexed copy, normalised so hyphenated compounds are findable however they
 * are typed: "Wi-Fi" is indexed as "wi fi wifi", so "wifi", "wi-fi" and
 * "wi fi" all match. Only compounds are joined — a plain word like "plan" is
 * never indexed as "lan", so short queries keep matching whole words.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[a-z0-9]+(?:-[a-z0-9]+)+/g, (word) => {
      const joined = word.replace(/-/g, "");
      return `${word.replace(/-/g, " ")} ${joined}`;
    })
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Does `haystack` contain `needle`? Terms of four characters or more may be a
 * prefix of a word, so "backup" still finds "backups". Shorter terms must be
 * whole words: otherwise "lan" matches "plan" and "wi" matches "switch".
 */
function contains(haystack: string, needle: string): boolean {
  return needle.length >= 4
    ? haystack.includes(needle)
    : ` ${haystack} `.includes(` ${needle} `);
}

function score(item: SearchItem, needles: string[]): number {
  const title = normalize(item.title);
  const body = normalize(`${item.description} ${(item.keywords ?? []).join(" ")}`);
  let total = 0;
  for (const needle of needles) {
    if (needle.length >= 4 && title.startsWith(needle)) total += 8;
    else if (contains(title, needle)) total += 5;
    else if (contains(body, needle)) total += 2;
    else return 0;
  }
  if (title === needles.join(" ")) total += 12;
  return total;
}

/**
 * Find the published items that contain every word the reader typed.
 *
 * Matching is deliberately literal: a missing result is better than a result
 * that pretends the site covers something it does not. An empty query finds
 * nothing rather than dumping the whole index.
 */
export function searchSite(query: string, limit = 10): SearchItem[] {
  const needles = tokens(query);
  if (!needles.length) return [];
  return SEARCH_INDEX.map((item) => ({ item, value: score(item, needles) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map((entry) => entry.item);
}
