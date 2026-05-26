import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RoleSidebar } from "@/components/layouts/RoleSidebar";
import {
  useQuickDeckDrop,
  DropZoneOverlay,
  QuickSubmitDialog,
} from "@/components/investor/QuickDeckSubmit";

export const Route = createFileRoute("/_protected/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { isDragOver, droppedFile, clearDroppedFile } = useQuickDeckDrop();

  return (
    <RoleSidebar role="admin">
      <DropZoneOverlay visible={isDragOver} />
      {droppedFile && (
        <QuickSubmitDialog
          file={droppedFile}
          open={!!droppedFile}
          onClose={clearDroppedFile}
        />
      )}
      <Outlet />
    </RoleSidebar>
  );
}
