import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

export const COLORS = {
  cyan: "#00AEEF",
  orange: "#D4941A",
  black: "#1a1a1a",
  gray: "#666666",
  lightGray: "#999999",
  bgGray: "#f5f7fa",
  border: "#e2e8f0",
  green: "#22c55e",
  red: "#ef4444",
  white: "#ffffff",
};

export const SECTION_META: {
  key: string;
  label: string;
  scoreKey: keyof NonNullable<Evaluation["sectionScores"]>;
  dataKey: keyof Evaluation;
}[] = [
  { key: "team", label: "Team", scoreKey: "team", dataKey: "teamData" },
  { key: "market", label: "Market Opportunity", scoreKey: "market", dataKey: "marketData" },
  { key: "product", label: "Product & Technology", scoreKey: "product", dataKey: "productData" },
  { key: "businessModel", label: "Business Model", scoreKey: "businessModel", dataKey: "businessModelData" },
  { key: "traction", label: "Traction & Metrics", scoreKey: "traction", dataKey: "tractionData" },
  { key: "gtm", label: "Go-to-Market Strategy", scoreKey: "gtm", dataKey: "gtmData" },
  { key: "competitiveAdvantage", label: "Competitive Landscape", scoreKey: "competitiveAdvantage", dataKey: "competitiveAdvantageData" },
  { key: "financials", label: "Financials", scoreKey: "financials", dataKey: "financialsData" },
  { key: "dealTerms", label: "Deal Terms", scoreKey: "dealTerms", dataKey: "dealTermsData" },
  { key: "legal", label: "Legal & Regulatory", scoreKey: "legal", dataKey: "legalData" },
  { key: "exitPotential", label: "Exit Potential", scoreKey: "exitPotential", dataKey: "exitPotentialData" },
];

export const DEFAULT_WEIGHTS: Record<string, number> = {
  team: 20,
  market: 15,
  product: 10,
  traction: 10,
  businessModel: 10,
  gtm: 8,
  competitiveAdvantage: 8,
  financials: 7,
  legal: 5,
  dealTerms: 5,
  exitPotential: 2,
};

export function getScoreColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

export function getScoreLabel(score: number): string {
  if (score >= 85) return "Highly Recommended";
  if (score >= 70) return "Strong Interest";
  if (score >= 55) return "Moderate Investment";
  if (score >= 40) return "Low Interest";
  return "Do Not Invest";
}

export function getSummaryFromData(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") return data.trim();
  if (typeof data !== "object") return "";

  const record = data as Record<string, unknown>;
  const fields = [
    "narrativeSummary", "memoNarrative", "summary", "assessment",
    "feedback", "overview", "analysis", "description",
    "detailedAnalysis", "investmentThesis", "financialHealth",
    "competitivePosition", "termsQuality", "legalStructure",
  ];

  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }

  return "";
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

export function formatStage(stage: string | null | undefined): string {
  if (!stage) return "N/A";
  const map: Record<string, string> = {
    pre_seed: "PRE-SEED", seed: "SEED", series_a: "SERIES A",
    series_b: "SERIES B", series_c: "SERIES C", series_d: "SERIES D",
    series_e: "SERIES E", series_f_plus: "SERIES F+",
  };
  return map[stage] || stage.toUpperCase().replace("_", " ");
}

export function formatRaiseType(type: string | null | undefined): string {
  if (!type) return "N/A";
  const map: Record<string, string> = {
    safe: "SAFE", convertible_note: "Convertible Note",
    equity: "Equity", safe_equity: "SAFE + Equity", undecided: "Undecided",
  };
  return map[type] || type;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export interface PdfData {
  startup: Startup;
  evaluation: Evaluation;
  weights?: Partial<Record<string, number>> | null;
  watermarkEmail?: string | null;
}
