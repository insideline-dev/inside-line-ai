import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Plus, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";
import type { Startup } from "@shared/schema";

function getStatusIcon(status: string) {
  switch (status) {
    case "approved":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "rejected":
      return <XCircle className="w-4 h-4 text-destructive" />;
    case "analyzing":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    default:
      return <Clock className="w-4 h-4 text-yellow-500" />;
  }
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved":
      return "default";
    case "rejected":
      return "destructive";
    default:
      return "secondary";
  }
}

function StartupCard({ startup }: { startup: Startup }) {
  return (
    <Card className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate" data-testid={`text-startup-name-${startup.id}`}>
                {startup.name}
              </h3>
              <Badge variant={getStatusVariant(startup.status)} className="shrink-0">
                {getStatusIcon(startup.status)}
                <span className="ml-1 capitalize">{startup.status.replace("_", " ")}</span>
              </Badge>
            </div>
            {startup.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {startup.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {startup.stage && (
                <span className="capitalize">{startup.stage.replace("_", " ")}</span>
              )}
              {startup.location && (
                <span>{startup.location}</span>
              )}
              {startup.createdAt && (
                <span>Submitted {new Date(startup.createdAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StartupListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ScoutDashboard() {
  const { data: startups, isLoading } = useQuery<Startup[]>({
    queryKey: ["/api/scout/startups"],
  });

  const stats = {
    total: startups?.length || 0,
    pending: startups?.filter(s => s.status === "submitted" || s.status === "pending_review" || s.status === "analyzing").length || 0,
    approved: startups?.filter(s => s.status === "approved").length || 0,
    rejected: startups?.filter(s => s.status === "rejected").length || 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Scout Dashboard</h1>
          <p className="text-muted-foreground">Manage your submitted startups</p>
        </div>
        <Button asChild data-testid="button-submit-startup">
          <Link href="/scout/submit">
            <Plus className="w-4 h-4 mr-2" />
            Submit Startup
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Submitted</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-pending">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-approved">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-rejected">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Your Submitted Startups</h2>
        {isLoading ? (
          <StartupListSkeleton />
        ) : startups && startups.length > 0 ? (
          <div className="space-y-4">
            {startups.map((startup) => (
              <StartupCard key={startup.id} startup={startup} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No startups submitted yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start sourcing deals by submitting your first startup
              </p>
              <Button asChild data-testid="button-submit-first">
                <Link href="/scout/submit">
                  <Plus className="w-4 h-4 mr-2" />
                  Submit Your First Startup
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
