import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StartupCard } from "@/components/startup/StartupCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useScoutControllerGetMySubmissions } from "@/api/generated/scout/scout";
import { Plus, CheckCircle2, Clock3, FileCheck, XCircle } from "lucide-react";
import type { ScoutSubmissionsResponseDtoDataItem } from "@/api/generated/model";
import type { Startup } from "@/types";

export const Route = createFileRoute("/_protected/scout/")({
  component: ScoutDashboard,
});

function ScoutDashboard() {
  const { data: response, isLoading, error } = useScoutControllerGetMySubmissions();
  const startups = (response?.data.data ?? []) as ScoutSubmissionsResponseDtoDataItem[];

  const stats = {
    total: startups.length,
    inReview: startups.filter((s) => s.status === "submitted" || s.status === "pending_review" || s.status === "analyzing").length,
    approved: startups.filter((s) => s.status === "approved").length,
    rejected: startups.filter((s) => s.status === "rejected").length,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scout Dashboard</h1>
          <p className="text-muted-foreground">Manage your submitted startups</p>
        </div>
        <Button asChild>
          <Link to="/scout/submit">
            <Plus className="mr-2 h-4 w-4" />
            Submit Startup
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Submitted</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <Clock3 className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inReview}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Your Submitted Startups</h2>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            Failed to load submissions: {(error as Error).message}
          </div>
        ) : startups.length === 0 ? (
          <div className="rounded-xl border bg-card py-16 px-4 text-center">
            <div className="mx-auto mb-4 w-fit rounded-full bg-muted p-6">
              <Plus className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No startups submitted yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Start sourcing deals by submitting your first startup.
            </p>
            <Button asChild>
              <Link to="/scout/submit">
                <Plus className="mr-2 h-4 w-4" />
                Submit Your First Startup
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {startups.map((startup) => (
              <StartupCard
                key={startup.id}
                startup={startup as unknown as Startup}
                basePath="/scout"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
