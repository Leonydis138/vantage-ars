import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runFloor } from "@/lib/office/api";

/**
 * The founder's manual trigger.
 *
 * It calls exactly the same code path the scheduled run uses, so "it works when
 * I press the button" means something. It is a convenience, not a prerequisite:
 * with `AUTONOMY=on` the office does this without anyone pressing it.
 */
export function RunFloorButton({ halted, onDone }: { halted: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onRun() {
    if (pending) return;
    setPending(true);
    try {
      const result = await runFloor();
      if (!result.ok) {
        toast.error(result.error ?? "The floor could not run.");
        return;
      }
      toast.success(
        `${result.executed} executed · ${result.escalated} to you · ${result.blocked} blocked`,
        { description: result.briefing },
      );
      onDone?.();
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The floor could not run.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="secondary"
      onClick={onRun}
      disabled={pending || halted}
      aria-busy={pending}
      title="This founder-triggered run may email queued customer notices."
    >
      {pending ? "Evaluating…" : halted ? "Office halted" : "Run floor (may email customers)"}
    </Button>
  );
}
