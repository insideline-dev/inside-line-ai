import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RoleSidebar } from "@/components/layouts/RoleSidebar";
import {
  useQuickDeckDrop,
  DropZoneOverlay,
  QuickSubmitDialog,
} from "@/components/investor/QuickDeckSubmit";

export const Route = createFileRoute("/_protected/investor")({
  component: InvestorLayout,
});

function InvestorLayout() {
  const { isDragOver, droppedFile, clearDroppedFile } = useQuickDeckDrop();

  return (
    <RoleSidebar role="investor">
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
