import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/ScoreRing";
import { StatusBadge } from "@/components/StatusBadge";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import { StartupListSkeleton, StatsGridSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { SearchAndFilters, useFilteredStartups, defaultFilters, type FilterState } from "@/components/SearchAndFilters";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Eye,
  ArrowRight,
  Building2,
  AlertTriangle,
  Users,
  Target,
  Sparkles
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import type { Startup } from "@shared/schema";

export default function AdminDashboard() {
  const { toast } = useToast();
  const prevAnalyzingCountRef = useRef<number>(0);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const { data: startups, isLoading } = useQuery<Startup[]>({
    queryKey: ["/api/admin/startups"],
    refetchInterval: (query) => {
      const data = query.state.data as Startup[] | undefined;
      const hasAnalyzing = data?.some(s => s.status === "analyzing");
      return hasAnalyzing ? 5000 : false;
    },
  });

  const { data: stats, isLoading: isLoadingStats } = useQuery<{
    pendingReview: number;
    analyzing: number;
    approved: number;
    rejected: number;
    totalInvestors: number;
    totalMatches: number;
  }>({
    queryKey: ["/api/admin/stats"],
    refetchInterval: (query) => {
      const data = query.state.data;
      return (data?.analyzing ?? 0) > 0 ? 5000 : false;
    },
  });

  // Notify when startups finish analyzing
  useEffect(() => {
    const currentAnalyzingCount = stats?.analyzing ?? 0;
    const prevCount = prevAnalyzingCountRef.current;
    
    if (prevCount > 0 && currentAnalyzingCount < prevCount) {
      const completed = prevCount - currentAnalyzingCount;
      toast({
        title: "Analysis Complete",
        description: `${completed} startup${completed > 1 ? 's have' : ' has'} finished analyzing and moved to the appropriate stage.`,
      });
    }
    prevAnalyzingCountRef.current = currentAnalyzingCount;
  }, [stats?.analyzing, toast]);

  const filteredStartups = useFilteredStartups(startups, filters);

  const filterByStatus = (status: string) => {
    if (status === "all") return filteredStartups;
    // Treat "submitted" startups as "pending_review" for admin dashboard
    if (status === "pending_review") {
      return filteredStartups.filter((s) => s.status === "pending_review" || s.status === "submitted");
    }
    return filteredStartups.filter((s) => s.status === status);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Review and approve startup evaluations before they're shown to investors
        </p>
      </div>

      {/* Stats */}
      {isLoadingStats ? (
        <StatsGridSkeleton count={6} variant="admin" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-chart-4/10 flex items-center justify-center mx-auto mb-2">
                <Clock className="w-5 h-5 text-chart-4" />
              </div>
              <p className="text-2xl font-bold">{stats?.pendingReview || 0}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-chart-5/10 flex items-center justify-center mx-auto mb-2">
                <Sparkles className="w-5 h-5 text-chart-5" />
              </div>
              <p className="text-2xl font-bold">{stats?.analyzing || 0}</p>
              <p className="text-xs text-muted-foreground">Analyzing</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-chart-2/10 flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="w-5 h-5 text-chart-2" />
              </div>
              <p className="text-2xl font-bold">{stats?.approved || 0}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-2">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <p className="text-2xl font-bold">{stats?.rejected || 0}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-chart-3/10 flex items-center justify-center mx-auto mb-2">
                <Users className="w-5 h-5 text-chart-3" />
              </div>
              <p className="text-2xl font-bold">{stats?.totalInvestors || 0}</p>
              <p className="text-xs text-muted-foreground">Investors</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-chart-1/10 flex items-center justify-center mx-auto mb-2">
                <Target className="w-5 h-5 text-chart-1" />
              </div>
              <p className="text-2xl font-bold">{stats?.totalMatches || 0}</p>
              <p className="text-xs text-muted-foreground">Matches</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      {startups && startups.length > 0 && (
        <SearchAndFilters
          filters={filters}
          onFiltersChange={setFilters}
          showScoreFilter={true}
          placeholder="Search all startups..."
        />
      )}

      {/* Startups Queue */}
      <Tabs defaultValue="pending_review" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pending_review" data-testid="tab-pending">
            Pending Review
            {stats?.pendingReview ? (
              <Badge variant="secondary" className="ml-2">{stats.pendingReview}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="analyzing" data-testid="tab-analyzing">
            Analyzing
            {stats?.analyzing ? (
              <Badge variant="secondary" className="ml-2">{stats.analyzing}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
        </TabsList>

        {["pending_review", "analyzing", "approved", "rejected", "all"].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-4">
            {isLoading ? (
              <StartupListSkeleton count={3} variant="admin" />
            ) : filterByStatus(tab).length > 0 ? (
              <div className="grid gap-4">
                {filterByStatus(tab).map((startup) => (
                  <Card key={startup.id} className="hover-elevate" data-testid={`card-admin-startup-${startup.id}`}>
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
                            <StatusBadge status={startup.status as any} />
                            {startup.stage && (
                              <Badge variant="outline">{startup.stage.replace("_", " ")}</Badge>
                            )}
                            {startup.sector && (
                              <Badge variant="secondary">{startup.sector}</Badge>
                            )}
                          </div>
                          {startup.description && (
                            <p className="text-muted-foreground line-clamp-2">{startup.description}</p>
                          )}
                          {startup.status === "analyzing" && (
                            <AnalysisProgressBar startupId={startup.id} />
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-4 h-4" />
                              {startup.website}
                            </span>
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
                          <Button variant="outline" asChild data-testid={`button-review-${startup.id}`}>
                            <Link href={`/admin/startup/${startup.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              Review
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : startups && startups.length > 0 && filteredStartups.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No matching results</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your search or filters to find what you're looking for.
                  </p>
                  <Button variant="outline" onClick={() => setFilters(defaultFilters)}>
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tab === "pending_review" ? "All caught up!" : `No ${tab.replace("_", " ")} startups`}
                  </h3>
                  <p className="text-muted-foreground">
                    {tab === "pending_review" 
                      ? "No startups pending review at the moment."
                      : `There are no startups in ${tab.replace("_", " ")} status.`
                    }
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
