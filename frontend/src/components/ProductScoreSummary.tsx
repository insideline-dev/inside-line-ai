import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Cpu,
  Layers
} from "lucide-react";

interface ProductScoreSummaryProps {
  productScore: number;
  productSummary?: string;
  trlStage?: string;
  moatType?: string;
  moatStrength?: number;
  keyStrengths?: string[];
  keyRisks?: string[];
  weight?: number;
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
}: ProductScoreSummaryProps) {
  const trlInfo = getTRLLabel(trlStage);

  return (
    <div className="space-y-6">
      <Card data-testid="card-product-score">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary/10">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Product Score</h3>
                <p className="text-sm text-muted-foreground">{weight !== undefined ? `${weight}%` : ''} weight in overall evaluation</p>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-4xl font-bold ${
                productScore >= 80 ? "text-green-600" :
                productScore >= 60 ? "text-amber-600" :
                "text-red-600"
              }`} data-testid="text-product-score">{productScore}</span>
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
            <p className="text-sm leading-relaxed" data-testid="text-product-summary">
              {productSummary}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
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

            {moatType && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <span className="text-sm font-medium">Moat Type</span>
                </div>
                <Badge variant="outline" className="shrink-0 capitalize" data-testid="badge-moat">
                  {moatType.replace(/_/g, ' ')}
                </Badge>
              </div>
            )}
          </div>

          {moatStrength !== undefined && moatStrength !== null && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Moat Strength:</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    moatStrength >= 70 ? "bg-green-500" :
                    moatStrength >= 40 ? "bg-amber-500" :
                    "bg-red-500"
                  }`}
                  style={{ width: `${moatStrength}%` }}
                />
              </div>
              <span className="text-sm font-medium">{moatStrength}/100</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {keyStrengths && keyStrengths.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-chart-2" />
                Product Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {keyStrengths.slice(0, 5).map((strength, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-chart-2 shrink-0" />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {keyRisks && keyRisks.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-chart-5" />
                Product Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {keyRisks.slice(0, 5).map((risk, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 mt-0.5 text-chart-5 shrink-0" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
