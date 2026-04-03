import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { MarkdownText } from "@/components/MarkdownText";
import { cn } from "@/lib/utils";

interface SubScoreItem {
  dimension: string;
  weight: number;
  score: number;
}

interface SectionScoreCardProps {
  title: string;
  score: number;
  weight?: number;
  confidence?: string;
  scoringBasis?: string;
  subScores?: SubScoreItem[];
  dataTestId?: string;
  scoreTestId?: string;
  confidenceTestId?: string;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 65) return "text-green-500 dark:text-green-400";
  if (score >= 51) return "text-orange-500 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

function barColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 73) return "bg-green-500";
  if (score >= 65) return "bg-green-400";
  if (score >= 51) return "bg-orange-400";
  return "bg-rose-500";
}

function formatWeight(value: number): string {
  const pct = value <= 1 ? value * 100 : value;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/** Returns a subtle border-left accent color based on score tier */
function borderAccent(score: number): string {
  if (score >= 80)
    return "border-l-emerald-500/40 dark:border-l-emerald-400/30";
  if (score >= 65)
    return "border-l-green-400/40 dark:border-l-green-400/30";
  if (score >= 51)
    return "border-l-orange-400/40 dark:border-l-orange-400/30";
  return "border-l-rose-500/40 dark:border-l-rose-400/30";
}

/** Returns a subtle bar shadow color for depth */
function barShadow(score: number): string {
  if (score >= 80) return "shadow-[0_0_6px_rgba(16,185,129,0.3)]";
  if (score >= 65) return "shadow-[0_0_6px_rgba(74,222,128,0.25)]";
  if (score >= 51) return "shadow-[0_0_6px_rgba(251,146,60,0.25)]";
  return "shadow-[0_0_6px_rgba(244,63,94,0.25)]";
}

function ScoreNumber({
  score,
  testId,
}: {
  score: number;
  testId?: string;
}) {
  return (
    <div className="flex items-baseline gap-0.5 shrink-0">
      <span
        className={cn("text-3xl font-bold tabular-nums tracking-tight", scoreColor(score))}
        data-testid={testId}
      >
        {score}
      </span>
      <span className="text-sm text-muted-foreground tabular-nums">/100</span>
    </div>
  );
}

export function SectionScoreCard({
  title,
  score,
  weight,
  confidence = "unknown",
  scoringBasis,
  subScores,
  dataTestId,
  scoreTestId,
  confidenceTestId,
}: SectionScoreCardProps) {
  const roundedScore = Math.round(score);

  return (
    <Card
      className={cn(
        "border-l-[3px] bg-gradient-to-br from-primary/[0.03] via-background to-background",
        borderAccent(roundedScore),
      )}
      data-testid={dataTestId}
    >
      <CardContent className="p-5 sm:p-6">
        {/* Row 1: Confidence badge */}
        <div className="mb-3">
          <ConfidenceBadge
            confidence={confidence}
            dataTestId={confidenceTestId}
          />
        </div>

        {/* Row 2: Title + Score ring */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-balance text-base font-bold tracking-tight">
              {title}
            </h3>
            {weight !== undefined && (
              <p className="mt-1 text-xs text-muted-foreground">
                {weight}% weight in overall evaluation
              </p>
            )}
          </div>
          <ScoreNumber score={roundedScore} testId={scoreTestId} />
        </div>

        {/* Row 3: Scoring basis */}
        {scoringBasis && (
          <div className="mt-4 rounded-lg bg-muted/50 px-3.5 py-2.5 dark:bg-muted/30">
            <MarkdownText className="text-pretty text-sm leading-relaxed text-muted-foreground [&>p]:mb-0">
              {scoringBasis}
            </MarkdownText>
          </div>
        )}

        {/* Row 4: Sub-scores in 2-col grid */}
        {subScores && subScores.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
            {subScores.map((item) => {
              const pct = formatWeight(item.weight);
              const itemScore = Math.round(
                Math.max(0, Math.min(100, item.score)),
              );
              return (
                <div key={item.dimension}>
                  <div className="flex items-baseline justify-between gap-1.5 text-xs">
                    <span className="truncate font-medium">
                      <MarkdownText className="inline [&>p]:inline [&>p]:mb-0" inline>{item.dimension}</MarkdownText>{" "}
                      <span className="font-normal text-muted-foreground">
                        {pct}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums font-semibold",
                        scoreColor(itemScore),
                      )}
                    >
                      {itemScore}
                      <span className="font-normal text-muted-foreground">
                        /100
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/70 dark:bg-muted/50">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        barColor(itemScore),
                        barShadow(itemScore),
                      )}
                      style={{ width: `${itemScore}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
