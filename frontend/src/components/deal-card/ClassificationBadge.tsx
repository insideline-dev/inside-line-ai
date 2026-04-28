import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Eye, XCircle } from "lucide-react";
import type { TriageClassification } from "@/lib/screening/useTriageDecision";

interface ClassificationBadgeProps {
  classification: TriageClassification;
  className?: string;
  size?: "sm" | "md";
}

const CONFIG: Record<
  TriageClassification,
  { label: string; icon: typeof CheckCircle2; tone: string }
> = {
  advance: {
    label: "Advance",
    icon: CheckCircle2,
    tone: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800",
  },
  review: {
    label: "Review",
    icon: Eye,
    tone: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",
  },
  reject: {
    label: "Reject",
    icon: XCircle,
    tone: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800",
  },
};

export function ClassificationBadge({
  classification,
  className,
  size = "md",
}: ClassificationBadgeProps) {
  const cfg = CONFIG[classification];
  const Icon = cfg.icon;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border font-semibold uppercase tracking-wide",
        size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10px]",
        cfg.tone,
        className,
      )}
      data-testid={`classification-${classification}`}
    >
      <Icon className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      {cfg.label}
    </Badge>
  );
}
