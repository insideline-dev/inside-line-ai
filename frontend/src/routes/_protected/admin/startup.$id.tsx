import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { AdminReviewSidebar } from "@/components/startup-view/AdminReviewSidebar";
import { TeamTabContent } from "@/components/startup-view/TeamTabContent";
import { ProductTabContent } from "@/components/startup-view/ProductTabContent";
import { MemoTabContent } from "@/components/startup-view/MemoTabContent";
import { CompetitorsTabContent } from "@/components/startup-view/CompetitorsTabContent";
import { SourcesTabContent } from "@/components/startup-view/SourcesTabContent";
import { AdminEditTab } from "@/components/startup-view/AdminEditTab";
import { AdminPipelineLivePanel } from "@/components/startup-view/AdminPipelineLivePanel";
import {
  RefreshCw,
  Download,
  ChevronDown,
  FileText,
  BarChart2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadMemo, downloadReport } from "@/lib/pdf/download";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  useStartupControllerFindOne,
  useStartupControllerAdminDelete,
  getStartupControllerFindOneQueryKey,
} from "@/api/generated/startup/startup";
import {
  useAdminControllerApproveStartup,
  useAdminControllerReanalyzeStartup,
  useAdminControllerRetryStartupAgent,
  useAdminControllerGetAllScoringWeights,
  useAdminControllerMatchStartupInvestors,
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adminNotes, setAdminNotes] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [reanalyzingSection, setReanalyzingSection] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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

  const retryAgentMutation = useAdminControllerRetryStartupAgent({
    mutation: {
      onSuccess: (_result, variables) => {
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
        toast.success("Section re-analysis triggered", {
          description: `${variables.data.agent} has been queued for re-analysis.`,
        });
      },
      onError: (error: Error) => {
        toast.error("Failed to re-analyze section", { description: error.message });
      },
      onSettled: () => {
        setReanalyzingSection(null);
      },
    },
  });

  const deleteMutation = useStartupControllerAdminDelete({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetStatsQueryKey() });
        toast.success("Startup submission deleted");
        setShowDeleteDialog(false);
        navigate({ to: "/admin" });
      },
      onError: (error: Error) => {
        toast.error("Failed to delete submission", { description: error.message });
      },
    },
  });

  const matchMutation = useAdminControllerMatchStartupInvestors({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
        toast.success("Investor matching complete", {
          description: "Matching results have been sent to investors.",
        });
        setShowMatchDialog(false);
      },
      onError: (error: Error) => {
        toast.error("Failed to match investors", { description: error.message });
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
  const defaultTabValue =
    startup.status === "analyzing" || !evaluation ? "pipeline-live" : "summary";

  const handleSectionReanalyze = async (
    sectionKey: string,
    _evaluationId: string,
    comment: string,
  ) => {
    setReanalyzingSection(sectionKey);
    await retryAgentMutation.mutateAsync({
      id,
      data: {
        phase: "evaluation",
        agent: sectionKey,
        feedback: comment,
      },
    });
  };

  const handleLiveAgentRetry = async (
    phase: "research" | "evaluation",
    agentKey: string,
  ) => {
    await retryAgentMutation.mutateAsync({
      id,
      data: {
        phase,
        agent: agentKey,
      },
    });
  };

  const pdfData = evaluation
    ? {
        startup,
        evaluation,
        weights: stageWeights as Record<string, number> | null,
        watermarkEmail: user?.email ?? null,
      }
    : null;

  const handleDownload = async (type: "memo" | "report") => {
    if (!pdfData) return;
    if (!pdfData.watermarkEmail) {
      toast.error("Unable to generate watermark", {
        description: "User email is required for PDF watermarking.",
      });
      return;
    }
    setDownloading(true);
    try {
      if (type === "memo") await downloadMemo(pdfData);
      else await downloadReport(pdfData);
      toast.success(`${type === "memo" ? "Investment Memo" : "Analysis Report"} downloaded`);
    } catch (e) {
      toast.error("Failed to generate PDF", { description: (e as Error).message });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <StartupHeader
        startup={startup}
        backLink="/admin"
        actions={
          <div className="flex gap-2">
            {evaluation && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={downloading || !user?.email}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDownload("memo")}>
                    <FileText className="w-4 h-4 mr-2" />
                    Download Memo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("report")}>
                    <BarChart2 className="w-4 h-4 mr-2" />
                    Download Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              Re-evaluate
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Tabs defaultValue={defaultTabValue} className="w-full min-w-0">
          <TabsList className="flex h-auto w-full flex-wrap rounded-xl bg-muted/60 p-2">
            <TabsTrigger value="pipeline-live" className="w-full sm:w-auto">
              Pipeline Live
            </TabsTrigger>
            {evaluation && (
              <>
                <TabsTrigger value="summary" className="w-full sm:w-auto">Summary</TabsTrigger>
                <TabsTrigger value="memo" className="w-full sm:w-auto">Memo</TabsTrigger>
                <TabsTrigger value="product" className="w-full sm:w-auto">Product</TabsTrigger>
                <TabsTrigger value="team" className="w-full sm:w-auto">Team</TabsTrigger>
                <TabsTrigger value="competitors" className="w-full sm:w-auto">Competitors</TabsTrigger>
                <TabsTrigger value="sources" className="w-full sm:w-auto">Sources</TabsTrigger>
                <TabsTrigger value="edit" className="w-full sm:w-auto">Edit</TabsTrigger>
                <TabsTrigger value="raw" className="w-full sm:w-auto">Raw</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="pipeline-live" className="mt-6">
            <AdminPipelineLivePanel
              startupId={startup.id}
              startupStatus={startup.status}
              onRetryAgent={handleLiveAgentRetry}
            />
          </TabsContent>

          {evaluation && (
            <>
              <TabsContent value="summary" className="mt-6">
                <AdminSummaryTab
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
                  adminFeedback={{
                    onReanalyze: handleSectionReanalyze,
                    reanalyzingSection,
                  }}
                />
              </TabsContent>

              <TabsContent value="competitors" className="mt-6">
                <CompetitorsTabContent
                  evaluation={evaluation}
                  companyName={startup.name}
                />
              </TabsContent>

              <TabsContent value="sources" className="mt-6">
                <SourcesTabContent startup={startup} evaluation={evaluation} />
              </TabsContent>

              <TabsContent value="edit" className="mt-6">
                <AdminEditTab startup={startup} />
              </TabsContent>

              <TabsContent value="raw" className="mt-6">
                <Card>
                  <CardContent className="p-0">
                    <pre className="max-h-[620px] overflow-auto rounded-lg bg-muted/30 p-4 text-xs leading-relaxed">
                      {JSON.stringify({ startup, evaluation }, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}
        </Tabs>

        <AdminReviewSidebar
          startup={startup}
          evaluation={evaluation}
          adminNotes={adminNotes}
          onAdminNotesChange={setAdminNotes}
          onApprove={() => setShowApproveDialog(true)}
          onReject={() => setShowRejectDialog(true)}
          onDeleteSubmission={() => setShowDeleteDialog(true)}
          onMatchInvestors={() => setShowMatchDialog(true)}
          approveDisabled={approveMutation.isPending || rejectMutation.isPending}
          rejectDisabled={approveMutation.isPending || rejectMutation.isPending}
          deleteDisabled={deleteMutation.isPending}
          matchDisabled={matchMutation.isPending}
          canApproveReject={canApproveReject}
        />
      </div>

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

      <AlertDialog open={showMatchDialog} onOpenChange={setShowMatchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Match investors for this startup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will run thesis alignment against all investor profiles and notify
              matched investors.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => matchMutation.mutate({ id })}
              disabled={matchMutation.isPending}
            >
              {matchMutation.isPending ? "Matching..." : "Match Investors"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this startup submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the startup and all linked analysis data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id })}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Submission"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
