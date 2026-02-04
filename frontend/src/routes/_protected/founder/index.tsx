import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StartupCard } from "@/components/startup/StartupCard";
import { getMockStartupsByFounder } from "@/mocks/data/startups";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_protected/founder/")({
  component: FounderDashboard,
});

function FounderDashboard() {
  const startups = getMockStartupsByFounder("user-founder-1");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Startups</h1>
          <p className="text-muted-foreground">Manage and track your startup submissions</p>
        </div>
        <Button asChild>
          <Link to="/founder/submit">
            <Plus className="mr-2 h-4 w-4" />
            Submit New
          </Link>
        </Button>
      </div>

      {startups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="rounded-full bg-muted p-6 mb-4">
            <Plus className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No startups yet</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Get started by submitting your first startup for analysis and investor matching.
          </p>
          <Button asChild>
            <Link to="/founder/submit">
              <Plus className="mr-2 h-4 w-4" />
              Submit Your First Startup
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {startups.map((startup) => (
            <StartupCard key={startup.id} startup={startup} basePath="/founder" />
          ))}
        </div>
      )}
    </div>
  );
}
