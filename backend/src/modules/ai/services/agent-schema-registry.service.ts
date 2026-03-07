import { Injectable, NotFoundException } from "@nestjs/common";
import { StartupStage } from "../../startup/entities/startup.schema";
import { isAiPromptKey, type AiPromptKey } from "./ai-prompt-catalog";
import type { SchemaDescriptor } from "../interfaces/schema.interface";
import { SchemaCompilerService } from "./schema-compiler.service";
import {
  ExtractionSchema,
  MarketEvaluationSchema,
  ProductEvaluationSchema,
  TeamEvaluationSchema,
  TractionEvaluationSchema,
  BusinessModelEvaluationSchema,
  GtmEvaluationSchema,
  FinancialsEvaluationSchema,
  CompetitiveAdvantageEvaluationSchema,
  LegalEvaluationSchema,
  DealTermsEvaluationSchema,
  ExitPotentialEvaluationSchema,
  TeamResearchSchema,
  MarketResearchSchema,
  ProductResearchSchema,
  NewsResearchSchema,
  CompetitorResearchObjectSchema,
  SynthesisSchema,
} from "../schemas";
import { z } from "zod";

export interface ResolvedSchemaDescriptor {
  promptKey: string;
  stage: StartupStage | null;
  source: "code";
  schemaJson: SchemaDescriptor;
}

const CODE_SCHEMA_BY_PROMPT_KEY: Partial<Record<AiPromptKey, z.ZodObject<z.ZodRawShape>>> = {
  "extraction.fields": ExtractionSchema,
  "research.team": TeamResearchSchema,
  "research.market": MarketResearchSchema,
  "research.product": ProductResearchSchema,
  "research.news": NewsResearchSchema,
  "research.competitor": CompetitorResearchObjectSchema,
  "evaluation.team": TeamEvaluationSchema,
  "evaluation.market": MarketEvaluationSchema,
  "evaluation.product": ProductEvaluationSchema,
  "evaluation.traction": TractionEvaluationSchema,
  "evaluation.businessModel": BusinessModelEvaluationSchema,
  "evaluation.gtm": GtmEvaluationSchema,
  "evaluation.financials": FinancialsEvaluationSchema,
  "evaluation.competitiveAdvantage": CompetitiveAdvantageEvaluationSchema,
  "evaluation.legal": LegalEvaluationSchema,
  "evaluation.dealTerms": DealTermsEvaluationSchema,
  "evaluation.exitPotential": ExitPotentialEvaluationSchema,
  "synthesis.final": SynthesisSchema,
};

@Injectable()
export class AgentSchemaRegistryService {
  constructor(private schemaCompiler: SchemaCompilerService) {}

  async resolveDescriptor(
    key: AiPromptKey | string,
    _stage?: StartupStage | string | null,
  ): Promise<SchemaDescriptor> {
    if (isAiPromptKey(key)) {
      return this.resolveCodeDescriptor(key);
    }
    throw new NotFoundException(`No schema registered for prompt key ${key}`);
  }

  async resolveDescriptorWithSource(
    key: AiPromptKey | string,
    stage?: StartupStage | string | null,
  ): Promise<ResolvedSchemaDescriptor> {
    const normalizedStage = this.normalizeStage(stage);
    const descriptor = await this.resolveDescriptor(key, normalizedStage);
    return {
      promptKey: String(key),
      stage: normalizedStage,
      source: "code",
      schemaJson: descriptor,
    };
  }

  private resolveCodeDescriptor(key: AiPromptKey): SchemaDescriptor {
    const schema = CODE_SCHEMA_BY_PROMPT_KEY[key];
    if (!schema) {
      throw new NotFoundException(`No code schema registered for prompt key ${key}`);
    }
    return this.schemaCompiler.serialize(schema);
  }

  private normalizeStage(value?: StartupStage | string | null): StartupStage | null {
    if (!value) {
      return null;
    }
    const normalized = String(value).trim().toLowerCase().replace(/-/g, "_");
    if (Object.values(StartupStage).includes(normalized as StartupStage)) {
      return normalized as StartupStage;
    }
    return null;
  }
}
