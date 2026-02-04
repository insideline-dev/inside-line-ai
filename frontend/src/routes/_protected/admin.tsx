import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RoleSidebar } from "@/components/layouts/RoleSidebar";

export const Route = createFileRoute("/_protected/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <RoleSidebar role="admin">
      <Outlet />
    </RoleSidebar>
  );
}
