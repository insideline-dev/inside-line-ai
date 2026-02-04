import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RoleSidebar } from "@/components/layouts/RoleSidebar";

export const Route = createFileRoute("/_protected/scout")({
  component: ScoutLayout,
});

function ScoutLayout() {
  return (
    <RoleSidebar role="scout">
      <Outlet />
    </RoleSidebar>
  );
}
