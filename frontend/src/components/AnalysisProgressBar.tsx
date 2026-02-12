import { useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2, Check, X, FileSearch, Globe, Search, BarChart3, Sparkles, AlertTriangle, Clock3 } from "lucide-react";
import { useStartupControllerGetProgress } from "@/api/generated/startup/startup";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface PhaseProgressData {
  status: string;
  progress: number;
  error?: string;
}

interface PipelineProgressData {
  overallProgress: number;
  currentPhase: string;
  pipelineStatus?: string;
  error?: string;
  phases: Record<string, PhaseProgressData>;
}

interface GetProgressResponse {
  progress: PipelineProgressData | null;
}

interface AnalysisProgressBarProps {
  startupId: number | string;
  onTerminalStatus?: (status: "pending_review" | "submitted") => void;
}

const PHASE_ORDER = ["extraction", "scraping", "research", "evaluation", "synthesis"] as const;

const PHASE_META: Record<string, { label: string; icon: typeof FileSearch }> = {
  extraction: { label: "Extracting", icon: FileSearch },
  scraping: { label: "Scraping", icon: Globe },
  research: { label: "Researching", icon: Search },
  evaluation: { label: "Evaluating", icon: BarChart3 },
  synthesis: { label: "Synthesizing", icon: Sparkles },
};

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

function PhaseIcon({
  status,
  hasWarning,
  Icon,
}: {
  status: string;
  hasWarning: boolean;
  Icon: typeof FileSearch;
}) {
  if (status === "failed") return <X className="w-3 h-3 text-destructive" />;
  if (status === "running") return <Loader2 className="w-3 h-3 animate-spin text-primary" />;
  if (hasWarning) return <AlertTriangle className="w-3 h-3 text-amber-600" />;
  if (status === "completed") return <Check className="w-3 h-3 text-emerald-500" />;
  return <Icon className="w-3 h-3 text-muted-foreground/40" />;
}

export function AnalysisProgressBar({
  startupId,
  onTerminalStatus,
}: AnalysisProgressBarProps) {
  const queryClient = useQueryClient();
  const terminalNotified = useRef(false);

  const { data: progressResponse } = useStartupControllerGetProgress(String(startupId), {
    query: {
      refetchInterval: (query) => {
        const raw = query.state.data;
        if (!raw) return 3000;

        const data = unwrapApiResponse<GetProgressResponse>(raw);
        const status = data?.progress?.pipelineStatus;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          return false;
        }

        return 3000;
      },
    },
  });

  const progressData = progressResponse
    ? unwrapApiResponse<GetProgressResponse>(progressResponse)
    : null;

  const progress = progressData?.progress;
  const overallProgress = Math.max(0, Math.min(100, progress?.overallProgress ?? 0));
  const pipelineStatus = progress?.pipelineStatus;
  const isFailed = pipelineStatus === "failed" || PHASE_ORDER.some((p) => progress?.phases?.[p]?.status === "failed");
  const isComplete = pipelineStatus === "completed";
  const isCancelled = pipelineStatus === "cancelled";
  const warningPhase = PHASE_ORDER.find(
    (phase) =>
      progress?.phases?.[phase]?.status !== "failed" &&
      Boolean(progress?.phases?.[phase]?.error),
  );
  const hasWarnings = Boolean(warningPhase);

  const currentPhase = progress?.currentPhase ?? "extraction";
  const currentMeta = PHASE_META[currentPhase];
  const currentPhaseStatus = progress?.phases?.[currentPhase]?.status;

  useEffect(() => {
    if (terminalNotified.current) {
      return;
    }

    if (pipelineStatus === "completed") {
      terminalNotified.current = true;
      onTerminalStatus?.("pending_review");
      void queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0] ?? "").startsWith("/startups"),
      });
      return;
    }

    if (pipelineStatus === "failed" || pipelineStatus === "cancelled") {
      terminalNotified.current = true;
      onTerminalStatus?.("submitted");
      void queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0] ?? "").startsWith("/startups"),
      });
    }
  }, [onTerminalStatus, pipelineStatus, queryClient]);

  // Build status label
  let statusLabel = "Starting analysis...";
  let statusColor = "text-muted-foreground";
  if (isFailed) {
    const failedPhase = PHASE_ORDER.find((p) => progress?.phases?.[p]?.status === "failed");
    const failedError = failedPhase ? progress?.phases?.[failedPhase]?.error : progress?.error;
    statusLabel = failedError ? `Failed: ${failedError}` : "Analysis failed";
    statusColor = "text-destructive";
  } else if (isCancelled) {
    statusLabel = "Analysis cancelled";
    statusColor = "text-amber-600";
  } else if (isComplete) {
    statusLabel = hasWarnings ? "Analysis complete with warnings" : "Analysis complete";
    statusColor = "text-emerald-600";
  } else if (currentMeta && currentPhaseStatus === "waiting") {
    statusLabel = `Waiting for ${currentMeta.label.toLowerCase()}`;
  } else if (currentMeta && progress?.phases?.[currentPhase]?.status === "running") {
    statusLabel = currentMeta.label;
  } else if (progress) {
    statusLabel = currentPhase.replace(/_/g, " ");
    if (hasWarnings) {
      statusLabel = `${statusLabel} (warnings)`;
    }
  }

  return (
    <div className="w-full space-y-2.5" data-testid={`progress-bar-startup-${startupId}`}>
      {/* Phase steps */}
      <div className="flex items-center gap-1">
        {PHASE_ORDER.map((phase, i) => {
          const meta = PHASE_META[phase];
          const phaseData = progress?.phases?.[phase];
          const status = phaseData?.status ?? "pending";
          const hasWarning = status !== "failed" && Boolean(phaseData?.error);

          return (
            <div key={phase} className="flex items-center gap-1 flex-1">
              <div
                className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full border transition-colors",
                  status === "completed" && "bg-emerald-500/10 border-emerald-500/30",
                  status === "running" && "bg-primary/10 border-primary/30",
                  status === "failed" && "bg-destructive/10 border-destructive/30",
                  hasWarning && "bg-amber-500/10 border-amber-500/30",
                  status === "pending" && "border-muted-foreground/20",
                  status === "skipped" && "border-muted-foreground/10",
                )}
                title={`${meta.label}: ${status}${phaseData?.error ? ` — ${phaseData.error}` : ""}`}
              >
                <PhaseIcon status={status} hasWarning={hasWarning} Icon={meta.icon} />
              </div>
              {i < PHASE_ORDER.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-px",
                    status === "completed" ? "bg-emerald-500/30" : "bg-muted-foreground/15",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Current status + progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className={cn("flex items-center gap-1.5 capitalize", statusColor)}>
            {isFailed ? (
              <AlertTriangle className="w-3 h-3" />
            ) : isCancelled ? (
              <AlertTriangle className="w-3 h-3" />
            ) : isComplete ? (
              <Check className="w-3 h-3" />
            ) : currentPhaseStatus === "waiting" ? (
              <Clock3 className="w-3 h-3" />
            ) : (
              <Loader2 className="w-3 h-3 animate-spin" />
            )}
            <span className="truncate max-w-[200px]">{statusLabel}</span>
          </span>
          <span className="text-muted-foreground font-medium">{overallProgress}%</span>
        </div>
        <Progress
          value={overallProgress}
          className={cn("h-1.5", isFailed && "[&>div]:bg-destructive")}
        />
      </div>
    </div>
  );
}
