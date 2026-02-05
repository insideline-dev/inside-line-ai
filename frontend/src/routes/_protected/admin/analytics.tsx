import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  Users,
  Building2,
  Clock,
  TrendingUp,
  Handshake,
  Globe,
} from "lucide-react";
import { useAdminControllerGetStats } from "@/api/generated/admin/admin";

export const Route = createFileRoute("/_protected/admin/analytics")({
  component: AnalyticsDashboard,
});

// Matches PlatformStats from the backend
interface PlatformStats {
  users: {
    total: number;
    byRole: Record<string, number>;
    weeklySignups: Array<{ week: string; count: number }>;
  };
  startups: {
    total: number;
    byStatus: Record<string, number>;
    pending: number;
  };
  matches: {
    total: number;
    highScore: number;
  };
  portals: {
    active: number;
    totalSubmissions: number;
  };
  topIndustries: Array<{ industry: string; count: number }>;
}

function AnalyticsDashboard() {
  const { data, isLoading } = useAdminControllerGetStats<PlatformStats>();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Platform metrics and insights</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = data;
  const totalStartups = stats?.startups?.total ?? 0;
  const approved = stats?.startups?.byStatus?.approved ?? 0;
  const approvalRate =
    totalStartups > 0 ? ((approved / totalStartups) * 100).toFixed(0) : "0";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Platform metrics and insights</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Startups</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStartups}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.portals?.totalSubmissions ?? 0} portal submissions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.startups?.pending ?? 0}</div>
            <p className="text-xs text-muted-foreground">Awaiting admin review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Matches</CardTitle>
            <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.matches?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.matches?.highScore ?? 0} high score (&gt;80)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Portals</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.portals?.active ?? 0}</div>
            <p className="text-xs text-muted-foreground">Accepting submissions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.users?.total ?? 0}</div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Founders</span>
                <span>{stats?.users?.byRole?.founder ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Investors</span>
                <span>{stats?.users?.byRole?.investor ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Admins</span>
                <span>{stats?.users?.byRole?.admin ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Scouts</span>
                <span>{stats?.users?.byRole?.scout ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvalRate}%</div>
            <p className="text-xs text-muted-foreground">Of submitted startups</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Industries</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="mt-1 space-y-1 text-xs text-muted-foreground">
              {(stats?.topIndustries ?? []).slice(0, 5).map((item) => (
                <div key={item.industry} className="flex justify-between">
                  <span className="truncate">{item.industry}</span>
                  <span>{item.count}</span>
                </div>
              ))}
              {(!stats?.topIndustries || stats.topIndustries.length === 0) && (
                <p>No data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
