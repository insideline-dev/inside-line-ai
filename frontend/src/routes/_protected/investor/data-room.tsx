import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DataRoomPanel } from "@/components/startup-view/DataRoomPanel";
import {
  DataRoomStartupGrid,
  type DataRoomStartupItem,
} from "@/components/startup-view/DataRoomStartupGrid";
import { customFetch } from "@/api/client";

export const Route = createFileRoute("/_protected/investor/data-room")({
  component: InvestorDataRoomPage,
  validateSearch: (search: Record<string, unknown>) => ({
    startupId: (search.startupId as string | undefined) || null,
  }),
});

function InvestorDataRoomPage() {
  const { startupId } = Route.useSearch();
  const navigate = useNavigate();

  const { data: startups, isLoading, error } = useQuery<DataRoomStartupItem[]>({
    queryKey: ["investor", "startups-list"],
    queryFn: async () => {
      const json = await customFetch<{ data?: DataRoomStartupItem[] }>(
        "/startups?limit=100",
      );
      return ((json as { data?: DataRoomStartupItem[] }).data ??
        json) as DataRoomStartupItem[];
    },
  });

  const selected = startupId
    ? startups?.find((s) => s.id === startupId) ?? null
    : null;

  const handleSelect = (id: string) => {
    navigate({ to: "/investor/data-room", search: { startupId: id } });
  };

  const handleBack = () => {
    navigate({ to: "/investor/data-room", search: { startupId: null } });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Data Room</h1>
          <p className="text-muted-foreground text-pretty">
            View startup documents shared with you.
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

  if (!startups || startups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-pretty">
          No startups available.
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
              Review documents shared by the founder, organized by section.
            </p>
          </div>
        </div>

        <DataRoomPanel
          startupId={selected.id}
          role="investor"
          allowUpload={false}
          allowCategoryEdit={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Data Room</h1>
        <p className="text-muted-foreground text-pretty">
          Select a startup to review its shared documents.
        </p>
      </div>

      <DataRoomStartupGrid startups={startups} onSelect={handleSelect} />
    </div>
  );
}
