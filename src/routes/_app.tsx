import { createFileRoute } from "@tanstack/react-router";
import { OfficeWorkspace, WorkspacePending } from "@/components/office/office-workspace";
import { getOfficeSnapshot } from "@/lib/office/api";

export const Route = createFileRoute("/_app")({
  head: () => ({
    meta: [{ title: "Workspace · Vantage-ARS" }, { name: "robots", content: "noindex" }],
  }),
  loader: () => getOfficeSnapshot(),
  component: WorkspaceLayout,
  pendingComponent: WorkspacePending,
});

/** The founder's workspace pages share the office door and shell. */
function WorkspaceLayout() {
  return <OfficeWorkspace access={Route.useLoaderData()} />;
}
