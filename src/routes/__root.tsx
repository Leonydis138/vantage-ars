import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PublicChat } from "@/components/chat/live-chat";
import { PublicFrame } from "@/components/public/site-frame";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { useSiteSignals } from "@/lib/site/signals";
import appCss from "../styles.css?url";
import { validateEnv } from "@/lib/env";

// Validate critical environment variables once when the server module loads.
// Guarded so it never runs in the browser. Autonomy-enabled deployments fail
// fast on missing cron/auth configuration so the office never starts half-wired.
if (typeof window === "undefined") {
  const report = validateEnv();
  if (report.blocked.length > 0) {
    throw new Error(`[vantage-ars] ${report.blocked.join(" ")}`);
  }
}

const APP_NAME = "Vantage-ARS";

/**
 * Server-only bridge to the in-process heartbeat. Keeping the `.server` import
 * inside `createServerOnlyFn` satisfies TanStack's client-bundle protection;
 * the route file itself is shared by the client and the server.
 */
const startOfficeHeartbeat = createServerOnlyFn(async () => {
  const { startSelfScheduler } = await import("@/lib/office/self-scheduler.server");
  return startSelfScheduler();
});

export const Route = createRootRoute({
  /**
   * The first request in a long-lived process starts the office's own
   * heartbeat. It is idempotent and self-disabling: serverless runtimes,
   * tests, `SELF_SCHEDULER=off` and a missing `AUTONOMY=on` all return without
   * starting a timer. No authority is created here — the tick still asks the
   * scheduler, which asks the governor, exactly as the cron endpoint does.
   */
  beforeLoad: async () => {
    if (typeof window !== "undefined") return;
    try {
      await startOfficeHeartbeat();
    } catch (error) {
      // A heartbeat that cannot start must never take the public site down.
      // The external cron path remains fully available.
      console.error("[self-scheduler] could not start", error);
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Worldwide remote VoIP, networking and IT infrastructure support from Vantage-ARS, with clear ZAR pricing.",
      },
      { name: "theme-color", content: "#050a12" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      // Fonts are fetched in CORS mode; without this the preconnected socket is
      // not reused for the actual font request.
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  notFoundComponent: NotFound,
  component: () => (
    <html lang="en-ZA" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <SiteSignals />
            <Outlet />
            <PublicChat />
          </TooltipProvider>
        </AuthProvider>
        <Toaster theme="light" position="bottom-right" />
        <Analytics />
        <Scripts />
      </body>
    </html>
  ),
});

/**
 * Report the page the visitor is actually reading, so SIGNAL has real traffic
 * data. Mounted at the root so single-page navigations count too, and it only
 * fires for public pages — the office never reports itself.
 */
function SiteSignals() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useSiteSignals(pathname);
  return null;
}

function NotFound() {
  return (
    <PublicFrame>
      <section className="py-24">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Missing page</p>
        <h1 className="mt-4 font-serif text-4xl tracking-[-0.03em]">
          That page is not on this site.
        </h1>
        <p className="mt-4 max-w-md text-sm text-muted">
          The services, the service desk, and the published rates are still here.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
        >
          Back to services
        </Link>
      </section>
    </PublicFrame>
  );
}
