import { createServerFn } from "@tanstack/react-start";
import { founderMiddleware } from "@/lib/office/founder-gate";
import { resolveModelTarget } from "@/lib/office/ai-provider";
import {
  applyRun,
  commandNames,
  listRuns,
  readRun,
  runCommand,
  startRun,
} from "./runner.server";
import type { RunView } from "./types";

/** What the desk has available: the model, the terminal commands, recent runs. */
export const getBuildDeskInfo = createServerFn({ method: "GET" })
  .middleware([founderMiddleware])
  .handler(async () => {
    const target = resolveModelTarget(process.env);
    return {
      model: target ? `${target.provider} · ${target.model}` : null,
      commands: commandNames(),
      runs: listRuns(),
    };
  });

export const startBuildRun = createServerFn({ method: "POST" })
  .middleware([founderMiddleware])
  .validator((input: { brief: string }) => input)
  .handler(async ({ data }) => {
    const brief = String(data.brief ?? "").trim();
    if (brief.length < 12) {
      return { ok: false as const, error: "Describe the change in at least a sentence." };
    }
    const target = resolveModelTarget(process.env);
    if (!target) {
      return { ok: false as const, error: "No reasoning model is configured in this environment." };
    }
    const run: RunView = startRun(brief);
    return { ok: true as const, run };
  });

export const getBuildRun = createServerFn({ method: "GET" })
  .middleware([founderMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => readRun(String(data.id ?? "")));

export const applyBuildRun = createServerFn({ method: "POST" })
  .middleware([founderMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => applyRun(String(data.id ?? "")));

export const runBuildCommand = createServerFn({ method: "POST" })
  .middleware([founderMiddleware])
  .validator((input: { name: string }) => input)
  .handler(async ({ data }) => runCommand(String(data.name ?? "")));
