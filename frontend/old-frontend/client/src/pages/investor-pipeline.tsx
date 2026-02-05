import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowRight, 
  Calendar,
  Clock, 
  DollarSign,
  GripVertical,
  Mail,
  MapPin,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  X
} from "lucide-react";
import { Link } from "wouter";
import { format, differenceInDays } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { computeWeightedScore, type ScoringWeights, type SectionScores } from "@/lib/score-utils";

interface PipelineStartup {
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

interface InvestorScoringPreference {
  stage: string;
  useCustomWeights: boolean;
  customWeights: ScoringWeights | null;
}

interface PipelineStats {
  new: number;
  reviewing: number;
  pursuing: number;
  closed: number;
  passed: number;
  total: number;
}

const PIPELINE_STAGES = [
  { key: "new", label: "New", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { key: "reviewing", label: "Reviewing", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { key: "pursuing", label: "Engaged", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  { key: "closed", label: "Closed", color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
  { key: "passed", label: "Passed", color: "bg-muted text-muted-foreground" },
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

export default function InvestorPipeline() {
  const { toast } = useToast();
  const [draggedCard, setDraggedCard] = useState<PipelineStartup | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  
  const [passDialogOpen, setPassDialogOpen] = useState(false);
  const [passTarget, setPassTarget] = useState<PipelineStartup | null>(null);
  const [passReason, setPassReason] = useState("");
  const [passNotes, setPassNotes] = useState("");
  
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<PipelineStartup | null>(null);
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [investmentCurrency, setInvestmentCurrency] = useState("USD");
  const [investmentNotes, setInvestmentNotes] = useState("");

  const { data: matches, isLoading } = useQuery<PipelineStartup[]>({
    queryKey: ["/api/investor/matches"],
  });

  const { data: stats } = useQuery<PipelineStats>({
    queryKey: ["/api/investor/pipeline-stats"],
  });

  const { data: scoringPrefs } = useQuery<InvestorScoringPreference[]>({
    queryKey: ["/api/investor/scoring-preferences"],
  });

  const getPreferenceForStage = useMemo(() => {
    const prefsByStage: Record<string, InvestorScoringPreference> = {};
    scoringPrefs?.forEach(pref => {
      prefsByStage[pref.stage] = pref;
    });
    return (stage: string) => prefsByStage[stage];
  }, [scoringPrefs]);

  const getPersonalizedScore = useMemo(() => {
    return (startup: PipelineStartup): number => {
      const pref = getPreferenceForStage(startup.stage);
      if (!pref?.useCustomWeights || !pref.customWeights || !startup.sectionScores) {
        return startup.overallScore;
      }
      return Math.round(computeWeightedScore(startup.sectionScores, pref.customWeights));
    };
  }, [getPreferenceForStage]);

  const updateMatchMutation = useMutation({
    mutationFn: async ({ matchId, updates }: { matchId: number; updates: any }) => {
      return apiRequest("PATCH", `/api/investor/matches/${matchId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investor/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investor/pipeline-stats"] });
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

  const getStartupsByStage = (stage: string) => {
    if (!matches) return [];
    return matches.filter(m => m.status === stage);
  };

  const getDaysInStage = (statusChangedAt: string | null) => {
    if (!statusChangedAt) return 0;
    return differenceInDays(new Date(), new Date(statusChangedAt));
  };

  const handleDragStart = (e: React.DragEvent, startup: PipelineStartup) => {
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

  const handlePursue = (startup: PipelineStartup) => {
    updateMatchMutation.mutate({
      matchId: startup.matchId,
      updates: { status: "pursuing" },
    });
  };

  const handleRequestMeeting = (startup: PipelineStartup) => {
    updateMatchMutation.mutate({
      matchId: startup.matchId,
      updates: { meetingRequested: true },
    });
    toast({
      title: "Meeting Requested",
      description: `A request to connect with ${startup.name} has been sent.`,
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500/15 text-green-700 dark:text-green-400";
    if (score >= 60) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    return "bg-red-500/15 text-red-700 dark:text-red-400";
  };

  const renderStartupCard = (startup: PipelineStartup) => {
    const displayScore = getPersonalizedScore(startup);
    const thesisScore = startup.thesisFitScore || 0;
    const daysInStage = getDaysInStage(startup.statusChangedAt);

    return (
      <Card 
        key={startup.matchId}
        className="hover-elevate cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={(e) => handleDragStart(e, startup)}
        data-testid={`pipeline-card-${startup.matchId}`}
      >
        <CardContent className="p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <Link href={`/investor/startup/${startup.id}`}>
                  <h4 className="font-medium text-sm truncate hover:underline" data-testid={`link-startup-${startup.id}`}>
                    {startup.name}
                  </h4>
                </Link>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 flex-shrink-0 text-right">
              <div className="flex items-center gap-1 justify-end">
                <span className="text-[10px] text-muted-foreground">Score</span>
                <div className={`px-1.5 py-0.5 rounded text-xs font-semibold min-w-[28px] text-center ${getScoreColor(displayScore)}`}>
                  {displayScore}
                </div>
              </div>
              <div className="flex items-center gap-1 justify-end">
                <span className="text-[10px] text-muted-foreground">Fit</span>
                <div className={`px-1.5 py-0.5 rounded text-xs font-semibold min-w-[28px] text-center ${getScoreColor(thesisScore)}`}>
                  {thesisScore}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1">
            {startup.stage && (
              <Badge variant="outline" className="text-xs">
                {startup.stage.replace("_", " ")}
              </Badge>
            )}
            {startup.sectorIndustryGroup && (
              <Badge variant="secondary" className="text-xs">
                {startup.sectorIndustryGroup}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {startup.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3" />
                {startup.location}
              </span>
            )}
            {daysInStage > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {daysInStage}d
              </span>
            )}
          </div>

          {startup.status === "reviewing" && (
            <div className="flex gap-1 pt-1">
              <Button 
                size="sm" 
                className="flex-1 h-7 text-xs"
                onClick={() => handlePursue(startup)}
                data-testid={`button-pursue-${startup.matchId}`}
              >
                <ThumbsUp className="w-3 h-3 mr-1" />
                Engage
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={() => {
                  setPassTarget(startup);
                  setPassDialogOpen(true);
                }}
                data-testid={`button-pass-${startup.matchId}`}
              >
                <ThumbsDown className="w-3 h-3 mr-1" />
                Pass
              </Button>
            </div>
          )}

          {startup.status === "pursuing" && (
            <div className="flex gap-1 pt-1">
              {!startup.meetingRequested ? (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="flex-1 h-7 text-xs"
                  onClick={() => handleRequestMeeting(startup)}
                  data-testid={`button-meeting-${startup.matchId}`}
                >
                  <Mail className="w-3 h-3 mr-1" />
                  Request Intro
                </Button>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  <Mail className="w-3 h-3 mr-1" />
                  Intro Requested
                </Badge>
              )}
              <Button 
                size="sm" 
                className="flex-1 h-7 text-xs"
                onClick={() => {
                  setCloseTarget(startup);
                  setCloseDialogOpen(true);
                }}
                data-testid={`button-close-${startup.matchId}`}
              >
                <DollarSign className="w-3 h-3 mr-1" />
                Close
              </Button>
            </div>
          )}

          {startup.status === "closed" && startup.investmentAmount && (
            <div className="pt-1 border-t">
              <div className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                <DollarSign className="w-3 h-3" />
                {startup.investmentCurrency} {startup.investmentAmount.toLocaleString()}
              </div>
            </div>
          )}

          {startup.status === "passed" && startup.passReason && (
            <div className="pt-1 border-t">
              <span className="text-xs text-muted-foreground">
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
    const count = stats?.[stage.key as keyof PipelineStats] || startups.length;

    return (
      <div 
        key={stage.key}
        className={`flex-1 min-w-[280px] max-w-[320px] flex flex-col rounded-lg border ${
          dragOverColumn === stage.key ? "ring-2 ring-primary bg-primary/5" : "bg-muted/30"
        }`}
        onDragOver={(e) => handleDragOver(e, stage.key)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, stage.key)}
        data-testid={`pipeline-column-${stage.key}`}
      >
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">{stage.label}</h3>
            <Badge variant="secondary" className="text-xs">{count}</Badge>
          </div>
        </div>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
          {isLoading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : startups.length > 0 ? (
            startups.map(renderStartupCard)
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">
            Track and manage your deal flow
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild data-testid="button-back-dealflow">
            <Link href="/investor">
              <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
              Deal Flow
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map(renderColumn)}
      </div>

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
