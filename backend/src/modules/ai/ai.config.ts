import { QueueName, QUEUE_NAMES } from "../../queue";
import { ModelPurpose, PipelinePhase } from "./interfaces/pipeline.interface";

export const AI_PIPELINE_PHASES: PipelinePhase[] = [
  PipelinePhase.CLASSIFICATION,
  PipelinePhase.EXTRACTION,
  PipelinePhase.ENRICHMENT,
  PipelinePhase.SCRAPING,
  PipelinePhase.RESEARCH,
  PipelinePhase.EVALUATION,
  PipelinePhase.SYNTHESIS,
];

export const AI_PHASE_QUEUE_MAP: Record<PipelinePhase, QueueName> = {
  [PipelinePhase.CLASSIFICATION]: QUEUE_NAMES.DOCUMENT_CLASSIFICATION,
  [PipelinePhase.EXTRACTION]: QUEUE_NAMES.AI_EXTRACTION,
  [PipelinePhase.ENRICHMENT]: QUEUE_NAMES.AI_ENRICHMENT,
  [PipelinePhase.SCRAPING]: QUEUE_NAMES.AI_SCRAPING,
  [PipelinePhase.RESEARCH]: QUEUE_NAMES.AI_RESEARCH,
  [PipelinePhase.EVALUATION]: QUEUE_NAMES.AI_EVALUATION,
  [PipelinePhase.SYNTHESIS]: QUEUE_NAMES.AI_SYNTHESIS,
};

export const DEFAULT_MODEL_BY_PURPOSE: Record<ModelPurpose, string> = {
  [ModelPurpose.EXTRACTION]: "gemini-3-flash-preview",
  [ModelPurpose.ENRICHMENT]: "gemini-3-flash-preview",
  [ModelPurpose.RESEARCH]: "gemini-3-flash-preview",
  [ModelPurpose.EVALUATION]: "gemini-3-flash-preview",
  [ModelPurpose.SYNTHESIS]: "gpt-5.4",
  [ModelPurpose.MEMO_SYNTHESIS]: "gpt-5.4",
  [ModelPurpose.REPORT_SYNTHESIS]: "gpt-5.4",
  [ModelPurpose.THESIS_ALIGNMENT]: "gemini-3-flash-preview",
  [ModelPurpose.LOCATION_NORMALIZATION]: "gemini-3-flash-preview",
  [ModelPurpose.OCR]: "mistral-ocr-latest",
  [ModelPurpose.CLARA]: "gpt-5.4",
  [ModelPurpose.CLASSIFICATION]: "gpt-5.4-nano",
};

export const AI_PIPELINE_REDIS_KEY_PREFIX = "pipeline";
