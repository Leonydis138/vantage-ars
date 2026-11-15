import { createFileRoute } from "@tanstack/react-router";
import { OfficeWorkspace, WorkspacePending } from "@/components/office/office-workspace";
import { getOfficeSnapshot } from "@/lib/office/api";

export const Route = createFileRoute("/office")({
  head: () => ({
    meta: [{ title: "Sign in · Vantage-ARS" }, { name: "robots", content: "noindex" }],
  }),
  loader: () => getOfficeSnapshot(),
  component: OfficeLayout,
  pendingComponent: WorkspacePending,
});

function OfficeLayout() {
  return <OfficeWorkspace access={Route.useLoaderData()} />;
}
