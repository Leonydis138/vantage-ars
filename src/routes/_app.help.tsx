import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/office/page-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { COMPANY, PUBLIC_EMAIL } from "@/lib/office/company";

export const Route = createFileRoute("/_app/help")({
  head: () => ({ meta: [{ title: "Help · Vantage-ARS" }, { name: "robots", content: "noindex" }] }),
  component: HelpPage,
});

const FAQ = [
  {
    q: "What does the office do on its own?",
    a: "The scheduled pass reads the real state of the business and files work for each agent. Agents act inside their role envelope. Anything costly, customer-facing or irreversible stops at a founder gate and waits for you.",
  },
  {
    q: "How do I stop everything?",
    a: "Settings holds the halt switch. A halt stops every agent and the scheduled pass immediately; records stay exactly as they are. Resume from the same panel.",
  },
  {
    q: "Where do approvals come from?",
    a: "The governor checks every proposed act against the constitution. A cost, a sales handoff, a customer win or loss, and a margin constraint each raise a gate. Approvals lists them with the trace that produced them.",
  },
  {
    q: "How do I bring data in?",
    a: "Import data takes a CSV with at least a company and a subject column. Rows become inbound items in the same inbox as a website enquiry, so the office routes them by its normal rules. A row is skipped if it has no company. Up to 100 rows per import.",
  },
  {
    q: "Is the record tamper-evident?",
    a: "Yes. Every write hashes the previous record, so the chain head on Audit either matches or it does not. Download a checked backup from Audit before any structural change.",
  },
  {
    q: "Why is a task stuck or abandoned?",
    a: "A work item retries with a backoff and gives up after its attempt ceiling, so a permanently failing duty degrades to “reported” instead of looping. Failed items are listed on Tasks with the last error.",
  },
  {
    q: "Which browser preferences are saved?",
    a: "Compact lists, relative timestamps and whether finished work is shown. They are stored in this browser only and never change an office record.",
  },
];

const LINKS = [
  { to: "/support", title: "Contact support", body: "Open a support request with the public support desk." },
  { to: "/status", title: "Public status", body: "What the site and desk report to the outside world." },
  { to: "/guides", title: "Guides", body: "Published notes on VoIP, networking and infrastructure." },
  { to: "/rates", title: "Rates", body: "The published price lines the office quotes from." },
  { to: "/office/constitution", title: "Constitution", body: "The provisions every act is checked against." },
  { to: "/tasks", title: "Work queue", body: "See what the desk owes and what failed." },
] as const;

function HelpPage() {
  return (
    <div className="enter-up mx-auto max-w-3xl">
      <PageHeader
        kicker="Help centre"
        title="How this desk works."
        description="Short answers about autonomy, gates, the record and imports — plus the fastest route to a person."
      />

      <Card className="mb-6">
        <h2 className="font-serif text-xl">Frequently asked</h2>
        <Accordion type="single" collapsible className="mt-2">
          {FAQ.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger className="text-sm">{item.q}</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm leading-relaxed text-muted">{item.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>

      <Card className="mb-6">
        <h2 className="font-serif text-xl">Documentation and tools</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className="font-medium text-fg hover:text-accent">
                {link.title}
              </Link>
              <span className="text-muted"> — {link.body}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-serif text-xl">Still stuck?</h2>
        <p className="mt-2 text-sm text-muted">
          Mail{" "}
          <a href={`mailto:${PUBLIC_EMAIL}`} className="text-accent underline-offset-4 hover:underline">
            {PUBLIC_EMAIL}
          </a>{" "}
          or use the support desk. The office runs from {COMPANY.jurisdiction} and keeps hours in{" "}
          {COMPANY.timezone.replace("_", " ")}.
        </p>
        <p className="mt-3 text-xs text-subtle">
          Never send a password, a backup file or a customer list by email.
        </p>
      </Card>
    </div>
  );
}
