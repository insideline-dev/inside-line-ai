// DS-E7-F3-S1 — calibration mismatch surface for the investor.
// Reads aggregate stats from /investor/calibration: how often the
// system's triage classification at decision time aligned with the
// investor's actual verdict. Closes the visible side of the loop —
// each verdict the investor records (DS-E11-F1-S1) updates these
// counts, making the platform's calibration audit-able.
//
// Hidden when the investor has fewer than MIN_DECISIONS verdicts on
// file — small samples are too noisy to surface as a stat.

import { useInvestorControllerGetCalibration } from "@/api/generated/investor/investor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GaugeCircle, AlertCircle, ThumbsUp, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalibrationStats {
  totalDecisions: number;
  decisionsWithTriage: number;
  aligned: number;
  falsePositive: number;
  falseNegative: number;
  softMismatch: number;
  alignmentRate: number | null;
}

function unwrap<T>(payload: unknown): T | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>)
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T | undefined;
}

const MIN_DECISIONS = 3;

function rateLabel(rate: number | null): string {
  if (rate === null) return "no data yet";
  return `${Math.round(rate * 100)}% aligned`;
}

function rateTone(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 0.75) return "text-emerald-700";
  if (rate >= 0.5) return "text-amber-700";
  return "text-rose-700";
}

interface CalibrationCardProps {
  className?: string;
}

export function CalibrationCard({ className }: CalibrationCardProps) {
  const { data, isLoading } = useInvestorControllerGetCalibration({
    query: {
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });

  const stats = unwrap<CalibrationStats>(data) ?? null;

  // Hide entirely while loading OR until we have meaningful sample size.
  if (isLoading || !stats || stats.decisionsWithTriage < MIN_DECISIONS) {
    return null;
  }

  return (
    <Card className={className} data-testid="calibration-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GaugeCircle className="h-4 w-4" />
          Calibration
          <span className={cn("ml-auto text-xs font-normal", rateTone(stats.alignmentRate))}>
            {rateLabel(stats.alignmentRate)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          How the system's triage compared with your actual verdicts on{" "}
          {stats.decisionsWithTriage} of {stats.totalDecisions} deals.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            icon={<ThumbsUp className="h-3.5 w-3.5" />}
            label="Aligned"
            value={stats.aligned}
            tone="good"
          />
          <Stat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="False positive"
            value={stats.falsePositive}
            tone="bad"
            hint="Model said advance, you passed"
          />
          <Stat
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            label="False negative"
            value={stats.falseNegative}
            tone="bad"
            hint="Model said reject, you advanced"
          />
          <Stat
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            label="Soft mismatch"
            value={stats.softMismatch}
            tone="warn"
            hint="Model hedged (review), you didn't"
          />
        </div>
      </CardContent>
    </Card>
  );
}

const TONE_CLASSES: Record<"good" | "bad" | "warn", string> = {
  good: "border-emerald-300/60 bg-emerald-50 text-emerald-900",
  bad: "border-rose-300/60 bg-rose-50 text-rose-900",
  warn: "border-amber-300/60 bg-amber-50 text-amber-900",
};

function Stat({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "good" | "bad" | "warn";
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-md border px-2.5 py-2",
        TONE_CLASSES[tone],
      )}
      title={hint}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
