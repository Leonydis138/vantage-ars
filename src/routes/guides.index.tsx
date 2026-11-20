import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicFrame } from "@/components/public/site-frame";
import { SignalBars } from "@/components/public/motion-icons";
import { GUIDES } from "@/lib/site/guides";
import { breadcrumbJsonLd, businessJsonLd, jsonLd, pageHead, SITE_URL } from "@/lib/site/seo";

export const Route = createFileRoute("/guides/")({
  head: () => {
    const head = pageHead({
      title: "Guides · Vantage-ARS",
      description:
        "Plain-language guides to VoIP audio, Wi-Fi faults, backups, firewall changes and preparing for remote support. No promises, just the checks that narrow a fault.",
      path: "/guides",
    });
    return {
      ...head,
      scripts: [
        businessJsonLd(),
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Guides", path: "/guides" },
        ]),
        jsonLd({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Vantage-ARS guides",
          url: `${SITE_URL}/guides`,
          description:
            "Practical technical guides to VoIP, networking, backups and infrastructure changes.",
          hasPart: GUIDES.map((guide) => ({
            "@type": "Article",
            headline: guide.title,
            url: `${SITE_URL}/guides/${guide.slug}`,
          })),
        }),
      ],
    };
  },
  component: GuidesPage,
});

function GuidesPage() {
  return (
    <PublicFrame>
      <section className="enter-up pb-14 pt-16 lg:pt-24">
        <p className="flex items-center gap-2 font-mono text-xs tracking-[0.22em] text-accent uppercase">
          <SignalBars className="size-4" aria-hidden="true" />
          Field notes
        </p>
        <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[0.98] tracking-[-0.03em] sm:text-7xl">
          Understand the fault before you buy the fix.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Short, practical guides to the problems we see most often. They explain what to check,
          what to record and where the work stops. They are not a written quote, a diagnosis of your
          system, or a promise about the outcome.
        </p>
      </section>

      <section className="border-t border-border py-10" aria-labelledby="guide-list-heading">
        <h2 id="guide-list-heading" className="sr-only">
          All guides
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link
                to="/guides/$slug"
                params={{ slug: guide.slug }}
                className="panel panel-hover flex h-full flex-col rounded-2xl p-6"
              >
                <span className="flex flex-wrap items-center gap-3 font-mono text-[10px] tracking-[0.16em] text-subtle uppercase">
                  <span>{guide.readingMinutes} min read</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={guide.updated}>
                    {new Intl.DateTimeFormat("en-ZA", {
                      dateStyle: "long",
                      timeZone: "UTC",
                    }).format(new Date(guide.updated))}
                  </time>
                </span>
                <span className="mt-3 font-serif text-3xl leading-tight tracking-[-0.02em] text-fg">
                  {guide.title}
                </span>
                <span className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                  {guide.summary}
                </span>
                <span className="mt-5 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-accent uppercase">
                  Read the guide <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-14">
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          A guide can help you describe a fault, but it cannot see your system. If you want the
          fault narrowed on your own records, ask for a written quote first.
        </p>
        <Link
          to="/"
          hash="enquiry"
          className="cta inline-flex h-11 items-center rounded-md px-5 text-sm font-semibold"
        >
          Get a written quote
        </Link>
      </section>
    </PublicFrame>
  );
}
