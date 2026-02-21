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
  const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const radius = (width - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalizedScore / 100) * circumference;

  const getScoreColor = (scoreValue: number) => {
    if (variant === "secondary") {
      if (scoreValue >= 80) return "var(--color-primary)";
      if (scoreValue >= 60) return "#818cf8";
      if (scoreValue >= 40) return "#a5b4fc";
      return "var(--color-muted-foreground)";
    }
    if (scoreValue >= 80) return "hsl(142 72% 32%)";
    if (scoreValue >= 60) return "var(--color-primary)";
    if (scoreValue >= 40) return "hsl(38 92% 50%)";
    return "var(--color-destructive)";
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
            className="transition-all duration-500"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ stroke: getScoreColor(normalizedScore) }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-semibold", textSize)}>{Math.ceil(normalizedScore)}</span>
        </div>
      </div>
      {showLabel && label && (
        <span className="text-xs text-muted-foreground text-center">{label}</span>
      )}
    </div>
  );
}
