import type { Evaluation } from "@/types/evaluation";

type SectionKey =
  | "team"
  | "market"
  | "product"
  | "traction"
  | "businessModel"
  | "gtm"
  | "financials"
  | "competitiveAdvantage"
  | "legal"
  | "dealTerms"
  | "exitPotential";

const SECTION_FIELD_MAP: Record<SectionKey, keyof Evaluation> = {
  team: "teamScore",
  market: "marketScore",
  product: "productScore",
  traction: "tractionScore",
  businessModel: "businessModelScore",
  gtm: "gtmScore",
  financials: "financialsScore",
  competitiveAdvantage: "competitiveAdvantageScore",
  legal: "legalScore",
  dealTerms: "dealTermsScore",
  exitPotential: "exitPotentialScore",
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function getDisplayOverallScore(
  evaluation: Evaluation | null | undefined,
  startupOverallScore?: number | null,
): number {
  return asNumber(evaluation?.overallScore) ?? asNumber(startupOverallScore) ?? 0;
}

export function getDisplayPercentileRank(
  evaluation: Evaluation | null | undefined,
  startupPercentileRank?: number | null,
): number | null {
  return asNumber(evaluation?.percentileRank) ?? asNumber(startupPercentileRank);
}

export function getDisplaySectionScore(
  evaluation: Evaluation | null | undefined,
  sectionKey: SectionKey,
): number | null {
  if (!evaluation) return null;
  const directKey = SECTION_FIELD_MAP[sectionKey];
  const directScore = asNumber(evaluation[directKey]);
  if (directScore !== null) return directScore;
  return asNumber(evaluation.sectionScores?.[sectionKey]);
}

export function getDisplayStrengths(evaluation: Evaluation | null | undefined): string[] {
  const primary = asStringArray(evaluation?.keyStrengths);
  if (primary.length > 0) return primary;
  return asStringArray((evaluation as Record<string, unknown> | undefined)?.strengths);
}

export function getDisplayRisks(evaluation: Evaluation | null | undefined): string[] {
  const primary = asStringArray(evaluation?.keyRisks);
  if (primary.length > 0) return primary;
  return asStringArray((evaluation as Record<string, unknown> | undefined)?.concerns);
}
