import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { MarkdownText } from "@/components/MarkdownText";

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
      className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background"
      data-testid={dataTestId}
    >
      <CardContent className="p-4 sm:p-5">
        {/* Row 1: Confidence badge */}
        <div className="mb-2">
          <ConfidenceBadge
            confidence={confidence}
            dataTestId={confidenceTestId}
          />
        </div>

        {/* Row 2: Title + Score */}
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {weight !== undefined && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {weight}% weight in overall evaluation
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <span
              className={`text-3xl font-bold tabular-nums ${scoreColor(roundedScore)}`}
              data-testid={scoreTestId}
            >
              {roundedScore}
            </span>
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
        </div>

        {/* Row 3: Scoring basis */}
        {scoringBasis && (
          <MarkdownText className="mt-2 text-xs text-muted-foreground leading-relaxed [&>p]:mb-0">
            {scoringBasis}
          </MarkdownText>
        )}

        {/* Row 4: Sub-scores in 2-col grid */}
        {subScores && subScores.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            {subScores.map((item) => {
              const pct = formatWeight(item.weight);
              const itemScore = Math.round(Math.max(0, Math.min(100, item.score)));
              return (
                <div key={item.dimension}>
                  <div className="flex items-baseline justify-between gap-1 text-xs">
                    <span className="font-medium truncate">
                      {item.dimension}{" "}
                      <span className="text-muted-foreground font-normal">{pct}</span>
                    </span>
                    <span className={`font-semibold tabular-nums shrink-0 ${scoreColor(itemScore)}`}>
                      {itemScore}
                      <span className="text-muted-foreground font-normal">/100</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(itemScore)}`}
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
