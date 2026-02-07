import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { useAdminControllerGetStats, useAdminControllerGetAllStartups } from "@/api/generated/admin/admin";
import type { AdminControllerGetAllStartupsStatus } from "@/api/generated/model";
import { Clock, Sparkles, CheckCircle, XCircle, Users, Target, Building2, Eye } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_protected/admin/")({
  component: AdminDashboard,
});

interface StatsData {
  pendingReview: number;
  analyzing: number;
  approved: number;
  rejected: number;
  totalInvestors: number;
  totalMatches: number;
}

interface StartupItem {
  id: string;
  name: string;
  status: string;
  description?: string;
  website?: string;
  stage?: string;
  sector?: string;
  overallScore?: number;
  createdAt: string;
  percentileRank?: number;
}

const TAB_TO_STATUS: Record<string, AdminControllerGetAllStartupsStatus | undefined> = {
  pending_review: "pending_review",
  analyzing: "analyzing",
  approved: "approved",
  rejected: "rejected",
  all: undefined,
};

function AdminDashboard() {
  const prevAnalyzingCountRef = useRef<number>(0);
  const [activeTab, setActiveTab] = useState("pending_review");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const statusFilter = TAB_TO_STATUS[activeTab];

  const { data: statsResponse, isLoading: isLoadingStats } = useAdminControllerGetStats({
    query: {
      staleTime: 30_000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      refetchInterval: (query: any) => {
        const data = query.state.data as { data: StatsData } | undefined;
        return (data?.data?.analyzing ?? 0) > 0 ? 5000 : false;
      },
    },
  });

  const { data: startupsResponse, isLoading: isLoadingStartups } = useAdminControllerGetAllStartups(
    { limit: PAGE_SIZE, page, ...(statusFilter ? { status: statusFilter } : {}) },
    {
      query: {
        staleTime: 30_000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        refetchInterval: (query: any) => {
          const data = query.state.data as { data: StartupItem[] } | undefined;
          const hasAnalyzing = data?.data?.some((s) => s.status === "analyzing");
          return hasAnalyzing ? 5000 : false;
        },
      },
    }
  );

  const statsData = statsResponse?.data as StatsData | undefined;
  const startups = (startupsResponse?.data as StartupItem[] | undefined) ?? [];

  // Toast notification when analyzing count drops
  useEffect(() => {
    const currentAnalyzingCount = statsData?.analyzing ?? 0;
    const prevCount = prevAnalyzingCountRef.current;

    if (prevCount > 0 && currentAnalyzingCount < prevCount) {
      const completed = prevCount - currentAnalyzingCount;
      toast.success("Analysis Complete", {
        description: `${completed} startup${completed > 1 ? "s have" : " has"} finished analyzing.`,
      });
    }
    prevAnalyzingCountRef.current = currentAnalyzingCount;
  }, [statsData?.analyzing]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setPage(1);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      submitted: { label: "Pending", className: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
      pending_review: { label: "Pending", className: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
      analyzing: { label: "Analyzing", className: "bg-chart-5/10 text-chart-5 border-chart-5/20" },
      approved: { label: "Approved", className: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
      rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/20" },
    };

    const variant = variants[status] || { label: status, className: "" };
    return (
      <Badge variant="outline" className={variant.className}>
        {variant.label}
      </Badge>
    );
  };

  const formatStage = (stage: string) => {
    return stage
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  const stats = [
    {
      label: "Pending",
      value: statsData?.pendingReview ?? 0,
      icon: Clock,
      bgColor: "bg-chart-4/10",
      iconColor: "text-chart-4",
    },
    {
      label: "Analyzing",
      value: statsData?.analyzing ?? 0,
      icon: Sparkles,
      bgColor: "bg-chart-5/10",
      iconColor: "text-chart-5",
    },
    {
      label: "Approved",
      value: statsData?.approved ?? 0,
      icon: CheckCircle,
      bgColor: "bg-chart-2/10",
      iconColor: "text-chart-2",
    },
    {
      label: "Rejected",
      value: statsData?.rejected ?? 0,
      icon: XCircle,
      bgColor: "bg-destructive/10",
      iconColor: "text-destructive",
    },
    {
      label: "Investors",
      value: statsData?.totalInvestors ?? 0,
      icon: Users,
      bgColor: "bg-chart-3/10",
      iconColor: "text-chart-3",
    },
    {
      label: "Matches",
      value: statsData?.totalMatches ?? 0,
      icon: Target,
      bgColor: "bg-chart-1/10",
      iconColor: "text-chart-1",
    },
  ];

  const tabs = [
    { value: "pending_review", label: "Pending Review", count: statsData?.pendingReview },
    { value: "analyzing", label: "Analyzing", count: statsData?.analyzing },
    { value: "approved", label: "Approved", count: 0 },
    { value: "rejected", label: "Rejected", count: 0 },
    { value: "all", label: "All", count: 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Review and manage startup submissions</p>
      </div>

      {/* Stats */}
      {isLoadingStats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 text-center">
                <div className={`w-10 h-10 rounded-full ${stat.bgColor} flex items-center justify-center mx-auto mb-2`}>
                  <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {tab.count && tab.count > 0 ? (
                <Badge variant="secondary" className="ml-2">
                  {tab.count}
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="space-y-4">
            {isLoadingStartups ? (
              <div className="grid gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-lg" />
                ))}
              </div>
            ) : startups.length > 0 ? (
              <div className="grid gap-4">
                {startups.map((startup) => (
                  <Card key={startup.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row items-start gap-6">
                        {startup.overallScore ? (
                          <ScoreRing score={startup.overallScore} size="sm" showLabel={false} />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                            <Clock className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-semibold">{startup.name}</h3>
                            {getStatusBadge(startup.status)}
                            {startup.stage && <Badge variant="outline">{formatStage(startup.stage)}</Badge>}
                            {startup.sector && <Badge variant="secondary">{startup.sector}</Badge>}
                          </div>
                          {startup.description && (
                            <p className="text-muted-foreground line-clamp-2">{startup.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            {startup.website && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-4 h-4" />
                                {startup.website}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              Submitted {format(new Date(startup.createdAt), "MMM d, yyyy")}
                            </span>
                            {startup.percentileRank && (
                              <span className="flex items-center gap-1">
                                Top {Math.round(100 - startup.percentileRank)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" asChild>
                            <Link to="/admin/startup/$id" params={{ id: startup.id }}>
                              <Eye className="w-4 h-4 mr-2" />
                              Review
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {startups.length >= PAGE_SIZE && (
                  <div className="flex justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="flex items-center text-sm text-muted-foreground px-3">
                      Page {page}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tab.value === "pending_review" ? "All caught up!" : "No matching results"}
                  </h3>
                  <p className="text-muted-foreground">
                    {tab.value === "pending_review"
                      ? "No startups pending review at the moment."
                      : `There are no startups in ${tab.label.toLowerCase()} status.`}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
