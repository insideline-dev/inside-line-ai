import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import { useStartupControllerGetProgress } from "@/api/generated/startup/startup";

interface PhaseProgressData {
  status: string;
  progress: number;
}

interface PipelineProgressData {
  overallProgress: number;
  currentPhase: string;
  phases: Record<string, PhaseProgressData>;
}

interface GetProgressResponse {
  progress: PipelineProgressData | null;
}

interface AnalysisProgressBarProps {
  startupId: number | string;
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

export function AnalysisProgressBar({ startupId }: AnalysisProgressBarProps) {
  const { data: progressResponse } = useStartupControllerGetProgress(String(startupId), {
    query: {
      refetchInterval: 2000,
    },
  });

  const progressData = progressResponse
    ? unwrapApiResponse<GetProgressResponse>(progressResponse)
    : null;

  const progress = progressData?.progress;
  const overallProgress = Math.max(0, Math.min(100, progress?.overallProgress ?? 0));
  const phaseLabel = progress?.currentPhase
    ? progress.currentPhase.replace(/_/g, " ")
    : "Analyzing";

  return (
    <div className="w-full space-y-2" data-testid={`progress-bar-startup-${startupId}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground capitalize">
          <Loader2 className="w-3 h-3 animate-spin" />
          {phaseLabel}
        </span>
        <span className="text-muted-foreground font-medium">{overallProgress}%</span>
      </div>
      <Progress value={overallProgress} className="h-1.5" />
    </div>
  );
}
