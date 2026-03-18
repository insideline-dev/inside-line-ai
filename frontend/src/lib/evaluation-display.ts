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
  const legacy = asStringArray((evaluation as Record<string, unknown> | undefined)?.strengths);
  if (legacy.length > 0) return legacy;
  if (!evaluation) return [];
  // Fall back to aggregating from section-level data
  const items: string[] = [];
  for (const { dataKey } of AGENT_DATA_FIELDS) {
    const data = evaluation[dataKey] as Record<string, unknown> | undefined;
    if (!data) continue;
    items.push(...asStringArray(data.strengths), ...asStringArray(data.keyFindings));
  }
  return items;
}

export function getDisplayRisks(evaluation: Evaluation | null | undefined): string[] {
  const primary = asStringArray(evaluation?.keyRisks);
  if (primary.length > 0) return primary;
  const legacy = asStringArray((evaluation as Record<string, unknown> | undefined)?.concerns);
  if (legacy.length > 0) return legacy;
  if (!evaluation) return [];
  // Fall back to aggregating from section-level data
  const items: string[] = [];
  for (const { dataKey } of AGENT_DATA_FIELDS) {
    const data = evaluation[dataKey] as Record<string, unknown> | undefined;
    if (!data) continue;
    items.push(...asStringArray(data.risks), ...asStringArray(data.dataGaps), ...asStringArray(data.keyRisks));
  }
  return items;
}

// ---------------------------------------------------------------------------
// Cross-agent sourced strengths, risks, and data gaps
// ---------------------------------------------------------------------------

export interface AgentTaggedItem {
  text: string;
  agent: string;
  agentLabel: string;
}

const AGENT_DATA_FIELDS: Array<{
  dataKey: keyof Evaluation;
  agent: string;
  label: string;
  tab: string;
}> = [
  { dataKey: "teamData", agent: "team", label: "Team", tab: "team" },
  { dataKey: "marketData", agent: "market", label: "Market", tab: "market" },
  { dataKey: "productData", agent: "product", label: "Product", tab: "product" },
  { dataKey: "tractionData", agent: "traction", label: "Traction", tab: "memo" },
  { dataKey: "businessModelData", agent: "businessModel", label: "Biz Model", tab: "memo" },
  { dataKey: "gtmData", agent: "gtm", label: "GTM", tab: "memo" },
  { dataKey: "financialsData", agent: "financials", label: "Financials", tab: "memo" },
  { dataKey: "competitiveAdvantageData", agent: "competitiveAdvantage", label: "Competitive", tab: "competitors" },
  { dataKey: "legalData", agent: "legal", label: "Legal", tab: "memo" },
  { dataKey: "dealTermsData", agent: "dealTerms", label: "Deal Terms", tab: "memo" },
  { dataKey: "exitPotentialData", agent: "exitPotential", label: "Exit", tab: "memo" },
];

function extractTaggedItems(
  evaluation: Evaluation,
  field: "strengths" | "risks" | "dataGaps",
): AgentTaggedItem[] {
  const items: AgentTaggedItem[] = [];
  for (const { dataKey, agent, label } of AGENT_DATA_FIELDS) {
    const data = evaluation[dataKey] as Record<string, unknown> | undefined;
    if (!data) continue;
    const arr = asStringArray(data[field]);
    for (const text of arr) {
      items.push({ text, agent, agentLabel: label });
    }
  }
  return items;
}

export function getCrossAgentStrengths(evaluation: Evaluation | null | undefined): AgentTaggedItem[] {
  if (!evaluation) return [];
  return extractTaggedItems(evaluation, "strengths");
}

export function getCrossAgentRisks(evaluation: Evaluation | null | undefined): AgentTaggedItem[] {
  if (!evaluation) return [];
  return extractTaggedItems(evaluation, "risks");
}

export function getCrossAgentDataGaps(evaluation: Evaluation | null | undefined): AgentTaggedItem[] {
  if (!evaluation) return [];
  return extractTaggedItems(evaluation, "dataGaps");
}

export function getAgentTab(agent: string): string {
  return AGENT_DATA_FIELDS.find((f) => f.agent === agent)?.tab ?? "memo";
}

// ---------------------------------------------------------------------------
// Score-sorted sourced items (for summary ranking by section quality)
// ---------------------------------------------------------------------------

export interface SourcedItem {
  text: string;
  source: string;
  score: number;
}

const SECTION_SCORE_KEY_MAP: Record<string, keyof Evaluation> = {
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

export function getSourcedStrengths(evaluation: Evaluation | null | undefined): SourcedItem[] {
  if (!evaluation) return [];
  const items: SourcedItem[] = [];
  for (const { dataKey, label, agent } of AGENT_DATA_FIELDS) {
    const data = evaluation[dataKey] as Record<string, unknown> | undefined;
    if (!data) continue;
    const scoreKey = SECTION_SCORE_KEY_MAP[agent];
    const score = asNumber(scoreKey ? evaluation[scoreKey] : undefined) ?? 0;
    for (const text of asStringArray(data.strengths)) {
      items.push({ text, source: label, score });
    }
  }
  // Sort by score descending — strongest sections first
  return items.sort((a, b) => b.score - a.score);
}

export function getSourcedRisks(evaluation: Evaluation | null | undefined): SourcedItem[] {
  if (!evaluation) return [];
  const items: SourcedItem[] = [];
  for (const { dataKey, label, agent } of AGENT_DATA_FIELDS) {
    const data = evaluation[dataKey] as Record<string, unknown> | undefined;
    if (!data) continue;
    const scoreKey = SECTION_SCORE_KEY_MAP[agent];
    const score = asNumber(scoreKey ? evaluation[scoreKey] : undefined) ?? 0;
    for (const text of asStringArray(data.risks)) {
      items.push({ text, source: label, score });
    }
  }
  // Sort by score ascending — weakest sections first (most concerning)
  return items.sort((a, b) => a.score - b.score);
}

// ---------------------------------------------------------------------------
// Critical data gaps with structured impact filtering
// ---------------------------------------------------------------------------

export interface CriticalDataGap {
  gap: string;
  impact: string;
  suggestedAction: string;
  source: string;
  score: number;
}

export function getCriticalDataGaps(evaluation: Evaluation | null | undefined): CriticalDataGap[] {
  if (!evaluation) return [];
  const items: CriticalDataGap[] = [];
  for (const { dataKey, label, agent } of AGENT_DATA_FIELDS) {
    const data = evaluation[dataKey] as Record<string, unknown> | undefined;
    if (!data || !Array.isArray(data.dataGaps)) continue;
    const scoreKey = SECTION_SCORE_KEY_MAP[agent];
    const score = asNumber(scoreKey ? evaluation[scoreKey] : undefined) ?? 0;
    for (const gap of data.dataGaps) {
      if (!gap || typeof gap !== "object") continue;
      const g = gap as Record<string, unknown>;
      if (g.impact !== "critical") continue;
      items.push({
        gap: String(g.gap ?? ""),
        impact: "critical",
        suggestedAction: String(g.suggestedAction ?? ""),
        source: label,
        score,
      });
    }
  }
  // Sort by score ascending — weakest sections first
  return items.sort((a, b) => a.score - b.score);
}

const IMPACT_ORDER: Record<string, number> = { critical: 0, important: 1, minor: 2 };

export function getAllStructuredDataGaps(evaluation: Evaluation | null | undefined): CriticalDataGap[] {
  if (!evaluation) return [];
  const items: CriticalDataGap[] = [];
  for (const { dataKey, label, agent } of AGENT_DATA_FIELDS) {
    const data = evaluation[dataKey] as Record<string, unknown> | undefined;
    if (!data || !Array.isArray(data.dataGaps)) continue;
    const scoreKey = SECTION_SCORE_KEY_MAP[agent];
    const score = asNumber(scoreKey ? evaluation[scoreKey] : undefined) ?? 0;
    for (const gap of data.dataGaps) {
      if (!gap || typeof gap !== "object") continue;
      const g = gap as Record<string, unknown>;
      const impact = typeof g.impact === "string" ? g.impact : "minor";
      items.push({
        gap: String(g.gap ?? ""),
        impact,
        suggestedAction: String(g.suggestedAction ?? ""),
        source: label,
        score,
      });
    }
  }
  // Sort by impact priority (critical first), then by score ascending
  return items.sort((a, b) => {
    const impactDiff = (IMPACT_ORDER[a.impact] ?? 3) - (IMPACT_ORDER[b.impact] ?? 3);
    if (impactDiff !== 0) return impactDiff;
    return a.score - b.score;
  });
}
