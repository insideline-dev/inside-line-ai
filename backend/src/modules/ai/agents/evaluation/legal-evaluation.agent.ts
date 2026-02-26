import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { LegalEvaluationSchema, type LegalEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";

@Injectable()
export class LegalEvaluationAgent extends BaseEvaluationAgent<LegalEvaluation> {
  readonly key = "legal" as const;
  protected readonly schema = LegalEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating legal, compliance, and regulatory risk.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
  ) {
    super(providers, aiConfig, promptService, modelExecution);
  }

  readonly buildContext = (pipelineData: EvaluationPipelineInput) => {
    const { extraction, scraping } = pipelineData;
    const rawText = typeof extraction.rawText === "string" ? extraction.rawText : "";
    const notableClaims = Array.isArray(scraping.notableClaims)
      ? scraping.notableClaims
      : [];
    const headings = Array.isArray(scraping.website?.headings)
      ? scraping.website.headings
      : [];
    const complianceMentions = Array.from(
      new Set(
        [
          rawText,
          ...notableClaims,
          ...headings,
        ]
          .filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0,
          )
          .flatMap((entry) =>
            entry
              .split(/[.,]/)
              .map((value) => value.trim())
              .filter((value) =>
                /(soc ?2|iso|gdpr|hipaa|compliance|regulatory|audit|security)/i.test(
                  value,
                ),
              ),
          )
          .slice(0, 8),
      ),
    );

    const regulatoryLandscape: string[] = [];
    const newsContext: { regulatoryNews: Array<{ title: string; summary: string }> } | undefined =
      undefined;

    const corporateStructure = extraction.startupContext
      ? {
          sectorIndustryGroup: extraction.startupContext.sectorIndustryGroup,
          sectorIndustry: extraction.startupContext.sectorIndustry,
        }
      : undefined;

    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      location: extraction.location,
      industry: extraction.industry,
      complianceMentions,
      regulatoryLandscape,
      newsContext,
      corporateStructure,
    };
  };

  fallback(): LegalEvaluation {
    return LegalEvaluationSchema.parse({
      ...baseEvaluation(25, "Legal evaluation incomplete — requires manual review"),
      ipStatus: "No material IP blockers identified",
      regulatoryRisks: ["Regulatory exposure depends on target geography"],
      legalStructure: "Standard venture-friendly entity assumptions",
    });
  }
}
