import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchSite, type SearchKind } from "@/lib/site/search";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<SearchKind, string> = {
  page: "Page",
  service: "Service",
  rate: "Rate",
  answer: "Answer",
  guide: "Guide",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

/**
 * Search every public page, service, rate and answer without leaving the page.
 *
 * The index is the site's own published copy, so a result can never reveal an
 * office record. The dialog is a convenience over normal navigation; every
 * result is also reachable from the navigation and footer.
 */
export function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const results = useMemo(() => searchSite(query), [query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (commandK || (slash && !isTypingTarget(event.target))) {
        event.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      const href = results[active].href;
      close();
      // Client-side navigation: a full document load would throw away the
      // in-page state and re-download the whole site for one result.
      navigate({ to: href as never });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search this site"
        className="cta-ghost flex h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden lg:inline">Search</span>
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="p-0">
          <DialogTitle className="sr-only">Search this site</DialogTitle>
          <DialogDescription className="sr-only">
            Search published services, rates, common questions and public pages.
          </DialogDescription>

          <div className="border-b border-border px-4 py-3">
            <label htmlFor="site-search-input" className="sr-only">
              Search services, rates and answers
            </label>
            <div className="flex items-center gap-2">
              <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <Input
                ref={inputRef}
                id="site-search-input"
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search services, rates and answers…"
                autoComplete="off"
                spellCheck={false}
                className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0"
                aria-controls="site-search-results"
              />
            </div>
          </div>

          <div id="site-search-results" className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
            {query.trim() && results.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted">
                <p className="font-medium text-fg">Nothing published matches that.</p>
                <p className="mt-1">
                  Try a service name, a rate, or a word from the question. You can also{" "}
                  <Link
                    to="/support"
                    onClick={close}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    ask the service desk
                  </Link>
                  .
                </p>
              </div>
            ) : !query.trim() ? (
              <div className="px-3 py-6 text-sm text-muted">
                <p className="font-medium text-fg">Search what this site publishes.</p>
                <p className="mt-1">
                  Services, published rates, common questions and public pages. Office records and
                  customer documents are never in this index.
                </p>
              </div>
            ) : (
              <nav aria-label="Search results">
                <ul>
                  {results.map((item, index) => (
                    <li key={item.id}>
                      <Link
                        to={item.href as never}
                        onClick={close}
                        onMouseEnter={() => setActive(index)}
                        className={cn(
                          "block rounded-lg px-3 py-2.5 transition-colors",
                          active === index ? "bg-raised" : "hover:bg-raised/60",
                        )}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-fg">{item.title}</span>
                          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[9px] tracking-[0.12em] text-subtle uppercase">
                            {KIND_LABEL[item.kind]}
                          </span>
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-muted">
                          {item.description}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>

          <p className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-[10px] tracking-[0.12em] text-subtle uppercase">
            <span>Ctrl/⌘ K or / to open</span>
            <span>Esc to close</span>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
