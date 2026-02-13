import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { StartupHeader } from "@/components/startup-view/StartupHeader";
import { AdminSummaryTab } from "@/components/startup-view/AdminSummaryTab";
import { TeamTabContent } from "@/components/startup-view/TeamTabContent";
import { ProductTabContent } from "@/components/startup-view/ProductTabContent";
import { MemoTabContent } from "@/components/startup-view/MemoTabContent";
import { CompetitorsTabContent } from "@/components/startup-view/CompetitorsTabContent";
import { InsightsTabContent } from "@/components/startup-view/InsightsTabContent";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import {
  RefreshCw,
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

function unwrapApiResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    return (payload as Record<string, unknown>).data as T;
  }

  return payload as T;
}

function AdminReviewPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [adminNotes, setAdminNotes] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const { data: startupResponse, isLoading } = useStartupControllerFindOne(id);
  const startup = startupResponse
    ? unwrapApiResponse<StartupDetail>(startupResponse)
    : undefined;

  const { data: scoringDefaults } = useAdminControllerGetAllScoringWeights();
  const stageScoringWeights = scoringDefaults
    ? unwrapApiResponse<StageScoringWeight[]>(scoringDefaults)
    : [];

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
      <StartupHeader
        startup={startup}
        backLink="/admin"
        actions={
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
            Re-evaluate
          </Button>
        }
      />

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
            <AdminSummaryTab
              startup={startup}
              evaluation={evaluation}
              weights={stageWeights}
              adminNotes={adminNotes}
              onAdminNotesChange={setAdminNotes}
              onApprove={() => setShowApproveDialog(true)}
              onReject={() => setShowRejectDialog(true)}
              approveDisabled={approveMutation.isPending || rejectMutation.isPending}
              rejectDisabled={approveMutation.isPending || rejectMutation.isPending}
              canApproveReject={canApproveReject}
            />
          </TabsContent>

          <TabsContent value="team" className="mt-6">
            <TeamTabContent
              evaluation={evaluation}
              teamMembers={startup.teamMembers || []}
              teamWeight={stageWeights?.team}
              companyName={startup.name}
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
