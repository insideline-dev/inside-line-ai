import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RoleSidebar } from "@/components/layouts/RoleSidebar";

export const Route = createFileRoute("/_protected/investor")({
  component: InvestorLayout,
});

function InvestorLayout() {
  return (
    <RoleSidebar role="investor">
      <Outlet />
    </RoleSidebar>
  );
}
