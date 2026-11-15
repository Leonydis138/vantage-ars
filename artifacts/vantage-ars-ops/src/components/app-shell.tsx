import { useClerk, useUser } from "@clerk/react";
import { Activity, ArrowUpRight, ClipboardList, Inbox, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

export function AppShell({
  children,
  section,
}: {
  children: ReactNode;
  section: "overview" | "inbox";
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [location] = useLocation();
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Owner";
  const firstInitial = displayName.charAt(0).toUpperCase();

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/" className="brand sidebar-brand">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>VANTAGE<span className="brand-light"> ARS</span><small>COGNITIVE OPERATIONS</small></span>
        </Link>
        <div className="sidebar-label">OPERATIONS</div>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/dashboard" className={`nav-link ${section === "overview" ? "active" : ""}`}><LayoutDashboard size={17} /> Overview</Link>
          <Link href="/inbox" className={`nav-link ${section === "inbox" || location.startsWith("/inquiries/") ? "active" : ""}`}><Inbox size={17} /> Enquiries</Link>
          <Link href="/audit" className={`nav-link ${location.startsWith("/audit") ? "active" : ""}`}><ClipboardList size={17} /> Audit</Link>
        </nav>
        <div className="sidebar-lower">
          <div className="secure-note"><ShieldCheck size={16} /><span><b>Owner controlled</b><small>Runs when services are ready · pause anytime</small></span></div>
          <a className="site-link" href="https://vantage-ars.co.za" target="_blank" rel="noreferrer">vantage-ars.co.za <ArrowUpRight size={14} /></a>
          <div className="profile-row">
            <span className="profile-avatar">{firstInitial}</span>
            <span className="profile-info"><b>{displayName}</b><small>Business owner</small></span>
            <button className="icon-button signout-button" aria-label="Sign out" title="Sign out" onClick={() => void signOut({ redirectUrl: import.meta.env.BASE_URL || "/" })}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>VANTAGE ARS</span><span className="breadcrumb-slash">/</span><b>{section === "overview" ? "OVERVIEW" : "ENQUIRIES"}</b></div>
          <div className="topbar-status"><span className="status-indicator" /> PRIVATE WORKSPACE <span className="topbar-divider" /> <Activity size={14} /> LIVE SERVICES</div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
