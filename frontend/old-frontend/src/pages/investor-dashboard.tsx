import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ScoreRing";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StartupListSkeleton, StatsGridSkeleton, PrivateStartupCardSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { SearchAndFilters, useFilteredStartups, defaultFilters, type FilterState } from "@/components/SearchAndFilters";
import { 
  Target, 
  TrendingUp, 
  Building2, 
  MapPin, 
  ArrowRight, 
  Star,
  Eye,
  Clock,
  Filter,
  Plus,
  FileSearch,
  Lock,
  Loader2,
  Settings,
  Sliders
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { computeWeightedScore, type ScoringWeights, type SectionScores } from "@/lib/score-utils";

interface MatchedStartup {
  id: number;
  name: string;
  description: string;
  stage: string;
  sector: string;
  sectorIndustryGroup?: string;
  location: string;
  normalizedRegion?: string;
  overallScore: number;
  thesisFitScore: number;
  fitRationale: string;
  matchedAt: string;
  status: string;
  sectionScores?: SectionScores;
}

interface PrivateStartup {
  id: number;
  name: string;
  description: string;
  stage: string;
  sector: string;
  sectorIndustryGroup?: string;
  location: string;
  normalizedRegion?: string;
  overallScore: number;
  status: string;
  createdAt: string;
  sectionScores?: SectionScores;
}

interface InvestorScoringPreference {
  stage: string;
  useCustomWeights: boolean;
  customWeights: ScoringWeights | null;
}

export default function InvestorDashboard() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const { data: matches, isLoading } = useQuery<MatchedStartup[]>({
    queryKey: ["/api/investor/matches"],
  });

  const { data: myStartups, isLoading: isLoadingMyStartups } = useQuery<PrivateStartup[]>({
    queryKey: ["/api/investor/my-startups"],
  });

  const { data: scoringPrefs } = useQuery<InvestorScoringPreference[]>({
    queryKey: ["/api/investor/scoring-preferences"],
  });

  const hasAnyCustomWeights = useMemo(() => {
    return scoringPrefs?.some(pref => pref.useCustomWeights) ?? false;
  }, [scoringPrefs]);

  const getPreferenceForStage = useMemo(() => {
    const prefsByStage: Record<string, InvestorScoringPreference> = {};
    scoringPrefs?.forEach(pref => {
      prefsByStage[pref.stage] = pref;
    });
    return (stage: string) => prefsByStage[stage];
  }, [scoringPrefs]);

  const getPersonalizedScore = useMemo(() => {
    return (startup: MatchedStartup | PrivateStartup): number => {
      const pref = getPreferenceForStage(startup.stage);
      if (!pref?.useCustomWeights || !pref.customWeights || !startup.sectionScores) {
        return startup.overallScore;
      }
      return Math.round(computeWeightedScore(startup.sectionScores, pref.customWeights));
    };
  }, [getPreferenceForStage]);

  const { data: stats, isLoading: isLoadingStats } = useQuery<{
    totalMatches: number;
    reviewing: number;
    interested: number;
    passed: number;
  }>({
    queryKey: ["/api/investor/stats"],
  });

  const filteredMatches = useFilteredStartups(matches, filters);

  const filterMatchesByStatus = (status: string) => {
    if (status === "all") return filteredMatches;
    return filteredMatches.filter((m) => m.status === status);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "analyzing":
        return <Badge variant="outline" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" />Analyzing</Badge>;
      case "approved":
        return <Badge className="bg-chart-2/10 text-chart-2 border-chart-2/20">Ready</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Deal Flow</h1>
            {hasAnyCustomWeights && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="gap-1 cursor-help">
                    <Sliders className="w-3 h-3" />
                    Custom Scoring
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>You're viewing scores with your custom scoring weights</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-muted-foreground">
            Startups matched to your investment thesis
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild data-testid="button-submit-startup">
            <Link href="/investor/submit">
              <Plus className="w-4 h-4 mr-2" />
              Analyze Startup
            </Link>
          </Button>
          <Button variant="outline" asChild data-testid="button-edit-thesis">
            <Link href="/investor/thesis">
              <Target className="w-4 h-4 mr-2" />
              Edit Thesis
            </Link>
          </Button>
          <Button variant="outline" asChild data-testid="button-scoring-settings">
            <Link href="/investor/scoring">
              <Sliders className="w-4 h-4 mr-2" />
              Scoring
            </Link>
          </Button>
        </div>
      </div>

      {/* My Private Startups */}
      {isLoadingMyStartups ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">My Private Analysis</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => <PrivateStartupCardSkeleton key={i} />)}
          </div>
        </div>
      ) : (myStartups && myStartups.length > 0) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">My Private Analysis</h2>
            <Badge variant="secondary">{myStartups.length}</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {myStartups.map((startup) => {
              const displayScore = getPersonalizedScore(startup);
              return (
              <Card key={startup.id} className="hover-elevate" data-testid={`card-my-startup-${startup.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {startup.status === "approved" && displayScore ? (
                      <ScoreRing score={displayScore} size="sm" showLabel={false} />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <FileSearch className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium truncate">{startup.name}</h3>
                        {getStatusBadge(startup.status)}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {startup.description || "No description"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {format(new Date(startup.createdAt), "MMM d, yyyy")}
                      </div>
                    </div>
                  </div>
                  {startup.status === "approved" && (
                    <Button className="w-full mt-4" size="sm" asChild>
                      <Link href={`/investor/startup/${startup.id}`}>
                        View Analysis
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      {isLoadingStats ? (
        <StatsGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.totalMatches || 0}</p>
                  <p className="text-sm text-muted-foreground">Matches</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-chart-4/10 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-chart-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.reviewing || 0}</p>
                  <p className="text-sm text-muted-foreground">Reviewing</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-chart-2/10 flex items-center justify-center">
                  <Star className="w-5 h-5 text-chart-2" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.interested || 0}</p>
                  <p className="text-sm text-muted-foreground">Interested</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.passed || 0}</p>
                  <p className="text-sm text-muted-foreground">Passed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      {matches && matches.length > 0 && (
        <SearchAndFilters
          filters={filters}
          onFiltersChange={setFilters}
          showScoreFilter={true}
          placeholder="Search matched startups..."
        />
      )}

      {/* Matches */}
      <Tabs defaultValue="all" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
          <TabsTrigger value="new" data-testid="tab-new">New</TabsTrigger>
          <TabsTrigger value="reviewing" data-testid="tab-reviewing">Reviewing</TabsTrigger>
          <TabsTrigger value="interested" data-testid="tab-interested">Interested</TabsTrigger>
          <TabsTrigger value="watchlist" data-testid="tab-watchlist">Watchlist</TabsTrigger>
        </TabsList>

        {["all", "new", "reviewing", "interested", "watchlist"].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-4">
            {isLoading ? (
              <StartupListSkeleton count={3} variant="match" />
            ) : filterMatchesByStatus(tab).length > 0 ? (
              <div className="grid gap-4">
                {filterMatchesByStatus(tab).map((match) => {
                  const displayScore = getPersonalizedScore(match);
                  return (
                  <Card key={match.id} className="hover-elevate" data-testid={`card-match-${match.id}`}>
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row items-start gap-6">
                        {/* Two Score Display */}
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center gap-1">
                            <ScoreRing score={displayScore} size="sm" showLabel={false} />
                            <span className="text-xs font-medium text-muted-foreground">Startup</span>
                          </div>
                          <div className="w-px h-12 bg-border" />
                          <div className="flex flex-col items-center gap-1">
                            <ScoreRing score={Math.round(match.thesisFitScore)} size="sm" showLabel={false} variant="secondary" />
                            <span className="text-xs font-medium text-muted-foreground">Thesis Fit</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-semibold">{match.name}</h3>
                            {match.stage && (
                              <Badge variant="outline">{match.stage.replace("_", " ")}</Badge>
                            )}
                            {match.sector && (
                              <Badge variant="secondary">{match.sector}</Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground line-clamp-2">{match.description}</p>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            {match.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {match.location}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              Matched {format(new Date(match.matchedAt), "MMM d")}
                            </span>
                          </div>
                        </div>
                        <div className="flex lg:flex-col gap-2">
                          <Button asChild data-testid={`button-view-memo-${match.id}`}>
                            <Link href={`/investor/startup/${match.id}`}>
                              View Memo
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            ) : matches && matches.length > 0 && filteredMatches.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                    <Target className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No matching results</h3>
                  <p className="text-muted-foreground mb-4 max-w-md mx-auto">
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
                    <Target className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No matches yet</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {tab === "all" 
                      ? "We're actively searching for startups that match your thesis. Check back soon."
                      : `No startups in ${tab} status yet.`
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
