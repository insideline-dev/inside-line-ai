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
