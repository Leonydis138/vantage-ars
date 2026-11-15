import { useCallback, useEffect, useState } from "react";
import { getWorkQueue } from "@/lib/office/api";

export type WorkQueue = Awaited<ReturnType<typeof getWorkQueue>>;

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The work queue could not be read.";
}

/**
 * The durable work queue, read on the client.
 *
 * Kept out of the route loader so a signed-out visit to a workspace page shows
 * the founder door instead of a failed request.
 */
export function useWorkQueue() {
  const [queue, setQueue] = useState<WorkQueue | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setQueue(await getWorkQueue());
      setError("");
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getWorkQueue()
      .then((data) => {
        if (cancelled) return;
        setQueue(data);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(messageOf(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { queue, error, loading, reload };
}
