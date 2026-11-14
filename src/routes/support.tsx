import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead, businessJsonLd, faqJsonLd } from "@/lib/site/seo";
import { PublicFrame } from "@/components/public/site-frame";
import { LiveNode } from "@/components/public/motion-icons";
import { EnquiryForm } from "@/components/public/enquiry-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
export const Route = createFileRoute("/support")({
  head: () => {
    const head = pageHead({
      title: "Customer service · Vantage-ARS",
      description:
        "Log a fault, a question about work in progress, or a complaint with Vantage-ARS. The office prepares internal drafts; work requires a founder action.",
      path: "/support",
    });

    return {
      ...head,
      scripts: [businessJsonLd(), faqJsonLd(FAQS)],
    };
  },
  component: SupportDesk,
});

const MATTERS = [
  { value: "fault", label: "Something is not working" },
  { value: "question", label: "A question about work in progress" },
  { value: "complaint", label: "A complaint" },
] as const;

const FAQS = [
  {
    q: "Does this form create a new quote or refund?",
    a: "No. It records a matter for review. No refund, cancellation, or price change is created here.",
  },
  {
    q: "Can I use this for a new job?",
    a: "Use the enquiry form from the homepage if you need a written quote for new work.",
  },
  {
    q: "Do I need to include passwords or access keys?",
    a: "No. Please do not include credentials, card numbers, or private credentials in any message.",
  },
];

function SupportDesk() {
  return (
    <PublicFrame>
      <section className="enter-up grid gap-10 border-b border-border py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <p className="font-mono text-xs tracking-[0.22em] text-accent uppercase">
            Customer service
          </p>
          <h1 className="mt-4 max-w-xl font-serif text-5xl leading-[0.98] tracking-[-0.03em] sm:text-7xl">
            Already a customer? This is the right place.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">
            Tell us about a fault, a job already underway, or a complaint. The office may prepare
            internal drafts, but this form does not send a reply or start technical work. Nothing is
            refunded, cancelled, or repriced by this form.
          </p>
        </div>

        <dl className="panel self-end space-y-4 rounded-2xl p-6 text-sm">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-subtle">
              What this desk does
            </dt>
            <dd className="mt-1 text-muted">
              Records the matter and prepares it for founder review.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-subtle">
              What it does not do
            </dt>
            <dd className="mt-1 text-muted">
              No refund, no new price, and no contract from this form.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-subtle">
              New work
            </dt>
            <dd className="mt-1 text-muted">
              <Link
                to="/"
                hash="enquiry"
                className="text-accent underline-offset-4 hover:underline"
              >
                Use the enquiry form
              </Link>{" "}
              if you need a quote.
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-4 border-b border-border py-10 md:grid-cols-3">
        {[
          {
            n: "01",
            title: "A fault",
            body: "Something stopped. Say what it was doing, and what it does now.",
          },
          {
            n: "02",
            title: "Work in progress",
            body: "Ask where an agreed job stands. This does not change the quote.",
          },
          {
            n: "03",
            title: "A complaint",
            body: "Say what went wrong. A refund or a credit is not decided on this form.",
          },
        ].map((item) => (
          <div key={item.title} className="panel panel-hover rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-3xl">{item.title}</h2>
              <p className="font-mono text-sm text-subtle">{item.n}</p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-10 py-16 lg:grid-cols-[1fr_0.9fr]">
        <EnquiryForm
          desk
          initialMatter="fault"
          matters={MATTERS}
          submitLabel="Send to the desk"
          doneTitle="Recorded."
          doneBody="Recorded for founder review. No automatic reply is sent and no work starts on your systems. Nothing has been refunded, cancelled, or quoted."
          nameMinLength={2}
          nameMaxLength={160}
          errorMessage="The desk could not record this. Try again in a moment."
          messageRows={6}
        />
        <div className="panel rounded-2xl p-6">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
            <LiveNode className="size-4" aria-hidden="true" />
            Need a quick check?
          </p>
          <h2 className="mt-3 font-serif text-3xl">Before you send the desk a note</h2>
          <ul className="mt-6 space-y-4 text-sm text-muted">
            <li className="border-b border-border pb-3">
              Include what stopped working, when it started, and what you have already tried.
            </li>
            <li className="border-b border-border pb-3">
              Add the customer or site name so the team can trace the work quickly.
            </li>
            <li>
              Keep the message factual. Avoid passwords, remote access keys, or payment details.
            </li>
          </ul>
        </div>
      </section>

      <section className="border-t border-border py-16" aria-labelledby="support-faq-heading">
        <h2 id="support-faq-heading" className="text-4xl sm:text-5xl">
          Common questions
        </h2>
        <Accordion type="single" collapsible className="mt-8 border-t border-border">
          {FAQS.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </PublicFrame>
  );
}
