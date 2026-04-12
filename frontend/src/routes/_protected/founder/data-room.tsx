import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useStartupControllerFindAll } from "@/api/generated/startups/startups";
import { DataRoomPanel } from "@/components/startup-view/DataRoomPanel";
import {
  DataRoomStartupGrid,
  type DataRoomStartupItem,
} from "@/components/startup-view/DataRoomStartupGrid";

export const Route = createFileRoute("/_protected/founder/data-room")({
  component: DataRoomPage,
  validateSearch: (search: Record<string, unknown>) => ({
    startupId: (search.startupId as string | undefined) || null,
  }),
});

function DataRoomPage() {
  const { startupId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: response, isLoading, error } = useStartupControllerFindAll();
  const startups = (response?.data as DataRoomStartupItem[] | undefined) ?? [];

  const selected = startupId ? startups.find((s) => s.id === startupId) : null;

  const handleSelect = (id: string) => {
    navigate({ to: "/founder/data-room", search: { startupId: id } });
  };

  const handleBack = () => {
    navigate({ to: "/founder/data-room", search: { startupId: null } });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Data Room</h1>
          <p className="text-muted-foreground text-pretty">
            Upload and manage investor-facing documents.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load startups: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (startups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-pretty">
          Submit a startup to start managing your data room.
        </CardContent>
      </Card>
    );
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            All startups
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-balance">{selected.name}</h1>
            <p className="text-muted-foreground text-pretty">
              Upload and manage investor-facing documents, organized by section.
            </p>
          </div>
        </div>

        <DataRoomPanel startupId={selected.id} role="founder" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Data Room</h1>
        <p className="text-muted-foreground text-pretty">
          Select a startup to manage its investor-facing documents.
        </p>
      </div>

      <DataRoomStartupGrid startups={startups} onSelect={handleSelect} />
    </div>
  );
}
