import { QueueName, QUEUE_NAMES } from "../../queue";
import { ModelPurpose, PipelinePhase } from "./interfaces/pipeline.interface";

export const AI_PIPELINE_PHASES: PipelinePhase[] = [
  PipelinePhase.EXTRACTION,
  PipelinePhase.SCRAPING,
  PipelinePhase.RESEARCH,
  PipelinePhase.EVALUATION,
  PipelinePhase.SYNTHESIS,
];

export const AI_PHASE_QUEUE_MAP: Record<PipelinePhase, QueueName> = {
  [PipelinePhase.EXTRACTION]: QUEUE_NAMES.AI_EXTRACTION,
  [PipelinePhase.SCRAPING]: QUEUE_NAMES.AI_SCRAPING,
  [PipelinePhase.RESEARCH]: QUEUE_NAMES.AI_RESEARCH,
  [PipelinePhase.EVALUATION]: QUEUE_NAMES.AI_EVALUATION,
  [PipelinePhase.SYNTHESIS]: QUEUE_NAMES.AI_SYNTHESIS,
};

export const DEFAULT_MODEL_BY_PURPOSE: Record<ModelPurpose, string> = {
  [ModelPurpose.EXTRACTION]: "gemini-3.0-flash-preview",
  [ModelPurpose.RESEARCH]: "gemini-3.0-flash-preview",
  [ModelPurpose.EVALUATION]: "gemini-3.0-flash-preview",
  [ModelPurpose.SYNTHESIS]: "gpt-5.2",
  [ModelPurpose.THESIS_ALIGNMENT]: "gemini-3.0-flash-preview",
  [ModelPurpose.LOCATION_NORMALIZATION]: "gemini-3.0-flash-preview",
  [ModelPurpose.OCR]: "mistral-ocr-latest",
};

export const AI_PIPELINE_REDIS_KEY_PREFIX = "pipeline";
