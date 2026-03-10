import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

export function normalizeConfidence(value: unknown): ConfidenceLevel | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "mid") return "medium";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";
  if (normalized === "unknown" || normalized === "n/a") return "unknown";

  return null;
}

function confidenceClassName(confidence: ConfidenceLevel): string {
  if (confidence === "high") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (confidence === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (confidence === "low") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

interface ConfidenceBadgeProps {
  confidence: unknown;
  className?: string;
  dataTestId?: string;
}

export function ConfidenceBadge({
  confidence,
  className,
  dataTestId,
}: ConfidenceBadgeProps) {
  const normalized = normalizeConfidence(confidence);
  if (!normalized) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide",
        confidenceClassName(normalized),
        className,
      )}
      data-testid={dataTestId}
    >
      {normalized} confidence
    </Badge>
  );
}
