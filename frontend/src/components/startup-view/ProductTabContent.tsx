import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Package, Image, Code, Layers, Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownText } from "@/components/MarkdownText";
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { DataGapsSection, parseDataGapItems } from "@/components/DataGapsSection";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";


function DescriptionBlock({ text, forcePrint = false }: { text: string; forcePrint?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isExpanded = forcePrint || expanded;
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium">Description</h4>
      <div className={cn("text-sm leading-relaxed text-muted-foreground", !isExpanded && "line-clamp-4")}>
        <MarkdownText className="[&>p]:mb-2 [&>p:last-child]:mb-0">{text}</MarkdownText>
      </div>
      {!forcePrint && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-1 text-xs text-primary hover:underline"
          data-print-hide="true"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductTabContentProps {
  startup: Startup;
  evaluation: Evaluation | null;
  showScores?: boolean;
  showDataGaps?: boolean;
  productWeight?: number;
  forcePrint?: boolean;
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
// Styling helpers
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

/** Extract all parenthetical content from tech names → tooltip */
function parseTechBrackets(tech: string): { name: string; detail?: string } {
  const parts = tech.match(/\(([^)]+)\)/g);
  if (!parts || parts.length === 0) return { name: tech };
  const detail = parts.map((p) => p.slice(1, -1)).join(", ");
  const name = tech.replace(/\s*\([^)]+\)/g, "").trim();
  return { name, detail };
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

export function ProductTabContent({ startup, evaluation, showScores = true, showDataGaps = true, productWeight, forcePrint = false }: ProductTabContentProps) {
  const productData = (evaluation?.productData ?? {}) as Record<string, unknown>;
  const productOverview = (productData.productOverview ?? {}) as Record<string, unknown>;
  const compAdvData = (evaluation?.competitiveAdvantageData ?? {}) as Record<string, unknown>;
  const moatAssessment = (compAdvData.moatAssessment ?? {}) as Record<string, unknown>;

  // Score
  const productScore = evaluation?.productScore ?? 0;
  const scoring = (productData.scoring ?? {}) as Record<string, unknown>;
  const confidence = str(scoring.confidence) ?? "unknown";
  const scoringBasis = str(scoring.scoringBasis);
  const subScores = toSubScores(scoring.subScores);

  // Product Overview
  const productCategory = str(productOverview.productCategory);
  const targetUser = str(productOverview.targetUser);
  const techStage = str(productOverview.techStage);
  const coreValueProp = str(productOverview.coreValueProp);
  const description = str(productOverview.description);
  const whatItDoes = str(productOverview.whatItDoes);
  const keyFeatures = toFeaturesWithSources(productData.keyFeatures);

  // Maturity & Defensibility
  const stageFitAssessment = str(productData.stageFitAssessment);
  const claimsAssessment = toClaimsAssessment(productData.claimsAssessment);
  const moatType = str(moatAssessment.moatType);
  const moatStage = str(moatAssessment.moatStage);
  const moatEvidence = toStringArray(moatAssessment.moatEvidence);
  const moatSelfReinforcing = bool(moatAssessment.selfReinforcing);
  const timeToReplicate = str(moatAssessment.timeToReplicate);

  // Technology Stack
  const technologyStack = toTechStack(productData.technologyStack);

  // Data Gaps
  const dataGaps = parseDataGapItems(productData.dataGaps);

  // Product Showcase
  const founderScreenshots = (startup.productScreenshots as string[]) || [];

  // Unified description — prefer description, fallback to whatItDoes
  const productDescription = description || whatItDoes;

  const hasOverview = productCategory || targetUser || techStage || coreValueProp || productDescription || keyFeatures.length > 0;
  const hasMoat = !!(moatStage || moatType);
  const hasMaturity = techStage || claimsAssessment.length > 0 || hasMoat;
  const hasContent = hasOverview || hasMaturity || technologyStack.length > 0 || dataGaps.length > 0 || founderScreenshots.length > 0 || productData;

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
      {/* Score Card                                                        */}
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
      {/* Product Overview                                                  */}
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
            {/* Labeled stat cards for key fields */}
            {(productCategory || targetUser || techStage) && (
              <TooltipProvider>
                <div className="grid grid-cols-3 gap-3">
                  {productCategory && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-lg border bg-muted/50 px-3 py-2 cursor-default">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Category</p>
                          <MarkdownText inline className="text-sm font-medium line-clamp-1">{productCategory}</MarkdownText>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <MarkdownText className="text-xs">{productCategory}</MarkdownText>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {targetUser && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-lg border bg-muted/50 px-3 py-2 cursor-default">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Target User</p>
                          <MarkdownText inline className="text-sm font-medium line-clamp-1">{targetUser}</MarkdownText>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <MarkdownText className="text-xs">{targetUser}</MarkdownText>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {techStage && (
                    <div className="rounded-lg border bg-muted/50 px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tech Stage</p>
                      <p className="text-sm font-medium capitalize">{techStage}</p>
                    </div>
                  )}
              </div>
              </TooltipProvider>
            )}

            {/* Core Value Prop — highlighted callout */}
            {coreValueProp && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="mb-1 flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-primary">Value Proposition</span>
                </div>
                <MarkdownText inline className="text-sm font-medium leading-relaxed [&>p]:inline [&>p]:mb-0">
                  {coreValueProp}
                </MarkdownText>
              </div>
            )}

            {/* Description — unified display */}
            {productDescription && (
              <DescriptionBlock text={productDescription} forcePrint={forcePrint} />
            )}

            {/* Key Features — within description area */}
            {keyFeatures.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium">Key Features</h4>
                <div className="grid gap-2">
                  {keyFeatures.map((item, idx) => {
                    const isDeckOnly = item.verifiedBy.length === 1 && item.verifiedBy[0] === "deck";
                    return (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <MarkdownText className="flex-1 inline [&>p]:inline [&>p]:mb-0">{item.feature}</MarkdownText>
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
      {/* Product Maturity & Defensibility                                  */}
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

            {/* Moat Assessment — right after lifecycle */}
            {hasMoat && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium">Moat Assessment</h4>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {moatType && moatType !== "none" && (
                    <Badge variant="secondary" className="capitalize">
                      {moatType.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {moatSelfReinforcing !== undefined && (
                    <Badge variant={moatSelfReinforcing ? "default" : "outline"}>
                      {moatSelfReinforcing ? "Self-reinforcing" : "Not self-reinforcing"}
                    </Badge>
                  )}
                  {timeToReplicate && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Replication: {timeToReplicate}
                    </Badge>
                  )}
                </div>
                {moatStage && <MoatStageIndicator stage={moatStage} />}
                {moatEvidence.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {moatEvidence.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item}</MarkdownText>
                      </li>
                    ))}
                  </ul>
                )}
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
                          <td className="py-2 pr-3 font-medium"><MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item.claim}</MarkdownText></td>
                          <td className="py-2 pr-3 text-muted-foreground"><MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item.deckSays}</MarkdownText></td>
                          <td className="py-2 pr-3 text-muted-foreground"><MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item.evidence}</MarkdownText></td>
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
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Technology Stack                                                  */}
      {/* ================================================================= */}
      {technologyStack.length > 0 && (
        <Card data-testid="card-tech-stack">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Code className="h-5 w-5" />
              <span>Technology Stack</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <div className="flex flex-wrap gap-2">
                {technologyStack.map((item, idx) => {
                  const { name, detail } = parseTechBrackets(item.technology);
                  const tooltipText = [detail, !forcePrint && item.source ? `Source: ${item.source}` : ""]
                    .filter(Boolean)
                    .join(" \u00b7 ");
                  return tooltipText ? (
                    <Tooltip key={idx}>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="px-3 py-1 cursor-default">
                          {name}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{tooltipText}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Badge key={idx} variant="secondary" className="px-3 py-1">
                      {name}
                    </Badge>
                  );
                })}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Data Gaps                                                         */}
      {/* ================================================================= */}
      {showDataGaps && <DataGapsSection gaps={dataGaps} />}

      {/* ================================================================= */}
      {/* Product Showcase (founder screenshots)                            */}
      {/* ================================================================= */}
      {founderScreenshots.length > 0 && (
        <Card data-testid="card-product-showcase">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Image className="h-5 w-5" />
              <span data-testid="text-product-showcase-title">Product Showcase</span>
            </CardTitle>
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
