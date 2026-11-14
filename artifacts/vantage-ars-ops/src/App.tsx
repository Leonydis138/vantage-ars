import { useEffect, useRef, type ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { DashboardPage } from "@/pages/dashboard";
import { InboxPage } from "@/pages/inbox";
import { InquiryPage } from "@/pages/inquiry";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 20_000 },
    mutations: { retry: false },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#55d8e8",
    colorForeground: "#ecf5fa",
    colorMutedForeground: "#91a4b4",
    colorDanger: "#ff7c7c",
    colorBackground: "#101c2a",
    colorInput: "#0c1724",
    colorInputForeground: "#ecf5fa",
    colorNeutral: "#ecf5fa",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#101c2a] rounded-2xl w-[440px] max-w-full overflow-hidden border border-white/10",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white",
    headerSubtitle: "text-slate-400",
    formFieldLabel: "text-slate-200",
    formFieldInput: "bg-[#0c1724] text-white border-white/15",
    footerActionLink: "text-cyan-300",
    footerActionText: "text-slate-400",
    logoBox: "w-full flex justify-center pt-6 pb-2",
    logoImage: "h-[38px] w-[180px] object-contain",
    socialButtonsBlockButton: "border-white/15 text-white",
    formButtonPrimary: "bg-cyan-300 text-slate-950",
  },
};

function AuthCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previousId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousId.current !== undefined && previousId.current !== userId) {
        cache.clear();
      }
      previousId.current = userId;
    });
    return unsubscribe;
  }, [addListener, cache]);
  return null;
}

function LoadingPage() {
  return (
    <main className="auth-loading">
      <div className="loader-mark" />
      <span>Checking secure access</span>
    </main>
  );
}

function PublicHome() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && isSignedIn) setLocation("/dashboard", { replace: true });
  }, [isLoaded, isSignedIn, setLocation]);

  if (!isLoaded || isSignedIn) return <LoadingPage />;

  return (
    <main className="landing">
      <div className="landing-top">
        <a className="brand" href={basePath || "/"}>
          <BrandMark />
          <span>VANTAGE<span className="brand-light"> ARS</span></span>
        </a>
        <a className="button button-outline" href={`${basePath}/sign-in`}>
          Owner sign in
        </a>
      </div>
      <section className="landing-hero">
        <div className="eyebrow"><span className="pulse-dot" /> OWNER CONTROL SYSTEM</div>
        <h1>Technical operations.<br /><em>Under your control.</em></h1>
        <p>
          Grok reviews real customer enquiries, prepares quote proposals, and
          keeps your operations organized. You stay in control of every message,
          customer record, and business decision.
        </p>
        <div className="landing-actions">
          <a className="button button-primary" href={`${basePath}/sign-in`}>Open operations <ArrowIcon /></a>
          <a className="text-link" href="https://vantage-ars.co.za" target="_blank" rel="noreferrer">Visit Vantage ARS ↗</a>
        </div>
        <div className="landing-note"><ShieldIcon /> Real inbox data. No demo records. External actions require owner approval.</div>
      </section>
      <section className="landing-grid">
        <article><span className="step-number">01</span><h2>Monitor</h2><p>Connect live business services and see what needs attention.</p></article>
        <article><span className="step-number">02</span><h2>Prepare</h2><p>Grok triages customer email and drafts quotes from published rates.</p></article>
        <article><span className="step-number">03</span><h2>Approve</h2><p>Review the exact action before any email is sent or CRM record is created.</p></article>
      </section>
      <footer className="landing-footer"><span>VANTAGE ARS · COGNITIVE OPERATIONS</span><span>Secure owner access · South Africa</span></footer>
    </main>
  );
}

function SignInPage() {
  return <main className="auth-page"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main>;
}

function SignUpPage() {
  return <main className="auth-page"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main>;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation("/sign-in", { replace: true });
  }, [isLoaded, isSignedIn, setLocation]);
  return !isLoaded || !isSignedIn ? <LoadingPage /> : <>{children}</>;
}

function Routed() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={PublicHome} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/dashboard">
          <Protected><AppShell section="overview"><DashboardPage /></AppShell></Protected>
        </Route>
        <Route path="/inbox">
          <Protected><AppShell section="inbox"><InboxPage /></AppShell></Protected>
        </Route>
        <Route path="/inquiries/:inquiryId">
          {(params) => <Protected><AppShell section="inbox"><InquiryPage inquiryId={params.inquiryId} /></AppShell></Protected>}
        </Route>
        <Route>
          <Protected><AppShell section="overview"><DashboardPage /></AppShell></Protected>
        </Route>
      </Switch>
    </ErrorBoundary>
  );
}

function ClerkApplication() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <AuthCacheInvalidator />
        <Routed />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkApplication />
    </WouterRouter>
  );
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ShieldIcon() {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M9 2.2 14.5 4v4.2c0 3.5-2.4 6.1-5.5 7.6-3.1-1.5-5.5-4.1-5.5-7.6V4L9 2.2Z" stroke="currentColor" strokeWidth="1.4" /><path d="m6.7 8.8 1.5 1.5 3.2-3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default App;
