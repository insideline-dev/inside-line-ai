import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Image, Code, Layers, CheckCircle2, AlertTriangle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownText } from "@/components/MarkdownText";
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { DataGapsSection, parseDataGapItems } from "@/components/DataGapsSection";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface FeatureWithSources {
  feature: string;
  verifiedBy: string[];
}

interface ClaimAssessmentItem {
  claim: string;
  deckSays: string;
  evidence: string;
  verdict: string;
}

interface TechStackItem {
  technology: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Parsers — safe access for Record<string, unknown>
// ---------------------------------------------------------------------------

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function toSubScores(value: unknown): SubScoreItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): SubScoreItem | null => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const dimension = str(r.dimension);
      const weight = typeof r.weight === "number" ? r.weight : null;
      const score = typeof r.score === "number" ? r.score : null;
      if (!dimension || weight === null || score === null) return null;
      return { dimension, weight, score };
    })
    .filter((item): item is SubScoreItem => item !== null);
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((s) => s.replace(/^[\s\-*•]+/, "").trim())
      .filter((s) => s.length > 0);
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function toFeaturesWithSources(value: unknown): FeatureWithSources[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): FeatureWithSources | null => {
      if (typeof item === "string") return item.trim() ? { feature: item.trim(), verifiedBy: [] } : null;
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const feature = str(record.feature);
      if (!feature) return null;
      const verifiedBy = Array.isArray(record.verifiedBy)
        ? (record.verifiedBy as unknown[])
            .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
            .map((v) => v.trim().toLowerCase())
        : [];
      return { feature, verifiedBy };
    })
    .filter((item): item is FeatureWithSources => item !== null);
}

function toClaimsAssessment(value: unknown): ClaimAssessmentItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ClaimAssessmentItem | null => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const claim = str(r.claim) ?? "";
      const deckSays = str(r.deckSays) ?? "";
      const evidence = str(r.evidence) ?? "";
      const verdict = str(r.verdict) ?? "";
      if (!claim && !deckSays) return null;
      return { claim, deckSays, evidence, verdict };
    })
    .filter((item): item is ClaimAssessmentItem => item !== null);
}

function toTechStack(value: unknown): TechStackItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): TechStackItem | null => {
      if (typeof item === "string") return item.trim() ? { technology: item.trim(), source: "" } : null;
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const technology = str(r.technology);
      if (!technology) return null;
      return { technology, source: str(r.source) ?? "" };
    })
    .filter((item): item is TechStackItem => item !== null);
}

// ---------------------------------------------------------------------------
// Source badge styling
// ---------------------------------------------------------------------------

function sourceBadgeClass(source: string): string {
  switch (source) {
    case "website":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400";
    case "research":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";
  }
}

function verdictBadgeClass(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case "verified":
      return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400";
    case "partially_verified":
      return "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400";
    case "contradicted":
      return "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400";
    default:
      return "border-slate-300 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  }
}

// ---------------------------------------------------------------------------
// Product Lifecycle Bar (6-stage)
// ---------------------------------------------------------------------------

const LIFECYCLE_STAGES = ["Concept", "Prototype", "MVP", "Beta", "Production", "Scaling"] as const;

function techStageToIndex(techStage: string | undefined): number {
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
  const activeIdx = techStageToIndex(techStage);
  const isBehind = (stageFit ?? "").toLowerCase() === "behind";
  const activeColor = isBehind ? "bg-rose-500" : "bg-emerald-500";
  const pastColor = isBehind
    ? "bg-rose-200 dark:bg-rose-800"
    : "bg-emerald-200 dark:bg-emerald-800";
  const activeText = isBehind
    ? "font-semibold text-rose-600 dark:text-rose-400"
    : "font-semibold text-emerald-600 dark:text-emerald-400";

  return (
    <div className="flex items-center gap-0.5">
      {LIFECYCLE_STAGES.map((stage, idx) => {
        const isActive = idx === activeIdx;
        const isPast = idx < activeIdx;
        return (
          <div key={stage} className="flex-1 text-center">
            <div
              className={cn(
                "h-2.5 rounded-full",
                isActive ? activeColor : isPast ? pastColor : "bg-muted",
              )}
            />
            <p className={cn("mt-1 text-[10px]", isActive ? activeText : "text-muted-foreground")}>
              {stage}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Moat Stage Indicator (5-stage: Potential → Dominant)
// ---------------------------------------------------------------------------

const MOAT_STAGES = ["Potential", "Emerging", "Forming", "Established", "Dominant"] as const;

function moatStageToIndex(stage: string): number {
  const n = stage.toLowerCase().trim();
  if (n.includes("potential") || n.includes("none")) return 0;
  if (n.includes("emerg")) return 1;
  if (n.includes("form") || n.includes("develop")) return 2;
  if (n.includes("establish")) return 3;
  if (n.includes("dominan")) return 4;
  return -1;
}

function moatStageColor(idx: number): string {
  if (idx >= 4) return "bg-emerald-700 dark:bg-emerald-600";
  if (idx >= 3) return "bg-emerald-500";
  if (idx >= 2) return "bg-lime-500";
  if (idx >= 1) return "bg-amber-400";
  return "bg-slate-400";
}

function MoatStageIndicator({ stage }: { stage: string }) {
  const activeIdx = moatStageToIndex(stage);
  return (
    <div className="flex items-center gap-1">
      {MOAT_STAGES.map((s, idx) => {
        const isActive = idx === activeIdx;
        const isPast = idx < activeIdx;
        return (
          <div key={s} className="flex-1 text-center">
            <div
              className={cn(
                "h-2 rounded-full",
                isActive
                  ? moatStageColor(idx)
                  : isPast
                    ? "bg-emerald-200 dark:bg-emerald-800"
                    : "bg-muted",
              )}
            />
            <p className={cn("mt-0.5 text-[9px]", isActive ? "font-semibold" : "text-muted-foreground")}>
              {s}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ProductTabContent({ startup, evaluation, showScores = true, productWeight }: ProductTabContentProps) {
  const productData = (evaluation?.productData ?? {}) as Record<string, unknown>;
  const productOverview = (productData.productOverview ?? {}) as Record<string, unknown>;
  const compAdvData = (evaluation?.competitiveAdvantageData ?? {}) as Record<string, unknown>;
  const moatAssessment = (compAdvData.moatAssessment ?? {}) as Record<string, unknown>;

  // Section 1: Score
  const productScore = evaluation?.productScore ?? 0;
  const scoring = (productData.scoring ?? {}) as Record<string, unknown>;
  const confidence = str(scoring.confidence) ?? "unknown";
  const scoringBasis = str(scoring.scoringBasis);
  const subScores = toSubScores(scoring.subScores);

  // Section 2: Product Overview
  const productCategory = str(productOverview.productCategory);
  const targetUser = str(productOverview.targetUser);
  const techStage = str(productOverview.techStage);
  const coreValueProp = str(productOverview.coreValueProp);
  const description = str(productOverview.description);
  const whatItDoes = str(productOverview.whatItDoes);
  const keyFeatures = toFeaturesWithSources(productData.keyFeatures);

  // Section 3: Product Maturity & Defensibility
  const stageFitAssessment = str(productData.stageFitAssessment);
  const claimsAssessment = toClaimsAssessment(productData.claimsAssessment);
  const moatType = str(moatAssessment.moatType);
  const moatStage = str(moatAssessment.moatStage);
  const moatEvidence = str(moatAssessment.moatEvidence);
  const moatSelfReinforcing = bool(moatAssessment.selfReinforcing);

  // Section 5: Technology Stack
  const technologyStack = toTechStack(productData.technologyStack);

  // Section 6: Strengths & Risks
  const strengths = toStringArray(productData.strengths);
  const risks = toStringArray(productData.risks);

  // Section 7: Data Gaps
  const dataGaps = parseDataGapItems(productData.dataGaps);

  // Product Showcase
  const founderScreenshots = (startup.productScreenshots as string[]) || [];

  const hasOverview = productCategory || targetUser || techStage || coreValueProp || description || whatItDoes || keyFeatures.length > 0;
  const hasMaturity = techStage || claimsAssessment.length > 0 || moatStage;
  const hasContent = hasOverview || hasMaturity || technologyStack.length > 0 || strengths.length > 0 || risks.length > 0 || dataGaps.length > 0 || founderScreenshots.length > 0 || productData;

  if (!hasContent) {
    return (
      <Card className="border-dashed" data-testid="card-product-empty">
        <CardContent className="p-12 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 font-semibold" data-testid="text-no-product-title">No product data</h3>
          <p className="text-muted-foreground" data-testid="text-no-product-message">
            Product information has not been submitted or analyzed yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="product-tab-content">
      {/* ================================================================= */}
      {/* Section 1: Score Card                                             */}
      {/* ================================================================= */}
      {evaluation && showScores && (
        <SectionScoreCard
          title="Product Score"
          score={productScore}
          weight={productWeight}
          confidence={confidence}
          scoringBasis={scoringBasis}
          subScores={subScores}
          dataTestId="card-product-score"
          scoreTestId="text-product-score"
          confidenceTestId="badge-product-confidence"
        />
      )}

      {/* ================================================================= */}
      {/* Section 2: Product Overview                                       */}
      {/* ================================================================= */}
      {hasOverview && (
        <Card data-testid="card-product-overview">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5" />
              <span>Product Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Product Identity Bar */}
            {(productCategory || targetUser || techStage) && (
              <div className="flex flex-wrap gap-2">
                {productCategory && <Badge variant="secondary">{productCategory}</Badge>}
                {targetUser && <Badge variant="outline">{targetUser}</Badge>}
                {techStage && (
                  <Badge variant="outline" className="border-primary/30 capitalize text-primary">
                    {techStage}
                  </Badge>
                )}
              </div>
            )}

            {/* Core Value Prop — callout box */}
            {coreValueProp && (
              <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4">
                <h4 className="mb-1 text-sm font-semibold">Core Value Proposition</h4>
                <MarkdownText className="text-sm leading-relaxed [&>p]:mb-0">
                  {coreValueProp}
                </MarkdownText>
              </div>
            )}

            {/* Product Description */}
            {description && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Product Description</h4>
                <MarkdownText className="text-sm leading-relaxed text-muted-foreground [&>p]:mb-0">
                  {description}
                </MarkdownText>
              </div>
            )}

            {/* What It Does */}
            {whatItDoes && (
              <div>
                <h4 className="mb-1 text-sm font-medium">What It Does</h4>
                <MarkdownText className="text-sm leading-relaxed text-muted-foreground [&>p]:mb-0">
                  {whatItDoes}
                </MarkdownText>
              </div>
            )}

            {/* Key Features (inside overview card) */}
            {keyFeatures.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium">Key Features</h4>
                <div className="grid gap-2">
                  {keyFeatures.map((item, idx) => {
                    const isDeckOnly = item.verifiedBy.length === 1 && item.verifiedBy[0] === "deck";
                    return (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="flex-1">{item.feature}</span>
                        <div className="flex shrink-0 gap-1">
                          {isDeckOnly ? (
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px] border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400"
                            >
                              Deck only
                            </Badge>
                          ) : (
                            item.verifiedBy.map((source) => (
                              <Badge
                                key={source}
                                variant="outline"
                                className={cn("px-1.5 py-0 text-[10px]", sourceBadgeClass(source))}
                              >
                                {source}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Section 3: Product Maturity & Defensibility                       */}
      {/* ================================================================= */}
      {hasMaturity && (
        <Card data-testid="card-product-maturity">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-5 w-5" />
              <span>Product Maturity & Defensibility</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Product Lifecycle Bar */}
            {techStage && (
              <div>
                <h4 className="mb-2 text-sm font-medium">Product Lifecycle Position</h4>
                <ProductLifecycleBar techStage={techStage} stageFit={stageFitAssessment} />
              </div>
            )}

            {/* Claims Credibility Table */}
            {claimsAssessment.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium">Claims Credibility</h4>
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
              </div>
            )}

            {/* Moat Assessment (cross-referenced from competitive advantage agent) */}
            {moatStage && (
              <div>
                <h4 className="mb-2 text-sm font-medium">Moat Assessment</h4>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {moatType && (
                      <Badge variant="secondary" className="capitalize">
                        <Shield className="mr-1 h-3 w-3" />
                        {moatType.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {moatSelfReinforcing !== undefined && (
                      <Badge variant={moatSelfReinforcing ? "default" : "secondary"}>
                        {moatSelfReinforcing ? "Self-reinforcing" : "Not self-reinforcing"}
                      </Badge>
                    )}
                  </div>
                  <MoatStageIndicator stage={moatStage} />
                  {moatEvidence && (
                    <MarkdownText className="text-sm text-muted-foreground [&>p]:mb-0">
                      {moatEvidence}
                    </MarkdownText>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Section 5: Technology Stack                                       */}
      {/* ================================================================= */}
      {technologyStack.length > 0 && (
        <Card data-testid="card-tech-stack">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Code className="h-5 w-5" />
              <span>Technology Stack</span>
            </CardTitle>
            <CardDescription>Technologies and frameworks used</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {technologyStack.map((item, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="px-3 py-1"
                  title={item.source ? `Source: ${item.source}` : undefined}
                >
                  {item.technology}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Section 6: Strengths & Risks                                      */}
      {/* ================================================================= */}
      {(strengths.length > 0 || risks.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Product Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              {strengths.length > 0 ? (
                <ul className="space-y-2">
                  {strengths.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No explicit product strengths were captured in this run.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
                Product Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {risks.length > 0 ? (
                <ul className="space-y-2">
                  {risks.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No explicit product risks were captured in this run.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================================================================= */}
      {/* Section 7: Data Gaps                                              */}
      {/* ================================================================= */}
      <DataGapsSection gaps={dataGaps} />

      {/* ================================================================= */}
      {/* Product Showcase (founder screenshots — after data gaps)           */}
      {/* ================================================================= */}
      {founderScreenshots.length > 0 && (
        <Card data-testid="card-product-showcase">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Image className="h-5 w-5" />
              <span data-testid="text-product-showcase-title">Product Showcase</span>
            </CardTitle>
            <CardDescription data-testid="text-product-showcase-description">
              Screenshots submitted by founder
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {founderScreenshots.map((url, idx) => (
                <div key={idx} className="aspect-video overflow-hidden rounded-lg bg-muted">
                  <img
                    src={url}
                    alt={`Product screenshot ${idx + 1}`}
                    className="h-full w-full object-contain"
                    data-testid={`img-screenshot-${idx}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
