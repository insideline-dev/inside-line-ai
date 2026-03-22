import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  Loader2,
  RefreshCw,
  RotateCcw,
  StopCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStartupRealtimeProgress } from "@/lib/startup/useStartupRealtimeProgress";
import { PhaseDataInspector } from "./PhaseDataInspector";
import { ScrapeLogTable } from "./ScrapeLogTable";
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
  onCancelPipeline?: () => void;
}

type FlattenedAgent = {
  phase: string;
  key: string;
  data: PipelineAgentProgress;
};

type SignalTone = "neutral" | "success" | "info" | "warning" | "danger";

type ActivityItemKind = "agent" | "event" | "ai_trace" | "step_trace";

type ActivityFilter = "all" | "issues" | "agents" | "traces" | "events";

type ActivityItem = {
  id: string;
  kind: ActivityItemKind;
  name: string;
  phase: string;
  status: string;
  tone: SignalTone;
  timestamp: string | undefined;
  error?: string;
  runtimeSummary?: string;
  hasIssue: boolean;
  agent?: FlattenedAgent;
  event?: PipelineAgentEvent;
  trace?: PipelineAgentTrace;
};

const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issues", label: "Issues" },
  { value: "agents", label: "Agents" },
  { value: "traces", label: "Traces" },
  { value: "events", label: "Events" },
];

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
  resolve_extraction: "Resolve Extraction",
  resolve_website: "Resolve Website",
  resolve_email: "Resolve Email",
  web_search: "Web Search",
  research_parameters: "Research Parameters",
  ai_synthesis: "AI Synthesis",
  db_writes: "DB Writes",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  started: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  running: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  waiting: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  cancelled: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  skipped: "bg-muted text-muted-foreground border-border",
  pending: "bg-muted text-muted-foreground border-border",
};

const RETRIED_BADGE_CLASS =
  "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300";

const SURFACE_TONE_CLASS: Record<SignalTone, string> = {
  neutral: "",
  success: "border-emerald-500/30 bg-emerald-500/5",
  info: "border-sky-500/30 bg-sky-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  danger: "border-destructive/40 bg-destructive/5",
};

const PHASE_STEP_AGENT_KEYS = new Set([
  "pdf_fetch",
  "text_extraction",
  "ocr_fallback",
  "field_extraction",
  "gap_analysis",
  "resolve_extraction",
  "resolve_website",
  "resolve_email",
  "web_search",
  "research_parameters",
  "ai_synthesis",
  "db_writes",
  "cache_check",
  "website_scrape",
  "team_discovery",
  "linkedin_enrichment_step",
]);

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
    .replace(/[._-]+/g, " ")
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
  if (isFallbackAgent(agent)) return "warning";
  if (agent.status === "running") return "info";
  if (agent.status === "completed") return "success";
  return "neutral";
}

function toneForPhase(phase: PipelinePhaseProgress): SignalTone {
  const agentValues = Object.values(phase.agents ?? {});
  const hasRetrySignals =
    (phase.retryCount ?? 0) > 0 ||
    agentValues.some((agent) => (agent.retryCount ?? 0) > 0);
  const hasFallbackSignals = agentValues.some((agent) => isFallbackAgent(agent));
  if (
    phase.status === "failed" ||
    agentValues.some((agent) => isHardFailedAgent(agent))
  ) {
    return "danger";
  }
  if (hasFallbackSignals || (phase.status === "running" && hasRetrySignals)) {
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
  if (status === "started") {
    return <Activity className="h-4 w-4 text-sky-500" />;
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
  if (
    normalized.includes("unipile") &&
    (/\b401\b/.test(normalized) ||
      /\b403\b/.test(normalized) ||
      normalized.includes("authorization failed"))
  ) {
    return "LinkedIn enrichment integration auth failed (Unipile 401/403). Check Unipile credentials/account access.";
  }
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

function readTraceWarning(trace: PipelineAgentTrace): string | undefined {
  if (!trace.meta || typeof trace.meta !== "object" || Array.isArray(trace.meta)) {
    return undefined;
  }

  const searchEnforcement = (trace.meta as Record<string, unknown>).searchEnforcement;
  if (
    !searchEnforcement ||
    typeof searchEnforcement !== "object" ||
    Array.isArray(searchEnforcement)
  ) {
    return undefined;
  }

  const enforcementRecord = searchEnforcement as Record<string, unknown>;
  const missingProviderEvidence = enforcementRecord.missingProviderEvidence === true;
  const missingBraveToolCall = enforcementRecord.missingBraveToolCall === true;

  if (!missingProviderEvidence && !missingBraveToolCall) {
    return undefined;
  }
  if (missingProviderEvidence && missingBraveToolCall) {
    return "Grounded provider evidence and Brave tool call were both missing; output was accepted with warning.";
  }
  if (missingProviderEvidence) {
    return "Grounded provider evidence was missing; output was accepted with warning.";
  }
  return "Brave tool call evidence was missing; output was accepted with warning.";
}

function isAdvisoryTraceWarning(
  trace: PipelineAgentTrace,
  warning: string | undefined,
  normalizedError?: string,
): boolean {
  return Boolean(warning) && !normalizedError && trace.status === "completed";
}

function readTraceRuntimeSummary(trace: PipelineAgentTrace): string | undefined {
  if (!trace.meta || typeof trace.meta !== "object" || Array.isArray(trace.meta)) {
    return undefined;
  }

  const modelConfig = (trace.meta as Record<string, unknown>).modelConfig;
  if (!modelConfig || typeof modelConfig !== "object" || Array.isArray(modelConfig)) {
    return undefined;
  }

  const config = modelConfig as Record<string, unknown>;
  const modelName = typeof config.modelName === "string" ? config.modelName : undefined;
  const searchMode = typeof config.searchMode === "string" ? config.searchMode : undefined;
  const source = typeof config.source === "string" ? config.source : undefined;

  if (!modelName || !searchMode || !source) {
    return undefined;
  }

  return `${modelName} · ${searchMode} · ${source}`;
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

function formatFallbackReasonWithLegacyLabel(
  reason: string | undefined,
): string {
  return (
    formatFallbackReason(reason) ??
    "Legacy trace (no fallback reason recorded)"
  );
}

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toPrettyUserPrompt(trace: PipelineAgentTrace | null): string {
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

function toPrettySystemPrompt(trace: PipelineAgentTrace | null): string {
  if (!trace) {
    return "";
  }
  if (
    typeof trace.systemPrompt === "string" &&
    trace.systemPrompt.trim().length > 0
  ) {
    return trace.systemPrompt;
  }
  return "System prompt not captured";
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

export function TraceInputPanel({
  trace,
  defaultTab = "user",
  className,
  contentClassName,
}: {
  trace: PipelineAgentTrace | null;
  defaultTab?: "user" | "system";
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Tabs defaultValue={defaultTab} className={cn("space-y-2", className)}>
      <TabsList className="grid h-8 w-full grid-cols-2">
        <TabsTrigger value="user" className="text-xs">
          User Prompt
        </TabsTrigger>
        <TabsTrigger value="system" className="text-xs">
          System Prompt
        </TabsTrigger>
      </TabsList>
      <TabsContent value="user" className="mt-0 min-h-0">
        <pre className={cn("max-h-[440px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap", contentClassName)}>
          {toPrettyUserPrompt(trace)}
        </pre>
      </TabsContent>
      <TabsContent value="system" className="mt-0 min-h-0">
        <pre className={cn("max-h-[440px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap", contentClassName)}>
          {toPrettySystemPrompt(trace)}
        </pre>
      </TabsContent>
    </Tabs>
  );
}

function isPhaseStepTrace(trace: PipelineAgentTrace): boolean {
  return trace.traceKind === "phase_step";
}

function traceOperationLabel(trace: PipelineAgentTrace): string | undefined {
  const operation = trace.meta?.operation;
  if (typeof operation !== "string" || operation.trim().length === 0) {
    return undefined;
  }
  return formatLabel(operation);
}

function traceDisplayStatus(
  trace: PipelineAgentTrace,
  isLive: boolean,
): string {
  if (trace.status !== "running") {
    return trace.status;
  }
  if (!isLive) {
    return "started";
  }
  return trace.completedAt ? "started" : "running";
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

function readSummaryBoolean(
  summary: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = summary?.[key];
  return typeof value === "boolean" ? value : undefined;
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
    const linkedinStatuses = asSummaryRecord(linkedinSummary?.enrichmentStatuses);

    const pages = readSummaryNumber(scrapeSummary, "pages");
    const teamTotal = readSummaryNumber(teamSummary, "total");
    const linkedinEnriched =
      readSummaryNumber(linkedinSummary, "verifiedTeamMembers") ??
      readSummaryNumber(linkedinSummary, "verified") ??
      readSummaryNumber(linkedinSummary, "successfulMatches") ??
      readSummaryNumber(linkedinStatuses, "success") ??
      readSummaryNumber(linkedinSummary, "enrichedTeamMembers") ??
      readSummaryNumber(linkedinSummary, "liveEnriched");

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

  if (phase === "evaluation") {
    let mappedSourceCount = 0;
    let fallbackCount = 0;
    const linkedResearchAgents = new Set<string>();

    for (const summary of Object.values(summaries)) {
      const sourceCount = readSummaryNumber(summary, "mappedSourceCount");
      if (typeof sourceCount === "number") {
        mappedSourceCount += sourceCount;
      }
      if (readSummaryBoolean(summary, "edgeDrivenInputFallbackUsed") === true) {
        fallbackCount += 1;
      }
      const linked = readSummaryArray(summary, "linkedResearchAgents");
      for (const agent of linked ?? []) {
        if (typeof agent === "string" && agent.trim().length > 0) {
          linkedResearchAgents.add(agent);
        }
      }
    }

    const linkedList = Array.from(linkedResearchAgents).sort();
    return [
      mappedSourceCount > 0 ? `${mappedSourceCount} mapped inputs` : null,
      linkedList.length > 0
        ? `Linked research: ${linkedList.join(", ")}`
        : null,
      fallbackCount > 0
        ? `${fallbackCount} agents using legacy research input`
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
  onCancelPipeline,
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
        const agentEntries = Object.entries(data.agents ?? {});
        const visibleAgents = agentEntries
          .filter(([agentKey]) => !PHASE_STEP_AGENT_KEYS.has(agentKey))
          .map(([, agent]) => agent);
        const retryingAgentCount = visibleAgents.filter(
          (agent) =>
            data.status === "running" &&
            progress?.pipelineStatus === "running" &&
            agent.status === "running" &&
            (agent.retryCount ?? 0) > 0,
        ).length;
        const retriedAgentCount = visibleAgents.filter(
          (agent) => (agent.retryCount ?? 0) > 0,
        ).length;
        const fallbackAgentCount = visibleAgents.filter(
          (agent) => isFallbackAgent(agent),
        ).length;
        const failedAgentCount = visibleAgents.filter(
          (agent) => isHardFailedAgent(agent),
        ).length;
        return {
          phase,
          data,
          percent: calculatePhaseProgress(data),
          tone: toneForPhase(data),
          agentCount: visibleAgents.length,
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

  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

  const activityItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    for (const agent of flattenedAgents) {
      const tone = toneForAgent(agent.data);
      items.push({
        id: `agent:${agent.phase}:${agent.key}`,
        kind: "agent",
        name: formatLabel(agent.key),
        phase: agent.phase,
        status: agent.data.status,
        tone,
        timestamp: agent.data.lastEventAt,
        error: normalizeAgentError(agent.data.error),
        hasIssue: isHardFailedAgent(agent.data) || isFallbackAgent(agent.data),
        agent,
      });
    }

    for (const event of eventTimeline) {
      const tone = toneForEvent(event.event);
      items.push({
        id: `event:${event.id}`,
        kind: "event",
        name: formatLabel(event.agentKey),
        phase: String(event.phase),
        status: event.event,
        tone,
        timestamp: event.timestamp,
        error: normalizeAgentError(event.error),
        hasIssue: event.event === "failed" || event.event === "fallback",
        event,
      });
    }

    for (const trace of aiAgentTraceTimeline) {
      const warning = readTraceWarning(trace);
      const normalizedTraceError = normalizeTraceError(trace);
      const advisoryWarning = isAdvisoryTraceWarning(
        trace,
        warning,
        normalizedTraceError,
      );
      const runtimeSummary = readTraceRuntimeSummary(trace);
      items.push({
        id: `ai_trace:${trace.id}`,
        kind: "ai_trace",
        name: formatLabel(trace.agentKey),
        phase: String(trace.phase),
        status: trace.status,
        tone: trace.status === "failed"
          ? "danger"
          : trace.status === "fallback" || (warning && !advisoryWarning)
            ? "warning"
          : trace.status === "running"
            ? "info"
            : "success",
        timestamp: trace.startedAt ?? trace.completedAt ?? undefined,
        error: normalizedTraceError ?? (advisoryWarning ? undefined : warning),
        runtimeSummary,
        hasIssue:
          trace.status === "failed" ||
          trace.status === "fallback" ||
          (Boolean(warning) && !advisoryWarning),
        trace,
      });
    }

    for (const trace of stepTraceTimeline) {
      const warning = readTraceWarning(trace);
      const normalizedTraceError = normalizeTraceError(trace);
      const advisoryWarning = isAdvisoryTraceWarning(
        trace,
        warning,
        normalizedTraceError,
      );
      const runtimeSummary = readTraceRuntimeSummary(trace);
      items.push({
        id: `step_trace:${trace.id}`,
        kind: "step_trace",
        name: formatLabel(trace.stepKey || trace.agentKey),
        phase: String(trace.phase),
        status: trace.status,
        tone: trace.status === "failed"
          ? "danger"
          : trace.status === "fallback" || (warning && !advisoryWarning)
            ? "warning"
          : trace.status === "running"
            ? "info"
            : "success",
        timestamp: trace.startedAt ?? trace.completedAt ?? undefined,
        error: normalizedTraceError ?? (advisoryWarning ? undefined : warning),
        runtimeSummary,
        hasIssue:
          trace.status === "failed" ||
          trace.status === "fallback" ||
          (Boolean(warning) && !advisoryWarning),
        trace,
      });
    }

    items.sort((a, b) => {
      const tsA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tsB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tsB - tsA;
    });

    return items;
  }, [flattenedAgents, eventTimeline, aiAgentTraceTimeline, stepTraceTimeline]);

  const filteredActivityItems = useMemo(() => {
    if (activityFilter === "all") return activityItems;
    if (activityFilter === "issues") return activityItems.filter((item) => item.hasIssue);
    if (activityFilter === "agents") return activityItems.filter((item) => item.kind === "agent");
    if (activityFilter === "traces") return activityItems.filter((item) => item.kind === "ai_trace" || item.kind === "step_trace");
    return activityItems.filter((item) => item.kind === "event");
  }, [activityItems, activityFilter]);

  const activityFilterCounts = useMemo(() => ({
    all: activityItems.length,
    issues: activityItems.filter((item) => item.hasIssue).length,
    agents: activityItems.filter((item) => item.kind === "agent").length,
    traces: activityItems.filter((item) => item.kind === "ai_trace" || item.kind === "step_trace").length,
    events: activityItems.filter((item) => item.kind === "event").length,
  }), [activityItems]);

  const runningAgentsCount = flattenedAgents.filter(
    (agent) => agent.data.status === "running",
  ).length;
  const isLive = startupStatus === "analyzing" && progress?.pipelineStatus === "running";
  const fallbackCount = flattenedAgents.filter(
    (agent) => isFallbackAgent(agent.data),
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
  const isCancelledPipeline = progress?.pipelineStatus === "cancelled";
  const progressErrorText = String(progress?.error ?? "");
  const normalizedProgressError = progressErrorText.toLowerCase();
  const isAwaitingFounderInfoState =
    normalizedProgressError.includes("awaiting founder info");
  const isOrphanRuntimeWarningState =
    normalizedProgressError.includes("live pipeline runtime state missing");
  const runTone: SignalTone =
    progress?.pipelineStatus === "failed" ||
    (Boolean(progress?.error) &&
      !isAwaitingFounderInfoState &&
      !isOrphanRuntimeWarningState)
      ? "danger"
      : isCancelledPipeline || isAwaitingFounderInfoState || isOrphanRuntimeWarningState
        ? "warning"
      : isLive && (activeFailedAgentsCount > 0 || activePhaseErrorCount > 0)
        ? "danger"
      : problematicAgentsCount > 0 || fallbackCount > 0 || (isLive && activeRetriesCount > 0)
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
  const selectedTraceWarning = selectedTrace ? readTraceWarning(selectedTrace) : undefined;
  const selectedTraceRuntimeSummary = selectedTrace
    ? readTraceRuntimeSummary(selectedTrace)
    : undefined;
  const emptyTelemetryMessage =
    startupStatus === "submitted"
      ? "Awaiting founder info. Clara has requested missing required details (website and funding stage). Pipeline will resume after the startup is updated."
      : startupStatus === "analyzing"
        ? "Pipeline telemetry is temporarily unavailable. Refresh in a few seconds."
        : "No pipeline telemetry is available for this startup yet.";
  const showAwaitingFounderInfoBanner =
    startupStatus === "submitted" &&
    (isAwaitingFounderInfoState || isCancelledPipeline);
  const awaitingFounderInfoMessage =
    isAwaitingFounderInfoState && progress?.error
      ? progress.error
      : "Action required: missing required founder details. Clara sent an email to the submitter, and the pipeline is paused until the startup is updated.";

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
            {emptyTelemetryMessage}
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
          {isLive && onCancelPipeline && (
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto"
              onClick={onCancelPipeline}
            >
              <StopCircle className="h-4 w-4 mr-1" />
              Stop Pipeline
            </Button>
          )}
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

        {showAwaitingFounderInfoBanner && (
          <div className={`rounded-lg border px-3 py-2 ${SURFACE_TONE_CLASS.warning}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Action required: waiting for founder info
              </div>
              <Badge variant="outline" className={statusClass(String(progress?.pipelineStatus ?? "submitted"))}>
                {progress?.pipelineStatus ?? startupStatus}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{awaitingFounderInfoMessage}</p>
          </div>
        )}

        {(progress?.error || isCancelledPipeline || totalIssueSignals > 0 || latestAttentionEvent) && (
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
                : isCancelledPipeline
                  ? "Pipeline paused and cancelled. Waiting for founder-provided required details before a new run can start."
                : isCompletedSnapshot && problematicAgentsCount > 0
                  ? `Completed with ${problematicAgentsCount} flagged agent result(s) that need manual review.`
                : latestAttentionEvent
                  ? `${formatLabel(latestAttentionEvent.agentKey)} ${eventVerb(latestAttentionEvent.event).toLowerCase()} at ${formatTime(latestAttentionEvent.timestamp)}`
                  : "No blocking issues detected."}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">Stages</h3>
          <div className="rounded-lg border divide-y">
            {phaseEntries.map((entry) => {
              const runningAgents = Object.entries(entry.data.agents ?? {})
                .filter(([k, a]) => a.status === "running" && !PHASE_STEP_AGENT_KEYS.has(k));
              const hasSignals = entry.failedAgentCount > 0 || entry.fallbackAgentCount > 0 || entry.retriedAgentCount > 0 || entry.retryingAgentCount > 0;
              return (
                <div key={entry.phase} className={cn("px-3 py-2.5", SURFACE_TONE_CLASS[entry.tone])}>
                  <div className="flex items-center gap-2">
                    {statusIcon(entry.data.status)}
                    <span className="text-sm font-medium">{formatLabel(entry.phase)}</span>
                    {entry.agentCount > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">{entry.agentCount} agents</span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      {hasSignals && (
                        <>
                          {entry.retryingAgentCount > 0 && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300">
                              retrying {entry.retryingAgentCount}
                            </Badge>
                          )}
                          {entry.failedAgentCount > 0 && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                              failed {entry.failedAgentCount}
                            </Badge>
                          )}
                          {entry.fallbackAgentCount > 0 && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300">
                              fallback {entry.fallbackAgentCount}
                            </Badge>
                          )}
                          {entry.retriedAgentCount > 0 && (
                            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", RETRIED_BADGE_CLASS)}>
                              retried {entry.retriedAgentCount}
                            </Badge>
                          )}
                        </>
                      )}
                      <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", statusClass(entry.data.status))}>
                        {entry.data.status}
                      </Badge>
                    </div>
                  </div>

                  {runningAgents.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {runningAgents.map(([agentKey, agent]) => (
                        <span key={agentKey} className="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-sky-300">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {formatLabel(agent.key ?? agentKey)}
                        </span>
                      ))}
                    </div>
                  )}

                  <DataFlowBadges phase={entry.phase} agents={entry.data.agents} />

                  {entry.phase === "scraping" && entry.data.status === "completed" && (() => {
                    const website = (progress?.phaseResults?.scraping as Record<string, unknown>)?.website as
                      | { url: string; title: string; fullText?: string; subpages?: Array<{ url: string; title: string; content: string }> }
                      | undefined;
                    if (!website?.subpages?.length) return null;
                    return (
                      <ScrapeLogTable
                        websiteUrl={website.url}
                        homepageTitle={website.title}
                        fullText={website.fullText ?? ""}
                        subpages={website.subpages}
                      />
                    );
                  })()}

                  {entry.data.error && (
                    <p className={cn("mt-1.5 text-xs truncate", entry.data.status === "failed" ? "text-destructive" : "text-amber-700 dark:text-amber-300")}>
                      {entry.data.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold list-none [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
            Phase Data Inspector
          </summary>
          <div className="mt-2">
            <PhaseDataInspector
              phaseResults={progress?.phaseResults}
              phases={progress?.phases}
            />
          </div>
        </details>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Activity</h3>
            <div className="flex gap-1">
              {ACTIVITY_FILTERS.map((filter) => {
                const count = activityFilterCounts[filter.value];
                return (
                  <button
                    key={filter.value}
                    type="button"
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                      activityFilter === filter.value
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-transparent text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => setActivityFilter(filter.value)}
                  >
                    {filter.label}
                    {count > 0 && (
                      <span className="ml-1 tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <ScrollArea className="h-[480px] rounded-lg border">
            <div className="space-y-1 p-2">
              {filteredActivityItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No activity to show.
                </p>
              ) : (
                filteredActivityItems.map((item) => {
                  const isAgent = item.kind === "agent" && item.agent;
                  const isTrace = item.kind === "ai_trace" || item.kind === "step_trace";
                  const isEvent = item.kind === "event" && item.event;
                  const displayStatus = isTrace && item.trace
                    ? traceDisplayStatus(item.trace, isLive)
                    : item.status;
                  const traceOperation = isTrace && item.trace
                    ? traceOperationLabel(item.trace)
                    : undefined;
                  const isTrackedAgent = isAgent &&
                    trackedRetry?.phase === item.agent?.phase &&
                    trackedRetry?.agentKey === item.agent?.key;
                  const canRetry = isAgent &&
                    onRetryAgent &&
                    item.agent &&
                    (item.agent.phase === "research" || item.agent.phase === "evaluation") &&
                    (item.agent.data.status === "failed" || isFallbackAgent(item.agent.data));

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-md border px-2.5 py-2",
                        SURFACE_TONE_CLASS[item.tone],
                        isTrace && "cursor-pointer",
                        isTrackedAgent && "ring-1 ring-primary/50",
                      )}
                      onClick={isTrace && item.trace ? () => setSelectedTrace(item.trace!) : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          {isEvent ? eventIcon(item.event!.event) : statusIcon(displayStatus)}
                          <span className="truncate text-sm font-medium">{item.name}</span>
                          <Badge variant="outline" className="shrink-0 border-border bg-muted/50 text-[10px] text-muted-foreground">
                            {formatLabel(item.phase)}
                          </Badge>
                          {item.kind !== "agent" && (
                            <Badge variant="outline" className="shrink-0 border-border bg-muted/50 text-[10px] text-muted-foreground">
                              {item.kind === "event" ? "event" : item.kind === "ai_trace" ? "trace" : "step"}
                            </Badge>
                          )}
                          {traceOperation && (
                            <Badge variant="outline" className="shrink-0 border-border bg-muted/50 text-[10px] text-muted-foreground">
                              {traceOperation}
                            </Badge>
                          )}
                          {item.runtimeSummary && (
                            <Badge variant="outline" className="shrink-0 border-border bg-muted/50 text-[10px] text-muted-foreground">
                              {item.runtimeSummary}
                            </Badge>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {isTrace && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.trace) setSelectedTrace(item.trace);
                              }}
                            >
                              <Eye className="inline h-3.5 w-3.5 mr-0.5" />
                              Trace
                            </button>
                          )}
                          <Badge variant="outline" className={cn("text-[10px]", isEvent ? EVENT_BADGE_CLASS[item.event!.event] : statusClass(displayStatus))}>
                            {isEvent ? eventVerb(item.event!.event) : displayStatus}
                          </Badge>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatTime(item.timestamp)}
                          </span>
                        </div>
                      </div>

                      {item.error && (
                        <p className={cn(
                          "mt-1 truncate text-xs",
                          item.tone === "danger"
                            ? "text-destructive"
                            : item.tone === "warning"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-muted-foreground",
                        )}>
                          {item.error}
                        </p>
                      )}

                      {isAgent && item.agent && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {isFallbackAgent(item.agent.data) && (
                            <span className="text-xs text-amber-700 dark:text-amber-300">
                              Fallback:{" "}
                              {formatFallbackReasonWithLegacyLabel(
                                item.agent.data.fallbackReason,
                              )}
                            </span>
                          )}
                          {(item.agent.data.retryCount ?? 0) > 0 && (
                            <Badge variant="outline" className={cn(RETRIED_BADGE_CLASS, "text-[10px]")}>
                              retried {item.agent.data.retryCount}
                            </Badge>
                          )}
                          {isTrackedAgent && (
                            <Badge variant="outline" className="bg-sky-500/10 text-sky-700 border-sky-500/30 text-[10px] dark:text-sky-300">
                              targeted retry
                            </Badge>
                          )}
                          {canRetry && item.agent && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="ml-auto h-6 gap-1 px-2 text-[10px]"
                              disabled={retryingAgentKey === `${item.agent.phase}:${item.agent.key}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const agent = item.agent!;
                                const actionKey = `${agent.phase}:${agent.key}`;
                                setRetryingAgentKey(actionKey);
                                try {
                                  await onRetryAgent!(
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
                              {retryingAgentKey === `${item.agent.phase}:${item.agent.key}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Retry
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
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
          <DialogContent className="flex h-[90vh] w-[min(96vw,90rem)] max-w-none flex-col overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b px-6 py-4">
              <DialogTitle>
                {selectedTrace
                  ? `${formatLabel(selectedTrace.stepKey || selectedTrace.agentKey)} · ${formatLabel(String(selectedTrace.phase))} ${isPhaseStepTrace(selectedTrace) ? "Step" : "Agent"} Trace`
                  : "Trace"}
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="space-y-4 pt-4">
                {selectedTrace?.status === "fallback" && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    Fallback reason:{" "}
                    {formatFallbackReasonWithLegacyLabel(
                      selectedTrace.fallbackReason,
                    )}
                    {selectedTrace.rawProviderError ? (
                      <>
                        {" "}
                        | Raw provider error: {selectedTrace.rawProviderError}
                      </>
                    ) : null}
                  </div>
                )}
                {selectedTraceWarning && selectedTrace?.status !== "fallback" && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    Warning: {selectedTraceWarning}
                  </div>
                )}
                {selectedTraceRuntimeSummary && (
                  <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
                    Runtime model config: {selectedTraceRuntimeSummary}
                  </div>
                )}
                <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
                  <div className="flex min-h-0 flex-col space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Input</p>
                    <TraceInputPanel
                      trace={selectedTrace}
                      className="min-h-0 flex-1"
                      contentClassName="h-[calc(90vh-14rem)] max-h-none"
                    />
                  </div>
                  <div className="flex min-h-0 flex-col space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Output</p>
                    <pre className="h-[calc(90vh-14rem)] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                      {toPrettyOutput(selectedTrace)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
