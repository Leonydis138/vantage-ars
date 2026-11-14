import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Trophy,
  Zap,
} from "lucide-react";
import { PublicFrame } from "@/components/public/site-frame";

export const Route = createFileRoute("/game")({
  head: () => ({
    meta: [
      { title: "Signal Sweep · Vantage-ARS" },
      {
        name: "description",
        content: "A quick, playable signal-routing arcade game from Vantage-ARS.",
      },
    ],
  }),
  component: GamePage,
});

type Point = { x: number; y: number };
type Direction = "up" | "right" | "down" | "left";
type GameState = { snake: Point[]; food: Point | null; score: number };
type RunState = "ready" | "running" | "paused" | "over" | "won";

const GRID = 20;
const START_SNAKE: Point[] = [
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 },
];
const VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  right: "left",
  down: "up",
  left: "right",
};

function initialGame(): GameState {
  return { snake: START_SNAKE, food: { x: 4, y: 10 }, score: 0 };
}

function placeFood(snake: Point[]): Point | null {
  const open: Point[] = [];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (!snake.some((part) => part.x === x && part.y === y)) open.push({ x, y });
    }
  }
  return open.length ? open[Math.floor(Math.random() * open.length)]! : null;
}

const BEST_SCORE_KEY = "vantage-signal-sweep-best";
const BEST_SCORE_EVENT = "vantage-signal-sweep-best-change";

function readBestScore() {
  try {
    return Number(window.localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function subscribeBestScore(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(BEST_SCORE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(BEST_SCORE_EVENT, callback);
  };
}

function GamePage() {
  const [game, setGame] = useState<GameState>(initialGame);
  const gameRef = useRef(game);
  const directionRef = useRef<Direction>("right");
  const [runState, setRunState] = useState<RunState>("ready");
  const best = useSyncExternalStore(subscribeBestScore, readBestScore, () => 0);
  const level = Math.floor(game.score / 50) + 1;
  const speed = Math.max(76, 158 - (level - 1) * 11);

  const commit = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);
    if (next.score > readBestScore()) {
      try {
        window.localStorage.setItem(BEST_SCORE_KEY, String(next.score));
        window.dispatchEvent(new Event(BEST_SCORE_EVENT));
      } catch {
        // Ignore storage restrictions; the current run still records its score.
      }
    }
  }, []);

  const start = useCallback(() => {
    directionRef.current = "right";
    commit({ ...initialGame(), food: placeFood(START_SNAKE) });
    setRunState("running");
  }, [commit]);

  const steer = useCallback((next: Direction) => {
    if (runState !== "running" || OPPOSITE[directionRef.current] === next) return;
    directionRef.current = next;
  }, [runState]);

  useEffect(() => {
    if (runState !== "running") return;
    const timer = window.setInterval(() => {
      const current = gameRef.current;
      const vector = VECTORS[directionRef.current];
      const head = {
        x: current.snake[0]!.x + vector.x,
        y: current.snake[0]!.y + vector.y,
      };
      const eating = current.food !== null && current.food.x === head.x && current.food.y === head.y;
      const body = eating ? current.snake : current.snake.slice(0, -1);
      const crashed =
        head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID ||
        body.some((part) => part.x === head.x && part.y === head.y);
      if (crashed) {
        setRunState("over");
        return;
      }

      const snake = [head, ...(eating ? current.snake : current.snake.slice(0, -1))];
      const food = eating ? placeFood(snake) : current.food;
      const next = {
        snake,
        food,
        score: current.score + (eating ? 10 : 0),
      };
      commit(next);
      if (eating && food === null) setRunState("won");
    }, speed);
    return () => window.clearInterval(timer);
  }, [commit, runState, speed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const key = event.key.toLowerCase();
      const directions: Record<string, Direction> = {
        arrowup: "up", w: "up", arrowright: "right", d: "right",
        arrowdown: "down", s: "down", arrowleft: "left", a: "left",
      };
      const direction = directions[key];
      if (direction) {
        event.preventDefault();
        steer(direction);
      } else if (key === " " && (runState === "running" || runState === "paused")) {
        event.preventDefault();
        setRunState(runState === "running" ? "paused" : "running");
      } else if (key === "enter" && runState === "paused") {
        setRunState("running");
      } else if (key === "enter" && (runState === "ready" || runState === "over" || runState === "won")) {
        start();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runState, start, steer]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && runState === "running") setRunState("paused");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [runState]);

  const snakeCells = new Set(game.snake.map((part) => `${part.x},${part.y}`));
  const headKey = `${game.snake[0]!.x},${game.snake[0]!.y}`;
  const cells = Array.from({ length: GRID * GRID }, (_, index) => {
    const x = index % GRID;
    const y = Math.floor(index / GRID);
    const key = `${x},${y}`;
    const isHead = key === headKey;
    const isSnake = snakeCells.has(key);
    const isFood = game.food?.x === x && game.food.y === y;
    return (
      <div
        key={key}
        className={`relative flex items-center justify-center rounded-[4px] ${
          isHead
            ? "z-10 bg-accent shadow-[0_0_16px_rgba(72,217,255,0.65)]"
            : isSnake
              ? "bg-[#1c9dbc] shadow-[0_0_9px_rgba(72,217,255,0.22)]"
              : isFood
                ? "after:size-[48%] after:rounded-full after:bg-[#ffca78] after:shadow-[0_0_16px_rgba(255,202,120,0.85)] after:content-['']"
                : "bg-white/[0.025]"
        }`}
        aria-hidden="true"
      >
        {isHead ? <span className="size-[28%] rounded-full bg-[#06131c]" /> : null}
      </div>
    );
  });

  const overlay = runState !== "running";
  const overlayCopy: Record<Exclude<RunState, "running">, { eyebrow: string; title: string; copy: string }> = {
    ready: { eyebrow: "READY WHEN YOU ARE", title: "Route the signal.", copy: "Collect the glowing packets. Don't hit the edge or your own trail." },
    paused: { eyebrow: "SIGNAL HELD", title: "Take a breath.", copy: "Your run is paused. Pick up where you left off when you're ready." },
    over: { eyebrow: "CONNECTION LOST", title: "Run complete.", copy: "The signal loop ended there. Reset and see if you can beat your best." },
    won: { eyebrow: "PERFECT ROUTE", title: "Board cleared!", copy: "Every packet collected. You swept the whole signal field." },
  };
  const message = overlayCopy[runState as Exclude<RunState, "running">];

  return (
    <PublicFrame>
      <section className="mx-auto max-w-6xl py-10 sm:py-14">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-accent uppercase">
              <Radio className="size-3.5" aria-hidden="true" /> Vantage arcade · 01
            </p>
            <h1 className="mt-3 font-serif text-5xl tracking-tight sm:text-6xl">Signal Sweep</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              Keep the signal alive. Gather packets, grow your route, and stay clear of your own trail.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-2 text-xs text-subtle">
            <span className="size-2 rounded-full bg-ok shadow-[0_0_10px_rgba(95,227,173,0.7)]" />
            Offline-ready · no account needed
          </div>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
          <section aria-label="Signal Sweep game" className="min-w-0 rounded-2xl border border-border bg-surface/65 p-3 shadow-[0_24px_70px_-45px_rgba(72,217,255,0.35)] sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] text-subtle uppercase">
                <span className={`size-2 rounded-full ${runState === "running" ? "animate-pulse bg-ok" : "bg-subtle/50"}`} />
                {runState === "running" ? "Live run" : runState === "paused" ? "Paused" : "Standby"}
              </div>
              <span className="font-mono text-[10px] tracking-[0.12em] text-subtle uppercase">Level {String(level).padStart(2, "0")}</span>
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-xl border border-[#244257] bg-[#07111b] p-[2.4%]">
              <div
                role="img"
                aria-label={`Game board: ${game.snake.length} signal segments, score ${game.score}${game.food ? `, packet at column ${game.food.x + 1}, row ${game.food.y + 1}` : ""}`}
                className="grid h-full w-full grid-cols-20 grid-rows-20 gap-[0.65%]"
              >
                {cells}
              </div>
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent_35%,rgba(0,0,0,0.12))]" />
              {overlay ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#06101bd9] p-5 text-center backdrop-blur-[3px]">
                  <div className="max-w-sm">
                    <p className="font-mono text-[9px] tracking-[0.22em] text-accent uppercase">{message.eyebrow}</p>
                    <h2 className="mt-3 font-serif text-4xl sm:text-5xl">{message.title}</h2>
                    <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted">{message.copy}</p>
                    <button
                      type="button"
                      onClick={runState === "paused" ? () => setRunState("running") : start}
                      className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-accent-fg transition hover:brightness-110"
                    >
                      {runState === "paused" ? <Play className="size-4" /> : runState === "ready" ? <Play className="size-4" /> : <RotateCcw className="size-4" />}
                      {runState === "paused" ? "Resume run" : runState === "ready" ? "Start run" : "Play again"}
                    </button>
                    <p className="mt-3 font-mono text-[9px] tracking-[0.14em] text-subtle uppercase">Press Enter to {runState === "paused" ? "resume" : "start"}</p>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <p className="text-xs text-subtle">Arrow keys / WASD to steer · Space to pause</p>
              {runState === "running" ? (
                <button type="button" onClick={() => setRunState("paused")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-fg">
                  <Pause className="size-3.5" /> Pause
                </button>
              ) : null}
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-surface/65 p-4">
                <p className="font-mono text-[9px] tracking-[0.18em] text-subtle uppercase">Current score</p>
                <p aria-live="polite" className="mt-2 font-mono text-3xl tabular-nums text-fg">{String(game.score).padStart(3, "0")}</p>
                <p className="mt-1 text-[11px] text-subtle">{game.snake.length} packets routed</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface/65 p-4">
                <p className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.18em] text-subtle uppercase"><Trophy className="size-3 text-warn" /> Personal best</p>
                <p className="mt-2 font-mono text-3xl tabular-nums text-fg">{String(best).padStart(3, "0")}</p>
                <p className="mt-1 text-[11px] text-subtle">Saved on this device</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface/65 p-5">
              <div className="flex items-center gap-2 text-accent"><Zap className="size-4" /><h2 className="text-sm font-semibold text-fg">How to play</h2></div>
              <ol className="mt-4 space-y-3 text-sm text-muted">
                <li className="flex gap-3"><span className="font-mono text-xs text-accent">01</span><span>Steer into the amber packet to score <strong className="font-semibold text-fg">10 points</strong>.</span></li>
                <li className="flex gap-3"><span className="font-mono text-xs text-accent">02</span><span>Every 50 points, your route speeds up and a new level begins.</span></li>
                <li className="flex gap-3"><span className="font-mono text-xs text-accent">03</span><span>Avoid the walls and your own signal trail. A collision ends the run.</span></li>
              </ol>
            </div>

            <div className="rounded-2xl border border-border bg-surface/65 p-5">
              <p className="font-mono text-[9px] tracking-[0.18em] text-subtle uppercase">Steering controls</p>
              <div className="mx-auto mt-3 grid w-fit grid-cols-3 gap-2" aria-label="Touch controls">
                <span />
                <ControlButton label="Steer up" direction="up" onPress={steer}><ArrowUp /></ControlButton>
                <span />
                <ControlButton label="Steer left" direction="left" onPress={steer}><ArrowLeft /></ControlButton>
                <ControlButton label="Steer down" direction="down" onPress={steer}><ArrowDown /></ControlButton>
                <ControlButton label="Steer right" direction="right" onPress={steer}><ArrowRight /></ControlButton>
              </div>
              <p className="mt-3 text-center text-[11px] text-subtle">Tap the arrows to play on touch screens.</p>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-accent/15 bg-accent/[0.04] p-4 text-xs leading-relaxed text-subtle">
              <Radio className="mt-0.5 size-4 shrink-0 text-accent" />
              Runs locally in your browser. Your high score stays on this device; no data is sent anywhere.
            </div>
          </aside>
        </div>
      </section>
    </PublicFrame>
  );
}

function ControlButton({
  label,
  direction,
  onPress,
  children,
}: {
  label: string;
  direction: Direction;
  onPress: (direction: Direction) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => onPress(direction)}
      className="flex size-12 items-center justify-center rounded-xl border border-border bg-raised/60 text-muted transition hover:border-accent/60 hover:bg-accent/10 hover:text-accent active:scale-95"
    >
      {children}
    </button>
  );
}
