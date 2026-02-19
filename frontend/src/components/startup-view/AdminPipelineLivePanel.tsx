import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStartupRealtimeProgress } from "@/lib/startup/useStartupRealtimeProgress";
import {
  PIPELINE_PHASE_ORDER,
  type PipelineAgentEvent,
  type PipelineAgentEventType,
  type PipelineAgentProgress,
  type PipelineAgentTrace,
  type PipelinePhaseProgress,
} from "@/types/pipeline-progress";

interface AdminPipelineLivePanelProps {
  startupId: string;
  startupStatus: string;
  onRetryAgent?: (phase: "research" | "evaluation", agentKey: string) => Promise<void>;
  trackedRetry?: {
    phase: "research" | "evaluation";
    agentKey: string;
    requestedAt: string;
  } | null;
  onClearTrackedRetry?: () => void;
}

type FlattenedAgent = {
  phase: string;
  key: string;
  data: PipelineAgentProgress;
};

type SignalTone = "neutral" | "success" | "info" | "warning" | "danger";

const PHASE_LABELS: Record<string, string> = {
  extraction: "Extraction",
  enrichment: "Gap Fill",
  scraping: "Scraping",
  research: "Research",
  evaluation: "Evaluation",
  synthesis: "Synthesis",
};

const STEP_LABELS: Record<string, string> = {
  extract_fields: "Document Parsing",
  scrape_website: "Website Scraping",
  pdf_fetch: "PDF Fetch",
  text_extraction: "Text Extraction",
  ocr_fallback: "OCR Fallback",
  field_extraction: "Field Extraction",
  cache_check: "Cache Check",
  website_scrape: "Website Scrape",
  team_discovery: "Team Discovery",
  linkedin_enrichment_step: "LinkedIn Enrichment",
  linkedin_enrichment: "LinkedIn Enrichment",
  gap_analysis: "Gap Analysis",
  web_search: "Web Search",
  ai_synthesis: "AI Synthesis",
  db_writes: "DB Writes",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  running: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  waiting: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  skipped: "bg-muted text-muted-foreground border-border",
  pending: "bg-muted text-muted-foreground border-border",
};

const SURFACE_TONE_CLASS: Record<SignalTone, string> = {
  neutral: "",
  success: "border-emerald-500/30 bg-emerald-500/5",
  info: "border-sky-500/30 bg-sky-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  danger: "border-destructive/40 bg-destructive/5",
};

const PROGRESS_TONE_CLASS: Record<SignalTone, string> = {
  neutral: "",
  success: "[&>div]:bg-emerald-500",
  info: "[&>div]:bg-sky-500",
  warning: "[&>div]:bg-amber-500",
  danger: "[&>div]:bg-destructive",
};

const EVENT_BADGE_CLASS: Record<PipelineAgentEventType, string> = {
  started: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  retrying: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  fallback: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
};

function normalizePercent(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function formatLabel(value: string): string {
  if (STEP_LABELS[value]) {
    return STEP_LABELS[value];
  }
  if (PHASE_LABELS[value]) {
    return PHASE_LABELS[value];
  }
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function formatTime(value?: string): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toTimestampMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function eventVerb(event: PipelineAgentEventType): string {
  if (event === "started") return "Started";
  if (event === "retrying") return "Retrying";
  if (event === "completed") return "Completed";
  if (event === "fallback") return "Fallback";
  return "Failed";
}

function eventIcon(event: PipelineAgentEventType) {
  if (event === "completed") return <CheckCircle2 className="h-4 w-4 text-chart-2" />;
  if (event === "retrying") return <RotateCcw className="h-4 w-4 text-chart-4" />;
  if (event === "fallback") return <AlertTriangle className="h-4 w-4 text-chart-4" />;
  if (event === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Activity className="h-4 w-4 text-chart-5" />;
}

function statusClass(status: string): string {
  return STATUS_BADGE_CLASS[status] ?? "bg-muted text-muted-foreground border-border";
}

function toneForEvent(event: PipelineAgentEventType): SignalTone {
  if (event === "failed") return "danger";
  if (event === "fallback" || event === "retrying") return "warning";
  if (event === "started") return "info";
  if (event === "completed") return "success";
  return "neutral";
}

function isFallbackAgent(agent: PipelineAgentProgress): boolean {
  return agent.usedFallback === true || agent.lastEvent === "fallback";
}

function isHardFailedAgent(agent: PipelineAgentProgress): boolean {
  return (
    agent.status === "failed" ||
    (agent.lastEvent === "failed" && !isFallbackAgent(agent))
  );
}

function toneForAgent(agent: PipelineAgentProgress): SignalTone {
  if (isHardFailedAgent(agent)) return "danger";
  if (isFallbackAgent(agent) || (agent.retryCount ?? 0) > 0) return "warning";
  if (agent.status === "running") return "info";
  if (agent.status === "completed") return "success";
  return "neutral";
}

function toneForPhase(phase: PipelinePhaseProgress): SignalTone {
  const agentValues = Object.values(phase.agents ?? {});
  if (
    phase.status === "failed" ||
    agentValues.some((agent) => isHardFailedAgent(agent))
  ) {
    return "danger";
  }
  if (
    (phase.retryCount ?? 0) > 0 ||
    agentValues.some(
      (agent) => isFallbackAgent(agent) || (agent.retryCount ?? 0) > 0,
    )
  ) {
    return "warning";
  }
  if (phase.status === "running") return "info";
  if (phase.status === "completed" || phase.status === "skipped") return "success";
  return "neutral";
}

function statusIcon(status: string) {
  if (status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  }
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-sky-500" />;
  }
  if (status === "waiting") {
    return <Clock3 className="h-4 w-4 text-amber-500" />;
  }
  if (status === "failed") {
    return <XCircle className="h-4 w-4 text-destructive" />;
  }
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function runHealthText(tone: SignalTone): string {
  if (tone === "danger") return "Needs attention";
  if (tone === "warning") return "Degraded";
  if (tone === "info") return "Active";
  if (tone === "success") return "Healthy";
  return "Idle";
}

function previewText(value: string | null | undefined, limit = 160): string {
  if (!value || value.trim().length === 0) {
    return "Not captured";
  }
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, limit)}...`;
}

function normalizeAgentError(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  const normalized = value.toLowerCase();
  if (
    normalized.includes("no output generated") ||
    normalized.includes("no object generated") ||
    normalized.includes("empty response")
  ) {
    return "Model returned empty structured output; fallback result generated.";
  }
  return value;
}

function normalizeTraceError(trace: PipelineAgentTrace): string | undefined {
  if (!trace.error) {
    return undefined;
  }
  const normalized = trace.error.toLowerCase();
  const hasCapturedOutput =
    (typeof trace.outputText === "string" && trace.outputText.trim().length > 0) ||
    trace.outputJson !== undefined;
  if (
    hasCapturedOutput &&
    (normalized.includes("no output generated") ||
      normalized.includes("no object generated") ||
      normalized.includes("empty response"))
  ) {
    return "Model returned non-conforming structured output; fallback result was generated from captured output.";
  }
  return normalizeAgentError(trace.error);
}

function formatFallbackReason(
  reason: string | undefined,
): string | undefined {
  if (!reason || reason.trim().length === 0) {
    return undefined;
  }
  return reason
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toPrettyInput(trace: PipelineAgentTrace | null): string {
  if (!trace) {
    return "";
  }
  const sections: string[] = [];
  if (typeof trace.inputText === "string" && trace.inputText.trim().length > 0) {
    sections.push(`Input Text:\n${trace.inputText}`);
  } else if (
    typeof trace.inputPrompt === "string" &&
    trace.inputPrompt.trim().length > 0
  ) {
    sections.push(`Input Prompt:\n${trace.inputPrompt}`);
  }
  if (trace.inputJson !== undefined && trace.inputJson !== null) {
    sections.push(`Input JSON:\n${toPrettyJson(trace.inputJson)}`);
  }
  if (sections.length > 0) return sections.join("\n\n");
  return "Input not captured";
}

function toPrettyOutput(trace: PipelineAgentTrace | null): string {
  if (!trace) {
    return "";
  }
  const sections: string[] = [];
  if (typeof trace.outputText === "string" && trace.outputText.trim().length > 0) {
    sections.push(`Output Text:\n${trace.outputText}`);
  }
  if (trace.outputJson !== undefined && trace.outputJson !== null) {
    sections.push(`Output JSON:\n${toPrettyJson(trace.outputJson)}`);
  }
  if (typeof trace.rawProviderError === "string" && trace.rawProviderError.trim().length > 0) {
    sections.push(`Provider error:\n${trace.rawProviderError}`);
  }
  if (sections.length > 0) return sections.join("\n\n");
  return "Output not captured";
}

function toPrettyMeta(trace: PipelineAgentTrace | null): string {
  if (!trace) {
    return "";
  }
  if (trace.meta && Object.keys(trace.meta).length > 0) {
    return toPrettyJson(trace.meta);
  }
  return "Metadata not captured";
}

function isPhaseStepTrace(trace: PipelineAgentTrace): boolean {
  return trace.traceKind === "phase_step";
}

function readTraceOperation(trace: PipelineAgentTrace): string | undefined {
  const operation = trace.meta?.operation;
  return typeof operation === "string" && operation.trim().length > 0
    ? operation
    : undefined;
}

function formatCaptureStatus(
  status: PipelineAgentTrace["captureStatus"] | undefined,
): string {
  if (status === "captured") return "Captured";
  if (status === "provider_error_only") return "Provider Error Only";
  if (status === "missing") return "Missing";
  return "Unknown";
}

function phaseSortKey(phase: string): number {
  const index = PIPELINE_PHASE_ORDER.indexOf(phase as (typeof PIPELINE_PHASE_ORDER)[number]);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function calculatePhaseProgress(phase: PipelinePhaseProgress): number {
  if (typeof phase.progress === "number") {
    return normalizePercent(phase.progress);
  }
  if (phase.status === "completed" || phase.status === "skipped") {
    return 100;
  }
  return phase.status === "running" ? 50 : 0;
}

function isTerminalPhaseStatus(status: string | undefined): boolean {
  return status === "completed" || status === "failed" || status === "skipped";
}

function asSummaryRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readSummaryNumber(
  summary: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readSummaryString(
  summary: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = summary?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readSummaryArray(
  summary: Record<string, unknown> | undefined,
  key: string,
): unknown[] | undefined {
  const value = summary?.[key];
  return Array.isArray(value) ? value : undefined;
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}K`;
  return `${Math.round(value)}`;
}

function buildDataFlowBadges(
  phase: string,
  agents: Record<string, PipelineAgentProgress> | undefined,
): string[] {
  const summaries = Object.fromEntries(
    Object.entries(agents ?? {}).map(([key, agent]) => [
      key,
      asSummaryRecord(agent.dataSummary),
    ]),
  ) as Record<string, Record<string, unknown> | undefined>;

  if (phase === "extraction") {
    const textSummary = summaries.text_extraction ?? summaries.ocr_fallback;
    const fieldSummary = summaries.field_extraction;
    const source =
      readSummaryString(textSummary, "method") ??
      readSummaryString(summaries.pdf_fetch, "source");
    const pages = readSummaryNumber(textSummary, "pages");
    const chars = readSummaryNumber(textSummary, "chars");
    const fieldsExtracted = readSummaryArray(fieldSummary, "fieldsExtracted")?.length;

    return [
      source ? `Source: ${source}` : null,
      typeof pages === "number" ? `${pages} pages` : null,
      typeof chars === "number" ? `${formatCompactNumber(chars)} chars` : null,
      typeof fieldsExtracted === "number" && fieldsExtracted > 0
        ? `${fieldsExtracted} fields`
        : null,
    ].filter((value): value is string => Boolean(value));
  }

  if (phase === "scraping") {
    const scrapeSummary = summaries.website_scrape;
    const teamSummary = summaries.team_discovery;
    const linkedinSummary =
      summaries.linkedin_enrichment_step ?? summaries.linkedin_enrichment;

    const pages = readSummaryNumber(scrapeSummary, "pages");
    const teamTotal = readSummaryNumber(teamSummary, "total");
    const linkedinEnriched = readSummaryNumber(linkedinSummary, "liveEnriched");

    return [
      typeof pages === "number" ? `${pages} pages scraped` : null,
      typeof teamTotal === "number" ? `${teamTotal} team members` : null,
      typeof linkedinEnriched === "number"
        ? `${linkedinEnriched} LinkedIn enriched`
        : null,
    ].filter((value): value is string => Boolean(value));
  }

  if (phase === "enrichment") {
    const gapSummary = summaries.gap_analysis;
    const dbSummary = summaries.db_writes;

    const fieldsUpdated = readSummaryArray(dbSummary, "fieldsUpdated")?.length;
    const foundersAdded = readSummaryNumber(dbSummary, "foundersAdded");
    const missingBefore = readSummaryArray(gapSummary, "missing")?.length;
    const gapsFilled =
      typeof missingBefore === "number" && typeof fieldsUpdated === "number"
        ? Math.min(missingBefore, fieldsUpdated)
        : undefined;

    return [
      typeof gapsFilled === "number" && gapsFilled > 0
        ? `${gapsFilled} gaps filled`
        : null,
      typeof foundersAdded === "number" && foundersAdded > 0
        ? `${foundersAdded} founders discovered`
        : null,
      typeof fieldsUpdated === "number" && fieldsUpdated > 0
        ? `${fieldsUpdated} fields updated`
        : null,
    ].filter((value): value is string => Boolean(value));
  }

  return [];
}

function DataFlowBadges({
  phase,
  agents,
}: {
  phase: string;
  agents: Record<string, PipelineAgentProgress> | undefined;
}) {
  const badges = buildDataFlowBadges(phase, agents);
  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <Badge
          key={`${phase}-${badge}`}
          variant="outline"
          className="bg-slate-500/5 text-slate-700 border-slate-500/20 dark:text-slate-300"
        >
          {badge}
        </Badge>
      ))}
    </div>
  );
}

export function AdminPipelineLivePanel({
  startupId,
  startupStatus,
  onRetryAgent,
  trackedRetry,
  onClearTrackedRetry,
}: AdminPipelineLivePanelProps) {
  const [selectedTrace, setSelectedTrace] = useState<PipelineAgentTrace | null>(null);
  const [retryingAgentKey, setRetryingAgentKey] = useState<string | null>(null);
  const { progress, isLoading, isFetching } = useStartupRealtimeProgress(startupId, {
    enabled: true,
    pollMs: 1500,
    useSocket: true,
  });

  const phaseEntries = useMemo(() => {
    const keys = new Set<string>([
      ...PIPELINE_PHASE_ORDER,
      ...Object.keys(progress?.phases ?? {}),
    ]);
    return Array.from(keys)
      .sort((a, b) => phaseSortKey(a) - phaseSortKey(b))
      .map((phase) => {
        const data = progress?.phases?.[phase] ?? {
          status: "pending",
          progress: 0,
        };
        const agents = Object.values(data.agents ?? {});
        const retryingAgentCount = agents.filter(
          (agent) =>
            data.status === "running" &&
            progress?.pipelineStatus === "running" &&
            agent.status === "running" &&
            (agent.retryCount ?? 0) > 0,
        ).length;
        const retriedAgentCount = agents.filter(
          (agent) => (agent.retryCount ?? 0) > 0,
        ).length;
        const fallbackAgentCount = agents.filter(
          (agent) => isFallbackAgent(agent),
        ).length;
        const failedAgentCount = agents.filter(
          (agent) => isHardFailedAgent(agent),
        ).length;
        return {
          phase,
          data,
          percent: calculatePhaseProgress(data),
          tone: toneForPhase(data),
          agentCount: agents.length,
          retryingAgentCount,
          retriedAgentCount,
          fallbackAgentCount,
          failedAgentCount,
        };
      });
  }, [progress?.phases]);

  const flattenedAgents = useMemo<FlattenedAgent[]>(() => {
    const rows: FlattenedAgent[] = [];
    for (const entry of phaseEntries) {
      for (const [agentKey, agentData] of Object.entries(entry.data.agents ?? {})) {
        rows.push({
          phase: entry.phase,
          key: agentKey,
          data: agentData,
        });
      }
    }
    rows.sort((a, b) => {
      const phaseCompare = phaseSortKey(a.phase) - phaseSortKey(b.phase);
      if (phaseCompare !== 0) {
        return phaseCompare;
      }
      return a.key.localeCompare(b.key);
    });
    return rows;
  }, [phaseEntries]);

  const eventTimeline = useMemo<PipelineAgentEvent[]>(() => {
    const activeRunId = progress?.pipelineRunId;
    const events = Array.isArray(progress?.agentEvents)
      ? progress.agentEvents.filter(
          (event) =>
            !activeRunId ||
            !event.pipelineRunId ||
            event.pipelineRunId === activeRunId,
        )
      : [];
    events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const seen = new Set<string>();
    const deduped: PipelineAgentEvent[] = [];
    for (const event of events) {
      if (seen.has(event.id)) {
        continue;
      }
      seen.add(event.id);
      deduped.push(event);
      if (deduped.length >= 80) {
        break;
      }
    }
    return deduped;
  }, [progress?.agentEvents, progress?.pipelineRunId]);

  const agentTraceTimeline = useMemo<PipelineAgentTrace[]>(() => {
    const activeRunId = progress?.pipelineRunId;
    const traces = Array.isArray(progress?.agentTraces)
      ? progress.agentTraces.filter(
          (trace) => !activeRunId || trace.pipelineRunId === activeRunId,
        )
      : [];
    traces.sort(
      (a, b) =>
        new Date(b.startedAt ?? b.completedAt ?? 0).getTime() -
        new Date(a.startedAt ?? a.completedAt ?? 0).getTime(),
    );
    return traces.slice(0, 100);
  }, [progress?.agentTraces, progress?.pipelineRunId]);

  const aiAgentTraceTimeline = useMemo(
    () => agentTraceTimeline.filter((trace) => !isPhaseStepTrace(trace)),
    [agentTraceTimeline],
  );
  const stepTraceTimeline = useMemo(
    () => agentTraceTimeline.filter((trace) => isPhaseStepTrace(trace)),
    [agentTraceTimeline],
  );

  const runningAgentsCount = flattenedAgents.filter(
    (agent) => agent.data.status === "running",
  ).length;
  const isLive = startupStatus === "analyzing" && progress?.pipelineStatus === "running";
  const fallbackCount = flattenedAgents.filter(
    (agent) => isFallbackAgent(agent.data),
  ).length;
  const retriedAgentsCount = flattenedAgents.filter(
    (agent) => (agent.data.retryCount ?? 0) > 0,
  ).length;
  const activeRetriesCount = flattenedAgents.filter(
    (agent) => (agent.data.retryCount ?? 0) > 0 && agent.data.status === "running",
  ).length;
  const phaseStatusByKey = Object.fromEntries(
    phaseEntries.map((entry) => [entry.phase, entry.data.status]),
  );
  const activeFailedAgentsCount = flattenedAgents.filter((agent) => {
    const phaseStatus = phaseStatusByKey[agent.phase];
    return (
      isHardFailedAgent(agent.data) &&
      !isTerminalPhaseStatus(phaseStatus)
    );
  }).length;
  const activePhaseErrorCount = phaseEntries.filter(
    (entry) => Boolean(entry.data.error) && !isTerminalPhaseStatus(entry.data.status),
  ).length;
  const problematicAgentsCount = flattenedAgents.filter(
    (agent) =>
      isFallbackAgent(agent.data) ||
      isHardFailedAgent(agent.data),
  ).length;
  const totalIssueSignals =
    problematicAgentsCount + activePhaseErrorCount + (isLive ? activeRetriesCount : 0);
  const completedAgentsCount = flattenedAgents.filter(
    (agent) => agent.data.status === "completed",
  ).length;
  const isCompletedSnapshot = progress?.pipelineStatus === "completed";
  const runTone: SignalTone =
    progress?.pipelineStatus === "failed" ||
    Boolean(progress?.error)
      ? "danger"
      : isLive && (activeFailedAgentsCount > 0 || activePhaseErrorCount > 0)
        ? "danger"
      : problematicAgentsCount > 0 || fallbackCount > 0 || retriedAgentsCount > 0
        ? "warning"
        : isCompletedSnapshot
          ? "success"
          : runningAgentsCount > 0
            ? "info"
            : "neutral";
  const latestAttentionEvent = eventTimeline.find((event) =>
    isLive
      ? event.event === "failed" || event.event === "fallback" || event.event === "retrying"
      : event.event === "failed" || event.event === "fallback",
  );
  const trackedRetryAgent = trackedRetry
    ? flattenedAgents.find(
        (agent) =>
          agent.phase === trackedRetry.phase && agent.key === trackedRetry.agentKey,
      )
    : null;
  const trackedRetryEvent = trackedRetry
    ? eventTimeline.find(
        (event) =>
          String(event.phase) === trackedRetry.phase &&
          event.agentKey === trackedRetry.agentKey,
      )
    : undefined;
  const trackedRetryRequestMs = toTimestampMs(trackedRetry?.requestedAt);
  const progressUpdatedMs = toTimestampMs(progress?.updatedAt);
  const hasTelemetrySinceTrackedRetry =
    trackedRetryRequestMs !== null &&
    progressUpdatedMs !== null &&
    progressUpdatedMs >= trackedRetryRequestMs;
  const trackedRetryAgentEventMs = toTimestampMs(trackedRetryAgent?.data.lastEventAt);
  const hasTrackedAgentSignal =
    hasTelemetrySinceTrackedRetry &&
    trackedRetryAgentEventMs !== null &&
    trackedRetryRequestMs !== null &&
    trackedRetryAgentEventMs >= trackedRetryRequestMs;
  const trackedRetryStatus: "queued" | "running" | "completed" | "failed" =
    !trackedRetry || !hasTrackedAgentSignal
      ? "queued"
      : trackedRetryAgent?.data.status === "running"
        ? "running"
        : trackedRetryAgent?.data.status === "failed"
          ? "failed"
          : trackedRetryAgent?.data.status === "completed"
            ? "completed"
            : "queued";
  const trackedRetryTone: SignalTone =
    trackedRetryStatus === "failed"
      ? "danger"
      : trackedRetryStatus === "completed"
        ? "success"
        : trackedRetryStatus === "running"
          ? "info"
          : "warning";
  const trackedRetryStatusMessage = trackedRetry
    ? trackedRetryStatus === "queued"
      ? "Queued. Waiting for live telemetry from the new pipeline run."
      : trackedRetryStatus === "running"
        ? `Running now${trackedRetryEvent ? ` • ${eventVerb(trackedRetryEvent.event)} at ${formatTime(trackedRetryEvent.timestamp)}` : ""}.`
        : trackedRetryStatus === "completed"
          ? `Completed${trackedRetryEvent ? ` • ${eventVerb(trackedRetryEvent.event)} at ${formatTime(trackedRetryEvent.timestamp)}` : ""}. Synthesis will refresh downstream outputs.`
          : `Failed${trackedRetryEvent ? ` • ${eventVerb(trackedRetryEvent.event)} at ${formatTime(trackedRetryEvent.timestamp)}` : ""}. Check timeline details.`
    : "";

  if (!progress && !isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-muted-foreground" />
            Pipeline Live
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No pipeline telemetry is available for this startup yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Pipeline Live
          {isLive ? (
            <Badge className="bg-chart-5/10 text-chart-5 border-chart-5/30">Live</Badge>
          ) : (
            <Badge variant="outline">Snapshot</Badge>
          )}
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {trackedRetry && (
          <div className={`rounded-lg border px-3 py-2 ${SURFACE_TONE_CLASS[trackedRetryTone]}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {trackedRetryStatus === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                ) : trackedRetryStatus === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : trackedRetryStatus === "failed" ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <Clock3 className="h-4 w-4 text-amber-500" />
                )}
                Tracking targeted retry: {formatLabel(trackedRetry.agentKey)} (
                {formatLabel(trackedRetry.phase)})
              </div>
              {onClearTrackedRetry && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={onClearTrackedRetry}
                >
                  Dismiss
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {trackedRetryStatusMessage}
            </p>
          </div>
        )}

        {(progress?.error || totalIssueSignals > 0 || latestAttentionEvent) && (
          <div className={`rounded-lg border px-3 py-2 ${SURFACE_TONE_CLASS[runTone]}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {runTone === "danger" ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : runTone === "warning" ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                Run health: {runHealthText(runTone)}
              </div>
              <Badge variant="outline" className={statusClass(String(progress?.pipelineStatus ?? "pending"))}>
                {progress?.pipelineStatus ?? startupStatus}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {progress?.error
                ? progress.error
                : isCompletedSnapshot && problematicAgentsCount > 0
                  ? `Completed with ${problematicAgentsCount} flagged agent result(s) that need manual review.`
                : latestAttentionEvent
                  ? `${formatLabel(latestAttentionEvent.agentKey)} ${eventVerb(latestAttentionEvent.event).toLowerCase()} at ${formatTime(latestAttentionEvent.timestamp)}`
                  : "No blocking issues detected."}
            </p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall</p>
            <p className="mt-1 text-2xl font-semibold">
              {normalizePercent(progress?.overallProgress)}%
            </p>
            <Progress
              value={normalizePercent(progress?.overallProgress)}
              className="mt-2 h-1.5"
            />
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current phase</p>
            <p className="mt-1 text-base font-semibold">
              {formatLabel(String(progress?.currentPhase ?? "—"))}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Run {progress?.pipelineRunId ? progress.pipelineRunId.slice(0, 8) : "—"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active agents</p>
            <p className="mt-1 text-2xl font-semibold">{runningAgentsCount}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Retrying now: {activeRetriesCount}
            </p>
          </div>
          <div className={`rounded-lg border p-3 ${SURFACE_TONE_CLASS[runTone]}`}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Issue signals</p>
            <p className="mt-1 text-2xl font-semibold">{totalIssueSignals}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {isLive
                ? `Active failed: ${activeFailedAgentsCount} • Retrying: ${activeRetriesCount}`
                : `Flagged agents: ${problematicAgentsCount} • Fallback: ${fallbackCount}`}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Stages</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {phaseEntries.map((entry) => (
              <div
                key={entry.phase}
                className={`rounded-lg border p-3 ${SURFACE_TONE_CLASS[entry.tone]}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium">
                    {statusIcon(entry.data.status)}
                    {formatLabel(entry.phase)}
                  </p>
                  <Badge variant="outline" className={statusClass(entry.data.status)}>
                    {entry.data.status}
                  </Badge>
                </div>
                <Progress
                  value={entry.percent}
                  className={`mt-2 h-1.5 ${PROGRESS_TONE_CLASS[entry.tone]}`}
                />
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{entry.percent}%</span>
                  <span>Agents: {entry.agentCount}</span>
                  {(entry.data.retryCount ?? 0) > 0 && (
                    <span>Retries: {entry.data.retryCount}</span>
                  )}
                </div>
                <DataFlowBadges phase={entry.phase} agents={entry.data.agents} />
                {(entry.failedAgentCount > 0 ||
                  entry.fallbackAgentCount > 0 ||
                  entry.retriedAgentCount > 0 ||
                  entry.retryingAgentCount > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.retryingAgentCount > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300"
                      >
                        retrying {entry.retryingAgentCount}
                      </Badge>
                    )}
                    {entry.failedAgentCount > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-destructive/10 text-destructive border-destructive/30"
                      >
                        failed {entry.failedAgentCount}
                      </Badge>
                    )}
                    {entry.fallbackAgentCount > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300"
                      >
                        fallback {entry.fallbackAgentCount}
                      </Badge>
                    )}
                    {entry.retriedAgentCount > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300"
                      >
                        retried {entry.retriedAgentCount}
                      </Badge>
                    )}
                  </div>
                )}
                {entry.data.error && (
                  <p
                    className={`mt-2 text-xs ${
                      entry.data.status === "failed"
                        ? "text-destructive"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {entry.data.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Agent Status</h3>
            <ScrollArea className="h-[280px] rounded-lg border">
              <div className="space-y-2 p-3">
                {flattenedAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No agent activity yet.</p>
                ) : (
                  flattenedAgents.map((agent) => {
                    const isTrackedAgent =
                      trackedRetry?.phase === agent.phase &&
                      trackedRetry.agentKey === agent.key;
                    return (
                      <div
                        key={`${agent.phase}:${agent.key}`}
                        className={`rounded-md border p-2.5 ${SURFACE_TONE_CLASS[toneForAgent(agent.data)]} ${
                          isTrackedAgent ? "ring-1 ring-primary/50" : ""
                        }`}
                      >
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {statusIcon(agent.data.status)}
                          {formatLabel(agent.key)}
                        </p>
                        <Badge variant="outline" className={statusClass(agent.data.status)}>
                          {agent.data.status}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Phase: {formatLabel(agent.phase)}</span>
                        <span>Attempt: {agent.data.attempts ?? 1}</span>
                        <span>Retries: {agent.data.retryCount ?? 0}</span>
                        <span>Fallback: {isFallbackAgent(agent.data) ? "yes" : "no"}</span>
                      </div>
                      {isFallbackAgent(agent.data) && (
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Reason: {formatFallbackReason(agent.data.fallbackReason) ?? "Unknown"}
                        </div>
                      )}
                      {onRetryAgent &&
                        (agent.phase === "research" || agent.phase === "evaluation") &&
                        (agent.data.status === "failed" || isFallbackAgent(agent.data)) && (
                          <div className="mt-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5 text-xs"
                              disabled={retryingAgentKey === `${agent.phase}:${agent.key}`}
                              onClick={async () => {
                                const actionKey = `${agent.phase}:${agent.key}`;
                                setRetryingAgentKey(actionKey);
                                try {
                                  await onRetryAgent(
                                    agent.phase as "research" | "evaluation",
                                    agent.key,
                                  );
                                } finally {
                                  setRetryingAgentKey((current) =>
                                    current === actionKey ? null : current,
                                  );
                                }
                              }}
                            >
                              {retryingAgentKey === `${agent.phase}:${agent.key}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Retry agent
                            </Button>
                          </div>
                        )}
                      {(isFallbackAgent(agent.data) ||
                        (agent.data.retryCount ?? 0) > 0 ||
                        agent.data.lastEvent) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {(agent.data.retryCount ?? 0) > 0 && (
                            <Badge
                              variant="outline"
                              className="bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300"
                            >
                              retried {agent.data.retryCount}
                            </Badge>
                          )}
                          {isFallbackAgent(agent.data) && (
                            <Badge
                              variant="outline"
                              className="bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300"
                            >
                              fallback
                            </Badge>
                          )}
                          {agent.data.lastEvent && (
                            <Badge
                              variant="outline"
                              className={EVENT_BADGE_CLASS[agent.data.lastEvent]}
                            >
                              {eventVerb(agent.data.lastEvent)}
                            </Badge>
                          )}
                          {isTrackedAgent && (
                            <Badge
                              variant="outline"
                              className="bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300"
                            >
                              targeted retry
                            </Badge>
                          )}
                        </div>
                      )}
                      {agent.data.error && (
                        <p
                          className={`mt-1 text-xs ${
                            isFallbackAgent(agent.data)
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-destructive"
                          }`}
                        >
                          {normalizeAgentError(agent.data.error)}
                        </p>
                      )}
                      {agent.data.rawProviderError && isFallbackAgent(agent.data) && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Provider: {previewText(agent.data.rawProviderError, 220)}
                        </p>
                      )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Event Timeline</h3>
            <ScrollArea className="h-[280px] rounded-lg border">
              <div className="space-y-2 p-3">
                {eventTimeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Waiting for lifecycle events.
                  </p>
                ) : (
                  eventTimeline.map((event) => (
                    <div
                      key={event.id}
                      className={`rounded-md border border-l-4 p-2.5 ${SURFACE_TONE_CLASS[toneForEvent(event.event)]}`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {eventIcon(event.event)}
                        <span className="font-medium">{formatLabel(event.agentKey)}</span>
                        <Badge variant="outline" className={EVENT_BADGE_CLASS[event.event]}>
                          {eventVerb(event.event)}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Phase: {formatLabel(String(event.phase))}</span>
                        <span>At: {formatTime(event.timestamp)}</span>
                        {typeof event.attempt === "number" && <span>Attempt: {event.attempt}</span>}
                        {typeof event.retryCount === "number" && (
                          <span>Retries: {event.retryCount}</span>
                        )}
                        {event.fallbackReason && (
                          <span>
                            Reason: {formatFallbackReason(event.fallbackReason)}
                          </span>
                        )}
                      </div>
                      {event.error && (
                        <p
                          className={`mt-1 text-xs ${
                            event.event === "fallback"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-destructive"
                          }`}
                        >
                          {normalizeAgentError(event.error)}
                        </p>
                      )}
                      {event.rawProviderError && event.event === "fallback" && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Provider: {previewText(event.rawProviderError, 220)}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">AI Agent Traces</h3>
            <ScrollArea className="h-[280px] rounded-lg border">
              <div className="space-y-2 p-3">
                {aiAgentTraceTimeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No AI-agent traces captured yet for this run.
                  </p>
                ) : (
                  aiAgentTraceTimeline.map((trace) => (
                    <div
                      key={trace.id}
                      className={`rounded-md border p-2.5 ${SURFACE_TONE_CLASS[
                        trace.status === "failed"
                          ? "danger"
                          : trace.status === "fallback"
                            ? "warning"
                            : trace.status === "running"
                              ? "info"
                              : "success"
                      ]} cursor-pointer`}
                      onClick={() => setSelectedTrace(trace)}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {formatLabel(trace.agentKey)} · {formatLabel(String(trace.phase))}
                        </p>
                        <Badge variant="outline" className={statusClass(trace.status)}>
                          {trace.status}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Attempt: {trace.attempt ?? 1}</span>
                        <span>Retries: {trace.retryCount ?? 0}</span>
                        <span>Capture: {formatCaptureStatus(trace.captureStatus)}</span>
                        <span>Started: {formatTime(trace.startedAt)}</span>
                      </div>
                      {trace.error && (
                        <p
                          className={`mt-1 text-xs ${
                            trace.status === "fallback"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-destructive"
                          }`}
                        >
                          {normalizeTraceError(trace)}
                        </p>
                      )}
                      {trace.rawProviderError && trace.status === "fallback" && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Provider: {previewText(trace.rawProviderError, 220)}
                        </p>
                      )}
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start gap-2 text-xs"
                          onClick={() => setSelectedTrace(trace)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Trace
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Input: {previewText(toPrettyInput(trace))}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Output: {previewText(toPrettyOutput(trace))}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Step Traces</h3>
            <ScrollArea className="h-[280px] rounded-lg border">
              <div className="space-y-2 p-3">
                {stepTraceTimeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No step-level traces captured yet for this run.
                  </p>
                ) : (
                  stepTraceTimeline.map((trace) => {
                    const operation = readTraceOperation(trace);
                    return (
                      <div
                        key={trace.id}
                        className={`rounded-md border p-2.5 ${SURFACE_TONE_CLASS[
                          trace.status === "failed"
                            ? "danger"
                            : trace.status === "fallback"
                              ? "warning"
                              : trace.status === "running"
                                ? "info"
                                : "success"
                        ]} cursor-pointer`}
                        onClick={() => setSelectedTrace(trace)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {formatLabel(trace.stepKey || trace.agentKey)} · {formatLabel(String(trace.phase))}
                          </p>
                          <Badge variant="outline" className={statusClass(trace.status)}>
                            {trace.status}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>Kind: Step</span>
                          {operation && <span>Operation: {operation}</span>}
                          <span>Capture: {formatCaptureStatus(trace.captureStatus)}</span>
                          <span>Started: {formatTime(trace.startedAt)}</span>
                        </div>
                        {trace.error && (
                          <p className="mt-1 text-xs text-destructive">
                            {normalizeTraceError(trace)}
                          </p>
                        )}
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="justify-start gap-2 text-xs"
                            onClick={() => setSelectedTrace(trace)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View Trace
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Input: {previewText(toPrettyInput(trace))}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Output: {previewText(toPrettyOutput(trace))}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          <span>Pipeline status: {progress?.pipelineStatus ?? startupStatus}</span>
          <span>
            Agents completed: {completedAgentsCount}/{flattenedAgents.length}
          </span>
          <span>Issue signals: {totalIssueSignals}</span>
          <span className="inline-flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            Polling every 1.5s with websocket updates
          </span>
        </div>

        <Dialog
          open={Boolean(selectedTrace)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTrace(null);
            }
          }}
        >
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>
                {selectedTrace
                  ? `${formatLabel(selectedTrace.stepKey || selectedTrace.agentKey)} · ${formatLabel(String(selectedTrace.phase))} ${isPhaseStepTrace(selectedTrace) ? "Step" : "Agent"} Trace`
                  : "Trace"}
              </DialogTitle>
            </DialogHeader>
            {selectedTrace?.status === "fallback" && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Fallback reason:{" "}
                {formatFallbackReason(selectedTrace.fallbackReason) ?? "Unknown"}
                {selectedTrace.rawProviderError ? (
                  <>
                    {" "}
                    | Raw provider error: {selectedTrace.rawProviderError}
                  </>
                ) : null}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Input</p>
                <pre className="max-h-[440px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {toPrettyInput(selectedTrace)}
                </pre>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Output</p>
                <pre className="max-h-[440px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {toPrettyOutput(selectedTrace)}
                </pre>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Metadata</p>
              <pre className="max-h-[220px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                {toPrettyMeta(selectedTrace)}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
