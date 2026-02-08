import { Injectable } from "@nestjs/common";
import { generateObject } from "ai";
import { SynthesisSchema } from "../schemas";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import type {
  EvaluationResult,
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
  SynthesisResult,
} from "../interfaces/phase-results.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiConfigService } from "./ai-config.service";

export interface SynthesisAgentInput {
  extraction: ExtractionResult;
  scraping: ScrapingResult;
  research: ResearchResult;
  evaluation: EvaluationResult;
}

export type SynthesisAgentOutput = Omit<
  SynthesisResult,
  "sectionScores" | "investorMemoUrl" | "founderReportUrl"
>;

@Injectable()
export class SynthesisAgentService {
  constructor(
    private providers: AiProviderService,
    private aiConfig: AiConfigService,
  ) {}

  async generate(input: SynthesisAgentInput): Promise<SynthesisAgentOutput> {
    const { object } = await generateObject({
      model: this.providers.resolveModelForPurpose(ModelPurpose.SYNTHESIS),
      schema: SynthesisSchema,
      temperature: this.aiConfig.getSynthesisTemperature(),
      maxOutputTokens: this.aiConfig.getSynthesisMaxOutputTokens(),
      system: [
        "You are producing final venture diligence synthesis for an investment committee.",
        "Ground all claims in provided data and avoid unsupported assumptions.",
        "Return concise executive language and clear actionable recommendations.",
      ].join("\n"),
      prompt: [
        "Generate final synthesis output from startup data.",
        "Required fields:",
        "- executiveSummary, strengths, concerns, investmentThesis, nextSteps",
        "- confidenceLevel, recommendation",
        "- investorMemo and founderReport markdown",
        "- dataConfidenceNotes",
        "Context:",
        JSON.stringify(input, null, 2),
      ].join("\n\n"),
    });

    return SynthesisSchema.parse(object);
  }
}
