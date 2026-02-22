import { z } from "zod";
import type { AiPromptKey } from "./ai-prompt-catalog";
import { ModelPurpose } from "../interfaces/pipeline.interface";

export const AI_RUNTIME_ALLOWED_MODEL_NAMES = [
  "gpt-5.2",
  "gemini-3.0-flash-preview",
] as const;

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
    return ModelPurpose.EXTRACTION;
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
