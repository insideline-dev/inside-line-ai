import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RoleSidebar } from "@/components/layouts/RoleSidebar";

export const Route = createFileRoute("/_protected/founder")({
  component: FounderLayout,
});

function FounderLayout() {
  return (
    <RoleSidebar role="founder">
      <Outlet />
    </RoleSidebar>
  );
}
