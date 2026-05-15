import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FitAxis, FitStatus, ThesisFitOutput } from "@/types/thesis-fit";

interface FitChipsProps {
  fit: ThesisFitOutput | null | undefined;
  className?: string;
}

const AXIS_LABEL: Record<keyof Omit<ThesisFitOutput, "overall" | "rationale">, string> = {
  geography: "geo",
  stage: "stage",
  sector: "sector",
  checkSize: "check",
};

const STATUS_STYLES: Record<FitStatus, { icon: React.ElementType; color: string }> = {
  match: { icon: CheckCircle2, color: "text-emerald-600" },
  borderline: { icon: AlertCircle, color: "text-amber-600" },
  mismatch: { icon: XCircle, color: "text-red-600" },
};

function Chip({ label, axis }: { label: string; axis: FitAxis }) {
  const { icon: Icon, color } = STATUS_STYLES[axis.status];
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-xs",
              color,
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px]">
          <span className="font-medium capitalize">{axis.status}: </span>
          {axis.note}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function FitChips({ fit, className }: FitChipsProps) {
  if (!fit) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        fit pending…
      </span>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {(Object.keys(AXIS_LABEL) as Array<keyof typeof AXIS_LABEL>).map((axisKey) => (
        <Chip key={axisKey} label={AXIS_LABEL[axisKey]} axis={fit[axisKey]} />
      ))}
      <span className="ml-1 text-xs font-medium text-muted-foreground">
        {fit.overall}
      </span>
    </div>
  );
}
