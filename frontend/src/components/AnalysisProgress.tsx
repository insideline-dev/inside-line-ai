import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useStartupRealtimeProgress } from "@/lib/startup/useStartupRealtimeProgress";
import type { PipelineProgressData } from "@/types/pipeline-progress";

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

interface ProgressTrackerPhase {
  status: string;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  agents?: Record<
    string,
    {
      key?: string;
      status: string;
      progress?: number;
      startedAt?: string;
      completedAt?: string;
      error?: string;
    }
  >;
}

interface ProgressTrackerPayload {
  overallProgress?: number;
  currentPhase?: string;
  pipelineStatus?: string;
  pipelineRunId?: string;
  estimatedTimeRemaining?: number;
  updatedAt?: string;
  error?: string;
  phasesCompleted?: string[];
  phases?: Record<string, ProgressTrackerPhase>;
}

interface AnalysisProgressProps {
  startupId: number | string;
  isAnalyzing: boolean;
  weights?: ScoringWeights;
  progress?: unknown;
  showAgentDetails?: boolean;
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
          const rawAgents = phaseValue.agents as Record<string, unknown> | undefined;
          const agents = rawAgents
            ? Object.fromEntries(
                Object.entries(rawAgents).map(([agentKey, agentValue]) => {
                  const agentRecord = (agentValue || {}) as Record<string, unknown>;
                  return [
                    agentKey,
                    {
                      key: String(agentRecord.key ?? agentKey),
                      status: String(agentRecord.status ?? "pending"),
                      progress:
                        typeof agentRecord.progress === "number"
                          ? agentRecord.progress
                          : undefined,
                      startedAt:
                        typeof agentRecord.startedAt === "string"
                          ? agentRecord.startedAt
                          : undefined,
                      completedAt:
                        typeof agentRecord.completedAt === "string"
                          ? agentRecord.completedAt
                          : undefined,
                      error:
                        typeof agentRecord.error === "string"
                          ? agentRecord.error
                          : undefined,
                    },
                  ];
                }),
              )
            : undefined;

          return [
            phase,
            {
              status,
              progress,
              startedAt:
                typeof phaseValue.startedAt === "string"
                  ? phaseValue.startedAt
                  : undefined,
              completedAt:
                typeof phaseValue.completedAt === "string"
                  ? phaseValue.completedAt
                  : undefined,
              error:
                typeof phaseValue.error === "string"
                  ? phaseValue.error
                  : undefined,
              agents,
            },
          ];
        },
      ),
    );

    return {
      overallProgress: record.overallProgress,
      currentPhase: record.currentPhase,
      pipelineStatus:
        typeof record.pipelineStatus === "string"
          ? record.pipelineStatus
          : undefined,
      pipelineRunId:
        typeof record.pipelineRunId === "string"
          ? record.pipelineRunId
          : undefined,
      estimatedTimeRemaining:
        typeof record.estimatedTimeRemaining === "number"
          ? record.estimatedTimeRemaining
          : undefined,
      updatedAt:
        typeof record.updatedAt === "string" ? record.updatedAt : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
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

      return [
        phase,
        {
          status,
          progress,
          startedAt: data.startedAt,
          completedAt: data.completedAt,
          error: data.error,
          agents: data.agents
            ? Object.fromEntries(
                Object.entries(data.agents).map(([agentKey, agentValue]) => [
                  agentKey,
                  {
                    key: agentValue.key ?? agentKey,
                    status: agentValue.status,
                    progress: agentValue.progress,
                    startedAt: agentValue.startedAt,
                    completedAt: agentValue.completedAt,
                    error: agentValue.error,
                  },
                ]),
              )
            : undefined,
        },
      ];
    }),
  );

  const phasesCompleted = Array.isArray(payload.phasesCompleted)
    ? payload.phasesCompleted
    : Object.entries(phases)
        .filter(([, value]) => value.status === "completed")
        .map(([phase]) => phase);

  const overallProgress =
    typeof payload.overallProgress === "number"
      ? payload.overallProgress
      : Math.round((phasesCompleted.length / Math.max(Object.keys(phases).length, 1)) * 100);

  return {
    overallProgress,
    currentPhase: payload.currentPhase || Object.keys(phases)[0] || "extraction",
    pipelineStatus: payload.pipelineStatus,
    pipelineRunId: payload.pipelineRunId,
    estimatedTimeRemaining: payload.estimatedTimeRemaining,
    updatedAt: payload.updatedAt,
    error: payload.error,
    phasesCompleted,
    phases,
  };
}

export function AnalysisProgress({
  startupId,
  isAnalyzing,
  weights: _weights,
  progress: progressOverride = null,
  showAgentDetails = false,
}: AnalysisProgressProps) {
  void _weights;

  const normalizedOverride = normalizeProgress(progressOverride)
    ?? normalizeFromTrackerPayload((progressOverride || {}) as ProgressTrackerPayload);

  const { progress: liveProgress } = useStartupRealtimeProgress(String(startupId), {
    enabled: isAnalyzing,
    pollMs: 2000,
    useSocket: true,
  });

  const progress = liveProgress ?? normalizedOverride;
  const overallProgress = isAnalyzing
    ? Math.max(0, Math.min(100, progress?.overallProgress ?? 0))
    : 100;
  const agentPhaseSections = useMemo(() => {
    const phaseConfig = [
      {
        phase: "research",
        label: "Research Agents",
        order: ["team", "market", "product", "news", "competitor"],
      },
      {
        phase: "evaluation",
        label: "Evaluation Agents",
        order: [
          "team",
          "market",
          "product",
          "traction",
          "businessModel",
          "gtm",
          "financials",
          "competitiveAdvantage",
          "legal",
          "dealTerms",
          "exitPotential",
        ],
      },
    ] as const;

    const sections: Array<{
      phase: "research" | "evaluation";
      label: string;
      agents: Array<[string, NonNullable<PipelineProgressData["phases"][string]["agents"]>[string]]>;
    }> = [];

    for (const config of phaseConfig) {
      const agents = progress?.phases?.[config.phase]?.agents;
      if (!agents) {
        continue;
      }

      const sortIndex = new Map<string, number>(
        config.order.map((key, idx) => [String(key), idx]),
      );
      const entries = Object.entries(agents).sort(([a], [b]) => {
        const ai = sortIndex.get(a);
        const bi = sortIndex.get(b);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return a.localeCompare(b);
      });

      if (entries.length === 0) {
        continue;
      }

      sections.push({
        phase: config.phase,
        label: config.label,
        agents: entries,
      });
    }

    return sections;
  }, [progress?.phases]);

  const formatTimestamp = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const formatDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt) return "—";
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return "—";
    }
    const seconds = Math.round((end - start) / 1000);
    return `${seconds}s`;
  };

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

        {showAgentDetails && agentPhaseSections.length > 0 && (
          <div className="space-y-2 pt-2">
            {agentPhaseSections.map((section) => (
              <div key={section.phase} className="space-y-2">
                <p className="text-sm font-medium">{section.label}</p>
                <div className="space-y-2">
                  {section.agents.map(([agentKey, agentData]) => (
                    <div
                      key={`${section.phase}-${agentKey}`}
                      className="rounded-md border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{agentData.key || agentKey}</span>
                        <Badge
                          variant={agentData.status === "completed" ? "default" : "outline"}
                        >
                          {agentData.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-3">
                        <span>Start: {formatTimestamp(agentData.startedAt)}</span>
                        <span>End: {formatTimestamp(agentData.completedAt)}</span>
                        <span>Duration: {formatDuration(agentData.startedAt, agentData.completedAt)}</span>
                      </div>
                      {agentData.error && (
                        <p className="mt-1 text-xs text-destructive">{agentData.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
