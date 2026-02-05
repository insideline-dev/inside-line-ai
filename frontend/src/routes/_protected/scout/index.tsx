import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StartupCard } from "@/components/startup/StartupCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useScoutControllerGetMySubmissions } from "@/api/generated/scout/scout";
import { Plus, CheckCircle2, Clock, FileCheck } from "lucide-react";
import type { Startup } from "@/types";

interface StartupItem {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

export const Route = createFileRoute("/_protected/scout/")({
  component: ScoutDashboard,
});

function ScoutDashboard() {
  const { data: response, isLoading, error } = useScoutControllerGetMySubmissions();
  const startups = (response?.data as StartupItem[] | undefined) ?? [];

  const stats = {
    total: startups.length,
    approved: startups.filter((s) => s.status === "approved").length,
    pending: startups.filter((s) => s.status === "submitted" || s.status === "pending_review" || s.status === "analyzing").length,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Submissions</h1>
          <p className="text-muted-foreground">Track startups you've submitted to Inside Line</p>
        </div>
        <Button asChild>
          <Link to="/scout/submit">
            <Plus className="mr-2 h-4 w-4" />
            Submit Startup
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
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
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          Failed to load submissions: {(error as Error).message}
        </div>
      ) : startups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="rounded-full bg-muted p-6 mb-4">
            <Plus className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No submissions yet</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Start scouting by submitting promising startups for review.
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
            <StartupCard key={startup.id} startup={startup as unknown as Startup} basePath="/scout" />
          ))}
        </div>
      )}
    </div>
  );
}
