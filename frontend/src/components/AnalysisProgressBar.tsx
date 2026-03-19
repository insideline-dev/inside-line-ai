import { useEffect, useMemo, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, FileSearch, Globe, Search, BarChart3, Sparkles, AlertTriangle, Clock3 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useStartupRealtimeProgress } from "@/lib/startup/useStartupRealtimeProgress";

interface AnalysisProgressBarProps {
  startupId: number | string;
  onTerminalStatus?: (status: "pending_review" | "submitted") => void;
  showAgentDetails?: boolean;
  compact?: boolean;
}

const PHASE_ORDER = [
  "enrichment",
  "extraction",
  "scraping",
  "research",
  "evaluation",
  "synthesis",
] as const;

const PHASE_META: Record<string, { label: string; icon: typeof FileSearch }> = {
  enrichment: { label: "Gap Filling", icon: Search },
  extraction: { label: "Extracting", icon: FileSearch },
  scraping: { label: "Scraping", icon: Globe },
  research: { label: "Researching", icon: Search },
  evaluation: { label: "Evaluating", icon: BarChart3 },
  synthesis: { label: "Synthesizing", icon: Sparkles },
};

const AGENT_PHASE_META = {
  research: {
    label: "Research Agents",
    order: ["team", "market", "product", "news", "competitor"],
  },
  evaluation: {
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
} as const;

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
  showAgentDetails = true,
  compact = false,
}: AnalysisProgressBarProps) {
  const queryClient = useQueryClient();
  const terminalNotified = useRef(false);

  const { progress } = useStartupRealtimeProgress(String(startupId), {
    pollMs: 3000,
    useSocket: true,
  });
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

  const currentPhase = progress?.currentPhase ?? "enrichment";
  const currentMeta = PHASE_META[currentPhase];
  const currentPhaseStatus = progress?.phases?.[currentPhase]?.status;
  const agentPhaseSections = useMemo(() => {
    const phases = progress?.phases;
    if (!phases) {
      return [];
    }

    const sections: Array<{
      phaseKey: string;
      label: string;
      phaseStatus: string;
      agents: Array<
        [string, {
          key?: string;
          status: string;
          progress?: number;
          error?: string;
        }]
      >;
    }> = [];

    for (const [phaseKey, meta] of Object.entries(AGENT_PHASE_META)) {
      const agents = phases[phaseKey]?.agents;
      if (!agents || Object.keys(agents).length === 0) {
        continue;
      }

      const order = new Map<string, number>(
        meta.order.map((key, index) => [String(key), index]),
      );
      const sortedAgents = Object.entries(agents).sort(([a], [b]) => {
        const ai = order.get(a);
        const bi = order.get(b);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return a.localeCompare(b);
      });

      sections.push({
        phaseKey,
        label: meta.label,
        phaseStatus: phases[phaseKey]?.status ?? "pending",
        agents: sortedAgents,
      });
    }

    return sections;
  }, [progress?.phases]);

  useEffect(() => {
    if (
      !pipelineStatus ||
      pipelineStatus === "running" ||
      pipelineStatus === "pending" ||
      pipelineStatus === "queued"
    ) {
      terminalNotified.current = false;
    }
  }, [pipelineStatus, progress?.pipelineRunId]);

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

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs" data-testid={`progress-bar-startup-${startupId}`}>
        {isFailed ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        ) : isCancelled ? (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        ) : isComplete ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        )}
        <span className={cn("truncate", statusColor)}>{statusLabel}</span>
      </div>
    );
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

      {showAgentDetails && agentPhaseSections.length > 0 && (
        <div className="space-y-2 pt-1">
          {agentPhaseSections.map((section) => (
            <div key={section.phaseKey} className="rounded-md border border-border/60 p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-foreground/90">{section.label}</p>
                <Badge variant="outline" className="text-[10px] capitalize h-5 px-1.5">
                  {section.phaseStatus}
                </Badge>
              </div>
              <div className="space-y-1">
                {section.agents.map(([agentKey, agent]) => {
                  const status = agent.status ?? "pending";
                  const label = agent.key || agentKey;
                  const statusClass =
                    status === "completed"
                      ? "text-emerald-600"
                      : status === "failed"
                        ? "text-destructive"
                        : status === "running"
                          ? "text-primary"
                          : "text-muted-foreground";

                  return (
                    <div key={`${section.phaseKey}-${agentKey}`} className="flex items-center justify-between text-[11px]">
                      <span className="truncate pr-2 text-foreground/85">{label}</span>
                      <span className={cn("inline-flex items-center gap-1", statusClass)}>
                        {status === "completed" ? (
                          <Check className="w-3 h-3" />
                        ) : status === "failed" ? (
                          <X className="w-3 h-3" />
                        ) : status === "running" ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Clock3 className="w-3 h-3" />
                        )}
                        <span className="capitalize">{status}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              {section.agents.some(([, agent]) => Boolean(agent.error)) && (
                <div className="space-y-0.5">
                  {section.agents.map(([agentKey, agent]) =>
                    agent.error ? (
                      <p key={`${section.phaseKey}-${agentKey}-error`} className="text-[10px] text-destructive line-clamp-2">
                        {agent.key || agentKey}: {agent.error}
                      </p>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
