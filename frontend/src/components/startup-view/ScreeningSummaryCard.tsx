import { useMemo } from "react";
import { AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ClassificationBadge } from "@/components/deal-card/ClassificationBadge";
import { summarizeReasonCodes, labelForReasonCode } from "@/lib/screening/reason-codes";
import { useScreeningOutput } from "@/lib/screening/useScreeningOutput";
import { useTriageDecision } from "@/lib/screening/useTriageDecision";
import { resolveScreeningDisplayState } from "@/lib/screening/screening-state";
import type { PipelineProgressData } from "@/types/pipeline-progress";

const MISSING_MATERIAL_LABELS: Record<string, string> = {
  deck: "Pitch deck",
  product_description: "Product description",
  team: "Team info",
  deal_terms: "Deal terms",
  website: "Website",
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  continue_evaluation: "Continue evaluation",
  manual_review: "Manual review",
  request_materials: "Request materials",
  stop: "Stop",
};

const SIGNAL_BADGE_CLASS: Record<string, string> = {
  advance:
    "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800",
  review:
    "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",
  reject:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800",
};

function formatLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function signalLabel(value: string): string {
  return formatLabel(value);
}

function missingMaterialLabel(code: string): string {
  return MISSING_MATERIAL_LABELS[code] ?? formatLabel(code);
}

function nextActionLabel(action: string): string {
  return NEXT_ACTION_LABELS[action] ?? formatLabel(action);
}

function phaseStatusLabel(status: string): string {
  return formatLabel(status);
}

function LensBadge({
  lens,
}: {
  lens: { key: string; score: number; signal: string };
}) {
  const tone =
    lens.signal === "advance"
      ? "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/25 dark:text-green-100"
      : lens.signal === "review"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-100"
        : lens.signal === "reject"
          ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/25 dark:text-red-100"
          : "border-border bg-muted/40 text-foreground";

  return (
    <div className={cn("rounded-md border px-3 py-2", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">
            {formatLabel(lens.key)}
          </div>
          <div className="text-sm font-semibold">{signalLabel(lens.signal)}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums leading-none">{lens.score}</div>
          <div className="text-[11px] opacity-70">/100</div>
        </div>
      </div>
    </div>
  );
}

export function ScreeningSummaryCard({
  startupId,
  progress,
  className,
}: {
  startupId: string;
  progress?: PipelineProgressData | null;
  className?: string;
}) {
  const triageDecision = useTriageDecision(startupId);
  const screeningOutput = useScreeningOutput(startupId);

  const decision = triageDecision.data;
  const output = screeningOutput.data;
  const screeningState = resolveScreeningDisplayState(output, decision);

  const screeningSignal = screeningState.signal;
  const screeningScore = screeningState.score;
  const nextAction = screeningState.nextAction;
  const missingMaterials = screeningState.missingMaterials;
  const displayReasonCodes = screeningState.reasonCodes.filter(
    (code) => !(code === "missing_materials" && missingMaterials.length > 0),
  );
  const reasonSummary =
    displayReasonCodes.length > 0
      ? summarizeReasonCodes(displayReasonCodes, 3)
      : decision
        ? missingMaterials.length > 0
          ? `${missingMaterials.length} material${missingMaterials.length === 1 ? "" : "s"} needed before evaluation can continue.`
          : "No flags raised"
        : null;
  const lenses = useMemo(
    () => output?.lenses ?? decision?.lensSnapshot ?? [],
    [decision?.lensSnapshot, output?.lenses],
  );
  const downstreamPhases = progress
    ? [
        { key: "evaluation", label: "Evaluation", status: progress.phases?.evaluation?.status },
        { key: "synthesis", label: "Synthesis", status: progress.phases?.synthesis?.status },
      ]
    : [];
  const hasDownstreamInfo = downstreamPhases.some((phase) => Boolean(phase.status));
  const screeningPhaseStatus = progress?.phases?.screening?.status;
  const isLoading = triageDecision.isLoading || screeningOutput.isLoading;

  const signalToneClass = screeningSignal ? SIGNAL_BADGE_CLASS[screeningSignal] : "bg-muted text-muted-foreground border-border";

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Screening
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Latest screening decision, what blocked it, and what happens next.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {screeningSignal ? (
              decision ? (
                <ClassificationBadge classification={decision.classification} size="sm" />
              ) : (
                <Badge variant="outline" className={cn("gap-1.5 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", signalToneClass)}>
                  {signalLabel(screeningSignal)}
                </Badge>
              )
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Not screened yet
              </Badge>
            )}
            {typeof screeningScore === "number" && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Score {Math.round(screeningScore)}/100
              </Badge>
            )}
            {nextAction && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Next {nextActionLabel(nextAction)}
              </Badge>
            )}
            {screeningPhaseStatus && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Phase {phaseStatusLabel(screeningPhaseStatus)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && !decision && !output ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-muted/20 px-3 py-2.5">
              <div className="text-sm font-medium text-foreground">
                {screeningSignal
                  ? `${signalLabel(screeningSignal)}${nextAction ? ` · ${nextActionLabel(nextAction)}` : ""}`
                  : output
                    ? output.overall.missingMaterials.length > 0
                      ? `${output.overall.missingMaterials.length} missing material${output.overall.missingMaterials.length === 1 ? "" : "s"} need review`
                      : `${output.lenses.length} lens result${output.lenses.length === 1 ? "" : "s"} available`
                    : "No screening data available yet."}
              </div>
              {reasonSummary && (
                <div className="mt-1 text-xs text-muted-foreground">{reasonSummary}</div>
              )}
            </div>

            {missingMaterials.length > 0 && (
              <div className="rounded-md border border-sky-300/60 bg-sky-50 px-3 py-2.5 text-xs text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-100">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Missing materials
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missingMaterials.map((code) => (
                    <Badge key={code} variant="outline" className="border-sky-400 bg-white text-[10px] text-sky-900 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-100">
                      {missingMaterialLabel(code)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {displayReasonCodes.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Flags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {displayReasonCodes.map((code) => (
                    <Badge key={code} variant="outline" className="border-border bg-muted/40 text-[11px] text-muted-foreground">
                      {labelForReasonCode(code)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {lenses.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Lens scores
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {lenses.map((lens) => (
                    <LensBadge
                      key={lens.key}
                      lens={{
                        key: lens.key,
                        score: lens.score,
                        signal: lens.signal,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {hasDownstreamInfo && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Downstream</span>
                <span className="ml-2">
                  {downstreamPhases
                    .filter((phase) => phase.status)
                    .map((phase) => `${phase.label} ${phaseStatusLabel(String(phase.status))}`)
                    .join(" · ")}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
