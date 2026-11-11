import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Shield, Sparkles } from "lucide-react";
import { PublicFrame } from "@/components/public/site-frame";

export const Route = createFileRoute("/game")({
  head: () => ({
    meta: [
      { title: "Signal Sprint · Vantage-ARS" },
      { name: "description", content: "A tiny arcade run through the signal grid. Dodge outages, collect clean packets, and set a new best." },
    ],
  }),
  component: SignalSprint,
});

type Packet = { id: number; lane: number; y: number; kind: "fault" | "signal" };
type Game = {
  status: "ready" | "running" | "paused" | "over";
  lane: number;
  packets: Packet[];
  tick: number;
  score: number;
  health: number;
  combo: number;
  best: number;
  boost: number;
  shieldUntil: number;
  invulnerableUntil: number;
  nextId: number;
  seed: number;
  lastMessage: string;
};
type Action =
  | { type: "start" }
  | { type: "move"; direction: -1 | 1 }
  | { type: "boost" }
  | { type: "toggle" }
  | { type: "tick" }
  | { type: "best"; value: number };

const initialGame: Game = {
  status: "ready", lane: 2, packets: [], tick: 0, score: 0, health: 3,
  combo: 0, best: 0, boost: 3, shieldUntil: 0, invulnerableUntil: 0,
  nextId: 1, seed: 82731, lastMessage: "",
};

function randomNext(seed: number) {
  const nextSeed = (seed * 1664525 + 1013904223) >>> 0;
  return { seed: nextSeed, value: nextSeed / 4294967296 };
}

function reducer(game: Game, action: Action): Game {
  if (action.type === "best") return { ...game, best: Math.max(game.best, action.value) };
  if (action.type === "start") {
    return { ...initialGame, status: "running", best: game.best, seed: (Date.now() ^ game.seed) >>> 0 };
  }
  if (action.type === "toggle") {
    if (game.status === "running") return { ...game, status: "paused" };
    if (game.status === "paused") return { ...game, status: "running" };
    return game;
  }
  if (game.status !== "running") return game;
  if (action.type === "move") return { ...game, lane: Math.max(0, Math.min(4, game.lane + action.direction)) };
  if (action.type === "boost") {
    if (game.boost <= 0 || game.tick < game.shieldUntil) return game;
    return { ...game, boost: game.boost - 1, shieldUntil: game.tick + 34, lastMessage: "Shield pulse online" };
  }
  if (action.type !== "tick") return game;

  const tick = game.tick + 1;
  const speed = 0.95 + Math.min(0.9, game.score / 1800);
  let score = tick % 2 === 0 ? game.score + 1 : game.score;
  let health = game.health;
  let combo = game.combo;
  let invulnerableUntil = game.invulnerableUntil;
  let lastMessage = "";
  let seed = game.seed;
  let nextId = game.nextId;
  const packets: Packet[] = [];
  for (const packet of game.packets) {
    const y = packet.y + speed;
    if (y >= 80 && y <= 80 + speed && packet.lane === game.lane) {
      if (packet.kind === "signal") {
        score += 25 + Math.min(combo, 10) * 2;
        combo += 1;
        lastMessage = combo > 1 ? `Clean packet · ${combo}× streak` : "Clean packet captured";
      } else if (tick >= invulnerableUntil) {
        if (tick < game.shieldUntil) {
          score += 8;
          lastMessage = "Fault absorbed · +8";
        } else {
          health -= 1;
          combo = 0;
          invulnerableUntil = tick + 20;
          lastMessage = "Signal hit · rerouting";
        }
      }
      continue;
    }
    if (y < 106) packets.push({ ...packet, y });
    else if (packet.kind === "signal") combo = 0;
  }

  if (tick % 17 === 0) {
    const laneRoll = randomNext(seed); seed = laneRoll.seed;
    const kindRoll = randomNext(seed); seed = kindRoll.seed;
    packets.push({
      id: nextId++, lane: Math.floor(laneRoll.value * 5), y: -10,
      kind: kindRoll.value > 0.68 ? "signal" : "fault",
    });
  }
  const status = health <= 0 ? "over" : "running";
  if (status === "over") lastMessage = "Run complete · the grid needs you again";
  return {
    ...game,
    status,
    tick,
    score,
    health,
    combo,
    packets,
    seed,
    nextId,
    invulnerableUntil,
    lastMessage,
    best: status === "over" ? Math.max(game.best, score) : game.best,
  };
}

const laneLeft = (lane: number) => `${10 + lane * 20}%`;

function SignalSprint() {
  const [game, dispatch] = useReducer(reducer, initialGame);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem("signal-sprint-best") ?? 0);
    if (Number.isFinite(stored) && stored > 0) dispatch({ type: "best", value: stored });
  }, []);

  useEffect(() => {
    if (game.status === "over" && game.best > 0) {
      const stored = Number(window.localStorage.getItem("signal-sprint-best") ?? 0);
      if (game.best > stored) window.localStorage.setItem("signal-sprint-best", String(game.best));
    }
  }, [game.status, game.best]);

  useEffect(() => {
    if (game.status !== "running") return;
    const timer = window.setInterval(() => dispatch({ type: "tick" }), 50);
    return () => window.clearInterval(timer);
  }, [game.status]);

  const move = useCallback((direction: -1 | 1) => dispatch({ type: "move", direction }), []);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (key === "arrowleft" || key === "a") move(-1);
      else if (key === "arrowright" || key === "d") move(1);
      else if (key === " " || key === "arrowup" || key === "w") dispatch({ type: "boost" });
      else if (key === "p" || key === "escape") dispatch({ type: "toggle" });
      else if (key === "enter" && (game.status === "ready" || game.status === "over")) dispatch({ type: "start" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game.status, move]);

  const active = game.status === "running";
  const shieldActive = active && game.tick < game.shieldUntil;
  const begin = () => dispatch({ type: "start" });

  return (
    <PublicFrame>
      <main className="signal-game mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link to="/" className="mb-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-subtle hover:text-accent"><ArrowLeft size={14} /> Back to Vantage</Link>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent"><span className="live-dot" /> Arcade / 001</p>
            <h1 className="mt-2 font-serif text-5xl leading-none sm:text-6xl">Signal <i className="text-accent">Sprint.</i></h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">The grid is alive. Dodge the faults, catch clean packets, and keep the signal moving.</p>
          </div>
          <div className="signal-score-card flex items-center gap-5 rounded-xl border border-border px-5 py-3">
            <div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-subtle">Personal best</p><p className="mt-1 font-mono text-xl text-fg">{game.best.toLocaleString()}<span className="ml-1 text-[10px] text-subtle">PTS</span></p></div>
            <Sparkles className="text-accent" size={19} aria-hidden="true" />
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section aria-label="Signal Sprint game" className="signal-console overflow-hidden rounded-2xl border border-border">
            <div className="signal-hud flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-5">
                <div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-subtle">Score</p><p className="font-mono text-xl tabular-nums text-accent">{String(game.score).padStart(5, "0")}</p></div>
                <div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-subtle">Integrity</p><div className="mt-1 flex gap-1.5" aria-label={`${game.health} of 3 integrity remaining`}>{[0, 1, 2].map((heart) => <span key={heart} className={`signal-heart ${heart < game.health ? "is-live" : ""}`} />)}</div></div>
                <div className="hidden sm:block"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-subtle">Streak</p><p className="font-mono text-sm text-fg">{game.combo > 1 ? `${game.combo}×` : "—"}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`signal-status ${active ? "is-live" : ""}`}><i />{active ? "LIVE" : game.status.toUpperCase()}</span>
                {active || game.status === "paused" ? <button className="signal-icon-button" onClick={() => dispatch({ type: "toggle" })} aria-label={active ? "Pause game" : "Resume game"}>{active ? <Pause size={15} /> : <Play size={15} />}</button> : null}
              </div>
            </div>

            <div className={`signal-arena ${shieldActive ? "has-shield" : ""}`} aria-label="Five-lane signal grid">
              <div className="arena-grid" aria-hidden="true" />
              <div className="arena-horizon" aria-hidden="true" />
              {Array.from({ length: 5 }, (_, lane) => <div key={lane} className={`arena-lane ${lane === game.lane ? "is-current" : ""}`} style={{ left: laneLeft(lane) }} aria-hidden="true"><span /></div>)}
              <div className="arena-label arena-label-top">CORE NETWORK <span>SECURE UPLINK</span></div>
              <div className="arena-label arena-label-bottom">EDGE 01 <span>EDGE 05</span></div>
              {game.packets.map((packet) => <div key={packet.id} className={`signal-packet-token ${packet.kind}`} style={{ left: laneLeft(packet.lane), top: `${packet.y}%` }} aria-label={packet.kind === "fault" ? "Network fault" : "Clean signal packet"}>{packet.kind === "fault" ? <span>×</span> : <span>✦</span>}</div>)}
              <div className={`signal-runner ${game.tick < game.invulnerableUntil ? "is-hit" : ""} ${shieldActive ? "is-shielded" : ""}`} style={{ left: laneLeft(game.lane) }} aria-label="Your signal runner"><span className="runner-core" /><span className="runner-trail" /></div>
              {game.lastMessage && active ? <div className="game-toast" key={`${game.tick}-${game.lastMessage}`}>{game.lastMessage}</div> : null}
              {game.status !== "running" ? <div className="game-overlay"><div className="game-overlay-card">
                <div className="overlay-icon">{game.status === "over" ? <Sparkles size={21} /> : game.status === "paused" ? <Pause size={21} /> : <span>↗</span>}</div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent">{game.status === "ready" ? "Ready when you are" : game.status === "paused" ? "Grid on hold" : "Run complete"}</p>
                <h2 className="mt-2 font-serif text-3xl">{game.status === "ready" ? "Catch the signal." : game.status === "paused" ? "Take a breath." : `${game.score.toLocaleString()} points.`}</h2>
                <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted">{game.status === "ready" ? "Slide between lanes. Avoid red faults and collect the bright packets." : game.status === "paused" ? "Your run is safe. Jump back in whenever you're ready." : game.score >= game.best && game.score > 0 ? "A new personal best. The network remembers." : "The signal is still out there. One more run?"}</p>
                <button className="signal-primary-button mt-5" onClick={game.status === "paused" ? () => dispatch({ type: "toggle" }) : begin}>{game.status === "paused" ? <><Play size={15} /> Resume run</> : game.status === "over" ? <><RotateCcw size={15} /> Run it back</> : <><Play size={15} /> Start sprint</>}</button>
                <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-subtle">{game.status === "ready" ? "or press enter" : game.status === "over" ? "press enter to restart" : "press p to resume"}</p>
              </div></div> : null}
            </div>

            <div className="signal-controls flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-subtle">{shieldActive ? "Shield pulse active" : "Keep moving · stay in the flow"}</p>
              <div className="flex items-center gap-2">
                <button className="signal-move-button" onClick={() => move(-1)} disabled={!active} aria-label="Move left"><ArrowLeft size={17} /></button>
                <button className={`signal-boost-button ${shieldActive ? "is-charged" : ""}`} onClick={() => dispatch({ type: "boost" })} disabled={!active || game.boost <= 0} aria-label={`Activate shield pulse, ${game.boost} charges remaining`}><Shield size={14} /> Pulse <span>{game.boost}</span></button>
                <button className="signal-move-button" onClick={() => move(1)} disabled={!active} aria-label="Move right"><ArrowRight size={17} /></button>
              </div>
            </div>
          </section>

          <aside className="signal-side-rail space-y-4">
            <section className="signal-side-card rounded-xl border border-border p-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">Mission briefing</p>
              <h2 className="mt-3 text-lg font-semibold">Protect the flow.</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted">Clean packets build your score and streak. Faults cost integrity. Three strikes and the run is over.</p>
              <div className="mt-5 space-y-3 border-t border-border pt-4">
                <div className="flex items-center gap-3"><span className="legend-token signal-token">✦</span><span className="text-xs text-muted">Clean packet <b className="float-right font-mono text-accent">+25</b></span></div>
                <div className="flex items-center gap-3"><span className="legend-token fault-token">×</span><span className="text-xs text-muted">Network fault <b className="float-right font-mono text-danger">−1</b></span></div>
                <div className="flex items-center gap-3"><span className="legend-token pulse-token"><Shield size={13} /></span><span className="text-xs text-muted">Shield pulse <b className="float-right font-mono text-fg">3 charges</b></span></div>
              </div>
            </section>
            <section className="signal-side-card rounded-xl border border-border p-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">Controls</p>
              <div className="mt-4 flex items-center gap-3"><div className="keycap-group"><kbd>A</kbd><kbd>←</kbd></div><span className="text-xs text-muted">Move left</span></div>
              <div className="mt-3 flex items-center gap-3"><div className="keycap-group"><kbd>D</kbd><kbd>→</kbd></div><span className="text-xs text-muted">Move right</span></div>
              <div className="mt-3 flex items-center gap-3"><div className="keycap-group"><kbd>W</kbd><kbd>↑</kbd></div><span className="text-xs text-muted">Shield pulse</span></div>
              <p className="mt-4 border-t border-border pt-3 text-[10px] leading-relaxed text-subtle">On mobile, use the arrows below the grid. Best score saves on this device.</p>
            </section>
            <section className="signal-quote rounded-xl p-5"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">Field note / 01</p><p className="mt-3 font-serif text-xl leading-snug">“A clear signal is worth protecting.”</p><p className="mt-3 font-mono text-[9px] text-subtle">— NETWORK OPS</p></section>
          </aside>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-[10px] text-subtle"><span>AN EXPERIMENT IN KEEPING THE SIGNAL ALIVE</span><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-ok" /> SYSTEM READY</span></div>
      </main>
    </PublicFrame>
  );
}
