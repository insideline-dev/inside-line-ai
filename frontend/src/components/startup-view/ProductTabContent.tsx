import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Image, Code, Layers } from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import { ProductScoreSummary } from "@/components/ProductScoreSummary";

interface ProductTabContentProps {
  startup: Startup;
  evaluation: Evaluation | null;
  showScores?: boolean;
  productWeight?: number;
}

interface SubScoreItem {
  dimension: string;
  weight: number;
  score: number;
}

function toSubScores(value: unknown): SubScoreItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): SubScoreItem | null => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const dimension = typeof r.dimension === "string" ? r.dimension.trim() : "";
      const weight = typeof r.weight === "number" ? r.weight : null;
      const score = typeof r.score === "number" ? r.score : null;
      if (!dimension || weight === null || score === null) return null;
      return { dimension, weight, score };
    })
    .filter((item): item is SubScoreItem => item !== null);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function toStructuredTextArray(
  value: unknown,
  preferredKey: "feature" | "technology",
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const preferred = record[preferredKey];
      return typeof preferred === "string" ? preferred.trim() : "";
    })
    .filter(Boolean);
}

function toDataGapStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const gap = typeof record.gap === "string" ? record.gap.trim() : "";
      const impact = typeof record.impact === "string" ? record.impact.trim() : "";
      return gap ? (impact ? `${gap} (${impact} impact)` : gap) : "";
    })
    .filter(Boolean);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

interface PitchRecommendationItem {
  deckMissingElement: string;
  whyItMatters: string;
  recommendation: string;
}

function toPitchRecommendations(value: unknown): PitchRecommendationItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): PitchRecommendationItem | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const deckMissingElement =
        typeof record.deckMissingElement === "string"
          ? record.deckMissingElement.trim()
          : "";
      const whyItMatters =
        typeof record.whyItMatters === "string"
          ? record.whyItMatters.trim()
          : "";
      const recommendation =
        typeof record.recommendation === "string"
          ? record.recommendation.trim()
          : "";
      if (!deckMissingElement && !recommendation) return null;
      return { deckMissingElement, whyItMatters, recommendation };
    })
    .filter((item): item is PitchRecommendationItem => item !== null);
}

function normalizeTrlStage(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["idea", "mvp", "scaling", "mature"].includes(normalized)) return normalized;
  if (normalized.includes("ga") || normalized.includes("production")) return "mature";
  return undefined;
}

const PRODUCT_LIFECYCLE_STAGES = ["Concept", "Prototype", "MVP", "Beta", "Production", "Scaling"] as const;

function normalizeTechStageToLifecycle(techStage: string | undefined): number {
  if (!techStage) return -1;
  const n = techStage.toLowerCase().trim();
  if (n.includes("concept") || n === "idea") return 0;
  if (n.includes("prototype")) return 1;
  if (n.includes("mvp")) return 2;
  if (n.includes("beta")) return 3;
  if (n.includes("production") || n.includes("ga") || n === "mature") return 4;
  if (n.includes("scaling")) return 5;
  return -1;
}

function ProductLifecycleBar({ techStage, stageFit }: { techStage?: string; stageFit?: string }) {
  const activeIdx = normalizeTechStageToLifecycle(techStage);
  const fitColor = (() => {
    const fit = (stageFit || "").toLowerCase();
    if (fit === "behind") return "bg-rose-500";
    return "bg-violet-500";
  })();

  return (
    <div className="flex items-center gap-0.5">
      {PRODUCT_LIFECYCLE_STAGES.map((stage, idx) => {
        const isActive = idx === activeIdx;
        const isPast = idx < activeIdx;
        return (
          <div key={stage} className="flex-1 text-center">
            <div
              className={`h-2.5 rounded-full ${
                isActive
                  ? fitColor
                  : isPast
                    ? "bg-violet-300 dark:bg-violet-700"
                    : "bg-muted"
              }`}
            />
            <p className={`mt-1 text-[10px] ${isActive ? "font-semibold text-violet-600 dark:text-violet-400" : "text-muted-foreground"}`}>
              {stage}
            </p>
          </div>
        );
      })}
    </div>
  );
}

interface ClaimAssessmentItem {
  claim: string;
  deckSays: string;
  evidence: string;
  verdict: string;
}

function toClaimsAssessment(value: unknown): ClaimAssessmentItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ClaimAssessmentItem | null => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const claim = typeof r.claim === "string" ? r.claim.trim() : "";
      const deckSays = typeof r.deckSays === "string" ? r.deckSays.trim() : "";
      const evidence = typeof r.evidence === "string" ? r.evidence.trim() : "";
      const verdict = typeof r.verdict === "string" ? r.verdict.trim() : "";
      if (!claim && !deckSays) return null;
      return { claim, deckSays, evidence, verdict };
    })
    .filter((item): item is ClaimAssessmentItem => item !== null);
}

function verdictBadgeClass(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case "verified": return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400";
    case "partially_verified": return "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400";
    case "contradicted": return "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400";
    default: return "border-slate-300 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  }
}

export function ProductTabContent({ startup, evaluation, showScores = true, productWeight }: ProductTabContentProps) {
  const founderScreenshots = (startup.productScreenshots as string[]) || [];

  const productData = evaluation?.productData as any;
  const productScore = evaluation?.productScore;
  const competitiveData = (evaluation?.competitiveAdvantageData as any) || {};
  const trlStage = normalizeTrlStage(
      startup.technologyReadinessLevel ||
      productData?.technologyReadiness?.stage ||
      productData?.productOverview?.techStage ||
      productData?.technologyStage ||
      productData?.productMaturity,
  );
  const moatType =
    productData?.competitiveMoat?.moatType ||
    productData?.moatType ||
    (Array.isArray(competitiveData?.moats) && competitiveData.moats.length > 0
      ? String(competitiveData.moats[0])
      : undefined);
  const moatStrength =
    productData?.competitiveMoat?.strength ??
    productData?.moatStrength ??
    null;
  const productConfidence =
    (typeof productData?.confidence === "string" && productData.confidence) ||
    (typeof productData?.scoring?.confidence === "string" && productData.scoring.confidence) ||
    "unknown";
  // New schema: strengths field > keyStrengths > keyFindings (backward compat)
  const productStrengths = dedupeStrings(
    [
      ...toStringArray(productData?.productStrengthsAndRisks?.strengths),
      ...toStringArray(productData?.strengths),
      ...toStringArray(productData?.keyStrengths),
      ...toStringArray(productData?.keyFindings),
    ].filter(Boolean),
  );
  const productRisks = dedupeStrings(
    [
      ...toStringArray(productData?.productStrengthsAndRisks?.risks),
      ...toStringArray(productData?.keyRisks),
      ...toStringArray(productData?.risks),
      ...toDataGapStrings(productData?.dataGaps),
    ].filter(Boolean),
  );
  const productSummary =
    evaluation?.productSummary ||
    productData?.productOverview?.description ||
    productData?.productDescription;
  // New schema: productOverview fields
  const productOverview = productData?.productOverview as Record<string, unknown> | undefined;
  const keyFeatures = toStructuredTextArray(productData?.keyFeatures, "feature");
  const technologyStack = toStructuredTextArray(productData?.technologyStack, "technology");
  // New schema: founderPitchRecommendations
  const founderPitchRecommendations = toPitchRecommendations(productData?.founderPitchRecommendations);
  const productSubScores = toSubScores(productData?.scoring?.subScores);
  const productScoringBasis = typeof productData?.scoring?.scoringBasis === "string" ? productData.scoring.scoringBasis.trim() : undefined;
  const rawTechStage = productOverview?.techStage as string | undefined ?? productData?.technologyStage as string | undefined;
  const stageFitAssessment = productData?.stageFitAssessment as string | undefined;
  const claimsAssessment = toClaimsAssessment(productData?.claimsAssessment);
  // Cross-reference moat from competitive advantage agent
  const compAdvData = (evaluation?.competitiveAdvantageData as Record<string, unknown> | undefined) ?? {};
  const moatAssessment = compAdvData.moatAssessment as Record<string, unknown> | undefined;
  const moatStage = typeof moatAssessment?.moatStage === "string" ? moatAssessment.moatStage : undefined;
  const moatEvidence2 = typeof moatAssessment?.moatEvidence === "string" ? moatAssessment.moatEvidence : undefined;
  const moatSelfReinforcing = typeof moatAssessment?.selfReinforcing === "boolean" ? moatAssessment.selfReinforcing : undefined;

  const hasContent =
    founderScreenshots.length > 0 ||
    keyFeatures.length > 0 ||
    technologyStack.length > 0 ||
    trlStage ||
    productSummary ||
    productData;

  if (!hasContent) {
    return (
      <Card className="border-dashed" data-testid="card-product-empty">
        <CardContent className="p-12 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2" data-testid="text-no-product-title">No product data</h3>
          <p className="text-muted-foreground" data-testid="text-no-product-message">
            Product information has not been submitted or analyzed yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="product-tab-content">
      {evaluation && showScores && (
        <ProductScoreSummary
          productScore={productScore || 0}
          productSummary={productSummary}
          trlStage={trlStage}
          moatType={moatType}
          moatStrength={moatStrength}
          keyStrengths={productStrengths}
          keyRisks={productRisks}
          weight={productWeight}
          confidence={productConfidence}
          subScores={productSubScores}
          scoringBasis={productScoringBasis}
        />
      )}

      {!showScores && productSummary && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background" data-testid="card-product-summary">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-5 h-5" />
              <span data-testid="text-product-summary-title">Product Summary</span>
            </CardTitle>
            <CardDescription data-testid="text-product-summary-description">
              What this product does
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{productSummary}</p>
          </CardContent>
        </Card>
      )}

      {(productData?.productDescription || productData?.uniqueValue || productOverview?.whatItDoes || productOverview?.coreValueProp) && (
        <Card className="border-primary/15" data-testid="card-product-overview">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-5 h-5" />
              <span>Product Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* New schema: productOverview.whatItDoes > legacy productDescription */}
            {(productOverview?.whatItDoes || productData?.productDescription) && (
              <div>
                <h4 className="text-sm font-medium mb-1">Description</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {(productOverview?.whatItDoes as string) || productData.productDescription}
                </p>
              </div>
            )}
            {/* New schema: productOverview.targetUser */}
            {productOverview?.targetUser && (
              <div>
                <h4 className="text-sm font-medium mb-1">Target User</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{productOverview.targetUser as string}</p>
              </div>
            )}
            {/* New schema: productOverview.productCategory */}
            {productOverview?.productCategory && (
              <div>
                <h4 className="text-sm font-medium mb-1">Category</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{productOverview.productCategory as string}</p>
              </div>
            )}
            {/* New schema: productOverview.coreValueProp > legacy uniqueValue */}
            {(productOverview?.coreValueProp || productData?.uniqueValue) && (
              <div>
                <h4 className="text-sm font-medium mb-1">Unique Value</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {(productOverview?.coreValueProp as string) || productData.uniqueValue}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {rawTechStage && (
        <Card className="border-primary/15" data-testid="card-product-lifecycle">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <span>Product Lifecycle</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProductLifecycleBar techStage={rawTechStage} stageFit={stageFitAssessment} />
          </CardContent>
        </Card>
      )}

      {claimsAssessment.length > 0 && (
        <Card className="border-primary/15" data-testid="card-claims-credibility">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-5 h-5" />
              <span>Claims Credibility</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 pr-3 text-left font-medium">Claim</th>
                    <th className="pb-2 pr-3 text-left font-medium">Deck Says</th>
                    <th className="pb-2 pr-3 text-left font-medium">Evidence</th>
                    <th className="pb-2 text-left font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {claimsAssessment.map((item, idx) => (
                    <tr key={idx} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-3 font-medium">{item.claim}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{item.deckSays}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{item.evidence}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={verdictBadgeClass(item.verdict)}>
                          {item.verdict.replace(/_/g, " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {moatStage && (
        <Card className="border-primary/15" data-testid="card-moat-assessment">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <span>Moat Assessment</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              {moatType && <Badge variant="secondary" className="capitalize">{moatType.replace(/_/g, " ")}</Badge>}
              <Badge variant="outline" className="capitalize">{moatStage.replace(/_/g, " ")}</Badge>
              {moatSelfReinforcing !== undefined && (
                <Badge variant={moatSelfReinforcing ? "default" : "secondary"}>
                  {moatSelfReinforcing ? "Self-reinforcing" : "Not self-reinforcing"}
                </Badge>
              )}
            </div>
            {moatEvidence2 && (
              <p className="text-sm text-muted-foreground">{moatEvidence2}</p>
            )}
          </CardContent>
        </Card>
      )}

      {founderScreenshots.length > 0 && (
        <Card className="border-primary/15" data-testid="card-product-showcase">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="w-5 h-5" />
              <span data-testid="text-product-showcase-title">Product Showcase</span>
            </CardTitle>
            <CardDescription data-testid="text-product-showcase-description">
              Screenshots submitted by founder
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {founderScreenshots.map((url, idx) => (
                <div key={idx} className="aspect-video bg-muted rounded-lg overflow-hidden">
                  <img
                    src={url}
                    alt={`Product screenshot ${idx + 1}`}
                    className="w-full h-full object-contain"
                    data-testid={`img-screenshot-${idx}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {keyFeatures.length > 0 && (
        <Card className="border-primary/15" data-testid="card-key-features">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <span>Key Features</span>
            </CardTitle>
            <CardDescription>Core capabilities identified from analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {keyFeatures.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {technologyStack.length > 0 && (
        <Card className="border-primary/15" data-testid="card-tech-stack">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Code className="w-5 h-5" />
              <span>Technology Stack</span>
            </CardTitle>
            <CardDescription>Technologies and frameworks used</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {technologyStack.map((tech, idx) => (
                <Badge key={idx} variant="secondary" className="px-3 py-1">
                  {tech}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {founderPitchRecommendations.length > 0 && (
        <Card className="border-primary/15" data-testid="card-pitch-recommendations">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <span>Pitch Recommendations</span>
            </CardTitle>
            <CardDescription>Actionable suggestions to strengthen the product narrative</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {founderPitchRecommendations.map((rec, idx) => (
                <li key={idx} className="rounded-md border border-border/60 p-3 text-sm" data-testid={`item-pitch-rec-${idx}`}>
                  {rec.deckMissingElement ? (
                    <p className="font-medium">{rec.deckMissingElement}</p>
                  ) : null}
                  {rec.whyItMatters ? (
                    <p className="mt-1 text-muted-foreground">{rec.whyItMatters}</p>
                  ) : null}
                  {rec.recommendation ? (
                    <p className="mt-2">{rec.recommendation}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
