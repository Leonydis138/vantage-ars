import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/guides")({
  component: GuidesLayout,
});

/**
 * `/guides` is the layout for the field notes: the index lives in
 * `guides.index.tsx` and each article in `guides.$slug.tsx`. Without this
 * outlet the child route's head was applied but the index page rendered in its
 * place, so every guide URL showed the list.
 */
function GuidesLayout() {
  return <Outlet />;
}
