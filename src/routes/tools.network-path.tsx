import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { PublicFrame } from "@/components/public/site-frame";
import { Button } from "@/components/ui/button";
import {
  checkNetworkPath,
  NETWORK_DIAGNOSTIC_DRAFT_KEY,
  networkPathSummary,
  type NetworkPathResult,
} from "@/lib/site/network-path-check";
import { pageHead } from "@/lib/site/seo";

export const Route = createFileRoute("/tools/network-path")({
  head: () =>
    pageHead({
      title: "Browser NAT path check · Vantage-ARS",
      description:
        "A browser-only WebRTC STUN check for basic network path diagnostics. It does not test SIP ALG, call quality, or packet loss.",
      path: "/tools/network-path",
    }),
  component: NetworkPathPage,
});

function NetworkPathPage() {
  const [consented, setConsented] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<NetworkPathResult | null>(null);

  async function runCheck() {
    setPending(true);
    setError("");
    setResult(null);
    try {
      setResult(await checkNetworkPath());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The browser network check failed.");
    } finally {
      setPending(false);
    }
  }

  function attachResult() {
    if (!result) return;
    try {
      window.sessionStorage.setItem(NETWORK_DIAGNOSTIC_DRAFT_KEY, networkPathSummary(result));
      window.location.assign("/support#enquiry-form");
    } catch {
      setError("The result could not be saved. Copy the report before leaving this page.");
    }
  }

  return (
    <PublicFrame>
      <article className="enter-up max-w-3xl py-16">
        <p className="font-mono text-xs tracking-[0.22em] text-accent uppercase">
          Free browser diagnostic
        </p>
        <h1 className="mt-4 font-serif text-5xl tracking-[-0.03em] sm:text-7xl">
          Check a basic network path
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
          This check asks your browser to gather WebRTC ICE candidates using Google’s public STUN
          server. The browser reports only candidate types and transports to this page; candidate
          addresses are not shown or attached to a support request.
        </p>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          A router feature called SIP ALG is a common cause of calls that register and then fail.{" "}
          <Link
            to="/guides/$slug"
            params={{ slug: "sip-alg-breaks-voip" }}
            className="text-accent underline-offset-4 hover:underline"
          >
            Read the checklist
          </Link>{" "}
          before you change a router setting.
        </p>

        <section className="glass mt-8 space-y-5 rounded-2xl p-5">
          <label className="flex items-start gap-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[var(--color-accent)]"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
            />
            <span>
              I understand the browser contacts Google’s STUN service, which can observe my public
              IP address, and I want to run the check.
            </span>
          </label>
          <Button type="button" disabled={!consented || pending} onClick={() => void runCheck()}>
            {pending ? "Gathering browser candidates…" : "Run network path check"}
          </Button>
        </section>

        {error ? (
          <p role="alert" className="mt-5 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {result ? (
          <section aria-live="polite" className="panel mt-8 rounded-2xl p-6">
            <h2 className="font-serif text-3xl">Browser result</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted">Observation</dt>
                <dd className="text-right font-medium">
                  {result.status === "server-reflexive"
                    ? "STUN-mapped candidate gathered"
                    : result.status === "no-server-reflexive"
                      ? "No STUN-mapped candidate observed"
                      : "No candidates gathered"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted">ICE candidate types</dt>
                <dd>{result.candidateTypes.join(", ") || "None"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted">Transports</dt>
                <dd>{result.protocols.join(", ") || "None"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Gathering time</dt>
                <dd>{result.elapsedMs} ms</dd>
              </div>
              {result.stunErrorCodes.length > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">STUN error codes</dt>
                  <dd>{result.stunErrorCodes.join(", ")}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-5 text-xs leading-relaxed text-subtle">
              This is not a SIP ALG test and does not measure call quality, jitter or packet loss.
              STUN reachability alone cannot identify your router’s NAT behaviour or confirm that
              SIP/RTP will work. For a meaningful fault check, include the PBX, router and SIP
              provider details in your support request.
            </p>
            <Button type="button" onClick={attachResult} className="cta mt-5 border-0">
              Attach result to a support request
            </Button>
          </section>
        ) : null}
      </article>
    </PublicFrame>
  );
}
