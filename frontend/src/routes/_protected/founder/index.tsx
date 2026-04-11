import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StartupCard } from "@/components/startup/StartupCard";
import { useStartupControllerFindAll } from "@/api/generated/startups/startups";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Startup } from "@/types";

interface StartupItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

export const Route = createFileRoute("/_protected/founder/")({
  component: FounderDashboard,
});

function FounderDashboard() {
  const { data: response, isLoading, error } = useStartupControllerFindAll(undefined, {
    query: {
      refetchInterval: (query) => {
        const payload = query.state.data;
        const rows = (payload?.data as Array<{ status?: string }> | undefined) ?? [];
        const hasInFlight = rows.some(
          (row) => row.status === "submitted" || row.status === "analyzing",
        );
        return hasInFlight ? 5000 : false;
      },
    },
  });
  const startups = (response?.data as StartupItem[] | undefined) ?? [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Startups</h1>
          <p className="text-muted-foreground">Manage and track your startup submissions</p>
        </div>
        <Button asChild>
          <Link to="/founder/submit" search={{ draftId: null }}>
            <Plus className="mr-2 h-4 w-4" />
            Submit New
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          Failed to load startups: {(error as Error).message}
        </div>
      ) : startups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="rounded-full bg-muted p-6 mb-4">
            <Plus className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No startups yet</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Get started by submitting your first startup for analysis and investor matching.
          </p>
          <Button asChild>
            <Link to="/founder/submit" search={{ draftId: null }}>
              <Plus className="mr-2 h-4 w-4" />
              Submit Your First Startup
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {startups.map((startup) => (
            <StartupCard key={startup.id} startup={startup as unknown as Startup} basePath="/founder" showScore={false} />
          ))}
        </div>
      )}
    </div>
  );
}
