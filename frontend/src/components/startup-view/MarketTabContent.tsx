import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const marketData = toRecord(evaluation?.marketData);
  const marketSizing = toRecord(marketData.marketSizing);
  const tam = toRecord(marketSizing.tam);
  const sam = toRecord(marketSizing.sam);
  const som = toRecord(marketSizing.som);
  const growthTiming = toRecord(marketData.marketGrowthAndTiming);
  const marketStructure = toRecord(marketData.marketStructure);
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

  const whyNowThesis =
    getMeaningful(toRecord(growthTiming.whyNow).thesis) ||
    getMeaningful(legacyMomentum.rationale) ||
    "Not provided";
  const timingAssessment =
    getMeaningful(growthTiming.timingAssessment) ||
    (typeof evaluation?.marketScore === "number" && evaluation.marketScore >= 75
      ? "right_time"
      : "slightly_early");
  const timingRationale =
    getMeaningful(growthTiming.timingRationale) ||
    getMeaningful(legacySizeGrowth.rationale) ||
    "Not provided";

  const structureType =
    getMeaningful(marketStructure.structureType) ||
    inferStructureType(getMeaningful(legacyStructure.rationale) || "");
  const entryAssessment =
    getMeaningful(toRecord(marketStructure.entryConditions).assessment) ||
    (typeof evaluation?.marketScore === "number" && evaluation.marketScore >= 75
      ? "favorable"
      : "neutral");

  const dataGaps = [
    ...toStringArray(marketData.dataGaps),
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
      <Card data-testid="card-market-score">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Market Sizing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>TAM: {tamValue}</p>
          <p>SAM: {samValue}</p>
          <p>SOM: {somValue}</p>
          <p>
            Methodologies: TAM {tamMethodology} · SAM {samMethodology} · SOM {somMethodology}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timing & Structure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Timing: {timingAssessment} — {timingRationale}
          </p>
          <p>
            Why now: {whyNowThesis}
          </p>
          <p>
            Structure: {structureType} · Entry Conditions: {entryAssessment}
          </p>
          {tailwinds.length > 0 && (
            <p>
              Tailwinds:{" "}
              {tailwinds
                .map((item) => `${String(item.factor || "Unknown")} (${String(item.impact || "n/a")})`)
                .join(", ")}
            </p>
          )}
          {headwinds.length > 0 && (
            <p>
              Headwinds:{" "}
              {headwinds
                .map((item) => `${String(item.factor || "Unknown")} (${String(item.impact || "n/a")})`)
                .join(", ")}
            </p>
          )}
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
