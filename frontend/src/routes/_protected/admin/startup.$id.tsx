import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { MarketTabContent } from "@/components/startup-view/MarketTabContent";
import { MemoTabContent } from "@/components/startup-view/MemoTabContent";
import { CompetitorsTabContent } from "@/components/startup-view/CompetitorsTabContent";
import { SourcesTabContent } from "@/components/startup-view/SourcesTabContent";
import { AdminEditTab } from "@/components/startup-view/AdminEditTab";
import { AdminPipelineLivePanel } from "@/components/startup-view/AdminPipelineLivePanel";
import { FounderRecommendationsTab } from "@/components/startup-view/FounderRecommendationsTab";
import { FinancialsTabContent } from "@/components/startup-view/FinancialsTabContent";
import {
  RefreshCw,
  Download,
  ChevronDown,
  FileText,
  BarChart2,
  StopCircle,
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
  useStartupControllerGetDataRoom,
  useStartupControllerGetProgress,
  useStartupControllerAdminDelete,
  getStartupControllerGetProgressQueryKey,
  getStartupControllerFindOneQueryKey,
} from "@/api/generated/startup/startup";
import {
  useAdminControllerApproveStartup,
  useAdminControllerReanalyzeStartup,
  useAdminControllerRetryStartupPhase,
  useAdminControllerRetryStartupAgent,
  useAdminControllerRejectStartup,
  useAdminControllerGetAllScoringWeights,
  useAdminControllerMatchStartupInvestors,
  useAdminControllerCancelStartupPipeline,
  getAdminControllerGetStatsQueryKey,
  getAdminControllerGetAllStartupsQueryKey,
} from "@/api/generated/admin/admin";
import {
  RetryPhaseDtoPhase,
  type RetryPhaseDtoPhase as RetryPhaseValue,
} from "@/api/generated/model/retryPhaseDtoPhase";
import type { ScoringWeights } from "@/lib/score-utils";

export const Route = createFileRoute("/_protected/admin/startup/$id")({
  component: AdminReviewPage,
});

import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

interface StartupDetail extends Startup {
  evaluation?: Evaluation;
}

interface DataRoomDocument {
  id: string;
  category?: string | null;
  uploadedAt?: string | null;
  assetUrl?: string | null;
  assetKey?: string | null;
  assetMimeType?: string | null;
}

interface StageScoringWeight {
  stage: string;
  weights: ScoringWeights;
}

type AdminStartupTab =
  | "pipeline-live"
  | "summary"
  | "memo"
  | "market"
  | "product"
  | "team"
  | "financials"
  | "competitors"
  | "sources"
  | "recommendations"
  | "edit"
  | "raw";

const TERMINAL_PIPELINE_STATUSES = new Set(["completed", "failed", "cancelled"]);

interface RetryTrackingState {
  phase: "research" | "evaluation";
  agentKey: string;
  requestedAt: string;
}

const PHASE_RERUN_OPTIONS: Array<{
  value: RetryPhaseValue;
  label: string;
  description: string;
}> = [
  {
    value: RetryPhaseDtoPhase.extraction,
    label: "From Extraction",
    description: "Re-run the full pipeline from extraction",
  },
  {
    value: RetryPhaseDtoPhase.enrichment,
    label: "From Enrichment",
    description: "Reuse extraction, re-run enrichment onward",
  },
  {
    value: RetryPhaseDtoPhase.scraping,
    label: "From Scraping",
    description: "Reuse extraction, re-run scraping onward",
  },
  {
    value: RetryPhaseDtoPhase.research,
    label: "From Research",
    description: "Reuse extraction/enrichment/scraping, re-run research onward",
  },
  {
    value: RetryPhaseDtoPhase.evaluation,
    label: "From Evaluation",
    description: "Reuse prior stages, re-run evaluation + synthesis",
  },
  {
    value: RetryPhaseDtoPhase.synthesis,
    label: "From Synthesis",
    description: "Reuse all prior stages, re-run synthesis only",
  },
];

function formatLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
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

function hasPipelineProgressSnapshot(payload: unknown): boolean {
  const unwrapped = unwrapApiResponse<unknown>(payload);
  if (!unwrapped || typeof unwrapped !== "object") {
    return false;
  }

  if (!("progress" in (unwrapped as Record<string, unknown>))) {
    return false;
  }

  const progress = (unwrapped as Record<string, unknown>).progress;
  return Boolean(progress && typeof progress === "object");
}

function getPipelineProgressMeta(payload: unknown): {
  pipelineStatus: string | null;
  pipelineRunId: string | null;
} {
  const unwrapped = unwrapApiResponse<unknown>(payload);
  if (!unwrapped || typeof unwrapped !== "object") {
    return { pipelineStatus: null, pipelineRunId: null };
  }

  const progress = (unwrapped as Record<string, unknown>).progress;
  if (!progress || typeof progress !== "object") {
    return { pipelineStatus: null, pipelineRunId: null };
  }

  const record = progress as Record<string, unknown>;
  return {
    pipelineStatus:
      typeof record.pipelineStatus === "string" ? record.pipelineStatus : null,
    pipelineRunId:
      typeof record.pipelineRunId === "string" ? record.pipelineRunId : null,
  };
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
  const [activeTab, setActiveTab] = useState<AdminStartupTab>("pipeline-live");
  const [initializedTabForStartupId, setInitializedTabForStartupId] = useState<
    string | null
  >(null);
  const [rerunPhase, setRerunPhase] = useState<RetryPhaseValue | null>(null);
  const [trackedRetry, setTrackedRetry] = useState<RetryTrackingState | null>(
    null,
  );
  const terminalStartupSyncKeyRef = useRef<string | null>(null);

  const { data: startupResponse, isLoading } = useStartupControllerFindOne(id);
  const progressQuery = useStartupControllerGetProgress(id, {
    query: {
      enabled: Boolean(id),
      staleTime: 30_000,
    },
  });
  const startup = startupResponse
    ? unwrapApiResponse<StartupDetail>(startupResponse)
    : undefined;
  const evaluation = startup?.evaluation as Evaluation | undefined;
  const { data: dataRoomResponse } = useStartupControllerGetDataRoom(id, {
    query: {
      enabled: Boolean(id),
    },
  });
  const rawDataRoomDocuments = dataRoomResponse
    ? unwrapApiResponse<unknown>(dataRoomResponse)
    : [];
  const dataRoomDocuments = Array.isArray(rawDataRoomDocuments)
    ? (rawDataRoomDocuments as DataRoomDocument[])
    : [];

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

  const canRerunFromPhase = useMemo(() => {
    if (progressQuery.isLoading) {
      return true;
    }
    return hasPipelineProgressSnapshot(progressQuery.data);
  }, [progressQuery.data, progressQuery.isLoading]);
  const progressMeta = useMemo(
    () => getPipelineProgressMeta(progressQuery.data),
    [progressQuery.data],
  );
  const hasTerminalPipelineProgress = Boolean(
    progressMeta.pipelineStatus &&
      TERMINAL_PIPELINE_STATUSES.has(progressMeta.pipelineStatus),
  );
  const isStartupAnalyzingUi =
    startup?.status === "analyzing" && !hasTerminalPipelineProgress;

  useEffect(() => {
    if (!startup?.id || startup.status !== "analyzing" || !hasTerminalPipelineProgress) {
      terminalStartupSyncKeyRef.current = null;
      return;
    }

    const syncKey = `${progressMeta.pipelineRunId ?? "none"}:${progressMeta.pipelineStatus ?? "unknown"}`;
    if (terminalStartupSyncKeyRef.current === syncKey) {
      return;
    }
    terminalStartupSyncKeyRef.current = syncKey;

    void queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
    void queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getAdminControllerGetStatsQueryKey() });
  }, [
    hasTerminalPipelineProgress,
    id,
    progressMeta.pipelineRunId,
    progressMeta.pipelineStatus,
    queryClient,
    startup?.id,
    startup?.status,
  ]);

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

  const rejectMutation = useAdminControllerRejectStartup({
    request: {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: adminNotes }),
    },
    mutation: {
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
    },
  });

  const reanalyzeMutation = useAdminControllerReanalyzeStartup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getStartupControllerGetProgressQueryKey(id) });
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

  const retryPhaseMutation = useAdminControllerRetryStartupPhase({
    mutation: {
      onSuccess: (_result, variables) => {
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getStartupControllerGetProgressQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
        setActiveTab("pipeline-live");
        toast.success("Phase re-evaluation triggered", {
          description: `${formatLabel(
            variables.data.phase,
          )} and downstream stages were queued. Earlier stage results will be reused.`,
        });
      },
      onError: (error: Error) => {
        toast.error("Failed to trigger phase re-evaluation", {
          description: error.message,
        });
      },
      onSettled: () => {
        setRerunPhase(null);
      },
    },
  });

  const retryAgentMutation = useAdminControllerRetryStartupAgent({
    mutation: {
      onSuccess: (result, variables) => {
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getStartupControllerGetProgressQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
        const retryResult = unwrapApiResponse<Record<string, unknown>>(result);
        const mode =
          retryResult && typeof retryResult.mode === "string"
            ? (retryResult.mode as string)
            : undefined;
        toast.success("Section re-analysis triggered", {
          description:
            mode === "full_reanalysis_fallback"
              ? `No cached pipeline state found. Full reanalysis started with guidance for ${formatLabel(
                  variables.data.agent,
                )}.`
              : `${formatLabel(
                  variables.data.agent,
                )} has been queued. Tracking progress in Pipeline Live.`,
        });
      },
      onError: (error: Error, variables) => {
        setTrackedRetry((current) => {
          if (!current) {
            return current;
          }
          return current.phase === variables.data.phase &&
            current.agentKey === variables.data.agent
            ? null
            : current;
        });
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

  const cancelPipelineMutation = useAdminControllerCancelStartupPipeline({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getStartupControllerGetProgressQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
        toast.success("Pipeline cancelled", {
          description: "The AI pipeline has been stopped.",
        });
      },
      onError: (error: Error) => {
        toast.error("Failed to cancel pipeline", { description: error.message });
      },
    },
  });

  useEffect(() => {
    setTrackedRetry(null);
    setReanalyzingSection(null);
    setRerunPhase(null);
    setInitializedTabForStartupId(null);
  }, [id]);

  useEffect(() => {
    if (!startup?.id) {
      return;
    }
    if (initializedTabForStartupId === startup.id) {
      return;
    }
    setActiveTab(
      isStartupAnalyzingUi || !evaluation ? "pipeline-live" : "summary",
    );
    setInitializedTabForStartupId(startup.id);
  }, [
    evaluation,
    initializedTabForStartupId,
    isStartupAnalyzingUi,
    startup?.id,
  ]);

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

  const canApproveReject = ["pending_review", "analyzing", "analyzed"].includes(
    startup.status
  );

  const handleSectionReanalyze = async (
    sectionKey: string,
    _evaluationId: string,
    comment: string,
  ) => {
    setReanalyzingSection(sectionKey);
    setTrackedRetry({
      phase: "evaluation",
      agentKey: sectionKey,
      requestedAt: new Date().toISOString(),
    });
    setActiveTab("pipeline-live");
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
    setTrackedRetry({
      phase,
      agentKey,
      requestedAt: new Date().toISOString(),
    });
    setActiveTab("pipeline-live");
    await retryAgentMutation.mutateAsync({
      id,
      data: {
        phase,
        agent: agentKey,
      },
    });
  };

  const handlePhaseRerun = (phase: RetryPhaseValue) => {
    setRerunPhase(phase);
    setActiveTab("pipeline-live");
    retryPhaseMutation.mutate({
      id,
      data: {
        phase,
        forceRerun: true,
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={retryPhaseMutation.isPending || reanalyzeMutation.isPending}
                >
                  {retryPhaseMutation.isPending || reanalyzeMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Re-evaluate
                  <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                {!canRerunFromPhase && (
                  <DropdownMenuItem
                    disabled
                    className="flex flex-col items-start gap-0.5 py-2 opacity-100"
                  >
                    <span>Phase Re-run Unavailable</span>
                    <span className="text-xs text-muted-foreground">
                      No saved pipeline state was found. Use Full Reanalysis (Fresh).
                    </span>
                  </DropdownMenuItem>
                )}
                {PHASE_RERUN_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    disabled={
                      !canRerunFromPhase ||
                      retryPhaseMutation.isPending ||
                      reanalyzeMutation.isPending
                    }
                    onClick={() => {
                      handlePhaseRerun(option.value);
                    }}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                      {rerunPhase === option.value ? " (starting…)" : ""}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  disabled={retryPhaseMutation.isPending || reanalyzeMutation.isPending}
                  onClick={() => reanalyzeMutation.mutate({ id })}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span>Full Reanalysis (Fresh)</span>
                  <span className="text-xs text-muted-foreground">
                    Start a new full analysis run without relying on existing pipeline state
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isStartupAnalyzingUi && (
              <Button
                variant="destructive"
                size="default"
                onClick={() => {
                  if (window.confirm("Cancel the running pipeline? This will stop all queued jobs.")) {
                    cancelPipelineMutation.mutate({ id });
                  }
                }}
                disabled={cancelPipelineMutation.isPending}
              >
                <StopCircle className="w-4 h-4 mr-2" />
                {cancelPipelineMutation.isPending ? "Cancelling…" : "Cancel Pipeline"}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as AdminStartupTab)}
          className="w-full min-w-0"
        >
          <TabsList className="flex h-auto w-full flex-wrap rounded-xl bg-muted/60 p-2">
            <TabsTrigger value="pipeline-live" className="w-full sm:w-auto">
              Pipeline Live
            </TabsTrigger>
            {evaluation && (
              <>
                <TabsTrigger value="summary" className="w-full sm:w-auto">Summary</TabsTrigger>
                <TabsTrigger value="memo" className="w-full sm:w-auto">Memo</TabsTrigger>
                <TabsTrigger value="market" className="w-full sm:w-auto">Market</TabsTrigger>
                <TabsTrigger value="product" className="w-full sm:w-auto">Product</TabsTrigger>
                <TabsTrigger value="team" className="w-full sm:w-auto">Team</TabsTrigger>
                <TabsTrigger value="financials" className="w-full sm:w-auto">Financials</TabsTrigger>
                <TabsTrigger value="competitors" className="w-full sm:w-auto">Competitors</TabsTrigger>
                <TabsTrigger value="sources" className="w-full sm:w-auto">Sources</TabsTrigger>
                <TabsTrigger value="recommendations" className="w-full sm:w-auto">Recommendations</TabsTrigger>
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
              trackedRetry={trackedRetry}
              onClearTrackedRetry={() => setTrackedRetry(null)}
              onCancelPipeline={
                isStartupAnalyzingUi
                  ? () => {
                      if (window.confirm("Cancel the running pipeline? This will stop all queued jobs.")) {
                        cancelPipelineMutation.mutate({ id });
                      }
                    }
                  : undefined
              }
            />
          </TabsContent>

          {evaluation && (
            <>
              <TabsContent value="summary" className="mt-6">
                <AdminSummaryTab
                  startup={startup}
                  evaluation={evaluation}
                  weights={stageWeights}
                  onNavigateTab={(tab) => setActiveTab(tab as AdminStartupTab)}
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

              <TabsContent value="financials" className="mt-6">
                <FinancialsTabContent
                  evaluation={evaluation}
                  financialsWeight={stageWeights?.financials}
                />
              </TabsContent>

              <TabsContent value="market" className="mt-6">
                <MarketTabContent
                  evaluation={evaluation}
                  marketWeight={stageWeights?.market}
                  fundingStage={startup.stage}
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
                <SourcesTabContent
                  startup={startup}
                  evaluation={evaluation}
                  dataRoomDocuments={dataRoomDocuments}
                />
              </TabsContent>

              <TabsContent value="recommendations" className="mt-6">
                <FounderRecommendationsTab evaluation={evaluation} />
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
              onClick={() => rejectMutation.mutate({ id })}
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
