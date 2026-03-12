import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { ChartNoAxesColumn } from "lucide-react";
import type { Evaluation } from "@/types/evaluation";

interface MarketTabContentProps {
  evaluation: Evaluation | null;
  marketWeight?: number;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function toStructuredGapStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (typeof item === "string" && item.trim().length > 0) return [item.trim()];
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const gap = typeof record.gap === "string" ? record.gap.trim() : "";
      const description = typeof record.description === "string" ? record.description.trim() : "";
      const impact = typeof record.impact === "string" ? record.impact.trim() : "";
      const text = [gap, description].filter(Boolean).join(": ");
      if (!text) return [];
      return impact ? [`${text} (${impact} impact)`] : [text];
    })
    .filter((item) => item.length > 0);
}

interface MarketSourceView {
  name: string;
  date: string;
  value: string;
  url?: string;
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
      return { name, date, value: sourceValue, url };
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

export function MarketTabContent({ evaluation, marketWeight }: MarketTabContentProps) {
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
  const entryRationale =
    (entryConditions.length > 0
      ? entryConditions.map((item) => item.note).join(" ")
      : null) ||
    getMeaningful(legacyStructure.rationale) ||
    "Not provided";
  const concentrationDirection = getMeaningful(concentrationTrend.direction) || "Not provided";
  const concentrationEvidence = getMeaningful(concentrationTrend.evidence) || "Not provided";

  const dataGaps = [
    ...toStructuredGapStrings(marketData.dataGaps),
    ...toStructuredGapStrings(marketData.marketResearchGaps),
    ...toStructuredGapStrings(marketData.researchGaps),
  ].filter((item, index, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index);
  const diligenceItems = toStringArray(marketData.diligenceItems).length > 0
    ? toStringArray(marketData.diligenceItems)
    : dataGaps;
  const founderPitchRecommendations = Array.isArray(marketData.founderPitchRecommendations)
    ? (marketData.founderPitchRecommendations as Array<Record<string, unknown>>)
    : [];
  const tailwinds = Array.isArray(marketStructure.tailwinds)
    ? (marketStructure.tailwinds as Array<Record<string, unknown>>)
    : [];
  const headwinds = Array.isArray(marketStructure.headwinds)
    ? (marketStructure.headwinds as Array<Record<string, unknown>>)
    : [];

  return (
    <div className="space-y-6">
      <Card
        className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background"
        data-testid="card-market-score"
      >
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3">
                <ChartNoAxesColumn className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Market Score</h3>
                <p className="text-sm text-muted-foreground">
                  {typeof marketWeight === "number" ? `${marketWeight}%` : ""} weight in overall evaluation
                </p>
                <ConfidenceBadge
                  confidence={confidence}
                  className="mt-2"
                  dataTestId="badge-market-confidence"
                />
              </div>
            </div>
            {typeof evaluation?.marketScore === "number" && (
              <div className="text-right">
                <span
                  className={`text-4xl font-bold ${
                    evaluation.marketScore >= 80
                      ? "text-green-600"
                      : evaluation.marketScore >= 60
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}
                >
                  {Math.round(evaluation.marketScore)}
                </span>
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="text-base">Market Sizing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { label: "TAM", value: tamValue, methodology: tamMethodology, confidence: tamConfidence, sources: tamSources },
              { label: "SAM", value: samValue, methodology: samMethodology, confidence: samConfidence, sources: samSources },
              { label: "SOM", value: somValue, methodology: somMethodology, confidence: somConfidence, sources: [] as MarketSourceView[] },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-primary/10 bg-muted/20 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground">{item.label}</p>
                  <ConfidenceBadge confidence={item.confidence} dataTestId={`badge-market-${item.label.toLowerCase()}-confidence`} />
                </div>
                <p className="text-sm font-medium break-words">{item.value}</p>
                <p className="text-xs text-muted-foreground">Methodology: {item.methodology}</p>
                {item.sources.length > 0 ? (
                  <ul className="space-y-1">
                    {item.sources.slice(0, 3).map((source, index) => (
                      <li key={`${source.name}-${index}`} className="text-xs text-muted-foreground">
                        {source.url ? (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-dotted underline-offset-2"
                          >
                            {source.name}
                          </a>
                        ) : (
                          source.name
                        )}{" "}
                        · {source.date}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No sources provided</p>
                )}
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-sm font-medium">Bottom-Up Sanity Check</p>
              <p className="text-xs text-muted-foreground">Calculation: {bottomUpCalculation}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Plausible:</span>
                <Badge variant={bottomUpPlausible === true ? "default" : bottomUpPlausible === false ? "secondary" : "outline"}>
                  {bottomUpPlausible === null ? "Not provided" : bottomUpPlausible ? "Yes" : "No"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Notes: {bottomUpNotes}</p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-sm font-medium">Deck vs Research</p>
              <p className="text-xs text-muted-foreground">TAM Claimed: {deckTamClaimed}</p>
              <p className="text-xs text-muted-foreground">TAM Researched: {deckTamResearched}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Discrepancy:</span>
                <Badge variant={deckDiscrepancyFlag === true ? "destructive" : deckDiscrepancyFlag === false ? "secondary" : "outline"}>
                  {deckDiscrepancyFlag === null ? "Not provided" : deckDiscrepancyFlag ? "Yes" : "No"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Notes: {deckDiscrepancyNotes}</p>
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
            <p className="text-muted-foreground">{timingRationale}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-sm font-medium">Growth Rate</p>
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
              <p className="text-xs text-muted-foreground">{whyNowThesis}</p>
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

          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-sm font-medium">Market Lifecycle</p>
            <p className="text-xs text-muted-foreground">Position: {lifecyclePosition}</p>
            <p className="text-xs text-muted-foreground">Evidence: {lifecycleEvidence}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle className="text-base">Market Structure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p>
              <span className="font-medium">Structure:</span> {structureType}
            </p>
            <p>
              <span className="font-medium">Entry Conditions:</span> {entryAssessment}
            </p>
            <p className="text-muted-foreground">{entryRationale}</p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-sm font-medium">Concentration Trend</p>
            <p className="text-xs text-muted-foreground">Direction: {concentrationDirection}</p>
            <p className="text-xs text-muted-foreground">Evidence: {concentrationEvidence}</p>
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

      {(dataGaps.length > 0 || diligenceItems.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data Gaps & Diligence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dataGaps.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Data Gaps</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {dataGaps.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {diligenceItems.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Diligence Items</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {diligenceItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {founderPitchRecommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Founder Pitch Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {founderPitchRecommendations.map((item, index) => (
              <div key={`${String(item.deckMissingElement ?? "rec")}-${index}`} className="rounded-md border p-3">
                <p className="text-sm font-medium">{String(item.deckMissingElement ?? "Recommendation")}</p>
                {typeof item.whyItMatters === "string" && item.whyItMatters.trim().length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">{item.whyItMatters}</p>
                )}
                {typeof item.recommendation === "string" && item.recommendation.trim().length > 0 && (
                  <p className="mt-2 text-sm">{item.recommendation}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
