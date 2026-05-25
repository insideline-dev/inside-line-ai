// DS-E8-F1-S2 — partner-facing activity timeline. Reads append-only
// events from GET /startups/:id/events and renders a vertical timeline
// of deal-level milestones (intake, screening, triage, investor
// verdicts, etc.). Latest first.
//
// Event payloads vary by type (typed in `formatEvent` below). Unknown
// types fall back to a generic "<type>" label so adding a new event
// type on the backend doesn't break this view — it just shows up
// without a custom icon/copy until someone updates this map.

import { useStartupControllerGetEvents } from "@/api/generated/startups/startups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  CircleHelp,
  CircleSlash,
  History,
  MessageSquare,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface DealEvent {
  id: string;
  startupId: string;
  actorUserId?: string | null;
  type: string;
  payload?: Record<string, unknown> | null;
  occurredAt: string;
}

function unwrap<T>(payload: unknown): T | undefined {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T | undefined;
}

interface FormattedEvent {
  icon: ReactNode;
  label: string;
  detail?: string;
  tone: "default" | "good" | "bad" | "warn" | "neutral";
}

const TONE_CLASSES: Record<FormattedEvent["tone"], string> = {
  default: "border-muted-foreground/30 bg-muted text-muted-foreground",
  good: "border-emerald-500/40 bg-emerald-50 text-emerald-700",
  bad: "border-rose-500/40 bg-rose-50 text-rose-700",
  warn: "border-amber-400/60 bg-amber-50 text-amber-800",
  neutral: "border-sky-400/40 bg-sky-50 text-sky-700",
};

function readString(p: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const v = p?.[key];
  return typeof v === "string" ? v : undefined;
}

function readNumber(p: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const v = p?.[key];
  return typeof v === "number" ? v : undefined;
}

function readArray<T>(p: Record<string, unknown> | null | undefined, key: string): T[] {
  const v = p?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function readRecord(
  p: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const v = p?.[key];
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function formatEvent(event: DealEvent): FormattedEvent {
  const p = event.payload;
  switch (event.type) {
    case "startup.submitted":
      return {
        icon: <Activity className="h-3.5 w-3.5" />,
        label: "Deal submitted",
        tone: "neutral",
      };
    case "startup.approved":
      return {
        icon: <ShieldCheck className="h-3.5 w-3.5" />,
        label: "Approved by admin",
        detail: readString(p, "actorRole"),
        tone: "good",
      };
    case "startup.rejected":
      return {
        icon: <XCircle className="h-3.5 w-3.5" />,
        label: "Rejected",
        detail: readString(p, "reason"),
        tone: "bad",
      };
    case "screening.completed":
      return {
        icon: <Sparkles className="h-3.5 w-3.5" />,
        label: "Screening lenses ran",
        detail: `${readNumber(p, "lensCount") ?? 0} lens results`,
        tone: "neutral",
      };
    case "screening.failed": {
      const failed = readArray<string>(p, "failedKeys");
      return {
        icon: <CircleSlash className="h-3.5 w-3.5" />,
        label: "Screening had failures",
        detail:
          failed.length > 0
            ? `failed: ${failed.join(", ")}`
            : undefined,
        tone: "warn",
      };
    }
    case "triage.decided": {
      const cls = readString(p, "classification");
      const score = readNumber(p, "overallScore");
      const reasons = readArray<string>(p, "reasonCodes");
      return {
        icon: <TrendingUp className="h-3.5 w-3.5" />,
        label: `Triage: ${cls ?? "decided"}${score != null ? ` @ ${score}` : ""}`,
        detail: reasons.length > 0 ? reasons.join(" • ") : undefined,
        tone:
          cls === "advance" ? "good" : cls === "reject" ? "bad" : "warn",
      };
    }
    case "decision.recorded": {
      const verdict = readString(p, "verdict");
      const tags = readArray<string>(p, "reasonTags");
      const calibration = readRecord(p, "calibration");
      const mismatchType = readString(calibration, "mismatchType");
      const calibrationReasons = readArray<string>(calibration, "reasonTags");
      const calibrationDetail =
        mismatchType && mismatchType !== "aligned"
          ? `${mismatchType.replace(/_/g, " ")} · ${readString(calibration, "modelVerdict") ?? "model"} → ${readString(calibration, "investorVerdict") ?? verdict ?? "recorded"}`
          : undefined;
      const detail =
        calibrationDetail ?? (tags.length > 0 ? tags.join(", ") : undefined);
      const tone =
        mismatchType === "soft_mismatch"
          ? "warn"
          : mismatchType && mismatchType !== "aligned"
            ? "bad"
            : verdict === "advance"
              ? "good"
              : verdict === "pass"
                ? "bad"
                : "warn";
      const reasons = calibrationReasons.length > 0 ? calibrationReasons : tags;
      return {
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        label: `Investor decision: ${verdict ?? "recorded"}`,
        detail: reasons.length > 0 && detail ? `${detail} · ${reasons.join(", ")}` : detail ?? (reasons.length > 0 ? reasons.join(", ") : undefined),
        tone,
      };
    }
    case "comment.added":
      return {
        icon: <MessageSquare className="h-3.5 w-3.5" />,
        label: "Comment added",
        detail: readString(p, "snippet"),
        tone: "default",
      };
    case "open_questions.seeded":
      return {
        icon: <CircleHelp className="h-3.5 w-3.5" />,
        label: "Open questions seeded",
        detail: `${readNumber(p, "count") ?? 0} items`,
        tone: "neutral",
      };
    case "agent.refresh":
      return {
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        label: "Agent refresh",
        detail: readString(p, "trigger"),
        tone: "neutral",
      };
    case "due_diligence.started":
      return {
        icon: <Activity className="h-3.5 w-3.5" />,
        label: "Due diligence started",
        detail: readString(p, "trigger") ?? readString(p, "path"),
        tone: "neutral",
      };
    case "due_diligence.completed":
      return {
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        label: "Due diligence completed",
        detail:
          readNumber(p, "overallScore") != null
            ? `overall score ${readNumber(p, "overallScore")}`
            : readString(p, "warningMessage"),
        tone: readString(p, "warningMessage") ? "warn" : "good",
      };
    case "calibration.delta_checked": {
      const count = readNumber(p, "materialDeltaCount") ?? 0;
      const lenses = readArray<string>(p, "lensKeys");
      return {
        icon: <TrendingUp className="h-3.5 w-3.5" />,
        label: "Calibration delta check",
        detail:
          lenses.length > 0
            ? `${count} material delta${count === 1 ? "" : "s"} · ${lenses.join(", ")}`
            : `${count} material delta${count === 1 ? "" : "s"}`,
        tone: count > 0 ? "warn" : "neutral",
      };
    }
    case "thesis.regenerated":
      return {
        icon: <Pencil className="h-3.5 w-3.5" />,
        label: "Thesis regenerated",
        detail: readString(p, "source"),
        tone: "default",
      };
    case "matching.completed": {
      const matches = readNumber(p, "matchesFound") ?? 0;
      const candidates = readNumber(p, "candidatesEvaluated") ?? 0;
      const trigger = readString(p, "triggerSource")?.replace(/_/g, " ");
      return {
        icon: <Target className="h-3.5 w-3.5" />,
        label: "Investor matching completed",
        detail: `${matches}/${candidates} matched${trigger ? ` · ${trigger}` : ""}`,
        tone: matches > 0 ? "good" : "neutral",
      };
    }
    case "matching.failed":
      return {
        icon: <XCircle className="h-3.5 w-3.5" />,
        label: "Investor matching failed",
        detail: readString(p, "triggerSource")?.replace(/_/g, " "),
        tone: "bad",
      };
    case "stage.changed": {
      const to = readString(p, "to");
      const from = readString(p, "from");
      const reason = readString(p, "passReason");
      return {
        icon: <ArrowRightLeft className="h-3.5 w-3.5" />,
        label: `Stage: ${from ?? "–"} → ${to ?? "–"}`,
        detail: reason,
        tone: to === "passed" || to === "closed" ? "bad" : to === "engaged" ? "good" : "neutral",
      };
    }
    case "founder.replied":
      return {
        icon: <MessageSquare className="h-3.5 w-3.5" />,
        label: "Founder replied",
        detail: readString(p, "channel"),
        tone: "neutral",
      };
    default:
      return {
        icon: <Check className="h-3.5 w-3.5" />,
        label: event.type,
        tone: "default",
      };
  }
}

interface DealActivityTimelineProps {
  startupId: string;
  className?: string;
  limit?: number;
}

export function DealActivityTimeline({
  startupId,
  className,
  limit,
}: DealActivityTimelineProps) {
  const { data, isLoading, isError } = useStartupControllerGetEvents(
    startupId,
    {
      query: {
        retry: false,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        enabled: Boolean(startupId),
      },
    },
  );

  const events = (unwrap<DealEvent[]>(data) ?? []).slice(0, limit);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Activity
          {events.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({events.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">
            Couldn't load activity.
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity yet. Events appear here as the deal progresses.
          </p>
        ) : (
          <ol
            className="relative ml-2 space-y-3 border-l border-border pl-4"
            data-testid="deal-activity-timeline"
          >
            {events.map((event) => {
              const f = formatEvent(event);
              const occurred = new Date(event.occurredAt);
              return (
                <li key={event.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[1.625rem] top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border bg-background",
                      TONE_CLASSES[f.tone],
                    )}
                  >
                    {f.icon}
                  </span>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                      <span className="font-medium">{f.label}</span>
                      {f.detail && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal"
                        >
                          {f.detail}
                        </Badge>
                      )}
                    </div>
                    <time
                      dateTime={event.occurredAt}
                      className="text-[11px] text-muted-foreground"
                      title={format(occurred, "MMM d, yyyy h:mm a")}
                    >
                      {formatDistanceToNow(occurred, { addSuffix: true })}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
