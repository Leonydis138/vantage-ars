import { Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { OfficeSnapshot } from "@/lib/office/types";
import { OfficeProvider } from "./office-context";
import { PrivateDoor } from "./private-door";

export type OfficeAccess = { locked: true } | { locked: false; snapshot: OfficeSnapshot };

/**
 * The founder door and the office shell, shared by `/office` and the workspace
 * pages (`/dashboard`, `/tasks`, …). The server decides who the founder is; the
 * loader only returns records to a verified founder session.
 */
export function OfficeWorkspace({ access }: { access: OfficeAccess }) {
  const { user, isPending } = useCurrentUserState();
  if (access.locked) {
    if (isPending) return <WorkspacePending />;
    return <PrivateDoor user={user} />;
  }
  return (
    <OfficeProvider snapshot={access.snapshot}>
      <AppShell snapshot={access.snapshot}>
        <Outlet />
      </AppShell>
    </OfficeProvider>
  );
}

export function WorkspacePending() {
  return (
    <div className="min-h-dvh bg-bg p-6">
      <Skeleton className="h-14 w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
