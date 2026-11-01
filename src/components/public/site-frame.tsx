import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  BookOpen,
  ChevronDown,
  FileText,
  Gauge,
  Headphones,
  Menu as MenuIcon,
  MessageCircle,
  Network,
  Search,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { WatchtowerMark } from "@/components/brand/mark";
import { PUBLIC_EMAIL } from "@/lib/office/company";
import { formatNowClock } from "@/lib/office/money";
import { LiveField } from "@/components/public/live-field";
import { GlobeIcon, NoTiesIcon, QuoteIcon, SignalBars } from "@/components/public/motion-icons";
import { SiteSearch } from "@/components/public/site-search";
import { SERVICE_PAGES } from "@/lib/site/services";
import { PUBLISHED_RATES } from "@/lib/office/catalogue";

const nav = [
  { to: "/services", hash: undefined, label: "Services", Icon: Network },
  { to: "/find", hash: undefined, label: "Find help", Icon: Search },
  { to: "/automation", hash: undefined, label: "AI automation", Icon: Workflow },
  { to: "/rates", hash: undefined, label: "Rates", Icon: BadgeDollarSign },
  { to: "/support", hash: undefined, label: "Service desk", Icon: Headphones },
] as const;

const exploreSections = [
  {
    number: "01",
    title: "Start with the problem",
    note: "Not sure what the fault is called? Begin with what you notice.",
    links: [
      { to: "/find", label: "Find the right service", Icon: Search },
      { to: "/assess", label: "Assess IT readiness", Icon: Gauge },
      { to: "/support", label: "Ask the service desk", Icon: Headphones },
    ],
  },
  {
    number: "02",
    title: "See the shape of the work",
    note: "Understand the scope, boundaries and published price first.",
    links: [
      { to: "/services", label: "Browse service lines", Icon: Network },
      { to: "/rates", label: "See published rates", Icon: BadgeDollarSign },
      { to: "/automation", label: "Explore AI automation", Icon: Workflow },
      { to: "/tools/email-auth", label: "Check email authentication", Icon: ShieldCheck },
      { to: "/tools/network-path", label: "Check a network path", Icon: Activity },
    ],
  },
  {
    number: "03",
    title: "Follow the thinking",
    note: "Read practical guides and see how the desk operates.",
    links: [
      { to: "/guides", label: "Read the guides", Icon: BookOpen },
      { to: "/work", label: "See the work", Icon: FileText },
      { to: "/model", label: "How the office works", Icon: Workflow },
    ],
  },
] as const;

const trustPills = [
  { label: "Written quote first", Icon: QuoteIcon },
  { label: "No uptime promise", Icon: NoTiesIcon },
  { label: "Remote support worldwide", Icon: GlobeIcon },
] as const;

/** The published amount for a rate, read from the catalogue and never typed out here. */
function zarAmount(rateId: string): string {
  const rate = PUBLISHED_RATES.find((item) => item.id === rateId);
  return rate?.price.match(/R[\d,]+/)?.[0] ?? "";
}

export function PublicFrame({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  // The server cannot know the visitor's current minute, and rendering one
  // during SSR guaranteed a hydration mismatch whenever the two renders straddled
  // a minute boundary. Start empty and fill in after mount instead.
  const [clock, setClock] = useState<{ date: string; time: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const tick = () => setClock(formatNowClock());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    // Escape closes the menu and hands focus back to the button that opened it —
    // without that, focus drops to <body> and a keyboard user loses their place.
    // An outside click is not restored: focus should follow what was clicked.
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  return (
    <div className="site relative min-h-dvh bg-bg">
      <LiveField />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:text-accent-fg"
      >
        Skip to main content
      </a>

      <div className="site-trustbar relative z-10 border-b border-border/60 bg-surface/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-2 sm:px-6">
          <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            <SignalBars className="size-3.5 text-accent" aria-hidden="true" />
            VoIP · Networking · IT infrastructure
          </span>
          <span className="hidden h-3 w-px bg-border sm:block" aria-hidden="true" />
          {trustPills.map(({ label, Icon }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 text-[11px] tracking-[0.14em] text-subtle uppercase"
            >
              <Icon className="size-3.5 text-accent" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Vantage-ARS home">
            <WatchtowerMark className="size-6 text-accent" />
            <span className="leading-none">
              <span className="block font-mono text-xs tracking-[0.22em] text-fg">VANTAGE-ARS</span>
              <span className="mt-0.5 hidden font-mono text-[9px] tracking-[0.28em] text-subtle sm:block">
                NETWORK OPERATIONS DESK
              </span>
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-3 lg:flex xl:gap-5">
            {nav.map(({ Icon, ...item }) => (
              <Link
                key={item.label}
                to={item.to}
                hash={"hash" in item ? item.hash : undefined}
                aria-current={
                  pathname === item.to || pathname.startsWith(`${item.to}/`) ? "page" : undefined
                }
                className="nav-link inline-flex items-center gap-1.5 rounded-sm py-2 text-[13px] font-medium"
              >
                <Icon className="size-3.5 opacity-75" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
            <details className="site-more-menu site-flow-menu group relative">
              <summary className="nav-link flex cursor-pointer list-none items-center gap-1 rounded-sm py-2 text-[13px] font-medium">
                Route map
                <ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="site-more-popover site-flow-popover absolute right-0 z-40 mt-4 w-[min(58rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-[var(--shadow-panel)]">
                <div className="site-flow-heading">
                  <span className="site-flow-overline">Choose a starting point</span>
                  <span className="site-flow-title">Every route leads to a clearer next step.</span>
                  <span className="site-flow-note">
                    Follow the path that fits. All work starts with a written scope.
                  </span>
                </div>
                <svg
                  className="site-flow-connector"
                  viewBox="0 0 900 86"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    className="site-flow-track"
                    d="M32 12H150V28C150 50 168 68 190 68H710C732 68 750 50 750 28V12H868"
                  />
                  <path
                    className="site-flow-trace"
                    pathLength="1"
                    d="M32 12H150V28C150 50 168 68 190 68H710C732 68 750 50 750 28V12H868"
                  />
                  {[
                    [32, 12],
                    [150, 12],
                    [450, 68],
                    [750, 12],
                    [868, 12],
                  ].map(([cx, cy]) => (
                    <circle key={cx} className="site-flow-node" cx={cx} cy={cy} r="5" />
                  ))}
                  <circle className="site-flow-packet" r="3">
                    <animateMotion
                      dur="5s"
                      repeatCount="indefinite"
                      path="M32 12H150V28C150 50 168 68 190 68H710C732 68 750 50 750 28V12H868"
                    />
                  </circle>
                </svg>
                <div className="site-flow-columns">
                  {exploreSections.map((section) => (
                    <section key={section.number} className="site-flow-column">
                      <p className="site-flow-number">{section.number} / ROUTE</p>
                      <h2>{section.title}</h2>
                      <p className="site-flow-description">{section.note}</p>
                      <div className="site-flow-links">
                        {section.links.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={(event) => {
                              event.currentTarget.closest("details")?.removeAttribute("open");
                            }}
                            className="site-more-link"
                          >
                            <item.Icon className="size-4 shrink-0 text-accent/70" aria-hidden="true" />
                            <span>{item.label}</span>
                            <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                          </Link>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
                <div className="site-flow-footer">
                  <SignalBars className="size-4" aria-hidden="true" />
                  <span>One connected desk · remote worldwide · quote before work</span>
                </div>
              </div>
            </details>
            <button
              type="button"
              className="nav-link inline-flex items-center gap-1.5 text-[13px] font-medium"
              onClick={() => window.dispatchEvent(new Event("vantage-open-chat"))}
            >
              <MessageCircle className="size-3.5 opacity-75" aria-hidden="true" />
              Chat
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <SiteSearch />
            <Link
              to="/"
              hash="enquiry"
              className="cta hidden h-10 items-center rounded-md px-4 text-sm font-medium lg:inline-flex"
            >
              Get a quote <ArrowRight className="ml-1 size-4" aria-hidden="true" />
            </Link>

            <div ref={menuRef} className="relative lg:hidden">
              <button
                ref={menuButtonRef}
                type="button"
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                onClick={() => setMenuOpen((open) => !open)}
                className="cta-ghost flex h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium"
              >
                {menuOpen ? (
                  <X className="size-4" aria-hidden="true" />
                ) : (
                  <MenuIcon className="size-4" aria-hidden="true" />
                )}
                {menuOpen ? "Close" : "Menu"}
              </button>
              {/* Always rendered so `aria-controls` resolves even when closed;
                  `hidden` keeps it out of the accessibility tree and layout. */}
              <nav
                id="mobile-nav"
                aria-label="Mobile navigation"
                hidden={!menuOpen}
                className="site-mobile-routes glass absolute right-0 z-40 mt-2 w-[min(23rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-3 text-fg shadow-[var(--shadow-panel)]"
              >
                <p className="site-mobile-routes-heading">Follow a route</p>
                <div className="site-mobile-flow">
                  {exploreSections.map((section) => (
                    <section key={section.number} className="site-mobile-flow-section">
                      <p className="site-mobile-flow-title">
                        <span>{section.number}</span>
                        {section.title}
                      </p>
                        {section.links.map(({ Icon, ...item }) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMenuOpen(false)}
                          aria-current={
                            pathname === item.to || pathname.startsWith(`${item.to}/`)
                              ? "page"
                              : undefined
                          }
                          className="site-mobile-nav-link flex items-center gap-2.5 rounded-md px-3 py-2 text-sm"
                        >
                          <Icon className="size-4 shrink-0 text-accent/70" aria-hidden="true" />
                          {item.label}
                        </Link>
                      ))}
                    </section>
                  ))}
                </div>
                <button
                  type="button"
                  className="site-mobile-nav-link flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm"
                  onClick={() => {
                    setMenuOpen(false);
                    window.dispatchEvent(new Event("vantage-open-chat"));
                  }}
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  Chat
                </button>
                <Link
                  to="/"
                  hash="enquiry"
                  onClick={() => setMenuOpen(false)}
                  className="cta mt-2 flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold"
                >
                  Get a quote <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* tabIndex=-1 so the skip link moves focus here (not just scroll). */}
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 mx-auto max-w-7xl px-5 pb-28 sm:px-8"
      >
        {children}
      </main>

      <footer className="relative z-10 border-t border-border bg-surface/60 backdrop-blur-sm">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <WatchtowerMark className="size-5 text-accent" />
              <p className="font-mono text-xs tracking-[0.22em]">VANTAGE-ARS</p>
            </div>
            <p className="mt-3 text-sm text-muted">
              VoIP, networking and IT infrastructure support.
            </p>
            <Link
              to="/status"
              className="mt-4 flex items-center gap-2 text-xs text-subtle transition-colors hover:text-fg"
            >
              <span className="live-dot size-1.5 rounded-full bg-ok" aria-hidden="true" />
              Desk status · Remote worldwide
            </Link>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-subtle">
              Services
            </p>
            {SERVICE_PAGES.map((page) => (
              <Link
                key={page.slug}
                to="/services/$slug"
                params={{ slug: page.slug }}
                className="text-muted transition-colors hover:text-fg"
              >
                {page.title}
              </Link>
            ))}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-subtle">Company</p>
            <Link to="/find" className="text-muted transition-colors hover:text-fg">
              Find a service
            </Link>
            <Link to="/assess" className="text-muted transition-colors hover:text-fg">
              IT readiness assessment
            </Link>
            <Link to="/automation" className="text-muted transition-colors hover:text-fg">
              AI automation assessment
            </Link>
            <Link to="/work" className="text-muted transition-colors hover:text-fg">
              Work
            </Link>
            <Link to="/model" className="text-muted transition-colors hover:text-fg">
              How the office runs
            </Link>
            <Link to="/rates" className="text-muted transition-colors hover:text-fg">
              Rates
            </Link>
            <Link to="/guides" className="text-muted transition-colors hover:text-fg">
              Guides
            </Link>
            <Link to="/tools/email-auth" className="text-muted transition-colors hover:text-fg">
              Email authentication check
            </Link>
            <Link to="/tools/network-path" className="text-muted transition-colors hover:text-fg">
              Browser network-path check
            </Link>
            <Link to="/support" className="text-muted transition-colors hover:text-fg">
              Service desk
            </Link>
            <Link to="/status" className="text-muted transition-colors hover:text-fg">
              Status
            </Link>
            <Link to="/terms" className="text-muted transition-colors hover:text-fg">
              How work is agreed
            </Link>
            <Link to="/privacy" className="text-muted transition-colors hover:text-fg">
              Privacy
            </Link>
          </div>

          <div className="text-sm text-muted">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-subtle">Contact</p>
            <a
              className="mt-2 block transition-colors hover:text-fg"
              href={`mailto:${PUBLIC_EMAIL}`}
            >
              {PUBLIC_EMAIL}
            </a>
            <p className="mt-3">South African rand. A written quote before any work.</p>
            <Link
              to="/office"
              className="mt-4 inline-block text-xs text-subtle transition-colors hover:text-fg"
            >
              Sign in
            </Link>
          </div>
        </div>
        <div className="border-t border-border">
          <p
            aria-hidden="true"
            className="select-none overflow-hidden px-4 pt-8 text-[clamp(2rem,7vw,5rem)] leading-none font-bold tracking-[-0.04em] text-fg/5 sm:px-6"
          >
            VANTAGE-ARS
          </p>
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-subtle sm:px-6">
            {/* The year only ever differs across a New Year boundary; suppress
                rather than blank it for a year to avoid a visible gap. */}
            <p suppressHydrationWarning>
              © {new Date().getFullYear()} Vantage-ARS. Quoted work and monthly managed plans — no
              uptime promise, no contractual service level.
            </p>
            <p className="flex items-center gap-3 font-mono">
              <span>
                {zarAmount("remote-support")}/hr remote · {zarAmount("onsite-support")}/hr on-site ·
                VAT only where quoted
              </span>
              {clock ? (
                <>
                  <span className="hidden h-3 w-px bg-border sm:block" aria-hidden="true" />
                  <span className="hidden items-center gap-1.5 sm:flex">
                    <span className="live-dot size-1.5 rounded-full bg-ok" aria-hidden="true" />
                    {clock.time} SAST
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
