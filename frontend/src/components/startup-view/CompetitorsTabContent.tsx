import { Card, CardContent } from "@/components/ui/card";
import { CompetitorAnalysis } from "@/components/CompetitorAnalysis";
import { Swords } from "lucide-react";
import type { Evaluation } from "@/types/evaluation";

interface CompetitorsTabContentProps {
  evaluation: Evaluation | null;
  companyName: string;
  showScores?: boolean;
}

export function CompetitorsTabContent({
  evaluation,
  companyName,
  showScores = true,
}: CompetitorsTabContentProps) {
  if (!evaluation) {
    return (
      <Card className="border-dashed" data-testid="card-no-competitors">
        <CardContent className="p-12 text-center">
          <Swords className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2" data-testid="text-no-competitors-title">No competitive analysis</h3>
          <p className="text-muted-foreground" data-testid="text-no-competitors-message">Competitor data has not been analyzed yet.</p>
        </CardContent>
      </Card>
    );
  }

  const marketData = toRecord(evaluation.marketData);
  const competitiveData = toRecord(evaluation.competitiveAdvantageData);

  // New schema: competitors.direct / competitors.indirect (object with nested arrays)
  const competitorsObj = toRecord(competitiveData.competitors ?? marketData.competitors);
  const competitorsDirectArr = toArrayOfRecords(competitorsObj.direct);
  const competitorsIndirectArr = toArrayOfRecords(competitorsObj.indirect);
  const competitorsAdvantages = toStringArray(competitorsObj.advantages);
  const competitorsRisks = toStringArray(competitorsObj.risks);
  const competitorsDetails = toStringArray(competitorsObj.details);

  const keyFindings = uniqueStrings([
    ...toStringArray(competitiveData.keyFindings ?? marketData.keyFindings),
    ...competitorsAdvantages,
    ...competitorsDetails,
  ]);
  const risks = uniqueStrings([
    ...toStringArray(competitiveData.risks),
    ...competitorsRisks,
  ]);

  const directCompetitors = toDirectCompetitors(
    toArrayOfRecords(
      // new schema: competitors.direct
      competitorsDirectArr.length > 0
        ? competitorsDirectArr
        : // legacy: directCompetitorsDetailed
          (marketData.directCompetitorsDetailed ??
          competitiveData.directCompetitorsDetailed ??
          // legacy flat competitors (if not an object with .direct)
          (competitorsObj.direct === undefined ? (competitiveData.competitors ?? marketData.competitors) : undefined)),
    ),
    toStringArray(marketData.sources),
    keyFindings,
    risks,
  );

  const directCompetitorNames = uniqueStrings([
    ...directCompetitors.map((competitor) => competitor.name),
    ...toStringArray(marketData.directCompetitors),
    ...toStringArray(competitiveData.directCompetitors),
  ]);
  const indirectCompetitorNames = uniqueStrings([
    ...toStringArray(marketData.indirectCompetitors),
    ...toStringArray(competitiveData.indirectCompetitors),
  ]);
  const indirectCompetitors = toIndirectCompetitors(
    toArrayOfRecords(
      // new schema: competitors.indirect
      competitorsIndirectArr.length > 0
        ? competitorsIndirectArr
        : // legacy: indirectCompetitorsDetailed
          (marketData.indirectCompetitorsDetailed ??
          competitiveData.indirectCompetitorsDetailed),
    ),
    indirectCompetitorNames,
    toStringArray(marketData.sources),
  );

  // New schema: barriersToEntry object > legacy barriers string[]
  const barriers = toBarrierStrings(
    competitiveData.barriersToEntry ?? competitiveData.barriers,
  );
  const strategicPositioning = toRecord(competitiveData.strategicPositioning);
  const competitivePositionObj = toRecord(competitiveData.competitivePosition);
  const moatAssessment = toRecord(competitiveData.moatAssessment);
  const competitiveCurrentGap = toString(competitivePositionObj.currentGap);
  const competitiveVulnerabilities = toStringArray(
    competitivePositionObj.vulnerabilities,
  );
  const defensibleAgainstFunded = toNullableBoolean(
    competitivePositionObj.defensibleAgainstFunded,
  );
  const differentiationType = toString(strategicPositioning.differentiationType);
  const differentiationDurability = toString(strategicPositioning.durability);
  const moatStage = toString(moatAssessment.moatStage);
  const moatEvidence = toStringArray(moatAssessment.moatEvidence);
  const moatSelfReinforcing = toNullableBoolean(moatAssessment.selfReinforcing);
  // New schema: competitivePosition + strategicPositioning + moatAssessment
  const competitivePosition =
    toString(competitiveData.competitivePosition) ??
    [
      toString(strategicPositioning.differentiation),
      toString(strategicPositioning.uniqueValueProposition),
      toString(competitivePositionObj.gapEvidence),
      toString(competitivePositionObj.defensibilityRationale),
      toString(moatAssessment.timeToReplicate),
    ]
      .filter((value): value is string => Boolean(value))
      .join(". ");
  const narrativeCompetitorNames = extractCompetitorNamesFromNarrative(
    [
      ...toStringArray(marketData.keyFindings),
      ...toStringArray(marketData.risks),
      ...toStringArray(competitiveData.keyFindings),
      ...toStringArray(competitiveData.risks),
      competitivePosition || "",
    ],
    companyName,
  );

  const mergedDirectNames = uniqueStrings([
    ...directCompetitorNames,
    ...narrativeCompetitorNames,
  ]);
  const normalizedDirectCompetitors =
    directCompetitors.length > 0
      ? directCompetitors
      : toDirectCompetitorsFromNames(
          mergedDirectNames,
          toStringArray(marketData.sources),
        );

  const positioning = buildPositioning(competitivePosition);
  const barriersToEntry = buildBarriersToEntry(barriers);
  const competitiveConfidence =
    (typeof competitiveData.confidence === "string" && competitiveData.confidence) ||
    (typeof toRecord(competitiveData.scoring).confidence === "string" &&
      (toRecord(competitiveData.scoring).confidence as string)) ||
    "unknown";

  return (
    <div data-testid="container-competitor-analysis">
      <CompetitorAnalysis
        directCompetitors={normalizedDirectCompetitors}
        indirectCompetitors={indirectCompetitors}
        companyName={companyName}
        basicLandscape={{
          directCompetitors: mergedDirectNames,
          indirectCompetitors: uniqueStrings(indirectCompetitorNames),
        }}
        positioning={positioning}
        competitivePositioning={{
          startupAdvantages: keyFindings,
          startupDisadvantages: risks,
          differentiationStrength: getDifferentiationStrength(
            evaluation.competitiveAdvantageScore,
          ),
          positioningRecommendation: toStringArray(evaluation.keyStrengths)[0],
          currentGap: competitiveCurrentGap,
          vulnerabilities: competitiveVulnerabilities,
          defensibleAgainstFunded,
          differentiationType,
          differentiationDurability,
          moatStage,
          moatEvidence,
          moatSelfReinforcing,
        }}
        barriersToEntry={barriersToEntry}
        keyStrengths={keyFindings}
        keyRisks={risks}
        competitiveAdvantageScore={
          showScores ? evaluation.competitiveAdvantageScore : undefined
        }
        competitiveAdvantageConfidence={competitiveConfidence}
      />
    </div>
  );
}

type GenericRecord = Record<string, unknown>;

interface DirectCompetitorView {
  name: string;
  website: string;
  description: string;
  foundingYear: number | null;
  headquarters: string | null;
  employeeCount: string | null;
  funding: {
    totalRaised: string | null;
    lastRound: string | null;
    lastRoundDate: string | null;
    keyInvestors: string[];
    marketCap?: string | null;
    isPublic?: boolean;
  };
  product: {
    keyFeatures: string[];
    pricingTiers: string | null;
    targetSegment: string;
  };
  marketPosition: {
    estimatedRevenue: string | null;
    customerBase: string | null;
    marketShare: string | null;
  };
  recentActivity: string[];
  strengths: string[];
  weaknesses: string[];
  sources: string[];
}

interface IndirectCompetitorView {
  name: string;
  website: string;
  description: string;
  threatLevel: "high" | "medium" | "low";
  whyIndirect: string;
  funding: string | null;
  strengths: string[];
  sources: string[];
}

function toRecord(value: unknown): GenericRecord {
  if (!value || typeof value !== "object") return {};
  return value as GenericRecord;
}

function toArrayOfRecords(value: unknown): GenericRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is GenericRecord => Boolean(item) && typeof item === "object");
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function toBarrierStrings(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return toStringArray(value);
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const output: string[] = [];
  if (record.technical === true) output.push("Technical barriers to entry");
  if (record.capital === true) output.push("Capital intensity barriers");
  if (record.network === true) output.push("Network effects and switching barriers");
  if (record.regulatory === true) output.push("Regulatory barriers to entry");
  return output;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  values.forEach((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(value);
  });
  return list;
}

function formatFundingValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

function toDirectCompetitors(
  records: GenericRecord[],
  fallbackSources: string[],
  defaultStrengths: string[],
  defaultWeaknesses: string[],
): DirectCompetitorView[] {
  const mapped: Array<DirectCompetitorView | null> = records.map((record) => {
      const name = toString(record.name);
      if (!name) return null;

      const website = toString(record.url) || "";
      const description = toString(record.description) || "No description available";
      const fundingRaised = formatFundingValue(record.fundingRaised);
      const competitorStrengths = toStringArray(record.strengths);
      const competitorWeaknesses = toStringArray(record.weaknesses);
      const competitorSources = toStringArray(record.sources);

      const competitor: DirectCompetitorView = {
        name,
        website,
        description,
        foundingYear: null,
        headquarters: null,
        employeeCount: null,
        funding: {
          totalRaised: fundingRaised,
          lastRound: null,
          lastRoundDate: null,
          keyInvestors: [],
        },
        product: {
          keyFeatures: toStringArray(record.keyFeatures),
          pricingTiers: null,
          targetSegment: "Not specified",
        },
        marketPosition: {
          estimatedRevenue: null,
          customerBase: null,
          marketShare: null,
        },
        recentActivity: [],
        strengths:
          competitorStrengths.length > 0
            ? competitorStrengths
            : defaultStrengths.slice(0, 3),
        weaknesses:
          competitorWeaknesses.length > 0
            ? competitorWeaknesses
            : defaultWeaknesses.slice(0, 3),
        sources:
          competitorSources.length > 0
            ? competitorSources
            : fallbackSources,
      };
      return competitor;
    });

  return mapped.filter((item): item is DirectCompetitorView => item !== null);
}

function toDirectCompetitorsFromNames(
  names: string[],
  fallbackSources: string[],
): DirectCompetitorView[] {
  return names.map((name) => ({
    name,
    website: "",
    description: "Direct competitor identified from market and competitive analysis.",
    foundingYear: null,
    headquarters: null,
    employeeCount: null,
    funding: {
      totalRaised: null,
      lastRound: null,
      lastRoundDate: null,
      keyInvestors: [],
    },
    product: {
      keyFeatures: [],
      pricingTiers: null,
      targetSegment: "Not specified",
    },
    marketPosition: {
      estimatedRevenue: null,
      customerBase: null,
      marketShare: null,
    },
    recentActivity: [],
    strengths: [],
    weaknesses: [],
    sources: fallbackSources,
  }));
}

function getDifferentiationStrength(score?: number): "strong" | "moderate" | "weak" {
  if (typeof score !== "number") return "moderate";
  if (score >= 80) return "strong";
  if (score >= 60) return "moderate";
  return "weak";
}

function buildPositioning(position?: string): {
  strategy?: string;
  differentiation?: string;
  uniqueValueProp?: string;
} | null {
  if (!position) return null;

  const lower = position.toLowerCase();
  let strategy: string | undefined;
  if (
    lower.includes("dominant") ||
    lower.includes("challenger") ||
    lower.includes("competitive")
  ) {
    strategy = "red ocean";
  } else if (lower.includes("new market") || lower.includes("category creation")) {
    strategy = "blue ocean";
  }

  return {
    strategy,
    differentiation: position,
    uniqueValueProp: position,
  };
}

function buildBarriersToEntry(barriers: string[]): {
  technical?: string;
  regulatory?: string;
  capital?: string;
  network?: string;
} | null {
  if (barriers.length === 0) return null;

  const output: {
    technical?: string;
    regulatory?: string;
    capital?: string;
    network?: string;
  } = {};

  barriers.forEach((barrier) => {
    const lower = barrier.toLowerCase();
    if (!output.regulatory && (lower.includes("regulator") || lower.includes("license"))) {
      output.regulatory = barrier;
      return;
    }
    if (!output.capital && (lower.includes("capital") || lower.includes("infrastructure"))) {
      output.capital = barrier;
      return;
    }
    if (!output.network && (lower.includes("network") || lower.includes("switching"))) {
      output.network = barrier;
      return;
    }
    if (!output.technical) {
      output.technical = barrier;
      return;
    }
    if (!output.network) {
      output.network = barrier;
      return;
    }
    if (!output.capital) {
      output.capital = barrier;
      return;
    }
    if (!output.regulatory) {
      output.regulatory = barrier;
    }
  });

  return output;
}

function extractCompetitorNamesFromNarrative(
  texts: string[],
  companyName: string,
): string[] {
  const candidates: string[] = [];
  const normalizedCompany = companyName.toLowerCase();
  const stopwords = new Set([
    "africa",
    "morocco",
    "fmcg",
    "bnpl",
    "gsma",
    "series",
    "market",
    "company",
    "startup",
    "retail",
    "consumer",
    "techcrunch",
    "reuters",
    "mcKinsey".toLowerCase(),
  ]);

  texts.forEach((text) => {
    if (!text) return;

    const seeded = [
      ...text.matchAll(/\blike\s+([^.;]+)/gi),
      ...text.matchAll(/\bsuch as\s+([^.;]+)/gi),
      ...text.matchAll(/\bincluding\s+([^.;]+)/gi),
    ]
      .map((match) => match[1] || "")
      .flatMap((segment) => segment.split(/,| and |\/| vs\.?/gi))
      .map((item) =>
        item
          .replace(/\([^)]*\)/g, "")
          .replace(/[^a-zA-Z0-9.&\-\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((item) => item.length >= 3 && item.length <= 40);

    seeded.forEach((item) => {
      const normalized = item.toLowerCase();
      if (normalized === normalizedCompany) return;
      if (stopwords.has(normalized)) return;
      if (!/[A-Z]/.test(item)) return;
      if (/^(intense|competition|heavily|funded|peers|with|relative|to)$/i.test(item))
        return;
      candidates.push(item);
    });
  });

  return uniqueStrings(candidates);
}

function toIndirectCompetitors(
  records: GenericRecord[],
  fallbackNames: string[],
  fallbackSources: string[],
): IndirectCompetitorView[] {
  if (records.length > 0) {
    const parsed = records
      .map((record) => {
        const name = toString(record.name);
        if (!name) return null;
        const threatRaw = toString(record.threatLevel)?.toLowerCase();
        const threatLevel: "high" | "medium" | "low" =
          threatRaw === "high" || threatRaw === "low" ? threatRaw : "medium";
        const sources = toStringArray(record.sources);
        return {
          name,
          website: toString(record.website) || toString(record.url) || "",
          description: toString(record.description) || "Indirect competitive pressure.",
          threatLevel,
          whyIndirect: toString(record.whyIndirect) || "Adjacent substitute offering.",
          funding: toString(record.funding) || null,
          strengths: toStringArray(record.strengths),
          sources: sources.length > 0 ? sources : fallbackSources,
        };
      })
      .filter((item): item is IndirectCompetitorView => item !== null);
    if (parsed.length > 0) return parsed;
  }

  return fallbackNames.map((name) => ({
    name,
    website: "",
    description: "Indirect competitor identified from market landscape context.",
    threatLevel: "medium" as const,
    whyIndirect: "Competes for overlapping customer budget and use case.",
    funding: null,
    strengths: [],
    sources: fallbackSources,
  }));
}
