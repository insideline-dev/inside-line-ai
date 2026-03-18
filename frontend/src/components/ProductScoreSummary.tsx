import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { MarkdownText } from "@/components/MarkdownText";
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Cpu,
  Layers
} from "lucide-react";

interface SubScoreItem {
  dimension: string;
  weight: number;
  score: number;
}

interface ProductScoreSummaryProps {
  productScore: number;
  productSummary?: string;
  trlStage?: string;
  moatType?: string;
  moatStrength?: number;
  keyStrengths?: string[];
  keyRisks?: string[];
  weight?: number;
  confidence?: string;
  subScores?: SubScoreItem[];
  scoringBasis?: string;
}

function getTRLLabel(trl: string | null | undefined): { label: string; color: string } {
  switch (trl) {
    case "idea":
      return { label: "Idea Stage", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" };
    case "mvp":
      return { label: "MVP", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" };
    case "scaling":
      return { label: "Scaling", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" };
    case "mature":
      return { label: "Mature", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" };
    default:
      return { label: "Unknown", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" };
  }
}

export function ProductScoreSummary({
  productScore,
  productSummary,
  trlStage,
  moatType,
  moatStrength,
  keyStrengths,
  keyRisks,
  weight,
  confidence = "unknown",
  subScores,
  scoringBasis,
}: ProductScoreSummaryProps) {
  const trlInfo = getTRLLabel(trlStage);
  const normalizedMoatType = moatType && moatType.trim().length > 0 ? moatType : "none";
  const normalizedMoatStrength =
    typeof moatStrength === "number" && Number.isFinite(moatStrength) ? moatStrength : 0;

  return (
    <div className="space-y-6">
      <SectionScoreCard
        title="Product Score"
        score={productScore}
        weight={weight}
        confidence={confidence}
        scoringBasis={scoringBasis}
        subScores={subScores}
        dataTestId="card-product-score"
        scoreTestId="text-product-score"
        confidenceTestId="badge-product-confidence"
      />

      {productSummary && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Product Summary
            </CardTitle>
            <CardDescription>What this product does</CardDescription>
          </CardHeader>
          <CardContent>
            <div data-testid="text-product-summary">
              <MarkdownText className="text-sm leading-relaxed [&>p]:mb-0">
                {productSummary}
              </MarkdownText>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/15">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            Product Readiness
          </CardTitle>
          <CardDescription>Technology stage and defensibility</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <Layers className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <span className="text-sm font-medium">Technology Stage</span>
              </div>
              {trlStage && (
                <Badge className={`${trlInfo.color} shrink-0`} data-testid="badge-trl">
                  {trlInfo.label}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <span className="text-sm font-medium">Moat Type</span>
              </div>
              <Badge variant="outline" className="shrink-0 capitalize" data-testid="badge-moat">
                {normalizedMoatType.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Moat Strength:</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  normalizedMoatStrength >= 70 ? "bg-green-500" :
                  normalizedMoatStrength >= 40 ? "bg-amber-500" :
                  "bg-red-500"
                }`}
                style={{ width: `${normalizedMoatStrength}%` }}
              />
            </div>
            <span className="text-sm font-medium">{Math.round(normalizedMoatStrength)}/100</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Product Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              {keyStrengths && keyStrengths.length > 0 ? (
                <ul className="space-y-2">
                  {keyStrengths.slice(0, 5).map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No clear product strengths were identified in this run.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Product Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {keyRisks && keyRisks.length > 0 ? (
                <ul className="space-y-2">
                  {keyRisks.slice(0, 5).map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-500 shrink-0" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No explicit product risks were identified in this run.</p>
              )}
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
