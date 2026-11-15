import { useCallback, useSyncExternalStore } from "react";

/**
 * The founder's workspace preferences.
 *
 * These are display choices for this browser only — they never touch office
 * records. Each one changes something a workspace page actually does:
 *   - `compact` tightens the row spacing of the task, project, activity and
 *     notification lists.
 *   - `relativeTime` switches their timestamps between "3h ago" and a full date.
 *   - `showCompleted` decides whether the task page lists finished work items.
 */
export type WorkspacePreferences = {
  compact: boolean;
  relativeTime: boolean;
  showCompleted: boolean;
};

export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  compact: false,
  relativeTime: true,
  showCompleted: false,
};

const STORAGE_KEY = "vantage-ars.workspace.preferences.v1";
const listeners = new Set<() => void>();
let cached: WorkspacePreferences | null = null;

function read(): WorkspacePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>;
    return {
      compact: parsed.compact === true,
      relativeTime: parsed.relativeTime !== false,
      showCompleted: parsed.showCompleted === true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function snapshot(): WorkspacePreferences {
  cached ??= read();
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkspacePreferences(): {
  preferences: WorkspacePreferences;
  update: (patch: Partial<WorkspacePreferences>) => void;
} {
  const preferences = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFERENCES);

  const update = useCallback((patch: Partial<WorkspacePreferences>) => {
    cached = { ...snapshot(), ...patch };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    } catch {
      // A browser refusing storage still gets the in-memory preference.
    }
    for (const listener of listeners) listener();
  }, []);

  return { preferences, update };
}
