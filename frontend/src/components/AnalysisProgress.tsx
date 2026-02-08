import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { useStartupControllerGetProgress } from "@/api/generated/startup/startup";

interface ScoringWeights {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
}

interface PhaseProgressData {
  status: "pending" | "waiting" | "running" | "completed" | "failed" | "skipped" | string;
  progress: number;
}

interface PipelineProgressData {
  overallProgress: number;
  currentPhase: string;
  phasesCompleted: string[];
  phases: Record<string, PhaseProgressData>;
}

interface GetProgressResponse {
  status: string;
  progress: PipelineProgressData | null;
}

interface ProgressTrackerPhase {
  status: string;
  agents?: Record<string, { status: string }>;
}

interface ProgressTrackerPayload {
  overallProgress?: number;
  currentPhase?: string;
  phases?: Record<string, ProgressTrackerPhase>;
}

interface AnalysisProgressProps {
  startupId: number | string;
  isAnalyzing: boolean;
  weights?: ScoringWeights;
  progress?: unknown;
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

function normalizeProgress(payload: unknown): PipelineProgressData | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (
    typeof record.overallProgress === "number" &&
    typeof record.currentPhase === "string" &&
    record.phases &&
    typeof record.phases === "object"
  ) {
    const phases = Object.fromEntries(
      Object.entries(record.phases as Record<string, unknown>).map(
        ([phase, value]) => {
          const phaseValue = value as Record<string, unknown>;
          const status = String(phaseValue.status ?? "pending");
          const progress =
            typeof phaseValue.progress === "number"
              ? phaseValue.progress
              : status === "completed"
                ? 100
                : status === "running"
                  ? 50
                  : 0;

          return [phase, { status, progress }];
        },
      ),
    );

    return {
      overallProgress: record.overallProgress,
      currentPhase: record.currentPhase,
      phasesCompleted: Array.isArray(record.phasesCompleted)
        ? (record.phasesCompleted as string[])
        : Object.entries(phases)
            .filter(([, value]) => value.status === "completed")
            .map(([phase]) => phase),
      phases,
    };
  }

  return null;
}

function normalizeFromTrackerPayload(
  payload: ProgressTrackerPayload,
): PipelineProgressData | null {
  if (!payload.phases) {
    return null;
  }

  const phases = Object.fromEntries(
    Object.entries(payload.phases).map(([phase, data]) => {
      const status = data.status || "pending";
      let progress = 0;

      if (status === "completed") {
        progress = 100;
      } else if (status === "running") {
        const agents = Object.values(data.agents || {});
        const completedAgents = agents.filter(
          (agent) => agent.status === "completed",
        ).length;
        progress = agents.length
          ? Math.round((completedAgents / agents.length) * 100)
          : 50;
      }

      return [phase, { status, progress }];
    }),
  );

  const phasesCompleted = Object.entries(phases)
    .filter(([, value]) => value.status === "completed")
    .map(([phase]) => phase);

  const overallProgress =
    typeof payload.overallProgress === "number"
      ? payload.overallProgress
      : Math.round((phasesCompleted.length / Math.max(Object.keys(phases).length, 1)) * 100);

  return {
    overallProgress,
    currentPhase: payload.currentPhase || Object.keys(phases)[0] || "extraction",
    phasesCompleted,
    phases,
  };
}

export function AnalysisProgress({
  startupId,
  isAnalyzing,
  weights: _weights,
  progress: progressOverride = null,
}: AnalysisProgressProps) {
  void _weights;

  const normalizedOverride = normalizeProgress(progressOverride)
    ?? normalizeFromTrackerPayload((progressOverride || {}) as ProgressTrackerPayload);

  const { data: progressResponse } = useStartupControllerGetProgress(String(startupId), {
    query: {
      enabled: isAnalyzing && !normalizedOverride,
      refetchInterval: isAnalyzing && !normalizedOverride ? 2000 : false,
    },
  });

  const normalizedFromApi = progressResponse
    ? normalizeProgress(
        unwrapApiResponse<GetProgressResponse>(progressResponse)?.progress,
      )
    : null;

  const progress = normalizedOverride ?? normalizedFromApi;
  const overallProgress = isAnalyzing
    ? Math.max(0, Math.min(100, progress?.overallProgress ?? 0))
    : 100;

  return (
    <Card data-testid="card-analysis-progress">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          {isAnalyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              AI Analysis in Progress
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-chart-2" />
              Analysis Complete
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {progress?.currentPhase && (
          <div className="text-sm text-muted-foreground">
            Current phase: <span className="font-medium capitalize text-foreground">{progress.currentPhase}</span>
          </div>
        )}

        {progress?.phases && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(progress.phases).map(([phase, phaseData]) => (
              <Badge
                key={phase}
                variant={phaseData.status === "completed" ? "default" : "outline"}
                className="capitalize"
              >
                {phase}: {phaseData.status}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
