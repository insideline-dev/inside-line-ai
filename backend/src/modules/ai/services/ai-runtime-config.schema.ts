import { z } from "zod";
import type { AiPromptKey } from "./ai-prompt-catalog";
import { ModelPurpose } from "../interfaces/pipeline.interface";

export const AI_RUNTIME_ALLOWED_MODEL_NAMES = [
  "gpt-5.2",
  "gpt-5.4",
  "gemini-3-flash-preview",
  "o4-mini-deep-research",
] as const;

export const AI_RUNTIME_MODEL_NAME_ALIASES: Record<string, string> = {
  "gemini-3.0-flash-preview": "gemini-3-flash-preview",
};

export function normalizeRuntimeModelName(modelName: string): string {
  const normalized = modelName.trim();
  if (!normalized) {
    return normalized;
  }
  return AI_RUNTIME_MODEL_NAME_ALIASES[normalized] ?? normalized;
}

export const AiContextConfigSchema = z.object({
  includePaths: z.array(z.string().trim().min(1)).min(1),
  sectionOrder: z.array(z.string().trim().min(1)).optional(),
  contextJsonFormat: z.enum(["compact", "pretty"]).optional(),
  contextSectionsWrapper: z.enum(["user_provided_data", "none"]).optional(),
});

export const AiModelConfigSchema = z.object({
  modelName: z.enum(AI_RUNTIME_ALLOWED_MODEL_NAMES),
  searchMode: z.enum([
    "off",
    "provider_grounded_search",
    "brave_tool_search",
    "provider_and_brave_search",
  ]),
});

export type AiContextConfig = z.infer<typeof AiContextConfigSchema>;
export type AiModelConfig = z.infer<typeof AiModelConfigSchema>;
export type AiRuntimeSearchMode = AiModelConfig["searchMode"];
export type AiRuntimeModelName = AiModelConfig["modelName"];
export type AiRuntimeModelProvider =
  | "openai"
  | "google"
  | "anthropic"
  | "mistral";

const OPENAI_DEEP_RESEARCH_MODEL_NAMES = new Set<string>([
  "o3-deep-research",
  "o3-deep-research-2025-06-26",
  "o4-mini-deep-research",
  "o4-mini-deep-research-2025-06-26",
]);

export function isOpenAiDeepResearchModel(modelName: string): boolean {
  const normalized = normalizeRuntimeModelName(modelName).toLowerCase();
  return OPENAI_DEEP_RESEARCH_MODEL_NAMES.has(normalized);
}

export function isOpenAiStandardModel(modelName: string): boolean {
  return (
    resolveProviderForModelName(modelName) === "openai" &&
    !isOpenAiDeepResearchModel(modelName)
  );
}

export const DEFAULT_CONTEXT_CONFIG: Required<
  Pick<
    AiContextConfig,
    "includePaths" | "contextJsonFormat" | "contextSectionsWrapper"
  >
> &
  Pick<AiContextConfig, "sectionOrder"> = {
  includePaths: ["*"],
  sectionOrder: undefined,
  contextJsonFormat: "compact",
  contextSectionsWrapper: "user_provided_data",
};

export function isResearchPromptKey(key: AiPromptKey): boolean {
  return key.startsWith("research.");
}

export function resolveModelPurposeForPromptKey(
  key: AiPromptKey,
): ModelPurpose {
  if (key === "enrichment.gapFill") {
    return ModelPurpose.ENRICHMENT;
  }

  if (key === "extraction.fields") {
    return ModelPurpose.EXTRACTION;
  }

  if (key.startsWith("research.")) {
    return ModelPurpose.RESEARCH;
  }

  if (key.startsWith("evaluation.")) {
    return ModelPurpose.EVALUATION;
  }

  if (key === "synthesis.final") {
    return ModelPurpose.SYNTHESIS;
  }

  if (key === "matching.thesis") {
    return ModelPurpose.THESIS_ALIGNMENT;
  }

  if (key.startsWith("clara.")) {
    return ModelPurpose.CLARA;
  }

  return ModelPurpose.EXTRACTION;
}

export function resolveProviderForModelName(
  modelName: string,
): AiRuntimeModelProvider {
  const lower = modelName.toLowerCase();

  if (lower.startsWith("gemini")) {
    return "google";
  }

  if (lower.startsWith("mistral")) {
    return "mistral";
  }

  if (lower.startsWith("claude")) {
    return "anthropic";
  }

  return "openai";
}
