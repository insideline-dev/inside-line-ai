import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { DealTermsEvaluationSchema, type DealTermsEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";

@Injectable()
export class DealTermsEvaluationAgent extends BaseEvaluationAgent<DealTermsEvaluation> {
  readonly key = "dealTerms" as const;
  protected readonly schema = DealTermsEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating valuation and round terms quality.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService, promptService: AiPromptService) {
    super(providers, aiConfig, promptService);
  }

  buildContext({ extraction, scraping }: EvaluationPipelineInput) {
    const raiseType: "equity" | "safe" | "convertible" =
      /\bsafe\b/i.test(extraction.rawText)
        ? "safe"
        : /(convertible|note)/i.test(extraction.rawText)
          ? "convertible"
          : "equity";

    const leadInvestorStatus =
      /(lead investor|lead committed|anchor investor)/i.test(extraction.rawText) ||
      scraping.notableClaims.some((claim) =>
        /(lead investor|lead committed|anchor investor)/i.test(claim),
      )
        ? true
        : undefined;

    const investorRights = Array.from(
      new Set(
        extraction.rawText
          .split(/[.,]/)
          .map((value) => value.trim())
          .filter((value) =>
            /(pro rata|board|liquidation|governance|information rights|discount)/i.test(
              value,
            ),
          ),
      ),
    );

    return {
      fundingTarget: extraction.fundingAsk,
      currentValuation: extraction.valuation,
      raiseType,
      leadInvestorStatus,
      investorRights,
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): DealTermsEvaluation {
    const ask = extraction.fundingAsk ?? 0;

    return DealTermsEvaluationSchema.parse({
      ...baseEvaluation(20, "Deal terms evaluation incomplete — requires manual review"),
      valuation: extraction.valuation ?? Math.max(5_000_000, ask * 5),
      askAmount: ask,
      equity: 12,
      termsQuality: "Terms appear within market range for current stage",
    });
  }
}
