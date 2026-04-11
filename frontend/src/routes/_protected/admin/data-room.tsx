import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { DataRoomPanel } from "@/components/startup-view/DataRoomPanel";
import { customFetch } from "@/api/client";

export const Route = createFileRoute("/_protected/admin/data-room")({
  component: AdminDataRoomPage,
});

type StartupItem = { id: string; name: string };

function AdminDataRoomPage() {
  const {
    data: startups,
    isLoading,
    error,
  } = useQuery<StartupItem[]>({
    queryKey: ["admin", "startups-list"],
    queryFn: async () => {
      const json = await customFetch<{ data?: StartupItem[] }>(
        "/startups?limit=100",
      );
      return ((json as { data?: StartupItem[] }).data ?? json) as StartupItem[];
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeStartupId = useMemo(
    () => selectedId ?? startups?.[0]?.id ?? null,
    [selectedId, startups],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Data Room</h1>
          <p className="text-muted-foreground text-pretty">
            View and manage startup documents and classifications.
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

  if (!startups || startups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-pretty">
          No startups found.
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
            View and manage startup documents and classifications.
          </p>
        </div>

        <div className="w-full space-y-1.5 sm:w-72">
          <Label
            htmlFor="admin-data-room-startup"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            Startup
          </Label>
          <Select value={activeStartupId ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger id="admin-data-room-startup" className="w-full">
              <span className="flex items-center gap-2 truncate">
                <Building2 className="size-4 shrink-0 text-muted-foreground inline mr-3" />
                <SelectValue placeholder="Select startup" />
              </span>
            </SelectTrigger>
            <SelectContent>
              {startups.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activeStartupId && (
        <DataRoomPanel startupId={activeStartupId} role="admin" />
      )}
    </div>
  );
}
