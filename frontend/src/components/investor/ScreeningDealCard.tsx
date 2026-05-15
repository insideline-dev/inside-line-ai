import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Check, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { FitChips } from "./FitChips";
import { cn } from "@/lib/utils";
import type { ThesisFitOutput } from "@/types/thesis-fit";
import type {
  LensScore,
  ScreeningVerdict,
} from "./ScreeningDetailModal";

export interface ScreeningDealCardData {
  id: string;
  companyName: string;
  industry?: string | null;
  stage?: string | null;
  verdict: ScreeningVerdict;
  overallScore?: number | null;
  fit: ThesisFitOutput | null;
  lensScores: LensScore[];
  submittedAt: string;
  dealbreakerNote?: string | null;
  isAutoAdvanced?: boolean;
}

interface ScreeningDealCardProps {
  data: ScreeningDealCardData;
  onOpen: (id: string) => void;
  onPass?: (id: string) => void;
  onAdvance?: (id: string) => void;
  className?: string;
}

const VERDICT_BADGE: Record<
  ScreeningVerdict,
  { label: string; className: string }
> = {
  review: {
    label: "REVIEW",
    className: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  },
  advance: {
    label: "ADVANCE",
    className: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  },
  reject: {
    label: "REJECT",
    className: "bg-red-100 text-red-900 hover:bg-red-100",
  },
};

const LENS_LABELS = ["market", "team", "traction"] as const;

function fitTone(score: number): { bg: string; text: string; ring: string } {
  if (score >= 80) return { bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-300" };
  if (score >= 60) return { bg: "bg-sky-100", text: "text-sky-800", ring: "ring-sky-300" };
  if (score >= 40) return { bg: "bg-amber-100", text: "text-amber-800", ring: "ring-amber-300" };
  return { bg: "bg-red-100", text: "text-red-800", ring: "ring-red-300" };
}

export function ScreeningDealCard({
  data,
  onOpen,
  onPass,
  onAdvance,
  className,
}: ScreeningDealCardProps) {
  const verdictCfg = VERDICT_BADGE[data.verdict];
  const lensByKey = new Map(data.lensScores.map((l) => [l.key, l]));

  return (
    <Card
      className={cn("overflow-hidden", className)}
      data-testid={`screening-card-${data.id}`}
    >
      <CardContent className="flex flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar className="h-12 w-12 shrink-0 rounded-lg border bg-muted/40">
              <AvatarFallback className="rounded-lg text-base font-semibold">
                {data.companyName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold leading-tight">
                {data.companyName}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {data.industry && (
                  <Badge
                    variant="secondary"
                    className="capitalize text-[11px]"
                  >
                    {data.industry.replace(/_/g, " ")}
                  </Badge>
                )}
                {data.stage && (
                  <Badge variant="outline" className="capitalize text-[11px]">
                    {data.stage.replace(/_/g, " ")}
                  </Badge>
                )}
                {data.isAutoAdvanced && (
                  <span className="text-[10px] italic text-emerald-700">
                    auto-advanced
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <Badge variant="secondary" className={verdictCfg.className}>
              {verdictCfg.label}
            </Badge>
          </div>
        </div>

        {/* Lens scores grid — ring + number tinted by score (red/amber/green) */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-3">
          {LENS_LABELS.map((key) => {
            const lens = lensByKey.get(key);
            return (
              <div
                key={key}
                className="flex flex-col items-center gap-1 rounded-md p-1"
                data-testid={`screening-card-lens-${key}`}
              >
                {lens ? (
                  <ScoreRing
                    score={lens.score}
                    size="sm"
                    showLabel={false}
                    colorText
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 text-[10px] text-muted-foreground">
                    —
                  </div>
                )}
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {key}
                </span>
              </div>
            );
          })}
        </div>

        {/* Thesis-fit — overall score highlighted, chips below */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/15 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Thesis fit
            </span>
            {data.fit ? (
              (() => {
                const tone = fitTone(data.fit.overall);
                return (
                  <div
                    className={cn(
                      "inline-flex items-baseline gap-1 rounded-full px-3 py-1 ring-1",
                      tone.bg,
                      tone.text,
                      tone.ring,
                    )}
                    data-testid="screening-card-fit-score"
                  >
                    <span className="text-lg font-bold leading-none">
                      {data.fit.overall}
                    </span>
                    <span className="text-[10px] font-medium leading-none opacity-80">
                      / 100
                    </span>
                  </div>
                );
              })()
            ) : (
              <span className="text-[10px] text-muted-foreground">pending</span>
            )}
          </div>
          <FitChips fit={data.fit} />
        </div>

        {data.dealbreakerNote && (
          <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            {data.dealbreakerNote}
          </div>
        )}

        {/* Footer: time + actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(data.submittedAt), {
              addSuffix: true,
            })}
          </span>
          <div className="flex items-center gap-1.5">
            {data.verdict === "review" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPass?.(data.id);
                  }}
                  data-testid={`screening-card-pass-${data.id}`}
                  aria-label="Pass on this deal"
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Pass
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdvance?.(data.id);
                  }}
                  data-testid={`screening-card-advance-${data.id}`}
                  aria-label="Advance to Due Diligence"
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Advance
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpen(data.id)}
              data-testid={`screening-card-open-${data.id}`}
            >
              Open
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
