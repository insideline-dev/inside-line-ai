import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StartupCard } from "@/components/startup/StartupCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminControllerGetStats } from "@/api/generated/admin/admin";
import { useStartupControllerAdminFindPending } from "@/api/generated/startup/startup";
import { BarChart3, Clock, CheckCircle, XCircle } from "lucide-react";
import type { Startup } from "@/types";

export const Route = createFileRoute("/_protected/admin/")({
  component: AdminDashboard,
});

interface StatsData {
  pendingReview: number;
  analyzing: number;
  approved: number;
  rejected: number;
}

interface StartupItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

function AdminDashboard() {
  const { data: statsResponse, isLoading: isLoadingStats } = useAdminControllerGetStats();
  const { data: startupsResponse, isLoading: isLoadingStartups } = useStartupControllerAdminFindPending();

  const statsData = statsResponse?.data as StatsData | undefined;
  const reviewQueue = (startupsResponse?.data as StartupItem[] | undefined) ?? [];

  const stats = [
    {
      label: "Pending Review",
      value: statsData?.pendingReview ?? 0,
      icon: Clock,
      color: "text-yellow-600",
    },
    {
      label: "Analyzing",
      value: statsData?.analyzing ?? 0,
      icon: BarChart3,
      color: "text-blue-600",
    },
    {
      label: "Approved",
      value: statsData?.approved ?? 0,
      icon: CheckCircle,
      color: "text-green-600",
    },
    {
      label: "Rejected",
      value: statsData?.rejected ?? 0,
      icon: XCircle,
      color: "text-red-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Review and manage startup submissions</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoadingStats ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div>
        <h2 className="text-2xl font-semibold mb-4">Review Queue</h2>
        {isLoadingStartups ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
          </div>
        ) : reviewQueue.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No startups in review queue</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviewQueue.map((startup) => (
              <StartupCard key={startup.id} startup={startup as unknown as Startup} basePath="/admin" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
