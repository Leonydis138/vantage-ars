import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { WatchtowerMark } from "@/components/brand/mark";
import { LiveField } from "@/components/public/live-field";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { haltOffice } from "@/lib/office/api";
import { formatNowClock, formatZar } from "@/lib/office/format";
import type { OfficeSnapshot } from "@/lib/office/types";
import { cn } from "@/lib/utils";
import { UserButton } from "@/lib/auth/gates";
import { OfficeSearch } from "@/components/office/office-search";

type AppShellProps = {
  snapshot?: OfficeSnapshot | null;
  children: React.ReactNode;
};

type NavItem = { href: string; label: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/office", label: "Command" },
  { href: "/office/approvals", label: "Approvals" },
  { href: "/office/floor", label: "Floor" },
  { href: "/office/inbox", label: "Inbox" },
  { href: "/office/customers", label: "Customers" },
  { href: "/office/chat", label: "Chat" },
  { href: "/office/service", label: "Service" },
  { href: "/office/catalogue", label: "Catalogue" },
  { href: "/office/marketing", label: "Marketing" },
  { href: "/office/briefs", label: "Briefs" },
  { href: "/office/sales", label: "Sales" },
  { href: "/office/ledger", label: "Ledger" },
  { href: "/office/technical", label: "Technical" },
  { href: "/office/revenue", label: "Revenue" },
  { href: "/office/delegations", label: "Delegation" },
  { href: "/office/constitution", label: "Constitution" },
  { href: "/office/governance", label: "Record" },
  { href: "/office/audit", label: "Audit" },
  { href: "/office/metrics", label: "Metrics" },
];

const GOVERNANCE_HREFS = new Set([
  "/office/delegations",
  "/office/constitution",
  "/office/governance",
  "/office/audit",
  "/office/metrics",
]);

const CUSTOMER_WORKSPACE_HREFS = new Set([
  "/office/customers",
  "/office/inbox",
  "/office/sales",
  "/office/service",
  "/office/revenue",
  "/office/ledger",
]);
const CUSTOMER_WORKSPACE_ITEMS = NAV_ITEMS.filter((item) =>
  CUSTOMER_WORKSPACE_HREFS.has(item.href),
);
const OPERATIONS_NAV_ITEMS = NAV_ITEMS.filter(
  (item) => !GOVERNANCE_HREFS.has(item.href) && !CUSTOMER_WORKSPACE_HREFS.has(item.href),
);
const GOVERNANCE_NAV_ITEMS = NAV_ITEMS.filter((item) => GOVERNANCE_HREFS.has(item.href));

function NavLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  const location = useLocation();

  const active =
    href === "/office" ? location.pathname === "/office" : location.pathname.startsWith(href);

  return (
    <Link
      to={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "office-nav-link group relative flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-medium transition-all duration-200",
        active
          ? "border-accent/30 bg-accent/10 text-accent shadow-[inset_0_0_0_1px_rgba(54,217,255,0.08)]"
          : "border-transparent text-muted hover:border-border/60 hover:bg-raised/40 hover:text-fg",
      )}
    >
      <span>{label}</span>

      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-opacity duration-200",
          active ? "bg-accent opacity-100" : "bg-muted opacity-0 group-hover:opacity-40",
        )}
      />
    </Link>
  );
}

function OfficeNavigation({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className={cn("office-navigation space-y-1", mobile ? "px-1 py-4" : "px-3 py-5")}>
      <div className="office-nav-heading mb-3 px-3 font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
        Customer workspace
      </div>

      {CUSTOMER_WORKSPACE_ITEMS.map((item) => (
        <NavLink key={item.href} {...item} onClick={onNavigate} />
      ))}

      <div className="office-nav-heading mb-3 mt-7 px-3 font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
        Operations
      </div>

      {OPERATIONS_NAV_ITEMS.map((item) => (
        <NavLink key={item.href} {...item} onClick={onNavigate} />
      ))}

      <div className="office-nav-heading mb-3 mt-7 px-3 font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
        Governance
      </div>

      {GOVERNANCE_NAV_ITEMS.map((item) => (
        <NavLink key={item.href} {...item} onClick={onNavigate} />
      ))}
    </nav>
  );
}

export function AppShell({ snapshot, children }: AppShellProps) {
  const router = useRouter();
  const [halting, setHalting] = useState(false);
  const [haltError, setHaltError] = useState("");

  const halted = snapshot?.company.halted === true;
  const treasury = snapshot?.company.treasuryCents ?? 0;
  const receivable = snapshot?.company.receivableCents ?? 0;
  const payable = snapshot?.company.payableCents ?? 0;

  async function toggleHalt() {
    if (halting) return;
    setHaltError("");
    setHalting(true);
    try {
      await haltOffice({
        data: {
          halted: !halted,
          reason: halted
            ? "Founder resumed operations from the office shell."
            : "Founder halted the office from the office shell.",
        },
      });
      await router.invalidate();
    } catch (reason) {
      setHaltError(reason instanceof Error ? reason.message : "Could not change the halt state.");
    } finally {
      setHalting(false);
    }
  }

  return (
    <div className="office-shell relative min-h-dvh overflow-hidden bg-bg text-fg">
      <LiveField />

      <a
        href="#office-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:text-accent"
      >
        Skip to content
      </a>

      <div className="relative z-10 min-h-dvh">
        <aside className="office-sidebar fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-border/70 bg-surface/65 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="border-b border-border/70 px-5 py-5">
            <Link to="/office" className="group flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 shadow-[0_0_30px_rgba(54,217,255,0.18)]">
                <WatchtowerMark className="h-7 w-7 shrink-0 transition-transform group-hover:scale-105" />
              </div>

              <div className="min-w-0">
                <div className="font-mono text-[10px] font-semibold tracking-[0.22em] text-fg">
                  VANTAGE-ARS
                </div>
                <div className="mt-1 truncate font-mono text-[8px] uppercase tracking-[0.18em] text-muted">
                  Network operations desk
                </div>
              </div>
            </Link>
          </div>

          <div className="border-b border-border/60 px-5 py-3">
            <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.18em]">
              <span className="flex items-center gap-2 text-muted">
                <span className={cn("live-dot", halted && "opacity-40")} />
                {halted ? "Halted" : "A3 live"}
              </span>
              <span className="rounded-full border border-accent/20 bg-accent/8 px-2 py-1 text-accent">
                SAST
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <OfficeNavigation />
          </div>

          <div className="border-t border-border/70 p-4">
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border/60 bg-bg/30 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="font-mono text-[8px] uppercase tracking-[0.15em] text-muted">
                  Treasury
                </div>
                <div className="mt-1 font-mono text-xs text-fg">{formatZar(treasury)}</div>
              </div>

              <div className="rounded-xl border border-border/60 bg-bg/30 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="font-mono text-[8px] uppercase tracking-[0.15em] text-muted">
                  Clock
                </div>
                <div className="mt-1 font-mono text-xs text-fg">
                  {(() => {
                    const clock = formatNowClock();
                    return (
                      <>
                        {clock.date} {clock.time}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            <p aria-live="polite" className="sr-only">
              {halted
                ? "Office halted. Agents cannot act."
                : `Office live. Treasury ${formatZar(treasury)}, receivable ${formatZar(receivable)}, payable ${formatZar(payable)}.`}
            </p>

            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-center",
                halted
                  ? "border-ok/30 text-ok hover:bg-ok/5"
                  : "border-danger/25 text-danger hover:border-danger/45 hover:bg-danger/5",
              )}
              disabled={halting}
              aria-busy={halting}
              onClick={toggleHalt}
            >
              {halting ? "Working…" : halted ? "Resume office" : "Halt office"}
            </Button>

            {haltError ? (
              <p role="alert" className="mt-2 text-center font-mono text-[9px] text-danger">
                {haltError}
              </p>
            ) : null}
          </div>
        </aside>

        <div className="office-mobile-header sticky top-0 z-50 border-b border-border/70 bg-bg/80 backdrop-blur-xl lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Open office navigation"
                  >
                    Menu
                  </Button>
                </SheetTrigger>

                <SheetContent
                  side="left"
                  aria-label="Office navigation"
                  className="w-[290px] border-r border-border/70 bg-bg/95 p-0 backdrop-blur-xl"
                >
                  <div className="border-b border-border/70 px-5 py-5">
                    <Link to="/office" className="flex items-center gap-3">
                      <WatchtowerMark className="h-9 w-9" />

                      <div>
                        <div className="font-mono text-xs font-semibold tracking-[0.2em]">
                          VANTAGE-ARS
                        </div>

                        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                          Network operations desk
                        </div>
                      </div>
                    </Link>
                  </div>

                  <div className="max-h-[calc(100dvh-90px)] overflow-y-auto">
                    <OfficeNavigation mobile />
                  </div>
                </SheetContent>
              </Sheet>

              <Link to="/office" className="flex items-center gap-2">
                <WatchtowerMark className="h-7 w-7" />

                <span className="font-mono text-[10px] font-semibold tracking-[0.18em]">
                  VANTAGE-ARS
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {snapshot ? <OfficeSearch snapshot={snapshot} compact /> : null}

              <span className="hidden font-mono text-[9px] uppercase tracking-[0.15em] text-muted sm:inline">
                {halted ? "Halted" : "A3 live"}
              </span>

              <UserButton />
            </div>
          </div>
        </div>

        <div className="lg:pl-72">
          <header className="office-topbar hidden border-b border-border/70 bg-bg/65 backdrop-blur-xl lg:block">
            <div className="flex h-16 items-center justify-between px-6 xl:px-8">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
                  Private operations
                </div>

                <div className="mt-1 flex items-center gap-2 font-mono text-xs">
                  <span className="live-dot" />
                  {halted ? "Office halted" : "Network operations active"}
                </div>
              </div>

              <div className="flex items-center gap-6">
                {snapshot ? <OfficeSearch snapshot={snapshot} shortcut /> : null}

                <div className="text-right">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                    SAST
                  </div>

                  <div className="font-mono text-xs">
                    {(() => {
                      const clock = formatNowClock();
                      return (
                        <>
                          {clock.date} {clock.time}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                    Treasury
                  </div>

                  <div className="font-mono text-xs text-accent">{formatZar(treasury)}</div>
                </div>

                <UserButton />
              </div>
            </div>
          </header>

          <main
            id="office-main"
            className="office-content relative min-h-[calc(100dvh-4rem)] px-4 py-6 sm:px-6 lg:px-8 xl:px-10"
          >
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
