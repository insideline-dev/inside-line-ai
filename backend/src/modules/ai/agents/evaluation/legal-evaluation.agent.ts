import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { LegalEvaluationSchema, type LegalEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";

@Injectable()
export class LegalEvaluationAgent extends BaseEvaluationAgent<LegalEvaluation> {
  readonly key = "legal" as const;
  protected readonly schema = LegalEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating legal, compliance, and regulatory risk.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService) {
    super(providers, aiConfig);
  }

  buildContext({ extraction, scraping, research }: EvaluationPipelineInput) {
    const complianceMentions = Array.from(
      new Set(
        [
          extraction.rawText,
          ...scraping.notableClaims,
          ...(scraping.website?.headings ?? []),
        ]
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

    const regulatoryLandscape =
      research.market?.marketTrends.filter((trend) =>
        /(regulat|compliance|policy|audit|risk)/i.test(trend),
      ) ?? [];

    return {
      location: extraction.location,
      industry: extraction.industry,
      complianceMentions,
      regulatoryLandscape,
    };
  }

  fallback(): LegalEvaluation {
    return LegalEvaluationSchema.parse({
      ...baseEvaluation(60, "No blocking legal red flags identified in this pass"),
      ipStatus: "No material IP blockers identified",
      regulatoryRisks: ["Regulatory exposure depends on target geography"],
      legalStructure: "Standard venture-friendly entity assumptions",
    });
  }
}
