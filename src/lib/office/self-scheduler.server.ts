/**
 * The server's own heartbeat.
 *
 * `startSelfScheduler` is idempotent per process. It registers one timer, takes
 * a leased claim in Postgres before each tick, and runs the exact `runNow()`
 * path the founder's button and the cron endpoint use. Every guard in the
 * scheduler still applies; this module only decides *when* to ask.
 *
 * Why a lease as well as a timer: Docker replicas, a blue/green deploy and a
 * developer's `npm run dev` can all be alive at once. The tick is already
 * idempotent, but a lease keeps the log honest and stops two instances doing
 * duplicate planning work. A dead owner's lease expires after fifteen minutes,
 * so a surviving replica takes over without an operator.
 */
import { getSql } from "../db";
import { COMPANY } from "./company";
import { ensureOffice } from "./store.server";
import { runNow, type TickResult } from "./scheduler.server";
import {
  SELF_SCHEDULER_LEASE_MINUTES,
  selfSchedulerConfig,
  type SelfSchedulerConfig,
} from "./self-scheduler";

export type SelfSchedulerStatus = SelfSchedulerConfig & {
  running: boolean;
  ownerId: string | null;
  startedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  ticks: number;
  /** The last tick's short detail, for the founder's panel. */
  lastDetail: string | null;
  nextRunAt: string | null;
};

type Runtime = {
  timer: ReturnType<typeof setInterval> | null;
  startTimer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  config: SelfSchedulerConfig;
  ownerId: string;
  startedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  ticks: number;
  lastDetail: string | null;
  nextRunAt: string | null;
  ticking: boolean;
};

const globalRef = globalThis as typeof globalThis & {
  __vantageSelfScheduler__?: Runtime;
};

function runtimeConfig(): SelfSchedulerConfig {
  return selfSchedulerConfig();
}

function runtime(): Runtime {
  const config = runtimeConfig();
  globalRef.__vantageSelfScheduler__ ??= {
    timer: null,
    startTimer: null,
    running: false,
    config,
    ownerId: `self-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: null,
    lastRunAt: null,
    lastError: null,
    ticks: 0,
    lastDetail: null,
    nextRunAt: null,
    ticking: false,
  };
  // A HMR reload can change env; keep the displayed config current.
  globalRef.__vantageSelfScheduler__.config = config;
  return globalRef.__vantageSelfScheduler__;
}

/**
 * Claim the right to tick. The UPDATE is atomic, so two instances starting on
 * the same second cannot both win.
 */
export async function acquireSelfSchedulerLease(
  ownerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  await ensureOffice();
  const sql = await getSql();
  const rows = await sql<{ scheduler_owner: string | null }>`
    insert into office_state (id, scheduler_owner, scheduler_owner_at)
    values (${COMPANY.id}, ${ownerId}, ${now.toISOString()})
    on conflict (id) do update set
      scheduler_owner = excluded.scheduler_owner,
      scheduler_owner_at = excluded.scheduler_owner_at
    where office_state.scheduler_owner is null
       or office_state.scheduler_owner = excluded.scheduler_owner
       or office_state.scheduler_owner_at is null
       or office_state.scheduler_owner_at <
          excluded.scheduler_owner_at - make_interval(mins => ${SELF_SCHEDULER_LEASE_MINUTES})
    returning scheduler_owner
  `;
  return rows[0]?.scheduler_owner === ownerId;
}

/** One heartbeat. Exported so a test can drive the real claim without a timer. */
export async function runSelfSchedulerBeat(
  ownerId: string,
  now: Date = new Date(),
): Promise<{ ran: boolean; result?: TickResult; reason: string }> {
  try {
    const claimed = await acquireSelfSchedulerLease(ownerId, now);
    if (!claimed) {
      return { ran: false, reason: "Another instance holds the heartbeat lease." };
    }
    const result = await runNow();
    return { ran: true, result, reason: result.detail };
  } catch (error) {
    return {
      ran: false,
      reason: error instanceof Error ? error.message : "The self-scheduler tick failed.",
    };
  }
}

async function fire(state: Runtime): Promise<void> {
  if (state.ticking) return;
  state.ticking = true;
  try {
    const outcome = await runSelfSchedulerBeat(state.ownerId);
    if (outcome.ran) {
      state.ticks += 1;
      state.lastRunAt = new Date().toISOString();
      state.lastDetail = outcome.result?.detail ?? outcome.reason;
      state.lastError = outcome.result?.ok ? null : outcome.reason;
    } else {
      // Losing the lease is normal on a multi-instance deploy, not an error.
      state.lastDetail = outcome.reason;
    }
  } finally {
    state.ticking = false;
    state.nextRunAt = new Date(Date.now() + state.config.intervalMs).toISOString();
  }
}

/**
 * Start the timer if the environment allows it. Safe to call on every request:
 * a running process gets the same object back.
 */
export function startSelfScheduler(): SelfSchedulerStatus {
  const state = runtime();
  if (!state.config.enabled || state.running) return selfSchedulerStatus();
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.nextRunAt = new Date(Date.now() + state.config.startDelayMs).toISOString();

  state.startTimer = setTimeout(() => {
    void fire(state);
    state.timer = setInterval(() => void fire(state), state.config.intervalMs);
    state.timer.unref?.();
    state.nextRunAt = new Date(Date.now() + state.config.intervalMs).toISOString();
  }, state.config.startDelayMs);
  state.startTimer.unref?.();

  console.info(
    `[self-scheduler] ${state.config.reason} Lease: ${SELF_SCHEDULER_LEASE_MINUTES} minutes.`,
  );
  return selfSchedulerStatus();
}

/** Stop the timer (used by tests and orderly shutdown). */
export function stopSelfScheduler(): void {
  const state = runtime();
  if (state.timer) clearInterval(state.timer);
  if (state.startTimer) clearTimeout(state.startTimer);
  state.timer = null;
  state.startTimer = null;
  state.running = false;
  state.nextRunAt = null;
}

/** A serialisable view for the founder's panel and the health document. */
export function selfSchedulerStatus(): SelfSchedulerStatus {
  const state = runtime();
  return {
    ...state.config,
    running: state.running,
    ownerId: state.running ? state.ownerId : null,
    startedAt: state.startedAt,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    ticks: state.ticks,
    lastDetail: state.lastDetail,
    nextRunAt: state.nextRunAt,
  };
}
