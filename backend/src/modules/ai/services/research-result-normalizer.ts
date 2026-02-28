import type { ResearchAgentKey } from "../interfaces/agent.interface";
import type { ResearchResult, SourceEntry } from "../interfaces/phase-results.interface";

type LooseRecord = Record<string, unknown>;

const SOURCE_TYPES = new Set<SourceEntry["type"]>([
  "document",
  "website",
  "linkedin",
  "api",
  "search",
]);

const SOURCE_AGENTS = new Set<SourceEntry["agent"]>([
  "team",
  "market",
  "product",
  "news",
  "competitor",
  "enrichment",
]);

const RESEARCH_KEYS: ResearchAgentKey[] = [
  "team",
  "market",
  "product",
  "news",
  "competitor",
];

export interface ResearchNormalizationResult {
  result: ResearchResult;
  warnings: string[];
}

export function normalizeResearchResult(
  input: Partial<ResearchResult> | null | undefined,
): ResearchNormalizationResult {
  const source = toRecord(input);
  const warnings: string[] = [];

  const result: ResearchResult = {
    team: normalizeBranch("team", source?.team, warnings),
    market: normalizeBranch("market", source?.market, warnings),
    product: normalizeBranch("product", source?.product, warnings),
    news: normalizeBranch("news", source?.news, warnings),
    competitor: normalizeBranch("competitor", source?.competitor, warnings),
    combinedReportText: normalizeCombinedReportText(source, warnings),
    sources: normalizeSourceEntries(source?.sources),
    errors: normalizeResearchErrors(source?.errors),
    ...(source?.researchParameters && typeof source.researchParameters === "object"
      ? { researchParameters: source.researchParameters as ResearchResult["researchParameters"] }
      : {}),
    ...(typeof source?.orchestratorGuidance === "string"
      ? { orchestratorGuidance: source.orchestratorGuidance }
      : {}),
    ...(source?.researchFallbackSummary &&
      typeof source.researchFallbackSummary === "object" &&
      !Array.isArray(source.researchFallbackSummary)
      ? {
          researchFallbackSummary:
            source.researchFallbackSummary as ResearchResult["researchFallbackSummary"],
        }
      : {}),
  };

  if (!result.combinedReportText.trim()) {
    result.combinedReportText = buildCombinedReportText(result);
  }

  return {
    result,
    warnings: Array.from(new Set(warnings)),
  };
}

function normalizeBranch(
  key: ResearchAgentKey,
  value: unknown,
  warnings: string[],
): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "object") {
    warnings.push(`${key}:coerced_to_text`);
    return safeStringify(value);
  }

  warnings.push(`${key}:invalid_type`);
  return String(value);
}

function normalizeCombinedReportText(
  source: LooseRecord | null,
  warnings: string[],
): string {
  const value = source?.combinedReportText;
  if (typeof value === "string") {
    return value.trim();
  }

  if (value != null) {
    warnings.push("combinedReportText:coerced_to_text");
    return safeStringify(value);
  }

  return "";
}

function buildCombinedReportText(research: ResearchResult): string {
  return RESEARCH_KEYS
    .map((key) => {
      const value = coerceText(research[key]);
      if (!value) {
        return null;
      }
      return `## ${key}\n${value}`;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");
}

function normalizeResearchErrors(value: unknown): ResearchResult["errors"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: ResearchResult["errors"] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const agent = (item as LooseRecord).agent;
    const error = (item as LooseRecord).error;

    if (
      (agent === "team" ||
        agent === "market" ||
        agent === "product" ||
        agent === "news" ||
        agent === "competitor") &&
      typeof error === "string" &&
      error.trim().length > 0
    ) {
      normalized.push({ agent, error: error.trim() });
    }
  }

  return normalized;
}

function normalizeSourceEntries(value: unknown): SourceEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: SourceEntry[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const candidate = raw as LooseRecord;
    const name = toString(candidate.name);
    const agent = toString(candidate.agent);

    if (!name || !agent || !SOURCE_AGENTS.has(agent as SourceEntry["agent"])) {
      continue;
    }

    const url = toString(candidate.url);
    const type = toString(candidate.type);
    const timestamp = toString(candidate.timestamp) ?? new Date().toISOString();

    const entry: SourceEntry = {
      name,
      agent: agent as SourceEntry["agent"],
      type: SOURCE_TYPES.has(type as SourceEntry["type"])
        ? (type as SourceEntry["type"])
        : "search",
      timestamp,
      ...(url ? { url } : {}),
    };

    const key = `${entry.agent}::${entry.url ?? entry.name}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entries.push(entry);
  }

  return entries;
}

function toRecord(value: unknown): LooseRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as LooseRecord;
}

function toString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = coerceText(value);
  return trimmed.length > 0 ? trimmed : undefined;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function coerceText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value == null) {
    return "";
  }
  return safeStringify(value).trim();
}
