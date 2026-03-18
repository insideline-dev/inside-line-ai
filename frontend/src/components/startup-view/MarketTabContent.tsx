import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { DataGapsSection, parseDataGapItems } from "@/components/DataGapsSection";
import { MarkdownText } from "@/components/MarkdownText";
import { ChartNoAxesColumn } from "lucide-react";
import type { Evaluation } from "@/types/evaluation";

interface MarketTabContentProps {
  evaluation: Evaluation | null;
  marketWeight?: number;
  fundingStage?: string;
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

const LIFECYCLE_STAGES = ["Introduction", "Growth", "Maturity", "Decline"] as const;

function LifecycleBar({ position }: { position: string }) {
  const normalized = position.toLowerCase().trim();
  const matchIdx = LIFECYCLE_STAGES.findIndex((s) => normalized.includes(s.toLowerCase()));
  const activeIdx = matchIdx >= 0 ? matchIdx : -1;
  // Sweet-spot = Growth stage (index 1)
  const sweetSpotIdx = 1;

  return (
    <div className="flex items-center gap-0.5">
      {LIFECYCLE_STAGES.map((stage, idx) => {
        const isActive = idx === activeIdx;
        const isPast = idx < activeIdx;
        const isSweetSpot = idx === sweetSpotIdx;
        return (
          <div key={stage} className={`flex-1 text-center ${isSweetSpot ? "rounded-md ring-1 ring-emerald-300/50 ring-offset-1 bg-emerald-50/30 dark:bg-emerald-950/20 dark:ring-emerald-700/40" : ""}`}>
            <div
              className={`h-2.5 rounded-full ${
                isActive
                  ? "bg-violet-500"
                  : isPast
                    ? "bg-violet-300 dark:bg-violet-700"
                    : "bg-muted"
              }`}
            />
            <p className={`mt-1 text-[10px] ${isActive ? "font-semibold text-violet-600 dark:text-violet-400" : "text-muted-foreground"}`}>
              {stage}
              {isSweetSpot && <span className="block text-[8px] text-emerald-600 dark:text-emerald-400">sweet spot</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function MarketTabContent({ evaluation, marketWeight, fundingStage }: MarketTabContentProps) {
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

  const tamMethodology = getMeaningful(tam.methodology) || "derived";
  const samMethodology = getMeaningful(sam.methodology) || "derived";
  const somMethodology = getMeaningful(som.methodology) || "derived";
  const tamConfidence = typeof tam.confidence === "string" ? tam.confidence : "unknown";
  const samConfidence = typeof sam.confidence === "string" ? sam.confidence : "unknown";
  const somConfidence = typeof som.confidence === "string" ? som.confidence : "unknown";
  const tamSources = toMarketSources(tam.sources);
  const samSources = toMarketSources(sam.sources);

  const bottomUpCalculation = getMeaningful(bottomUpSanityCheck.calculation) || "Not provided";
  const bottomUpPlausible = toBoolean(bottomUpSanityCheck.plausible);
  const bottomUpNotes = getMeaningful(bottomUpSanityCheck.notes) || "Not provided";

  const deckTamClaimed = getMeaningful(deckVsResearch.tamClaimed) || "Not provided";
  const deckTamResearched = getMeaningful(deckVsResearch.tamResearched) || "Not provided";
  const deckDiscrepancyFlag = toBoolean(deckVsResearch.discrepancyFlag);
  const deckDiscrepancyNotes =
    getMeaningful(deckVsResearch.notes) ||
    getMeaningful(deckVsResearch.discrepancyNotes) ||
    "Not provided";

  const whyNowThesis =
    getMeaningful(whyNow.thesis) ||
    getMeaningful(legacyMomentum.rationale) ||
    "Not provided";
  const whyNowSupportedByResearch = toBoolean(whyNow.supportedByResearch);
  const whyNowEvidence = toStringArray(whyNow.evidence);
  const timingAssessment =
    getMeaningful(growthTiming.timingAssessment) ||
    (typeof evaluation?.marketScore === "number" && evaluation.marketScore >= 75
      ? "right_time"
      : "slightly_early");
  const timingRationale = getMeaningful(legacySizeGrowth.rationale) || "Not provided";
  const growthRateCagr = getMeaningful(growthRate.cagr) || "Not provided";
  const growthRatePeriod = getMeaningful(growthRate.period) || "Not provided";
  const growthRateSource = getMeaningful(growthRate.source) || "Not provided";
  const growthRateDeckClaimed = getMeaningful(growthRate.deckClaimed) || "Not provided";
  const growthTrajectory = getMeaningful(growthRate.trajectory) || getMeaningful(growthTiming.trajectory);
  const growthRateDiscrepancyFlag = toBoolean(growthRate.discrepancyFlag);
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

  return (
    <div className="space-y-6">
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

      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="text-base">Market Sizing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {[
              { label: "TAM", value: tamValue, methodology: tamMethodology, confidence: tamConfidence, sources: tamSources, width: "100%", bg: "bg-violet-100 dark:bg-violet-900/40 border-violet-200 dark:border-violet-800" },
              { label: "SAM", value: samValue, methodology: samMethodology, confidence: samConfidence, sources: samSources, width: "70%", bg: "bg-violet-200 dark:bg-violet-800/40 border-violet-300 dark:border-violet-700" },
              { label: "SOM", value: somValue, methodology: somMethodology, confidence: somConfidence, sources: [] as MarketSourceView[], width: "40%", bg: "bg-violet-300 dark:bg-violet-700/40 border-violet-400 dark:border-violet-600" },
            ].map((item) => (
              <div key={item.label} className="mx-auto" style={{ width: item.width }}>
                <div className={`rounded-lg border p-3 ${item.bg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-wide">{item.label}</span>
                      <span className="text-sm font-semibold">{item.value}</span>
                    </div>
                    <ConfidenceBadge confidence={item.confidence} dataTestId={`badge-market-${item.label.toLowerCase()}-confidence`} />
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>{item.methodology}</span>
                    {item.sources.length > 0 && (
                      <span>{item.sources.map((s) => s.name).join(", ")}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {(tamSources.length > 0 || samSources.length > 0) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Source Attribution</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-1 pr-3 text-left font-medium">Estimate</th>
                      <th className="pb-1 pr-3 text-left font-medium">Source</th>
                      <th className="pb-1 pr-3 text-left font-medium">Tier</th>
                      <th className="pb-1 pr-3 text-left font-medium">Date</th>
                      <th className="pb-1 text-left font-medium">Geography</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tamSources.map((source, idx) => (
                      <tr key={`tam-${idx}`} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5 pr-3 font-medium">TAM</td>
                        <td className="py-1.5 pr-3">{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">{source.name}</a> : source.name}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{source.tier || "—"}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{source.date}</td>
                        <td className="py-1.5 text-muted-foreground">{source.geography || "—"}</td>
                      </tr>
                    ))}
                    {samSources.map((source, idx) => (
                      <tr key={`sam-${idx}`} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5 pr-3 font-medium">SAM</td>
                        <td className="py-1.5 pr-3">{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">{source.name}</a> : source.name}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{source.tier || "—"}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{source.date}</td>
                        <td className="py-1.5 text-muted-foreground">{source.geography || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={`grid gap-3 ${!fundingStage || /pre.?seed|seed|series.?a/i.test(fundingStage) ? "md:grid-cols-2" : ""}`}>
            {(!fundingStage || /pre.?seed|seed|series.?a/i.test(fundingStage)) && (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <p className="text-sm font-medium">Bottom-Up Sanity Check</p>
                <p className="text-xs text-muted-foreground">Calculation: {bottomUpCalculation}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Plausible:</span>
                  <Badge variant={bottomUpPlausible === true ? "default" : bottomUpPlausible === false ? "secondary" : "outline"}>
                    {bottomUpPlausible === null ? "Not provided" : bottomUpPlausible ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Notes: </span>
                  <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{bottomUpNotes}</MarkdownText>
                </div>
              </div>
            )}

            <div className={`rounded-lg border p-3 space-y-3 ${deckDiscrepancyFlag === true ? "border-l-4 border-l-rose-400 bg-rose-50/30 dark:bg-rose-950/10" : deckDiscrepancyFlag === false ? "border-l-4 border-l-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10" : "bg-muted/20"}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Deck vs Research</p>
                <Badge variant={deckDiscrepancyFlag === true ? "destructive" : deckDiscrepancyFlag === false ? "secondary" : "outline"}>
                  {deckDiscrepancyFlag === null ? "No data" : deckDiscrepancyFlag ? "Discrepancy" : "Aligned"}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>TAM — Deck claim</span>
                    <span className="font-medium text-foreground">{deckTamClaimed}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>TAM — Research finding</span>
                    <span className="font-medium text-foreground">{deckTamResearched}</span>
                  </div>
                  <div className={`h-2 rounded-full ${deckDiscrepancyFlag === true ? "bg-rose-400" : "bg-emerald-400"}`} />
                </div>
              </div>
              {growthRateDeckClaimed !== "Not provided" && (
                <div className="space-y-2 border-t border-border/40 pt-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Growth — Deck claim</span>
                      <span className="font-medium text-foreground">{growthRateDeckClaimed}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Growth — Research CAGR</span>
                      <span className="font-medium text-foreground">{growthRateCagr}</span>
                    </div>
                    <div className={`h-2 rounded-full ${growthRateDiscrepancyFlag === true ? "bg-rose-400" : "bg-emerald-400"}`} />
                  </div>
                </div>
              )}
              {deckDiscrepancyNotes !== "Not provided" && (
                <MarkdownText className="text-[10px] text-muted-foreground border-t border-border/40 pt-2 [&>p]:mb-0">
                  {deckDiscrepancyNotes}
                </MarkdownText>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="text-base">Growth & Timing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p>
              <span className="font-medium">Timing:</span> {timingAssessment}
            </p>
            <MarkdownText className="text-muted-foreground [&>p]:mb-0">{timingRationale}</MarkdownText>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Growth Rate</p>
                {growthTrajectory && (
                  <Badge variant="outline" className="text-[10px]">
                    {growthTrajectory.toLowerCase().includes("accel") ? "↑ " : growthTrajectory.toLowerCase().includes("decel") ? "↓ " : "→ "}
                    {growthTrajectory}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">CAGR: {growthRateCagr}</p>
              <p className="text-xs text-muted-foreground">Period: {growthRatePeriod}</p>
              <p className="text-xs text-muted-foreground">Source: {growthRateSource}</p>
              <p className="text-xs text-muted-foreground">Deck Claimed: {growthRateDeckClaimed}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Discrepancy:</span>
                <Badge variant={growthRateDiscrepancyFlag === true ? "destructive" : growthRateDiscrepancyFlag === false ? "secondary" : "outline"}>
                  {growthRateDiscrepancyFlag === null ? "Not provided" : growthRateDiscrepancyFlag ? "Yes" : "No"}
                </Badge>
              </div>
            </div>

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
                    <li key={item} className="text-xs text-muted-foreground">{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No evidence provided</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <p className="text-sm font-medium">Market Lifecycle</p>
            <LifecycleBar position={lifecyclePosition} />
            {lifecycleEvidence !== "Not provided" && (
              <MarkdownText className="text-xs text-muted-foreground [&>p]:mb-0">{lifecycleEvidence}</MarkdownText>
            )}
          </div>
        </CardContent>
      </Card>

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
            {entryConditions.length > 0 ? (
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
                      {entryConditions.map((item, idx) => (
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
                          <td className="py-1.5 text-muted-foreground">{item.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Entry Conditions: {entryAssessment}</p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <p className="text-sm font-medium">Concentration Trend</p>
            <ConcentrationSpectrum structureType={structureType} direction={concentrationDirection} evidence={concentrationEvidence} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-sm font-medium mb-2">Tailwinds</p>
              {tailwinds.length > 0 ? (
                <ul className="space-y-1">
                  {tailwinds.slice(0, 4).map((item, index) => (
                    <li key={`${String(item.factor)}-${index}`} className="text-xs text-muted-foreground">
                      {String(item.factor || "Unknown")} ({String(item.impact || "n/a")})
                      {typeof item.source === "string" && item.source.trim().length > 0 ? ` · ${item.source}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No tailwinds provided</p>
              )}
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-sm font-medium mb-2">Headwinds</p>
              {headwinds.length > 0 ? (
                <ul className="space-y-1">
                  {headwinds.slice(0, 4).map((item, index) => (
                    <li key={`${String(item.factor)}-${index}`} className="text-xs text-muted-foreground">
                      {String(item.factor || "Unknown")} ({String(item.impact || "n/a")})
                      {typeof item.source === "string" && item.source.trim().length > 0 ? ` · ${item.source}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No headwinds provided</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {(keyFindings.length > 0 || risks.length > 0) && (
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
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {risks.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Risks</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {risks.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <DataGapsSection gaps={dataGapItems} />

    </div>
  );
}
