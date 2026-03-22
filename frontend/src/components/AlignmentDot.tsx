import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AlignmentDotProps {
  score: number | null;
  claimed?: string;
  researched?: string;
  notes?: string;
  className?: string;
}

interface AlignmentConfig {
  label: string;
  dotColor: string;
  textColor: string;
}

function getAlignmentConfig(score: number): AlignmentConfig {
  if (score >= 85) {
    return { label: "Aligned", dotColor: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-400" };
  }
  if (score >= 65) {
    return { label: "Moderate", dotColor: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400" };
  }
  if (score >= 40) {
    return { label: "Overstated", dotColor: "bg-orange-500", textColor: "text-orange-600 dark:text-orange-400" };
  }
  return { label: "Overstated", dotColor: "bg-rose-500", textColor: "text-rose-600 dark:text-rose-400" };
}

export function AlignmentDot({ score, claimed, researched, notes, className }: AlignmentDotProps) {
  if (score === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    );
  }

  const config = getAlignmentConfig(score);
  const clampedScore = Math.max(0, Math.min(100, score));

  const hasClaimed = claimed && claimed.trim() !== "";
  const hasResearched = researched && researched.trim() !== "";
  const hasNotes = notes && notes.trim() !== "" && notes.trim() !== "Not provided";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex flex-col items-center gap-0.5 cursor-help", className)}>
          {/* Track */}
          <div className="w-16 h-[1px] bg-border relative">
            {/* Dot */}
            <div
              className={cn(
                "w-2 h-2 rounded-full absolute top-1/2 -translate-y-1/2 -translate-x-1/2",
                config.dotColor,
              )}
              style={{ left: `${clampedScore}%` }}
            />
          </div>
          {/* Label */}
          <span className={cn("text-[9px] font-medium", config.textColor)}>
            {config.label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
        {hasClaimed || hasResearched ? (
          <>
            <div>
              {hasClaimed && <span>Deck: <span className="font-medium">{claimed}</span></span>}
              {hasClaimed && hasResearched && <span className="text-muted-foreground"> | </span>}
              {hasResearched && <span>Research: <span className="font-medium">{researched}</span></span>}
            </div>
            {hasNotes && (
              <div className="text-muted-foreground">{notes}</div>
            )}
          </>
        ) : hasNotes ? (
          <div>{notes}</div>
        ) : (
          <div>
            <span className="font-medium">{config.label}</span>
            <span className="text-muted-foreground ml-1">({score})</span>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
