import { cn } from "@/lib/utils";

interface ScoreRingProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
  className?: string;
  variant?: "default" | "secondary";
}

export function ScoreRing({ score, size = "md", showLabel = true, label, className, variant = "default" }: ScoreRingProps) {
  const sizes = {
    sm: { width: 48, strokeWidth: 4, textSize: "text-sm" },
    md: { width: 80, strokeWidth: 6, textSize: "text-xl" },
    lg: { width: 120, strokeWidth: 8, textSize: "text-3xl" },
  };

  const { width, strokeWidth, textSize } = sizes[size];
  const radius = (width - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getScoreColor = (score: number) => {
    if (variant === "secondary") {
      if (score >= 80) return "stroke-indigo-500";
      if (score >= 60) return "stroke-indigo-400";
      if (score >= 40) return "stroke-indigo-300";
      return "stroke-muted-foreground";
    }
    if (score >= 80) return "stroke-chart-2";
    if (score >= 60) return "stroke-chart-1";
    if (score >= 40) return "stroke-chart-4";
    return "stroke-destructive";
  };

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width, height: width }}>
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${width} ${width}`}>
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            className="stroke-muted"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            className={cn("transition-all duration-500", getScoreColor(score))}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-semibold", textSize)}>{Math.round(score)}</span>
        </div>
      </div>
      {showLabel && label && (
        <span className="text-xs text-muted-foreground text-center">{label}</span>
      )}
    </div>
  );
}
