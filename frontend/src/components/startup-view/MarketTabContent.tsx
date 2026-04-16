import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlignmentDot } from "@/components/AlignmentDot";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { DataGapsSection, parseDataGapItems } from "@/components/DataGapsSection";
import { MarkdownText } from "@/components/MarkdownText";
import { ChartNoAxesColumn, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Evaluation } from "@/types/evaluation";

interface MarketTabContentProps {
  evaluation: Evaluation | null;
  marketWeight?: number;
  fundingStage?: string;
  showKeyFindingsAndRisks?: boolean;
  showDataGaps?: boolean;
  showScores?: boolean;
  forcePrint?: boolean;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

interface MarketSourceView {
  name: string;
  date: string;
  value: string;
  url?: string;
  tier?: string;
  geography?: string;
}

function sourceLabelFromUrl(url: string | null | undefined): string | null {
  if (!url || isPlaceholder(url)) return null;
  try {
    return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] || null;
  } catch {
    return null;
  }
}

function toMarketSources(value: unknown): MarketSourceView[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): MarketSourceView | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "Unknown source";
      const date = typeof record.date === "string" && record.date.trim() ? record.date.trim() : "Unknown date";
      const sourceValue =
        typeof record.value === "string" && record.value.trim() ? record.value.trim() : "Unknown value";
      const url = typeof record.url === "string" && record.url.trim() ? record.url.trim() : undefined;
      const tier = typeof record.tier === "string" && record.tier.trim() ? record.tier.trim()
        : typeof record.tier === "number" ? `Tier ${record.tier}` : undefined;
      const geography = typeof record.geography === "string" && record.geography.trim() ? record.geography.trim() : undefined;
      return { name, date, value: sourceValue, url, tier, geography };
    })
    .filter((item): item is MarketSourceView => item !== null);
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "aligned", "present"].includes(normalized)) return true;
    if (["false", "no", "n", "none", "unknown", "not provided"].includes(normalized)) return false;
  }
  return null;
}

function toEntryConditions(
  value: unknown,
): Array<{ factor: string; severity: string; note: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const factor = getMeaningful(record.factor) || "Unknown factor";
      const severity = getMeaningful(record.severity) || "moderate";
      const note = getMeaningful(record.note) || "Not provided";
      return { factor, severity, note };
    })
    .filter((item): item is { factor: string; severity: string; note: string } => item !== null);
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return [
    "unknown",
    "n/a",
    "na",
    "not available",
    "not performed",
    "pending",
    "timing assessment pending",
    "no notes",
    "neutral",
    "emerging",
  ].includes(normalized);
}

function getMeaningful(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isPlaceholder(trimmed) ? null : trimmed;
}

function extractLabeledMoney(
  text: string,
  label: "tam" | "sam" | "som",
): string | null {
  if (!text) return null;
  const re = new RegExp(
    `${label}\\b[^\\n.]{0,140}?(\\$\\s?\\d+(?:[.,]\\d+)?\\s?(?:[kmbt]|bn|million|billion|trillion))`,
    "i",
  );
  const match = text.match(re);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractFirstMoney(text: string): string | null {
  const match = text.match(
    /\$\s?\d+(?:[.,]\d+)?\s?(?:[kmbt]|bn|million|billion|trillion)/i,
  );
  return match?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

/** Extract a money range like "$500M-$1B" or "$500M to $1B" or just a single value */
function extractMoneyRange(text: string): string | null {
  if (!text || isPlaceholder(text)) return null;
  // Range pattern: $X - $Y or $X to $Y
  const rangeMatch = text.match(
    /(\$\s?\d+(?:[.,]\d+)?\s?(?:[kmbt]|bn|million|billion|trillion))\s*(?:[-–—]|to)\s*(\$\s?\d+(?:[.,]\d+)?\s?(?:[kmbt]|bn|million|billion|trillion))/i,
  );
  if (rangeMatch) return `${rangeMatch[1].trim()} – ${rangeMatch[2].trim()}`;
  // Single money value
  const singleMatch = text.match(
    /\$\s?\d+(?:[.,]\d+)?\s?(?:[kmbt]|bn|million|billion|trillion)/i,
  );
  if (singleMatch) return singleMatch[0].replace(/\s+/g, " ").trim();
  // Numeric-only fallback: "100 billion", "50M", etc.
  const numericMatch = text.match(
    /\d+(?:[.,]\d+)?\s?(?:[kmbt]|bn|million|billion|trillion)/i,
  );
  if (numericMatch) return `$${numericMatch[0].replace(/\s+/g, " ").trim()}`;
  return null;
}

/** Try to extract a clean numeric display from a sizing value */
function cleanSizingValue(raw: string): string {
  if (raw === "Not provided") return raw;
  const extracted = extractMoneyRange(raw);
  return extracted ?? raw;
}

/** Extract just the CAGR percentage from a verbose string like "Cloud: ~19.9% CAGR (public cloud...)" */
function extractCagrNumber(raw: string): { number: string; detail: string | null } {
  if (!raw || raw === "Not provided") return { number: raw, detail: null };
  // Try to find percentage patterns like "~19.9%", "17.5%-19.2%", "19.9% CAGR"
  const rangeMatch = raw.match(/~?(\d+(?:\.\d+)?)\s*%?\s*[-–—]\s*~?(\d+(?:\.\d+)?)\s*%/);
  if (rangeMatch) {
    return { number: `${rangeMatch[1]}% – ${rangeMatch[2]}%`, detail: raw };
  }
  const singleMatch = raw.match(/~?(\d+(?:\.\d+)?)\s*%/);
  if (singleMatch) {
    return { number: `~${singleMatch[1]}%`, detail: raw !== `~${singleMatch[1]}%` ? raw : null };
  }
  return { number: raw, detail: null };
}

function inferStructureType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("fragment")) return "fragmented";
  if (lower.includes("consolidat")) return "consolidating";
  if (lower.includes("concentrat")) return "concentrated";
  return "emerging";
}

function structureTypeToPosition(type: string): number {
  switch (type.toLowerCase()) {
    case "fragmented": return 10;
    case "emerging": return 33;
    case "consolidating": return 66;
    case "concentrated": return 90;
    default: return 33;
  }
}

function ConcentrationSpectrum({ structureType, direction, evidence }: { structureType: string; direction: string; evidence: string }) {
  const position = structureTypeToPosition(structureType);
  const isConsolidating = direction.toLowerCase().includes("consolidat");
  const isFragmenting = direction.toLowerCase().includes("fragment");

  return (
    <div className="space-y-3">
      <div className="relative pt-1 pb-4">
        <div className="h-3 rounded-full bg-gradient-to-r from-blue-200 via-amber-200 to-rose-300 dark:from-blue-900 dark:via-amber-900 dark:to-rose-900" />
        <div
          className="absolute top-0 w-4 h-5 rounded-full border-2 border-foreground bg-background shadow-sm"
          style={{ left: `calc(${position}% - 8px)` }}
        />
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>Fragmented</span>
          <span>Consolidated</span>
        </div>
      </div>
      {direction !== "Not provided" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Direction:</span>
          <span className="font-medium">
            {isConsolidating ? "→ Consolidating" : isFragmenting ? "← Fragmenting" : direction}
          </span>
        </div>
      )}
      {evidence !== "Not provided" && (
        <MarkdownText className="text-xs text-muted-foreground [&>p]:mb-0">{evidence}</MarkdownText>
      )}
    </div>
  );
}

// --- Market Lifecycle S-Curve ---

const LIFECYCLE_STAGES = [
  { key: "emerging",     cx: 44,  cy: 74, label: "Emerging",     labelX: 44,  regionStart: 0,   regionEnd: 72 },
  { key: "early_growth", cx: 104, cy: 44, label: "Early Growth", labelX: 104, regionStart: 72,  regionEnd: 144 },
  { key: "growth",       cx: 185, cy: 12, label: "Growth",       labelX: 185, regionStart: 144, regionEnd: 225 },
  { key: "mature",       cx: 268, cy: 18, label: "Maturity",     labelX: 268, regionStart: 225, regionEnd: 310 },
  { key: "declining",    cx: 340, cy: 56, label: "Decline",      labelX: 340, regionStart: 310, regionEnd: 370 },
] as const;

const LIFECYCLE_ALIASES: Record<string, string> = {
  introduction: "emerging",
  maturity: "mature",
  decline: "declining",
};

function LifecycleSCurve({ position }: { position: string }) {
  const raw = position.toLowerCase().trim().replace(/\s+/g, "_");
  const normalized = LIFECYCLE_ALIASES[raw] ?? raw;
  const activeStage = LIFECYCLE_STAGES.find((s) => s.key === normalized) ?? LIFECYCLE_STAGES[0];

  return (
    <div className="w-full">
      <svg viewBox="0 0 370 108" className="w-full h-auto" aria-label={`Market lifecycle: ${activeStage.label}`}>
        {/* Active stage highlight region */}
        <rect
          x={activeStage.regionStart}
          y={0}
          width={activeStage.regionEnd - activeStage.regionStart}
          height={92}
          rx={10}
          className="fill-violet-100/50 dark:fill-violet-900/20"
        />
        {/* Curve */}
        <path
          d="M 10,78 C 35,78 60,65 104,44 C 135,28 155,12 185,10 C 215,8 240,14 268,22 C 300,34 325,52 358,72"
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground/25"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Active dot with glow */}
        <circle
          cx={activeStage.cx}
          cy={activeStage.cy}
          r="10"
          className="fill-violet-500/15 dark:fill-violet-400/15"
        />
        <circle
          cx={activeStage.cx}
          cy={activeStage.cy}
          r="5.5"
          className="fill-violet-500 dark:fill-violet-400"
          stroke="white"
          strokeWidth="2.5"
        />
        {/* Stage labels */}
        {LIFECYCLE_STAGES.map((stage) => {
          const isActive = stage.key === normalized;
          return (
            <text
              key={stage.key}
              x={stage.labelX}
              y={104}
              textAnchor="middle"
              className={cn(
                "text-[10px] select-none",
                isActive
                  ? "fill-violet-600 dark:fill-violet-400 font-bold"
                  : "fill-muted-foreground/40",
              )}
            >
              {stage.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// --- Source Info Tooltip ---

function SourceInfoTooltip({ sources }: { sources: MarketSourceView[] }) {
  const hasExtra = sources.some((s) => s.date !== "Unknown date" || s.geography);
  if (!hasExtra || sources.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
        {sources.map((s, i) => (
          <div key={i}>
            <span className="font-medium">{s.name}</span>
            {s.date !== "Unknown date" && <span className="text-muted-foreground"> · {s.date}</span>}
            {s.geography && <span className="text-muted-foreground"> · {s.geography}</span>}
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

export function MarketTabContent({ evaluation, marketWeight, fundingStage, showKeyFindingsAndRisks = true, showDataGaps = true, showScores = true, forcePrint = false }: MarketTabContentProps) {
  if (!evaluation) {
    return (
      <Card className="border-dashed" data-testid="card-market-empty">
        <CardContent className="p-12 text-center">
          <ChartNoAxesColumn className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2" data-testid="text-no-market-title">No market data</h3>
          <p className="text-muted-foreground" data-testid="text-no-market-message">
            Market evaluation data has not been generated yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // --- Data extraction ---

  const marketData = toRecord(evaluation?.marketData);
  const marketSizing = toRecord(marketData.marketSizing);
  const tam = toRecord(marketSizing.tam);
  const sam = toRecord(marketSizing.sam);
  const som = toRecord(marketSizing.som);
  const bottomUpSanityCheck = toRecord(marketSizing.bottomUpSanityCheck);
  const deckVsResearch = toRecord(marketSizing.deckVsResearch);
  const growthTiming = toRecord(marketData.marketGrowthAndTiming);
  const growthRate = toRecord(growthTiming.growthRate);
  const whyNow = toRecord(growthTiming.whyNow);
  const marketLifecycle = toRecord(growthTiming.marketLifecycle);
  const marketStructure = toRecord(marketData.marketStructure);
  const concentrationTrend = toRecord(marketStructure.concentrationTrend);
  const entryConditions = toEntryConditions(marketStructure.entryConditions);
  const scoring = toRecord(marketData.scoring);
  const marketSubScores = (() => {
    const raw = scoring.subScores;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: unknown) => {
        if (!item || typeof item !== "object") return null;
        const r = item as Record<string, unknown>;
        const dimension = typeof r.dimension === "string" ? r.dimension.trim() : "";
        const weight = typeof r.weight === "number" ? r.weight : null;
        const score = typeof r.score === "number" ? r.score : null;
        if (!dimension || weight === null || score === null) return null;
        return { dimension, weight, score };
      })
      .filter((item: unknown): item is { dimension: string; weight: number; score: number } => item !== null);
  })();
  const scoringBasis = typeof scoring.scoringBasis === "string" ? scoring.scoringBasis.trim() : null;

  const confidence =
    (typeof scoring.confidence === "string" && scoring.confidence) ||
    (typeof marketData.confidence === "string" && marketData.confidence) ||
    "unknown";
  const legacySizeValidation = toRecord(marketData.marketSizeValidation);
  const legacySizeGrowth = toRecord(marketData.marketSizeGrowth);
  const legacyStructure = toRecord(marketData.marketStructureDynamics);
  const legacyMomentum = toRecord(marketData.marketMomentum);
  const keyFindings = toStringArray(marketData.keyFindings);
  const risks = toStringArray(marketData.risks);

  const textCorpus = [
    ...keyFindings,
    ...risks,
    getMeaningful(legacySizeValidation.rationale),
    getMeaningful(legacySizeGrowth.rationale),
    getMeaningful(legacyStructure.rationale),
    getMeaningful(legacyMomentum.rationale),
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n");

  const tamValue =
    getMeaningful(tam.value) ||
    extractLabeledMoney(textCorpus, "tam") ||
    extractFirstMoney(textCorpus) ||
    "Not provided";
  const samValue =
    getMeaningful(sam.value) ||
    extractLabeledMoney(textCorpus, "sam") ||
    "Not provided";
  const somValue =
    getMeaningful(som.value) ||
    extractLabeledMoney(textCorpus, "som") ||
    "Not provided";

  const tamConfidence = typeof tam.confidence === "string" ? tam.confidence : "unknown";
  const samConfidence = typeof sam.confidence === "string" ? sam.confidence : "unknown";
  const somConfidence = typeof som.confidence === "string" ? som.confidence : "unknown";
  const tamSources = toMarketSources(tam.sources);
  const samSources = toMarketSources(sam.sources);
  const somSources = toMarketSources(som.sources);

  const bottomUpCalculation = getMeaningful(bottomUpSanityCheck.calculation) || "Not provided";

  const dvr = {
    tam: toRecord(deckVsResearch.tam),
    sam: toRecord(deckVsResearch.sam),
    som: toRecord(deckVsResearch.som),
  };
  const dvrOverallNotes = String(deckVsResearch.overallNotes || "");

  // Backward compat: legacy flat shape
  if (!dvr.tam.claimed && deckVsResearch.tamClaimed) {
    dvr.tam = {
      claimed: deckVsResearch.tamClaimed,
      researched: deckVsResearch.tamResearched,
      alignmentScore: null,
      notes: deckVsResearch.notes || deckVsResearch.discrepancyNotes || "",
    };
  }

  const whyNowThesis =
    getMeaningful(whyNow.thesis) ||
    getMeaningful(legacyMomentum.rationale) ||
    "Not provided";
  const whyNowSupportedByResearch = toBoolean(whyNow.supportedByResearch);
  const whyNowEvidence = toStringArray(whyNow.evidence);
  const growthRateCagr = getMeaningful(growthRate.cagr) || "Not provided";
  const growthRateDeckClaimed = getMeaningful(growthRate.deckClaimed) || "Not provided";
  const growthRateDeckClaimedPeriod = getMeaningful(growthRate.deckClaimedPeriod);
  const growthRateDeckClaimedAnnualized = getMeaningful(growthRate.deckClaimedAnnualized);
  const growthRateYear = getMeaningful(growthRate.year);
  const growthRateSource = getMeaningful(growthRate.source);
  const growthRateSourceUrl = getMeaningful(growthRate.sourceUrl);
  const growthRateSourceLabel = growthRateSource || sourceLabelFromUrl(growthRateSourceUrl);
  const growthRateDataType = getMeaningful(growthRate.dataType);
  const standardizedGrowthRate = toRecord(growthTiming.standardizedGrowthRate);
  const standardizedCagr = typeof standardizedGrowthRate?.cagr === "number" ? standardizedGrowthRate.cagr : null;
  const standardizedBasis = getMeaningful(standardizedGrowthRate?.originalBasis);
  const growthTrajectory = getMeaningful(growthRate.trajectory) || getMeaningful(growthTiming.trajectory);
  const lifecyclePosition = getMeaningful(marketLifecycle.position) || "Not provided";
  const lifecycleEvidence = getMeaningful(marketLifecycle.evidence) || "Not provided";

  const structureType =
    getMeaningful(marketStructure.structureType) ||
    inferStructureType(getMeaningful(legacyStructure.rationale) || "");
  const entryAssessment =
    (entryConditions.length > 0
      ? entryConditions.map((item) => `${item.factor}: ${item.severity}`).join(" · ")
      : null) ||
    (typeof evaluation?.marketScore === "number" && evaluation.marketScore >= 75
      ? "favorable"
      : "neutral");
  const concentrationDirection = getMeaningful(concentrationTrend.direction) || "Not provided";
  const concentrationEvidence = getMeaningful(concentrationTrend.evidence) || "Not provided";

  const dataGapItems = (() => {
    const all = [
      ...parseDataGapItems(marketData.dataGaps),
      ...parseDataGapItems(marketData.marketResearchGaps),
      ...parseDataGapItems(marketData.researchGaps),
    ];
    const seen = new Set<string>();
    return all.filter((item) => {
      const key = item.gap.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  const tailwinds = Array.isArray(marketStructure.tailwinds)
    ? (marketStructure.tailwinds as Array<Record<string, unknown>>)
    : [];
  const headwinds = Array.isArray(marketStructure.headwinds)
    ? (marketStructure.headwinds as Array<Record<string, unknown>>)
    : [];

  // Sort entry conditions: High → Moderate → Low
  const severityOrder: Record<string, number> = { high: 0, moderate: 1, low: 2 };
  const sortedEntryConditions = [...entryConditions].sort(
    (a, b) => (severityOrder[a.severity.toLowerCase()] ?? 1) - (severityOrder[b.severity.toLowerCase()] ?? 1),
  );

  return (
    <div className="space-y-6">
      {showScores && (
        <SectionScoreCard
          title="Market Score"
          score={typeof evaluation?.marketScore === "number" ? evaluation.marketScore : 0}
          weight={typeof marketWeight === "number" ? marketWeight : undefined}
          confidence={confidence}
          scoringBasis={scoringBasis ?? undefined}
          subScores={marketSubScores}
          dataTestId="card-market-score"
          confidenceTestId="badge-market-confidence"
        />
      )}

      {/* --- Market Sizing Inverted Triangle --- */}
      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="text-base">Market Sizing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const tamDisplay = cleanSizingValue(tamValue);
            const samDisplay = cleanSizingValue(samValue);
            const somDisplay = cleanSizingValue(somValue);
            const allEmpty = tamDisplay === "Not provided" && samDisplay === "Not provided" && somDisplay === "Not provided";

            if (allEmpty) {
              return (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  Market sizing data not available
                </div>
              );
            }

            const tiers = [
              { label: "TAM", value: tamDisplay, confidence: tamConfidence, color: "bg-blue-100 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", text: "text-blue-800 dark:text-blue-300", labelColor: "text-blue-600 dark:text-blue-400", width: "w-full" },
              { label: "SAM", value: samDisplay, confidence: samConfidence, color: "bg-emerald-100 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", text: "text-emerald-800 dark:text-emerald-300", labelColor: "text-emerald-600 dark:text-emerald-400", width: "w-[75%]" },
              { label: "SOM", value: somDisplay, confidence: somConfidence, color: "bg-amber-100 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", text: "text-amber-800 dark:text-amber-300", labelColor: "text-amber-600 dark:text-amber-400", width: "w-[50%]" },
            ];

            return (
              <div className="flex flex-col items-center gap-2">
                {tiers.map((tier) => (
                  <div key={tier.label} className={cn("rounded-lg border-2 px-4 py-3 flex items-center justify-between transition-all", tier.color, tier.width)}>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-bold", tier.labelColor)}>{tier.label}</span>
                      <ConfidenceBadge confidence={tier.confidence} />
                    </div>
                    <p className={cn("text-lg font-bold tabular-nums", tier.text)}>
                      {tier.value}
                    </p>
                  </div>
                ))}

                {/* Source info */}
                {tamSources.length > 0 && (
                  <div className="mt-1">
                    {!forcePrint && <SourceInfoTooltip sources={tamSources} />}
                  </div>
                )}

                {/* Deck vs Research comparison table */}
                {(dvr.tam.claimed || dvr.tam.researched || dvr.sam.claimed || dvr.sam.researched || dvr.som.claimed || dvr.som.researched || tamSources.length > 0 || samSources.length > 0 || somSources.length > 0) && (
                  <div className="w-full mt-2 rounded-lg border text-xs">
                    <div className="grid grid-cols-[50px_1fr_1fr_1fr] border-b bg-muted/30">
                      <div className="px-2 py-1.5 font-medium text-muted-foreground" />
                      <div className="px-2 py-1.5 font-medium text-muted-foreground">Value</div>
                      <div className="px-2 py-1.5 font-medium text-muted-foreground">Sources</div>
                      <div className="px-2 py-1.5 font-medium text-muted-foreground text-center">Deck vs Research</div>
                    </div>
                    {[
                      { label: "TAM", value: cleanSizingValue(tamValue), sources: tamSources, alignment: dvr.tam },
                      { label: "SAM", value: cleanSizingValue(samValue), sources: samSources, alignment: dvr.sam },
                      { label: "SOM", value: cleanSizingValue(somValue), sources: somSources, alignment: dvr.som },
                    ].map((row) => (
                      <div key={row.label} className="grid grid-cols-[50px_1fr_1fr_1fr] border-b last:border-b-0">
                        <div className="px-2 py-2 font-bold">{row.label}</div>
                        <div className="px-2 py-2 font-semibold tabular-nums">{row.value}</div>
                        <div className="px-2 py-2 text-muted-foreground">
                          {row.sources.length > 0 ? row.sources.map((s, si) => (
                            <div key={si}>
                              {s.url ? (
                                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2"><MarkdownText className="inline [&>p]:inline [&>p]:mb-0" inline>{s.name}</MarkdownText></a>
                              ) : <MarkdownText className="inline [&>p]:inline [&>p]:mb-0" inline>{s.name}</MarkdownText>}
                              {s.tier && <span className="text-[10px] text-muted-foreground/60 ml-1">({s.tier})</span>}
                            </div>
                          )) : "—"}
                        </div>
                        <div className="px-2 py-2 flex items-center justify-center">
                          <AlignmentDot
                            score={typeof row.alignment?.alignmentScore === 'number' ? row.alignment.alignmentScore : null}
                            claimed={String(row.alignment?.claimed || "")}
                            researched={String(row.alignment?.researched || "")}
                            notes={String(row.alignment?.notes || "")}
                          />
                        </div>
                      </div>
                    ))}
                    {dvrOverallNotes && dvrOverallNotes !== "No notes" && (
                      <div className="px-3 py-2 bg-muted/20 text-[11px] text-muted-foreground border-t">
                        <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{dvrOverallNotes}</MarkdownText>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Bottom-Up Sanity Check */}
          {(!fundingStage || /pre.?seed|seed|series.?a/i.test(fundingStage)) && bottomUpCalculation !== "Not provided" && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-sm font-medium">Bottom-up check</p>
              <MarkdownText className="text-xs text-muted-foreground [&>p]:mb-0">{bottomUpCalculation}</MarkdownText>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Growth Section --- */}
      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="text-base">Growth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            {/* CAGR Hero */}
            {(() => {
              const cagr = extractCagrNumber(growthRateCagr);
              return (
                <div className="rounded-lg border bg-muted/20 p-4 flex flex-col items-center justify-center gap-2">
                  <p className="text-3xl font-bold tracking-tight tabular-nums">
                    {cagr.number}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">CAGR</span>
                    {growthTrajectory && (
                      <Badge variant="outline" className="text-[10px]">
                        {growthTrajectory.toLowerCase().includes("accel") ? "↑ " : growthTrajectory.toLowerCase().includes("decel") ? "↓ " : "→ "}
                        {growthTrajectory}
                      </Badge>
                    )}
                  </div>
                  {cagr.detail && (
                    <MarkdownText className="text-[11px] text-muted-foreground text-center max-w-xs mt-1 [&>p]:mb-0">{cagr.detail}</MarkdownText>
                  )}
                  {growthRateDeckClaimed !== "Not provided" && growthRateDeckClaimed !== growthRateCagr && (
                    <div className="flex flex-col gap-1 text-xs mt-1">
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground">Deck: <span className="font-medium text-foreground">{extractCagrNumber(growthRateDeckClaimed).number}{growthRateDeckClaimedPeriod && growthRateDeckClaimedPeriod !== "Unknown" ? ` ${growthRateDeckClaimedPeriod}` : ""}</span></span>
                        <span className="text-muted-foreground">Research: <span className="font-medium text-foreground">{cagr.number} CAGR</span></span>
                      </div>
                      {growthRateDeckClaimedAnnualized && growthRateDeckClaimedAnnualized !== "Unknown" && growthRateDeckClaimedPeriod && growthRateDeckClaimedPeriod !== "YoY" && (
                        <span className="text-[10px] text-muted-foreground">Deck annualized: <span className="font-medium text-foreground">{growthRateDeckClaimedAnnualized}</span></span>
                      )}
                    </div>
                  )}
                  {standardizedCagr !== null && standardizedBasis && standardizedBasis !== "YoY" && standardizedBasis !== "unknown" && (
                    <span className="text-[10px] text-muted-foreground">Standardized CAGR: <span className="font-medium text-foreground">{standardizedCagr.toFixed(1)}%</span></span>
                  )}
                  {(growthRateYear || growthRateSourceLabel || (growthRateDataType && growthRateDataType !== "unknown")) && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {growthRateYear && growthRateYear !== "Unknown" && (
                        <Badge variant="outline" className="text-[10px] h-5">{growthRateYear}</Badge>
                      )}
                      {growthRateSourceLabel && (
                        <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground max-w-full">
                          Source: {growthRateSourceLabel}
                        </Badge>
                      )}
                      {growthRateDataType && growthRateDataType !== "unknown" && (
                        <Badge variant={growthRateDataType === "actual" ? "default" : "secondary"} className="text-[10px] h-5">
                          {growthRateDataType === "forecast" ? "Forecast" : "Actual"}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Why Now */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-sm font-medium">Why Now</p>
              <MarkdownText className="text-xs text-muted-foreground [&>p]:mb-0">{whyNowThesis}</MarkdownText>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Supported by research:</span>
                <Badge variant={whyNowSupportedByResearch === true ? "default" : whyNowSupportedByResearch === false ? "secondary" : "outline"}>
                  {whyNowSupportedByResearch === null ? "Not provided" : whyNowSupportedByResearch ? "Yes" : "No"}
                </Badge>
              </div>
              {whyNowEvidence.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1">
                  {whyNowEvidence.slice(0, 4).map((item) => (
                    <li key={item} className="text-xs text-muted-foreground"><MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item}</MarkdownText></li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No evidence provided</p>
              )}
            </div>
          </div>

          {/* Market Lifecycle S-Curve */}
          {lifecyclePosition !== "Not provided" && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="grid grid-cols-2 gap-6 items-center">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Market Lifecycle</p>
                  {lifecycleEvidence !== "Not provided" && (
                    <MarkdownText className="text-xs text-muted-foreground leading-relaxed [&>p]:mb-1.5">{lifecycleEvidence}</MarkdownText>
                  )}
                </div>
                <LifecycleSCurve position={lifecyclePosition} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Market Structure --- */}
      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="text-base">Market Structure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Structure:</span>
              <Badge variant="outline" className="capitalize">{structureType}</Badge>
            </div>
            {sortedEntryConditions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Entry Conditions</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="pb-1 pr-3 text-left font-medium">Factor</th>
                        <th className="pb-1 pr-3 text-left font-medium">Severity</th>
                        <th className="pb-1 text-left font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEntryConditions.map((item, idx) => (
                        <tr key={idx} className="border-b border-border/40 last:border-0">
                          <td className="py-1.5 pr-3 font-medium">{item.factor}</td>
                          <td className="py-1.5 pr-3">
                            <Badge
                              variant="outline"
                              className={
                                item.severity.toLowerCase() === "high"
                                  ? "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
                                  : item.severity.toLowerCase() === "moderate"
                                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                                    : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                              }
                            >
                              {item.severity}
                            </Badge>
                          </td>
                          <td className="py-1.5 text-muted-foreground"><MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item.note}</MarkdownText></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Entry Conditions: <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{entryAssessment}</MarkdownText></p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <p className="text-sm font-medium">Concentration Trend</p>
            <ConcentrationSpectrum structureType={structureType} direction={concentrationDirection} evidence={concentrationEvidence} />
          </div>

          {/* Tailwinds & Headwinds — card per item */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Tailwinds</p>
              {tailwinds.length > 0 ? (
                <div className="space-y-2">
                  {tailwinds.slice(0, 4).map((item, index) => (
                    <div key={`tw-${index}`} className="rounded-lg border bg-emerald-50/30 dark:bg-emerald-950/10 p-2.5 space-y-1">
                      <MarkdownText className="text-xs font-medium [&>p]:mb-0">{String(item.factor || "Unknown")}</MarkdownText>
                      <MarkdownText className="text-xs text-muted-foreground [&>p]:mb-0">{String(item.impact || "n/a")}</MarkdownText>
                      {typeof item.source === "string" && item.source.trim().length > 0 && (
                        <MarkdownText className="text-[10px] text-muted-foreground/60 [&>p]:mb-0">{item.source}</MarkdownText>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No tailwinds provided</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Headwinds</p>
              {headwinds.length > 0 ? (
                <div className="space-y-2">
                  {headwinds.slice(0, 4).map((item, index) => (
                    <div key={`hw-${index}`} className="rounded-lg border bg-rose-50/30 dark:bg-rose-950/10 p-2.5 space-y-1">
                      <MarkdownText className="text-xs font-medium [&>p]:mb-0">{String(item.factor || "Unknown")}</MarkdownText>
                      <MarkdownText className="text-xs text-muted-foreground [&>p]:mb-0">{String(item.impact || "n/a")}</MarkdownText>
                      {typeof item.source === "string" && item.source.trim().length > 0 && (
                        <MarkdownText className="text-[10px] text-muted-foreground/60 [&>p]:mb-0">{item.source}</MarkdownText>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No headwinds provided</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- Key Findings & Risks --- */}
      {showKeyFindingsAndRisks && (keyFindings.length > 0 || risks.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Key Findings & Risks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {keyFindings.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Findings</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {keyFindings.slice(0, 4).map((item) => (
                    <li key={item}><MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item}</MarkdownText></li>
                  ))}
                </ul>
              </div>
            )}
            {risks.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Risks</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {risks.slice(0, 4).map((item) => (
                    <li key={item}><MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item}</MarkdownText></li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showDataGaps && <DataGapsSection gaps={dataGapItems} />}
    </div>
  );
}
