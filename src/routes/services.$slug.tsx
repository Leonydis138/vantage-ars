import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PublicFrame } from "@/components/public/site-frame";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CloudIcon,
  InfraIcon,
  NetworkIcon,
  NoTiesIcon,
  QuoteIcon,
  RestoreIcon,
  ShieldIcon,
  SignalBars,
  VoipIcon,
} from "@/components/public/motion-icons";
import { ratesByIds } from "@/lib/office/catalogue";
import { ServiceArt } from "@/components/public/service-art";
import { GUIDES } from "@/lib/site/guides";
import { SERVICE_PAGES, servicePage, type ServicePage } from "@/lib/site/services";
import {
  breadcrumbJsonLd,
  businessJsonLd,
  faqJsonLd,
  jsonLd,
  offerCatalogJsonLd,
  pageHead,
  SITE_URL,
} from "@/lib/site/seo";
import { COMPANY } from "@/lib/office/company";

const SLUG_ICONS = {
  voip: VoipIcon,
  networking: NetworkIcon,
  "it-infrastructure": InfraIcon,
  "ai-automation": CloudIcon,
  "managed-support": SignalBars,
  "cloud-email": CloudIcon,
  security: ShieldIcon,
  "backup-recovery": RestoreIcon,
} as const;

const VALUE_PROPS = [
  { label: "Scope explained before work starts", Icon: QuoteIcon },
  { label: "Quoted work or a monthly plan", Icon: NoTiesIcon },
  { label: "Remote first, on-site only when needed", Icon: SignalBars },
] as const;

export const Route = createFileRoute("/services/$slug")({
  loader: ({ params }: { params: { slug: string } }): ServicePage => {
    const page = servicePage(params.slug);
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }: { loaderData?: ServicePage }) => {
    if (!loaderData) return {};
    const head = pageHead({
      title: loaderData.metaTitle,
      description: loaderData.description,
      path: `/services/${loaderData.slug}`,
      authorName: COMPANY.authorName,
    });
    return {
      ...head,
      scripts: [
        businessJsonLd(),
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Services", path: "/services" },
          { name: loaderData.title, path: `/services/${loaderData.slug}` },
        ]),
        offerCatalogJsonLd({
          name: `${loaderData.title} — published rates`,
          path: `/services/${loaderData.slug}`,
          rateIds: loaderData.rateIds,
        }),
        faqJsonLd(loaderData.faqs),
        jsonLd({
          "@context": "https://schema.org",
          "@type": "Service",
          name: loaderData.title,
          serviceType: loaderData.title,
          description: loaderData.description,
          provider: { "@type": "ProfessionalService", name: "Vantage-ARS", url: SITE_URL },
          areaServed: "Worldwide (remote); on-site by arrangement",
          url: `${SITE_URL}/services/${loaderData.slug}`,
        }),
      ],
    };
  },
  component: ServicePageView,
});

function ServicePageView() {
  const page = Route.useLoaderData() as ServicePage;
  const rates = ratesByIds(page.rateIds);
  const others = SERVICE_PAGES.filter((item: ServicePage) => item.slug !== page.slug);
  const guides = GUIDES.filter((guide) => guide.relatedServices.includes(page.slug)).slice(0, 2);
  const Icon = SLUG_ICONS[page.slug];

  return (
    <PublicFrame>
      <nav
        aria-label="Breadcrumb"
        className="pt-10 font-mono text-xs tracking-[0.14em] text-subtle uppercase"
      >
        <Link to="/" className="transition-colors hover:text-fg">
          Home
        </Link>{" "}
        /{" "}
        <Link to="/services" className="transition-colors hover:text-fg">
          Services
        </Link>{" "}
        / <span className="text-accent">{page.title}</span>
      </nav>

      <section className="enter-up grid gap-10 pb-16 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:pt-12">
        <div>
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-border bg-raised">
              <Icon className="size-7 text-accent" aria-hidden="true" />
            </span>
            <p className="font-mono text-sm text-accent">{page.number}</p>
          </div>
          <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[0.98] tracking-[-0.03em] sm:text-7xl">
            {page.title}
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted">{page.lead}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/"
              hash="enquiry"
              className="cta inline-flex h-11 items-center rounded-md px-5 text-sm font-medium"
            >
              Get a written quote
            </Link>
            <Link
              to="/support"
              className="cta-ghost inline-flex h-11 items-center rounded-md px-5 text-sm font-medium"
            >
              Already a customer? Service desk
            </Link>
          </div>
        </div>

        <figure className="panel overflow-hidden rounded-2xl">
          {page.slug === "networking" ? (
            <img
              src="/images/panel.jpg"
              alt="Ethernet patch panel with labeled ports and connected network cables"
              className="service-photo block w-full"
              width="1400"
              height="933"
              decoding="async"
            />
          ) : (
            <ServiceArt slug={page.slug} className="block h-auto w-full" />
          )}
          <figcaption className="border-t border-border px-5 py-3 font-mono text-[10px] tracking-[0.18em] text-subtle uppercase">
            {page.slug === "networking" ? "Ethernet patch panel · Network troubleshooting" : `Signal desk · ${page.title} · ${page.number}`}
          </figcaption>
        </figure>
      </section>

      <section
        className="grid gap-4 border-y border-border py-4 md:grid-cols-3 md:p-4"
        aria-label="Service value summary"
      >
        {VALUE_PROPS.map(({ label, Icon: ValueIcon }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-border bg-bg/60 p-4 text-sm text-muted"
          >
            <ValueIcon className="size-5 shrink-0 text-accent" aria-hidden="true" />
            {label}
          </div>
        ))}
      </section>

      <section className="border-b border-border py-16" aria-labelledby="symptoms-heading">
        <div className="grid gap-8 lg:grid-cols-[16rem_1fr] lg:gap-16">
          <h2 id="symptoms-heading" className="font-serif text-3xl tracking-[-0.03em] sm:text-4xl">
            Sound familiar?
          </h2>
          <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {page.symptoms.map((item) => (
              <li
                key={item}
                className="flex gap-3 border-b border-border pb-4 text-sm leading-relaxed"
              >
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="text-muted">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {guides.length > 0 ? (
        <section className="border-b border-border py-12" aria-labelledby="service-guides-heading">
          <div className="grid gap-6 lg:grid-cols-[16rem_1fr] lg:gap-16">
            <div>
              <h2 id="service-guides-heading" className="font-serif text-3xl tracking-[-0.03em]">
                Before the call
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Short checks that make the first conversation more useful. A guide cannot see your
                system; it only helps you describe what changed.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {guides.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    to="/guides/$slug"
                    params={{ slug: guide.slug }}
                    className="panel panel-hover flex h-full flex-col rounded-2xl p-5"
                  >
                    <span className="font-mono text-[10px] tracking-[0.16em] text-subtle uppercase">
                      {guide.readingMinutes} min read
                    </span>
                    <span className="mt-2 font-serif text-2xl leading-tight text-fg">
                      {guide.title}
                    </span>
                    <span className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                      {guide.summary}
                    </span>
                    <span className="mt-4 text-xs text-accent">Read the guide →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="border-b border-border py-16" aria-labelledby="approach-heading">
        <h2 id="approach-heading" className="font-serif text-3xl tracking-[-0.03em] sm:text-4xl">
          How the work runs
        </h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {page.approach.map((step, index) => (
            <li key={step.title} className="panel panel-hover rounded-2xl p-5">
              <p className="font-mono text-sm text-accent">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 font-serif text-2xl">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {page.products ? (
        <section className="border-b border-border py-16" aria-labelledby="products-heading">
          <h2 id="products-heading" className="font-serif text-3xl tracking-[-0.03em] sm:text-4xl">
            AI automation engagements
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
            Start with one workflow. Each engagement is human-led and separately scoped; no software
            is purchased and no production system is changed until you approve a written quote.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {page.products.map((product, index) => (
              <article key={product.title} className="panel rounded-2xl p-6">
                <p className="font-mono text-xs text-accent">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 font-serif text-2xl">{product.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{product.suitableWhen}</p>
                <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed">
                  <span className="font-semibold">You receive: </span>
                  {product.deliverable}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-subtle">
            Labour is quoted at the applicable published remote or on-site rate after discovery.
            Third-party model, API and software fees are separate and require your approval.
          </p>
        </section>
      ) : null}

      <section className="border-b border-border py-16" aria-labelledby="price-heading">
        <div className="grid gap-8 lg:grid-cols-[16rem_1fr] lg:gap-16">
          <div>
            <h2 id="price-heading" className="font-serif text-3xl tracking-[-0.03em] sm:text-4xl">
              Prices
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              South African rand. VAT is added only if the written quote says so.{" "}
              <Link to="/rates" className="text-accent underline-offset-4 hover:underline">
                Full rate sheet
              </Link>
              .
            </p>
          </div>
          <ul className="border-t border-border">
            {rates.map((rate) => (
              <li
                key={rate.id}
                className="grid gap-2 border-b border-border py-5 transition-colors hover:bg-raised/40 sm:grid-cols-[1fr_9rem] sm:gap-8"
              >
                <div>
                  <h3 className="text-base font-semibold">{rate.title}</h3>
                  <p className="mt-1 text-sm text-muted">{rate.scope}</p>
                  <p className="mt-2 text-sm text-subtle">{rate.basis}</p>
                </div>
                <p className="font-mono text-sm font-medium text-accent sm:text-right">
                  {rate.price}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-border py-16" aria-labelledby="excluded-heading">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 id="excluded-heading" className="font-serif text-3xl tracking-[-0.03em]">
              {page.excludedTitle ?? "Not in the labour rate"}
            </h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-muted">
              {page.excluded.map((item) => (
                <li key={item} className="border-b border-border pb-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-serif text-3xl tracking-[-0.03em]">Questions</h2>
            <Accordion type="single" collapsible className="mt-6 border-t border-border">
              {page.faqs.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="text-sm font-medium">{item.q}</AccordionTrigger>
                  <AccordionContent>{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="panel relative overflow-hidden rounded-2xl p-8 sm:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -left-20 size-64 rounded-full bg-ok/10 blur-3xl"
          />
          <p className="font-mono text-xs tracking-[0.22em] text-accent uppercase">Signal desk</p>
          <h2 className="mt-4 max-w-2xl font-serif text-4xl tracking-[-0.03em] sm:text-5xl">
            Tell us what stopped.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            A few sentences are enough. You get a written quote before anyone starts, and asking
            does not commit you to anything.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/"
              hash="enquiry"
              className="cta inline-flex h-11 items-center rounded-md px-5 text-sm font-medium"
            >
              Request a quote
            </Link>
            <Link
              to="/support"
              className="cta-ghost inline-flex h-11 items-center rounded-md px-5 text-sm font-medium"
            >
              Service desk
            </Link>
          </div>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((item) => (
            <Link
              key={item.slug}
              to="/services/$slug"
              params={{ slug: item.slug }}
              className="group panel panel-hover rounded-xl p-6"
            >
              <p className="font-mono text-xs text-accent">{item.number}</p>
              <p className="mt-2 font-serif text-2xl group-hover:text-accent">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </PublicFrame>
  );
}
