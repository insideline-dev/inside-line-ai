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

  buildContext({ extraction, scraping, research }: EvaluationPipelineInput) {
    const rawText = extraction.rawText;
    const ctx = extraction.startupContext;

    const raiseType: "equity" | "safe" | "convertible" =
      ctx?.raiseType === "safe" || /\bsafe\b/i.test(rawText)
        ? "safe"
        : ctx?.raiseType === "convertible" || /(convertible|note)/i.test(rawText)
          ? "convertible"
          : "equity";

    const leadInvestorStatus =
      ctx?.leadSecured === true ||
      /(lead investor|lead committed|anchor investor)/i.test(rawText) ||
      scraping.notableClaims.some((claim) =>
        /(lead investor|lead committed|anchor investor)/i.test(claim),
      )
        ? true
        : undefined;

    const investorRights = Array.from(
      new Set(
        rawText
          .split(/[.,]/)
          .map((value) => value.trim())
          .filter((value) =>
            /(pro rata|board|liquidation|governance|information rights|discount)/i.test(
              value,
            ),
          ),
      ),
    );

    const competitorFunding = research.competitor
      ? research.competitor.competitors
          .filter((c) => c.fundingRaised || c.fundingStage)
          .map((c) => ({
            name: c.name,
            fundingRaised: c.fundingRaised,
            fundingStage: c.fundingStage,
          }))
      : undefined;

    const marketSizeContext = research.market?.marketSize ?? undefined;

    const startupFormContext = ctx
      ? {
          raiseType: ctx.raiseType,
          leadSecured: ctx.leadSecured,
          leadInvestorName: ctx.leadInvestorName,
          previousFundingAmount: ctx.previousFundingAmount,
          previousRoundType: ctx.previousRoundType,
          valuationKnown: ctx.valuationKnown,
          valuationType: ctx.valuationType,
        }
      : undefined;

    return {
      fundingTarget: extraction.fundingAsk,
      currentValuation: extraction.valuation,
      raiseType,
      leadInvestorStatus,
      investorRights,
      competitorFunding,
      marketSizeContext,
      startupFormContext,
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
