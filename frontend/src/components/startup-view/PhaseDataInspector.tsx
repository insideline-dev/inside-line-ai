import { useState } from "react";
import { ChevronRight, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  PIPELINE_PHASE_ORDER,
  type PipelinePhaseProgress,
} from "@/types/pipeline-progress";

interface PhaseDataInspectorProps {
  phaseResults: Record<string, unknown> | undefined;
  phases: Record<string, PipelinePhaseProgress> | undefined;
}

const PHASE_LABELS: Record<string, string> = {
  extraction: "Extraction",
  enrichment: "Gap Fill",
  scraping: "Scraping",
  research: "Research",
  evaluation: "Evaluation",
  synthesis: "Synthesis",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  completed:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  running:
    "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  pending: "bg-muted text-muted-foreground border-border",
};

/** Keys with potentially huge text values that should be hidden by default */
const LARGE_TEXT_KEYS = new Set(["rawText", "fullText", "pageTexts", "htmlContent", "markdownContent"]);

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Filters out large text fields from a result object,
 * returning the filtered data and the count of hidden fields.
 */
function filterLargeFields(
  data: Record<string, unknown>,
): { filtered: Record<string, unknown>; hiddenKeys: string[] } {
  const hiddenKeys: string[] = [];
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (LARGE_TEXT_KEYS.has(key) && typeof value === "string" && value.length > 500) {
      hiddenKeys.push(key);
    } else {
      filtered[key] = value;
    }
  }
  return { filtered, hiddenKeys };
}

function PhaseCard({
  phase,
  status,
  data,
}: {
  phase: string;
  status: string;
  data: unknown;
}) {
  const [showRawText, setShowRawText] = useState(false);
  const hasData = data !== undefined && data !== null;
  const isObject = hasData && typeof data === "object" && !Array.isArray(data);
  const { filtered, hiddenKeys } = isObject
    ? filterLargeFields(data as Record<string, unknown>)
    : { filtered: data as Record<string, unknown>, hiddenKeys: [] };

  return (
    <Collapsible>
      <CollapsibleTrigger
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
          !hasData ? "opacity-50" : ""
        }`}
        disabled={!hasData}
      >
        <div className="flex items-center gap-2">
          <ChevronRight className="h-4 w-4 shrink-0 transition-transform [[data-state=open]>&]:rotate-90" />
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {PHASE_LABELS[phase] ?? phase}
          </span>
        </div>
        <Badge
          variant="outline"
          className={STATUS_BADGE_CLASS[status] ?? STATUS_BADGE_CLASS.pending}
        >
          {hasData ? status : "no data"}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-lg border bg-muted/20 p-3">
          <pre className="max-h-[400px] overflow-auto text-xs leading-relaxed whitespace-pre-wrap">
            {toPrettyJson(filtered)}
          </pre>
          {hiddenKeys.length > 0 && (
            <div className="mt-2 border-t pt-2">
              <button
                type="button"
                onClick={() => setShowRawText((prev) => !prev)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {showRawText
                  ? `Hide large fields (${hiddenKeys.join(", ")})`
                  : `Show ${hiddenKeys.length} hidden large field(s): ${hiddenKeys.join(", ")}`}
              </button>
              {showRawText && (
                <pre className="mt-2 max-h-[300px] overflow-auto text-xs leading-relaxed whitespace-pre-wrap opacity-70">
                  {toPrettyJson(
                    Object.fromEntries(
                      hiddenKeys.map((key) => [
                        key,
                        (data as Record<string, unknown>)[key],
                      ]),
                    ),
                  )}
                </pre>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PhaseDataInspector({
  phaseResults,
  phases,
}: PhaseDataInspectorProps) {
  if (!phaseResults || Object.keys(phaseResults).length === 0) {
    return null;
  }

  const phaseKeys = Array.from(
    new Set([...PIPELINE_PHASE_ORDER, ...Object.keys(phaseResults)]),
  );

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Phase Data Inspector</h3>
      <div className="space-y-1.5">
        {phaseKeys.map((phase) => {
          const data = phaseResults[phase];
          const phaseStatus = phases?.[phase]?.status ?? "pending";
          return (
            <PhaseCard
              key={phase}
              phase={phase}
              status={phaseStatus}
              data={data}
            />
          );
        })}
      </div>
    </div>
  );
}
