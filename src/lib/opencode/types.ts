/** Shapes the build desk puts on the wire. Shared by the runner and the page. */

export type StepKind = "request" | "tool" | "edit" | "note" | "error" | "check" | "apply";

export type Step = { at: string; kind: StepKind; text: string };

export type EditStatus = "proposed" | "applied" | "reverted" | "failed";

export type EditView = {
  id: string;
  path: string;
  note: string;
  find: string;
  replace: string;
  status: EditStatus;
};

export type RunStatus = "running" | "ready" | "failed" | "applied" | "reverted";

export type RunView = {
  id: string;
  brief: string;
  status: RunStatus;
  steps: Step[];
  edits: EditView[];
  summary: string | null;
  check: { ok: boolean; output: string } | null;
  createdAt: string;
  updatedAt: string;
};
