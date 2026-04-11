import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import {
  useStartupControllerFindAll,
} from "@/api/generated/startups/startups";
import { DataRoomPanel } from "@/components/startup-view/DataRoomPanel";

export const Route = createFileRoute("/_protected/founder/data-room")({
  component: DataRoomPage,
});

type StartupItem = { id: string; name: string };

function DataRoomPage() {
  const { data: response, isLoading: loadingStartups, error } = useStartupControllerFindAll();
  const startups = (response?.data as StartupItem[] | undefined) ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeStartupId = useMemo(
    () => selectedId ?? startups[0]?.id ?? null,
    [selectedId, startups],
  );

  if (loadingStartups) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Data Room</h1>
          <p className="text-muted-foreground text-pretty">
            Upload and manage investor-facing documents.
          </p>
        </div>
        <Skeleton className="h-32 w-full" />
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-balance">Data Room</h1>
          <p className="text-muted-foreground text-pretty">
            Upload and manage investor-facing documents, organized by section.
          </p>
        </div>

        {startups.length > 1 && (
          <div className="w-full space-y-1.5 sm:w-72">
            <Label
              htmlFor="founder-data-room-startup"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Startup
            </Label>
            <Select
              value={activeStartupId ?? ""}
              onValueChange={setSelectedId}
            >
              <SelectTrigger id="founder-data-room-startup" className="w-full">
                <span className="flex items-center gap-2 truncate">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Select startup" />
                </span>
              </SelectTrigger>
              <SelectContent>
                {startups.map((startup) => (
                  <SelectItem key={startup.id} value={startup.id}>
                    {startup.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {activeStartupId && (
        <DataRoomPanel startupId={activeStartupId} role="founder" />
      )}
    </div>
  );
}
