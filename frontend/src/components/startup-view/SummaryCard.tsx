import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import {
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  Lightbulb
} from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import { roundUpScore } from "@/lib/round-score";
import {
  getDisplayOverallScore,
  getDisplayPercentileRank,
  getDisplayRisks,
  getDisplaySectionScore,
  getDisplayStrengths,
} from "@/lib/evaluation-display";

interface InvestorMemo {
  dealHighlights?: string[];
  summary?: string;
  dueDiligenceAreas?: string[];
  keyDueDiligenceAreas?: string[];
}

interface ScoringWeights {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
}

interface SummaryCardProps {
  startup: Startup;
  evaluation?: Evaluation | null;
  investorMemo?: InvestorMemo | null;
  showScores?: boolean;
  showSectionScores?: boolean;
  showRecommendation?: boolean;
  weights?: ScoringWeights | null;
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "N/A";
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

function formatStage(stage: string | null | undefined): string {
  if (!stage) return "N/A";
  const stageMap: Record<string, string> = {
    "pre_seed": "Pre-Seed",
    "seed": "Seed",
    "series_a": "Series A",
    "series_b": "Series B",
    "series_c": "Series C",
    "series_d": "Series D",
    "series_e": "Series E",
    "series_f_plus": "Series F+",
  };
  return stageMap[stage] || stage.replace("_", " ");
}

export function SummaryCard({
  startup,
  evaluation,
  investorMemo,
  showScores = true,
  showSectionScores = true,
  weights,
}: SummaryCardProps) {
  const [animateBars, setAnimateBars] = useState(false);
  const overallScore = getDisplayOverallScore(evaluation, startup.overallScore);
  const percentileRank = getDisplayPercentileRank(evaluation, startup.percentileRank);
  const strengths = getDisplayStrengths(evaluation);
  const risks = getDisplayRisks(evaluation);

  useEffect(() => {
    setAnimateBars(false);
    const frame = requestAnimationFrame(() => setAnimateBars(true));
    return () => cancelAnimationFrame(frame);
  }, [evaluation?.id, startup?.id]);

  const getSectionBarClass = (name: string, score: number) => {
    if (name === "Go-to-Market") {
      return "bg-gradient-to-r from-violet-600 to-indigo-500";
    }
    if (score < 40) {
      return "bg-gradient-to-r from-pink-600 to-rose-500";
    }
    return "bg-gradient-to-r from-orange-500 to-amber-500";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {showScores && (
              <div className="flex flex-col items-center text-center" data-testid="container-score">
                <ScoreRing score={overallScore} size="lg" />
                {percentileRank != null && (
                  <Badge variant="outline" className="mt-2" data-testid="badge-percentile">
                    Top {Math.round(100 - percentileRank)}%
                  </Badge>
                )}
              </div>
            )}
            
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 min-w-0">
              <div className="p-3 bg-muted/50 rounded-lg" data-testid="info-stage">
                <p className="text-xs text-muted-foreground mb-1">Stage</p>
                <p className="font-medium text-xs break-words">{formatStage(startup.stage)}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg" data-testid="info-sector">
                <p className="text-xs text-muted-foreground mb-1">Sector</p>
                <p className="font-medium text-xs break-words">{startup.industry || "N/A"}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg" data-testid="info-location">
                <p className="text-xs text-muted-foreground mb-1">Location</p>
                <p className="font-medium text-xs break-words">{startup.location || "N/A"}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg" data-testid="info-round-size">
                <p className="text-xs text-muted-foreground mb-1">Round Size</p>
                <p className="font-medium text-xs break-words">{formatCurrency(startup.fundingTarget)}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg" data-testid="info-valuation">
                <p className="text-xs text-muted-foreground mb-1">Valuation</p>
                <p className="font-medium text-xs break-words">{formatCurrency(startup.valuation)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {evaluation && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="bg-chart-2/5 border-chart-2/20" data-testid="card-strengths">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-chart-2">
                <CheckCircle className="w-5 h-5" />
                Key Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm" data-testid="list-strengths">
                {strengths.map((strength, i) => (
                  <li key={i} className="flex items-start gap-2" data-testid={`item-strength-${i}`}>
                    <ChevronRight className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-chart-4/5 border-chart-4/20" data-testid="card-risks">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-chart-4">
                <AlertTriangle className="w-5 h-5" />
                Key Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm" data-testid="list-risks">
                {risks.map((risk, i) => (
                  <li key={i} className="flex items-start gap-2" data-testid={`item-risk-${i}`}>
                    <ChevronRight className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {showSectionScores && evaluation && (
        <Card data-testid="card-section-scores">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              <span data-testid="text-section-scores-title">Section Scores</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: "Team", score: getDisplaySectionScore(evaluation, "team"), weight: `${weights?.team ?? 0}%` },
                { name: "Market", score: getDisplaySectionScore(evaluation, "market"), weight: `${weights?.market ?? 0}%` },
                { name: "Product", score: getDisplaySectionScore(evaluation, "product"), weight: `${weights?.product ?? 0}%` },
                { name: "Traction", score: getDisplaySectionScore(evaluation, "traction"), weight: `${weights?.traction ?? 0}%` },
                { name: "Business Model", score: getDisplaySectionScore(evaluation, "businessModel"), weight: `${weights?.businessModel ?? 0}%` },
                { name: "Go-to-Market", score: getDisplaySectionScore(evaluation, "gtm"), weight: `${weights?.gtm ?? 0}%` },
                { name: "Competitive Advantage", score: getDisplaySectionScore(evaluation, "competitiveAdvantage"), weight: `${weights?.competitiveAdvantage ?? 0}%` },
                { name: "Financials", score: getDisplaySectionScore(evaluation, "financials"), weight: `${weights?.financials ?? 0}%` },
                { name: "Legal", score: getDisplaySectionScore(evaluation, "legal"), weight: `${weights?.legal ?? 0}%` },
                { name: "Deal Terms", score: getDisplaySectionScore(evaluation, "dealTerms"), weight: `${weights?.dealTerms ?? 0}%` },
                { name: "Exit Potential", score: getDisplaySectionScore(evaluation, "exitPotential"), weight: `${weights?.exitPotential ?? 0}%` },
              ].map((section, index) => {
                const sectionId = section.name.toLowerCase().replace(/\s+/g, '-');
                const sectionScore = Math.max(
                  0,
                  Math.min(100, Math.ceil(Number(section.score || 0))),
                );
                return (
                  <div key={section.name} className="flex items-center gap-2" data-testid={`row-section-score-${sectionId}`}>
                    <span className="text-xs w-28 shrink-0" data-testid={`text-section-name-${sectionId}`}>{section.name}</span>
                    <span className="text-xs text-muted-foreground w-8 shrink-0 text-right" data-testid={`text-section-weight-${sectionId}`}>{section.weight}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-0">
                      <div 
                        className={`h-full rounded-full transition-[width] duration-700 ease-out ${getSectionBarClass(section.name, sectionScore)}`}
                        style={{
                          width: animateBars ? `${sectionScore}%` : "0%",
                          transitionDelay: `${index * 55}ms`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium w-8 text-right shrink-0" data-testid={`text-section-score-${sectionId}`}>{roundUpScore(sectionScore)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {investorMemo?.dueDiligenceAreas && investorMemo.dueDiligenceAreas.length > 0 && (
        <Card data-testid="card-due-diligence">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              <span data-testid="text-due-diligence-title">Key Due Diligence Areas</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" data-testid="list-due-diligence">
              {investorMemo.dueDiligenceAreas.map((area: string, i: number) => (
                <li key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg" data-testid={`item-due-diligence-${i}`}>
                  <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-sm font-medium flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm">{area}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
