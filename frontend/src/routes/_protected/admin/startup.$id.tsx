import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { StartupHeader } from "@/components/startup-view/StartupHeader";
import { SummaryCard } from "@/components/startup-view/SummaryCard";
import { TeamTabContent } from "@/components/startup-view/TeamTabContent";
import { ProductTabContent } from "@/components/startup-view/ProductTabContent";
import { MemoTabContent } from "@/components/startup-view/MemoTabContent";
import { CompetitorsTabContent } from "@/components/startup-view/CompetitorsTabContent";
import { InsightsTabContent } from "@/components/startup-view/InsightsTabContent";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowLeft,
  DollarSign,
  MapPin,
  Calendar,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { useStartupControllerFindOne, getStartupControllerFindOneQueryKey } from "@/api/generated/startup/startup";
import {
  useAdminControllerApproveStartup,
  useAdminControllerReanalyzeStartup,
  useAdminControllerGetAllScoringWeights,
  getAdminControllerRejectStartupUrl,
  getAdminControllerGetStatsQueryKey,
  getAdminControllerGetAllStartupsQueryKey,
} from "@/api/generated/admin/admin";
import { customFetch } from "@/api/client";
import type { ScoringWeights } from "@/lib/score-utils";

export const Route = createFileRoute("/_protected/admin/startup/$id")({
  component: AdminReviewPage,
});

import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

interface StartupDetail extends Startup {
  evaluation?: Evaluation;
}

interface StageScoringWeight {
  stage: string;
  weights: ScoringWeights;
}

const stageLabels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  series_d: "Series D",
  series_e: "Series E",
  series_f_plus: "Series F+",
};

function formatCurrency(amount: number, currency = "USD"): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M ${currency}`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K ${currency}`;
  }
  return `${amount.toLocaleString()} ${currency}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function AdminReviewPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [adminNotes, setAdminNotes] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const { data: startupResponse, isLoading } = useStartupControllerFindOne(id);
  const startup = startupResponse?.data as StartupDetail | undefined;

  const { data: scoringDefaults } = useAdminControllerGetAllScoringWeights();
  const stageScoringWeights =
    (scoringDefaults as unknown as StageScoringWeight[] | undefined) ?? [];

  const stageWeights = useMemo(() => {
    if (!startup?.stage) return null;
    const stageData = stageScoringWeights.find(
      (stage) => stage.stage === startup.stage
    );
    return stageData?.weights ?? null;
  }, [startup?.stage, stageScoringWeights]);

  const approveMutation = useAdminControllerApproveStartup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
        toast.success("Startup approved", {
          description: "The startup is now visible to investors.",
        });
        setShowApproveDialog(false);
        setAdminNotes("");
      },
      onError: (error: Error) => {
        toast.error("Failed to approve startup", { description: error.message });
      },
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      return customFetch(getAdminControllerRejectStartupUrl(id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getAdminControllerGetStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
      toast.success("Startup rejected", {
        description: "The startup has been rejected.",
      });
      setShowRejectDialog(false);
      setAdminNotes("");
    },
    onError: (error: Error) => {
      toast.error("Failed to reject startup", { description: error.message });
    },
  });

  const reanalyzeMutation = useAdminControllerReanalyzeStartup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
        toast.success("Reanalysis triggered", {
          description: "The startup evaluation has been queued for reanalysis.",
        });
      },
      onError: (error: Error) => {
        toast.error("Failed to trigger reanalysis", { description: error.message });
      },
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!startup) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <p className="text-muted-foreground">Startup not found</p>
        <Button asChild>
          <Link to="/admin">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const evaluation = startup.evaluation as Evaluation | undefined;
  const canApproveReject = ["pending_review", "analyzing", "analyzed"].includes(
    startup.status
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{startup.name}</h1>
          <p className="text-sm text-muted-foreground">Review startup submission</p>
        </div>
        {evaluation && evaluation.overallScore && <ScoreRing score={evaluation.overallScore} size="lg" />}
      </div>

      <div className="flex gap-2 flex-wrap">
        {canApproveReject && (
          <>
            <Button
              onClick={() => setShowApproveDialog(true)}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowRejectDialog(true)}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </>
        )}
        <Button
          variant="outline"
          onClick={() => reanalyzeMutation.mutate({ id })}
          disabled={reanalyzeMutation.isPending}
        >
          {reanalyzeMutation.isPending ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Re-analyze
        </Button>
      </div>

      <StartupHeader startup={startup} backLink="/admin" />

      {startup.status === "analyzing" && stageWeights && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <AnalysisProgress
              startupId={startup.id}
              isAnalyzing={true}
              weights={stageWeights}
              progress={evaluation?.analysisProgress as any}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {startup.description && (
              <div>
                <h4 className="text-sm font-medium mb-1">Description</h4>
                <p className="text-sm text-muted-foreground">{startup.description}</p>
              </div>
            )}
            <div className="space-y-2">
              {startup.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{startup.location}</span>
                </div>
              )}
              {startup.roundSize && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Raising {formatCurrency(startup.roundSize, startup.roundCurrency || "USD")}
                  </span>
                </div>
              )}
              {startup.valuation && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Valuation: {formatCurrency(startup.valuation, startup.roundCurrency || "USD")}{" "}
                    ({startup.valuationType === "pre_money" ? "Pre-money" : "Post-money"})
                  </span>
                </div>
              )}
              {startup.stage && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{stageLabels[startup.stage] || startup.stage}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Submitted {formatDate(startup.createdAt)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="admin-notes" className="sr-only">
              Admin notes
            </Label>
            <Textarea
              id="admin-notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="min-h-[120px]"
              placeholder="Add internal notes about this startup (required for rejection)..."
            />
          </CardContent>
        </Card>
      </div>

      {evaluation && (
        <Tabs defaultValue="summary" className="w-full">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="product">Product</TabsTrigger>
            <TabsTrigger value="memo">Memo</TabsTrigger>
            <TabsTrigger value="competitors">Competitors</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-6">
            <SummaryCard
              startup={startup}
              evaluation={evaluation}
              weights={stageWeights}
            />
          </TabsContent>

          <TabsContent value="team" className="mt-6">
            <TeamTabContent
              evaluation={evaluation}
              teamMembers={startup.teamMembers || []}
              teamWeight={stageWeights?.team}
            />
          </TabsContent>

          <TabsContent value="product" className="mt-6">
            <ProductTabContent
              startup={startup}
              evaluation={evaluation}
              productWeight={stageWeights?.product}
            />
          </TabsContent>

          <TabsContent value="memo" className="mt-6">
            <MemoTabContent
              startup={startup}
              evaluation={evaluation}
              weights={stageWeights}
            />
          </TabsContent>

          <TabsContent value="competitors" className="mt-6">
            <CompetitorsTabContent
              evaluation={evaluation}
              companyName={startup.name}
            />
          </TabsContent>

          <TabsContent value="insights" className="mt-6">
            <InsightsTabContent evaluation={evaluation} />
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this startup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make the startup visible to investors on the platform.
              {adminNotes && (
                <p className="mt-2 text-sm">
                  <strong>Your notes:</strong> {adminNotes}
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => approveMutation.mutate({ id })}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this startup?</AlertDialogTitle>
            <AlertDialogDescription>
              This startup will be marked as rejected and will not be visible to
              investors.
              {adminNotes ? (
                <p className="mt-2 text-sm">
                  <strong>Your notes:</strong> {adminNotes}
                </p>
              ) : (
                <p className="mt-2 text-sm text-destructive">
                  Please add a note explaining the rejection reason before proceeding.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rejectMutation.mutate(adminNotes)}
              disabled={rejectMutation.isPending || !adminNotes.trim()}
              className="bg-destructive text-destructive-foreground"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
