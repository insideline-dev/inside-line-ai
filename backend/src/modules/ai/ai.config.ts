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
  [ModelPurpose.EXTRACTION]: "gpt-5.4-mini",
  [ModelPurpose.ENRICHMENT]: "gpt-5.4-mini",
  [ModelPurpose.RESEARCH]: "gpt-5.4-mini",
  [ModelPurpose.EVALUATION]: "gpt-5.4-mini",
  [ModelPurpose.SYNTHESIS]: "gpt-5.4",
  [ModelPurpose.MEMO_SYNTHESIS]: "gpt-5.4",
  [ModelPurpose.REPORT_SYNTHESIS]: "gpt-5.4",
  [ModelPurpose.THESIS_ALIGNMENT]: "gpt-5.4-mini",
  [ModelPurpose.LOCATION_NORMALIZATION]: "gpt-5.4-mini",
  [ModelPurpose.OCR]: "gpt-5.4-mini",
  [ModelPurpose.CLARA]: "gpt-5.4",
  [ModelPurpose.CLASSIFICATION]: "gpt-5.4-mini",
};

export const AI_PIPELINE_REDIS_KEY_PREFIX = "pipeline";
