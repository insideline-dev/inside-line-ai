import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScoreRing } from "@/components/ScoreRing";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StartupListSkeleton, StatsGridSkeleton, PrivateStartupCardSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { SearchAndFilters, useFilteredStartups, defaultFilters, type FilterState } from "@/components/SearchAndFilters";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Sliders,
  Kanban,
  List,
  GripVertical,
  ThumbsUp,
  ThumbsDown,
  Mail,
  DollarSign,
  CircleCheck,
  CircleX,
  Sparkles
} from "lucide-react";
import { Link } from "wouter";
import { format, differenceInDays } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { computeWeightedScore, type ScoringWeights, type SectionScores } from "@/lib/score-utils";

interface MatchedStartup {
  id: number;
  matchId: number;
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
  statusChangedAt: string | null;
  sectionScores?: SectionScores;
  notes?: string;
  passReason?: string;
  passNotes?: string;
  investmentAmount?: number;
  investmentCurrency?: string;
  investmentDate?: string;
  investmentNotes?: string;
  meetingRequested?: boolean;
  meetingRequestedAt?: string;
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

const PIPELINE_STAGES = [
  { key: "new", label: "New", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", icon: Sparkles, iconColor: "text-blue-500" },
  { key: "reviewing", label: "Reviewing", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", icon: Eye, iconColor: "text-amber-500" },
  { key: "pursuing", label: "Engaged", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20", icon: Star, iconColor: "text-purple-500" },
  { key: "closed", label: "Closed", color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20", icon: CircleCheck, iconColor: "text-green-500" },
  { key: "passed", label: "Passed", color: "bg-muted text-muted-foreground", icon: CircleX, iconColor: "text-muted-foreground" },
];

const PASS_REASONS = [
  { value: "timing", label: "Timing" },
  { value: "valuation", label: "Valuation" },
  { value: "team", label: "Team concerns" },
  { value: "market", label: "Market size/fit" },
  { value: "competition", label: "Competition" },
  { value: "traction", label: "Insufficient traction" },
  { value: "thesis", label: "Outside thesis" },
  { value: "other", label: "Other" },
];

export default function InvestorDashboard() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  
  const [draggedCard, setDraggedCard] = useState<MatchedStartup | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  
  const [passDialogOpen, setPassDialogOpen] = useState(false);
  const [passTarget, setPassTarget] = useState<MatchedStartup | null>(null);
  const [passReason, setPassReason] = useState("");
  const [passNotes, setPassNotes] = useState("");
  
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<MatchedStartup | null>(null);
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [investmentCurrency, setInvestmentCurrency] = useState("USD");
  const [investmentNotes, setInvestmentNotes] = useState("");

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
    pursuing: number;
    closed: number;
    passed: number;
  }>({
    queryKey: ["/api/investor/stats"],
  });

  const updateMatchMutation = useMutation({
    mutationFn: async ({ matchId, updates }: { matchId: number; updates: any }) => {
      return apiRequest("PATCH", `/api/investor/matches/${matchId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investor/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investor/stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const filteredMatches = useFilteredStartups(matches, filters);

  const filterMatchesByStatus = (status: string) => {
    if (status === "all") return filteredMatches;
    return filteredMatches.filter((m) => m.status === status);
  };

  const getStartupsByStage = (stage: string) => {
    if (!matches) return [];
    return matches.filter(m => m.status === stage);
  };

  const getDaysInStage = (statusChangedAt: string | null) => {
    if (!statusChangedAt) return 0;
    return differenceInDays(new Date(), new Date(statusChangedAt));
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500/15 text-green-700 dark:text-green-400";
    if (score >= 60) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    return "bg-red-500/15 text-red-700 dark:text-red-400";
  };

  const handleDragStart = (e: React.DragEvent, startup: MatchedStartup) => {
    setDraggedCard(startup);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    setDragOverColumn(stage);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    
    if (!draggedCard || draggedCard.status === targetStage) {
      setDraggedCard(null);
      return;
    }

    if (targetStage === "passed") {
      setPassTarget(draggedCard);
      setPassDialogOpen(true);
      setDraggedCard(null);
      return;
    }

    if (targetStage === "closed") {
      setCloseTarget(draggedCard);
      setCloseDialogOpen(true);
      setDraggedCard(null);
      return;
    }

    updateMatchMutation.mutate({
      matchId: draggedCard.matchId,
      updates: { status: targetStage },
    });

    setDraggedCard(null);
  };

  const handlePass = () => {
    if (!passTarget) return;
    
    if (!passReason) {
      toast({
        title: "Pass reason required",
        description: "Please select a reason for passing on this startup.",
        variant: "destructive",
      });
      return;
    }
    
    updateMatchMutation.mutate({
      matchId: passTarget.matchId,
      updates: {
        status: "passed",
        passReason,
        passNotes,
      },
    });

    setPassDialogOpen(false);
    setPassTarget(null);
    setPassReason("");
    setPassNotes("");
  };

  const handleClose = () => {
    if (!closeTarget) return;
    
    if (!investmentAmount || parseFloat(investmentAmount) <= 0) {
      toast({
        title: "Investment amount required",
        description: "Please enter a valid investment amount to close this deal.",
        variant: "destructive",
      });
      return;
    }
    
    updateMatchMutation.mutate({
      matchId: closeTarget.matchId,
      updates: {
        status: "closed",
        investmentAmount: parseFloat(investmentAmount),
        investmentCurrency,
        investmentDate: new Date().toISOString(),
        investmentNotes,
      },
    });

    setCloseDialogOpen(false);
    setCloseTarget(null);
    setInvestmentAmount("");
    setInvestmentCurrency("USD");
    setInvestmentNotes("");
  };

  const handleEngage = (startup: MatchedStartup) => {
    updateMatchMutation.mutate({
      matchId: startup.matchId,
      updates: { status: "pursuing" },
    });
  };

  const handleRequestMeeting = (startup: MatchedStartup) => {
    updateMatchMutation.mutate({
      matchId: startup.matchId,
      updates: { meetingRequested: true },
    });
    toast({
      title: "Meeting Requested",
      description: `A request to connect with ${startup.name} has been sent.`,
    });
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

  const renderBoardCard = (startup: MatchedStartup) => {
    const displayScore = getPersonalizedScore(startup);
    const thesisScore = startup.thesisFitScore || 0;
    const daysInStage = getDaysInStage(startup.statusChangedAt);

    return (
      <Card 
        key={startup.matchId}
        className="cursor-grab active:cursor-grabbing overflow-hidden"
        draggable
        onDragStart={(e) => handleDragStart(e, startup)}
        data-testid={`pipeline-card-${startup.matchId}`}
      >
        <CardContent className="p-3 space-y-2 overflow-hidden">
          {/* Header with drag handle */}
          <div className="flex items-start gap-2">
            <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <Link href={`/investor/startup/${startup.id}`}>
                <h4 className="font-medium text-sm leading-tight hover:underline line-clamp-2" data-testid={`link-startup-${startup.id}`}>
                  {startup.name}
                </h4>
              </Link>
            </div>
          </div>

          {/* Scores row - horizontal layout */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded ${getScoreColor(displayScore)}`}>
              <span className="text-[10px] opacity-75">Score</span>
              <span className="text-xs font-bold">{displayScore}</span>
            </div>
            <div className={`flex items-center gap-1 px-2 py-1 rounded ${getScoreColor(thesisScore)}`}>
              <span className="text-[10px] opacity-75">Fit</span>
              <span className="text-xs font-bold">{thesisScore}</span>
            </div>
            {daysInStage > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                <Clock className="w-3 h-3" />
                {daysInStage}d
              </span>
            )}
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap gap-1">
            {startup.stage && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {startup.stage.replace("_", " ")}
              </Badge>
            )}
            {startup.sectorIndustryGroup && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {startup.sectorIndustryGroup}
              </Badge>
            )}
            {startup.location && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <MapPin className="w-2.5 h-2.5" />
                {startup.location}
              </span>
            )}
          </div>

          {/* Action buttons for reviewing */}
          {startup.status === "reviewing" && (
            <div className="flex gap-1 pt-1 justify-end">
              <Button 
                size="icon" 
                className="h-7 w-7"
                onClick={() => handleEngage(startup)}
                data-testid={`button-engage-${startup.matchId}`}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </Button>
              <Button 
                size="icon" 
                variant="outline"
                className="h-7 w-7"
                onClick={() => {
                  setPassTarget(startup);
                  setPassDialogOpen(true);
                }}
                data-testid={`button-pass-${startup.matchId}`}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* Action buttons for pursuing */}
          {startup.status === "pursuing" && (
            <div className="flex gap-1 pt-1 justify-end">
              {!startup.meetingRequested ? (
                <Button 
                  size="icon" 
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => handleRequestMeeting(startup)}
                  data-testid={`button-meeting-${startup.matchId}`}
                >
                  <Mail className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  <Mail className="w-3 h-3" />
                </Badge>
              )}
              <Button 
                size="icon" 
                className="h-7 w-7"
                onClick={() => {
                  setCloseTarget(startup);
                  setCloseDialogOpen(true);
                }}
                data-testid={`button-close-${startup.matchId}`}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </Button>
              <Button 
                size="icon" 
                variant="outline"
                className="h-7 w-7"
                onClick={() => {
                  setPassTarget(startup);
                  setPassDialogOpen(true);
                }}
                data-testid={`button-pass-pursuing-${startup.matchId}`}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* Investment info for closed */}
          {startup.status === "closed" && startup.investmentAmount && (
            <div className="pt-1 border-t">
              <div className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                <DollarSign className="w-3 h-3" />
                {startup.investmentCurrency} {startup.investmentAmount.toLocaleString()}
              </div>
            </div>
          )}

          {/* Pass reason for passed */}
          {startup.status === "passed" && startup.passReason && (
            <div className="pt-1 border-t">
              <span className="text-[10px] text-muted-foreground">
                {PASS_REASONS.find(r => r.value === startup.passReason)?.label || startup.passReason}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderColumn = (stage: typeof PIPELINE_STAGES[0]) => {
    const startups = getStartupsByStage(stage.key);
    const count = startups.length;
    const StageIcon = stage.icon;

    return (
      <div 
        key={stage.key}
        className={`flex-1 min-w-0 flex flex-col rounded-lg border ${
          dragOverColumn === stage.key ? "ring-2 ring-primary bg-primary/5" : "bg-muted/30"
        }`}
        onDragOver={(e) => handleDragOver(e, stage.key)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, stage.key)}
        data-testid={`pipeline-column-${stage.key}`}
      >
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <StageIcon className={`w-4 h-4 ${stage.iconColor}`} />
            <h3 className="font-medium text-sm">{stage.label}</h3>
            <Badge variant="secondary" className="text-xs">{count}</Badge>
          </div>
        </div>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-350px)]">
          {isLoading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : startups.length > 0 ? (
            startups.map(renderBoardCard)
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No startups
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Pipeline</h1>
            {hasAnyCustomWeights && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="gap-1">
                    <Sliders className="w-3 h-3" />
                    Custom Weights
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
          <div className="flex border rounded-md">
            <Button 
              variant={viewMode === "list" ? "secondary" : "ghost"} 
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="w-4 h-4" />
            </Button>
            <Button 
              variant={viewMode === "board" ? "secondary" : "ghost"} 
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode("board")}
              data-testid="button-view-board"
            >
              <Kanban className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" asChild data-testid="button-submit-startup">
            <Link href="/investor/submit">
              <Plus className="w-4 h-4 mr-2" />
              Analyze Startup
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
              <Card key={startup.id} className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/investor/startup/${startup.id}`}>
                        <h3 className="font-semibold truncate hover:underline" data-testid={`link-private-startup-${startup.id}`}>
                          {startup.name}
                        </h3>
                      </Link>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {startup.description}
                      </p>
                    </div>
                    <ScoreRing score={displayScore} size="sm" />
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {getStatusBadge(startup.status)}
                    {startup.stage && (
                      <Badge variant="outline" className="text-xs">
                        {startup.stage.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    {startup.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {startup.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(startup.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats - Only show in list view as filters */}
      {viewMode === "list" && (
        isLoadingStats ? (
          <StatsGridSkeleton count={5} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {PIPELINE_STAGES.map((stage) => {
              const getStageCount = () => {
                if (!matches) return 0;
                return matches.filter(m => m.status === stage.key).length;
              };
              const count = getStageCount();
              const isSelected = selectedStage === stage.key;
              const StageIcon = stage.icon;
              return (
                <Card 
                  key={stage.key}
                  className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : "hover-elevate"}`}
                  onClick={() => setSelectedStage(isSelected ? null : stage.key)}
                  data-testid={`filter-stage-${stage.key}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${stage.color.split(" ")[0]} flex items-center justify-center`}>
                        <StageIcon className={`w-5 h-5 ${stage.iconColor}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-sm text-muted-foreground">{stage.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Board View */}
      {viewMode === "board" && (
        <div className="grid grid-cols-5 gap-3">
          {PIPELINE_STAGES.map(renderColumn)}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <>
          {/* Search and Filters */}
          {matches && matches.length > 0 && (
            <SearchAndFilters
              filters={filters}
              onFiltersChange={setFilters}
              showScoreFilter={true}
              placeholder="Search matched startups..."
            />
          )}

          {/* Matches List */}
          <div className="space-y-4">
            {selectedStage && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Showing:</span>
                <Badge variant="outline" className="gap-1 pr-1">
                  {PIPELINE_STAGES.find(s => s.key === selectedStage)?.label}
                </Badge>
                <Button 
                  size="icon" 
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setSelectedStage(null)}
                  data-testid="button-clear-filter"
                >
                  <CircleX className="w-3 h-3" />
                </Button>
              </div>
            )}
            {isLoading ? (
              <StartupListSkeleton count={3} variant="match" />
            ) : filterMatchesByStatus(selectedStage || "all").length > 0 ? (
              filterMatchesByStatus(selectedStage || "all").map((match) => {
                const displayScore = getPersonalizedScore(match);
                const stageInfo = PIPELINE_STAGES.find(s => s.key === match.status);
                return (
                <Card key={match.id} className="hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <ScoreRing score={displayScore} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link href={`/investor/startup/${match.id}`}>
                              <h3 className="font-semibold hover:underline" data-testid={`link-match-${match.id}`}>
                                {match.name}
                              </h3>
                            </Link>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {match.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {stageInfo && (
                              <Badge className={stageInfo.color}>
                                {stageInfo.label}
                              </Badge>
                            )}
                            <Badge className="bg-chart-2/10 text-chart-2 border-chart-2/20">
                              {match.thesisFitScore}% Fit
                            </Badge>
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/investor/startup/${match.id}`}>
                                <ArrowRight className="w-4 h-4" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          {match.stage && (
                            <Badge variant="outline">
                              {match.stage.replace("_", " ")}
                            </Badge>
                          )}
                          {match.sectorIndustryGroup && (
                            <Badge variant="secondary">
                              {match.sectorIndustryGroup}
                            </Badge>
                          )}
                          {match.location && (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {match.location}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {match.fitRationale}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )})
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileSearch className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">No startups found</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedStage 
                      ? `No startups in "${PIPELINE_STAGES.find(s => s.key === selectedStage)?.label}" status.`
                      : "No startups match your current filters."}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Pass Dialog */}
      <Dialog open={passDialogOpen} onOpenChange={setPassDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pass on {passTarget?.name}</DialogTitle>
            <DialogDescription>
              Record why you're passing on this opportunity for future reference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={passReason} onValueChange={setPassReason}>
                <SelectTrigger data-testid="select-pass-reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {PASS_REASONS.map(reason => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add any additional notes..."
                value={passNotes}
                onChange={(e) => setPassNotes(e.target.value)}
                data-testid="input-pass-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPassDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePass} data-testid="button-confirm-pass">
              Confirm Pass
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Deal Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Deal with {closeTarget?.name}</DialogTitle>
            <DialogDescription>
              Record the investment details for this deal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Investment Amount</Label>
              <div className="flex gap-2">
                <Select value={investmentCurrency} onValueChange={setInvestmentCurrency}>
                  <SelectTrigger className="w-24" data-testid="select-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  className="flex-1"
                  data-testid="input-investment-amount"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add investment notes..."
                value={investmentNotes}
                onChange={(e) => setInvestmentNotes(e.target.value)}
                data-testid="input-investment-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClose} data-testid="button-confirm-close">
              Close Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
