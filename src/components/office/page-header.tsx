import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 rounded-[1.5rem] border border-border/70 bg-gradient-to-r from-surface via-surface to-surface/90 p-5 shadow-[0_20px_60px_-36px_rgba(54,217,255,0.35)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_6px_rgba(54,217,255,0.15)]" aria-hidden="true" />
            {kicker}
          </div>
          <h1 className="mt-4 font-serif text-4xl leading-[1.08] tracking-[-0.03em] text-fg sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
