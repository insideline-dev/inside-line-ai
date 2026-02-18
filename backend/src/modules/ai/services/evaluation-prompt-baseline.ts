import type { EvaluationFeedbackNote } from "../interfaces/agent.interface";
import type { ExtractionResult } from "../interfaces/phase-results.interface";

const DEFAULT_UNKNOWN = "Unknown";

const normalizeText = (value: string | null | undefined): string => {
  if (typeof value !== "string") {
    return DEFAULT_UNKNOWN;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_UNKNOWN;
};

const normalizeFounderNames = (names: string[] | undefined): string[] => {
  if (!Array.isArray(names)) {
    return [];
  }

  return names
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
};

export const buildEvaluationCommonBaseline = (input: {
  extraction: ExtractionResult;
  adminFeedback: EvaluationFeedbackNote[];
}) => {
  const { extraction, adminFeedback } = input;

  return {
    companyName: normalizeText(extraction.companyName),
    industry: normalizeText(extraction.industry),
    stage: normalizeText(extraction.stage),
    location: normalizeText(extraction.location),
    website: normalizeText(extraction.website),
    founderNames: normalizeFounderNames(extraction.founderNames),
    adminFeedback,
  };
};
