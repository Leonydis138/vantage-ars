import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficeProvider } from "@/components/office/office-context";
import { PrivateDoor } from "@/components/office/private-door";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getOfficeSnapshot } from "@/lib/office/api";

export const Route = createFileRoute("/office")({
  head: () => ({
    meta: [{ title: "Sign in · Vantage-ARS" }, { name: "robots", content: "noindex" }],
  }),
  loader: () => getOfficeSnapshot(),
  // The office snapshot is the whole book. Moving between office pages within
  // a few seconds must not re-read and re-send it; every action still calls
  // router.invalidate(), so a change is never hidden behind this window.
  staleTime: 15_000,
  component: OfficeLayout,
  pendingComponent: OfficePending,
});

function OfficeLayout() {
  const access = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  // The server decides who the founder is; the loader only returns records
  // to a verified founder session.
  if (access.locked) {
    if (isPending) return <OfficePending />;
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

function OfficePending() {
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
