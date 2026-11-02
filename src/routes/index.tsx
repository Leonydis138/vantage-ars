import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PublicFrame } from "@/components/public/site-frame";
import { FormConfirmation } from "@/components/public/form-confirmation";
import { EnquiryForm } from "@/components/public/enquiry-form";
import {
  CloudIcon,
  InfraIcon,
  NetworkIcon,
  QuoteIcon,
  RestoreIcon,
  ShieldIcon,
  SignalBars,
  VoipIcon,
} from "@/components/public/motion-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitPaymentNotice, getPaymentMethods } from "@/lib/office/api";
import type { PaymentMethod } from "@/lib/office/invoice";
import { allMethodsAwaitBankDetails } from "@/lib/office/invoice";
import { SERVICE_PAGES } from "@/lib/site/services";
import { SERVICE_LINES, rateAmount } from "@/lib/office/catalogue";
import { businessJsonLd, faqJsonLd, pageHead, SITE_URL, jsonLd } from "@/lib/site/seo";
import { COMPANY } from "@/lib/office/company";

const LINE_ICONS = [
  VoipIcon,
  NetworkIcon,
  InfraIcon,
  SignalBars,
  CloudIcon,
  ShieldIcon,
  RestoreIcon,
  CloudIcon,
] as const;

/** Every service line, paired with the page that explains it. */
const DEPARTMENTS = SERVICE_LINES.flatMap((line, index) => {
  const page = SERVICE_PAGES.find((item) => item.title === line.title);
  return page ? [{ line, page, Icon: LINE_ICONS[index] ?? VoipIcon }] : [];
});

const STEPS = [
  {
    n: "01",
    title: "Diagnose remotely first",
    body: "Endpoint and network symptoms, plus the call-path details you can provide.",
  },
  {
    n: "02",
    title: "Written quote",
    body: "Scope, hours, travel and VAT fixed in writing. Nothing starts until you accept.",
  },
  {
    n: "03",
    title: "Configure and test",
    body: "The agreed work is done and tested against the checks we set with you.",
  },
] as const;

// One source of truth for the FAQ: rendered on the page (search engines only
// surface FAQ rich results for content that is visible to users) and emitted
// as FAQPage JSON-LD from Route.head below.
const FAQS = [
  {
    q: "How do I get a quote?",
    a: "Send the enquiry form. You get a written quote with scope and total before anyone starts.",
  },
  {
    q: "Do you charge VAT?",
    a: "VAT is added only when the written quote says so.",
  },
  {
    q: "Do you offer managed support?",
    a: "Yes. There is a monthly managed support plan at a fixed published price, remote only, with a written report every month. There is no live monitoring of your estate, no uptime promise and no contractual service level.",
  },
];

export const Route = createFileRoute("/")({
  head: () => {
    const head = pageHead({
      title: "Cognitive operations for service-critical businesses · Vantage-ARS",
      description:
        "Vantage-ARS combines signal intelligence, AI-assisted triage, written quotes, and founder-controlled execution for VoIP, networking and infrastructure operations.",
      path: "/",
      authorName: COMPANY.authorName,
    });

    return {
      ...head,
      scripts: [
        businessJsonLd(),
        faqJsonLd(FAQS),
        jsonLd({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Vantage-ARS",
          url: SITE_URL,
        }),
      ],
    };
  },

  loader: () => getPaymentMethods(),

  component: HomePage,
});

function HomePage() {
  const payment = Route.useLoaderData();

  return (
    <PublicFrame>
      <section className="home-hero border-b border-border py-10 sm:py-14">
        <div className="home-hero-panel grid items-center gap-8 overflow-hidden rounded-xl lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative">
            <p className="home-hero-kicker font-mono text-xs tracking-[0.22em] uppercase">
              <span className="home-kicker-mark" aria-hidden="true" />
              The operating system for service-critical businesses
            </p>

            <h1 className="home-hero-title mt-5 max-w-3xl text-5xl leading-[0.98] tracking-[-0.05em] sm:text-7xl">
              We turn technical noise
              <span className="home-title-highlight">into a profitable operating loop.</span>
            </h1>

            <p className="home-hero-copy mt-6 max-w-xl text-lg leading-relaxed">
              Vantage-ARS brings together signal intelligence, AI-assisted triage, quote discipline,
              and founder-controlled execution so the business keeps moving without losing control.
            </p>

            <div className="home-hero-actions mt-8 flex flex-wrap gap-3">
              <Link
                to="/"
                hash="enquiry"
                className="home-primary-cta cta inline-flex h-12 items-center rounded-md px-5 text-sm font-semibold"
              >
                Book a diagnostic <span aria-hidden="true">↗</span>
              </Link>

              <Link
                to="/model"
                className="cta-ghost inline-flex h-11 items-center rounded-md px-5 text-sm font-semibold"
              >
                See the operating model
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Signal loop", value: "Detect → price → repair → confirm" },
                { label: "Coverage", value: "Remote worldwide" },
                { label: "Control", value: "Founder-led governance" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-border/80 bg-surface/40 px-3 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-subtle">{item.label}</p>
                  <p className="mt-2 text-sm font-medium text-fg">{item.value}</p>
                </div>
              ))}
            </div>

            <p className="home-hero-rates mt-6 text-sm">
              Remote from R{rateAmount("remote-support")}/hr · On-site from R
              {rateAmount("onsite-support")}/hr · VAT only where quoted
            </p>
          </div>

          <figure className="home-hero-figure relative overflow-hidden">
            <img
              src="/images/panel.jpg"
              alt="Ethernet patch panel with network cables connected inside a server rack"
              className="home-hero-image aspect-[4/3] w-full object-cover"
              width="1400"
              height="933"
              decoding="async"
              fetchPriority="high"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#06131d]/85 via-[#06131d]/20 to-transparent" aria-hidden="true" />
            <figcaption className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-5 text-left">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent">Operational signal</span>
              <span className="max-w-xs text-sm text-slate-100">
                Every route, fault, and handoff is measured before we act.
              </span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="border-b border-border py-16" aria-label="Why this is different">
        <div className="max-w-4xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Why it is different</p>
          <h2 className="mt-2 font-serif text-4xl sm:text-5xl">
            Not support tickets. A decision engine for modern infrastructure.
          </h2>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {[
            {
              title: "Signal intelligence",
              body: "We trace symptoms, isolate the likely fault, and build the story before the first intervention.",
            },
            {
              title: "Commercial clarity",
              body: "Every job starts with scope, total, and authority so work is accountable from the beginning.",
            },
            {
              title: "Founder-controlled execution",
              body: "Human judgment stays in charge of spend, customer commitments, and operational risk.",
            },
          ].map((item) => (
            <article key={item.title} className="rounded-2xl border border-border bg-surface/40 p-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">01</p>
              <h3 className="mt-3 text-xl font-semibold text-fg">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="services" className="border-b border-border py-16" aria-label="Departments">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">What we do</p>
            <h2 className="mt-2 font-serif text-4xl sm:text-5xl">Practical IT support.</h2>
          </div>

          <Link
            to="/services"
            className="font-mono text-xs tracking-[0.18em] text-subtle uppercase transition-colors hover:text-accent"
          >
            All service lines →
          </Link>
        </div>

        <ul className="mt-8 grid border-t border-border md:grid-cols-2 md:gap-x-8">
          {DEPARTMENTS.map(({ line, page, Icon }) => (
            <li key={page.slug} className="border-b border-border">
              <Link
                to="/services/$slug"
                params={{ slug: page.slug }}
                className="group grid min-h-24 grid-cols-[2rem_1fr_auto] items-center gap-3 px-1 py-4 transition-colors hover:bg-raised/40 sm:gap-4 sm:px-3"
              >
                <Icon className="size-5 text-accent/80" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-fg group-hover:text-accent">
                    {page.title}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted">
                    {page.description}
                  </span>
                </span>
                <span className="font-mono text-xs text-subtle">{line.price}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-sm text-muted">
          Need help choosing?{" "}
          <Link to="/find" className="text-accent underline-offset-4 hover:underline">
            Use the service finder
          </Link>
          .
        </p>
      </section>

      <section className="grid gap-10 border-b border-border py-12 lg:grid-cols-[1.3fr_0.7fr] lg:gap-16">
        <div aria-label="How a job runs">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Simple process</p>
          <h2 className="mt-2 font-serif text-3xl sm:text-4xl">Know what happens next.</h2>
          <ol className="mt-5 divide-y divide-border border-y border-border">
          {STEPS.map((step, index) => (
            <li key={step.n} className="grid grid-cols-[2rem_1fr] gap-3 py-4">
              <span className="font-mono text-xs text-subtle">{step.n}</span>
              <span>
                <span className="block text-sm font-semibold text-fg">{step.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{step.body}</span>
              </span>
            </li>
          ))}
          </ol>
        </div>

        <div id="prices" className="self-center" aria-label="Published prices">
            <p className="font-mono text-xs tracking-[0.18em] text-accent uppercase">
              Published pricing
            </p>
            <h2 className="mt-2 font-serif text-3xl">Remote support</h2>
            <p className="mt-2 text-xl text-fg">From R{rateAmount("remote-support")}/hr</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Written scope and total before work begins. VAT only where quoted.
            </p>
            <Link
              to="/rates"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
            >
              All rates <span aria-hidden="true">→</span>
            </Link>
            <Link
              to="/services/$slug"
              params={{ slug: "managed-support" }}
              className="mt-3 block text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
            >
              Managed support plans
            </Link>
        </div>
      </section>

      <section className="border-b border-border py-12" aria-label="Get a quote">
        <div id="enquiry" className="scroll-mt-24 max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Start a conversation</p>
          <h2 className="mt-2 font-serif text-4xl sm:text-5xl">Ask for a quote.</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Tell us what stopped working or what you want set up. You receive a written scope and total first.
          </p>
          <div className="mt-6">
            <EnquiryForm
              nameMaxLength={120}
              messagePlaceholder="What stopped working, or what you want set up."
              submitLabel="Request a quote"
            />
          </div>
        </div>

        <details id="payment" className="group mt-8 max-w-2xl scroll-mt-24 border-y border-border">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-fg marker:hidden">
            <span>Already paid? Send a payment notice.</span>
            <span className="text-lg text-accent transition-transform group-open:rotate-45" aria-hidden="true">+</span>
          </summary>
          <p className="pb-4 text-sm leading-relaxed text-muted">
            This records your notice; it is not an automatic receipt.
          </p>
          <div className="pb-5">
            <PaymentForm payment={payment} />
          </div>
        </details>
      </section>

      <section className="border-t border-border py-16" aria-label="Common questions">
        <h2 className="font-serif text-3xl sm:text-4xl">Common questions</h2>
        <div className="mt-6 max-w-3xl divide-y divide-border border-y border-border">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-fg">
                {faq.q}
                <span className="text-lg text-accent transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </PublicFrame>
  );
}

function PaymentForm({ payment }: { payment: unknown }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    reference: "",
    amount: "",
    website: "",
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const result = await submitPaymentNotice({
        data: form,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDone(true);
    } catch {
      setError("The notice could not be recorded. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <FormConfirmation>
        <p className="text-3xl text-ok">Noted.</p>

        <p className="mt-3 text-sm text-muted">
          Your payment notice is recorded. A receipt follows after it is checked.
        </p>
      </FormConfirmation>
    );
  }

  const methods = Array.isArray(payment) ? (payment as PaymentMethod[]) : [];

  return (
    <form onSubmit={onSubmit} className="glass space-y-4 rounded-2xl p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="pay-name">Name on payment</Label>

          <Input
            id="pay-name"
            className="mt-2"
            required
            value={form.name}
            onChange={(event) =>
              setForm({
                ...form,
                name: event.target.value,
              })
            }
          />
        </div>

        <div>
          <Label htmlFor="pay-email">Email</Label>

          <Input
            id="pay-email"
            type="email"
            className="mt-2"
            required
            value={form.email}
            onChange={(event) =>
              setForm({
                ...form,
                email: event.target.value,
              })
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="pay-ref">Reference (VA-…)</Label>

          <Input
            id="pay-ref"
            className="mt-2"
            required
            placeholder="VA-XXXX"
            value={form.reference}
            onChange={(event) =>
              setForm({
                ...form,
                reference: event.target.value,
              })
            }
          />
        </div>

        <div>
          <Label htmlFor="pay-amount">Amount (R)</Label>

          <Input
            id="pay-amount"
            className="mt-2"
            required
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]+)?"
            title="Enter the amount in rand, for example 690.00"
            placeholder="690.00"
            value={form.amount}
            onChange={(event) =>
              setForm({
                ...form,
                amount: event.target.value,
              })
            }
          />
        </div>
      </div>

      <div className="h-0 overflow-hidden" aria-hidden="true">
        Leave this field empty
        <input
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) =>
            setForm({
              ...form,
              website: event.target.value,
            })
          }
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {allMethodsAwaitBankDetails(methods) ? (
        <p className="text-xs text-subtle">Bank details are sent with your quote or invoice.</p>
      ) : null}

      <Button type="submit" disabled={pending} className="cta w-full border-0 sm:w-auto">
        {pending ? "Sending…" : "Notify payment"}
      </Button>
    </form>
  );
}
