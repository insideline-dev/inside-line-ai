import { Injectable } from "@nestjs/common";
import { CONTENT_PATTERNS } from "../../constants";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import {
  FinancialsEvaluationSchema,
  type FinancialsEvaluation,
} from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";
import { OpenAiDirectClientService } from "../../services/openai-direct-client.service";
import { FinancialsEvaluationOpenAiSchema } from "../../schemas/evaluations/openai/financials-openai.schema";

@Injectable()
export class FinancialsEvaluationAgent extends BaseEvaluationAgent<FinancialsEvaluation> {
  readonly key = "financials" as const;
  protected readonly schema = FinancialsEvaluationSchema;
  protected readonly openAiSchema = FinancialsEvaluationOpenAiSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating financial health, burn, and runway assumptions.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
    openAiDirect?: OpenAiDirectClientService,
  ) {
    super(providers, aiConfig, promptService, modelExecution, openAiDirect);
  }

  protected override getMaxOutputTokens(): number {
    return 120_000;
  }

  protected override getReasoningEffort(): "low" | "medium" | "high" {
    return "high";
  }

  protected override useDirectGenerateText(): boolean {
    return true;
  }

  protected override getAgentTemplateVariables(
    _pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    const rawText = _pipelineData.extraction.rawText ?? "";
    const financialLines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          /revenue|mrr|arr|burn rate|runway|gross margin|unit economics|ltv|cac|ebitda|net income|recurring revenue/i.test(
            line,
          ),
      )
      .slice(0, 15)
      .join("\n");

    const claims = Array.isArray(_pipelineData.scraping.notableClaims)
      ? _pipelineData.scraping.notableClaims
          .filter((claim) =>
            /revenue|mrr|arr|funding|raised|burn|runway|profit|margin/i.test(claim),
          )
          .slice(0, 5)
          .join("\n")
      : "";

    const combined = [financialLines, claims].filter(Boolean).join("\n");

    return {
      valuation: _pipelineData.extraction.valuation?.toString() ?? "Not provided",
      valuationType: _pipelineData.extraction.startupContext?.valuationType ?? "Not provided",
      roundSize: _pipelineData.extraction.fundingAsk?.toString() ?? "Not provided",
      roundCurrency: _pipelineData.extraction.startupContext?.roundCurrency ?? "USD",
      financialModel: combined || "Not provided",
    };
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction } = pipelineData;
    const fundingTarget = extraction.fundingAsk;
    const currentValuation = extraction.valuation;
    const burnRate = fundingTarget ? Math.max(0, fundingTarget / 18) : undefined;
    const notableClaims = Array.isArray(pipelineData.scraping.notableClaims)
      ? pipelineData.scraping.notableClaims
      : [];
    const previousFunding = notableClaims
      .filter((claim) => CONTENT_PATTERNS.FUNDING.test(claim))
      .map((claim) => ({
        title: claim,
        source: "Notable claim",
      }));

    const financialProjections = {
      runwayMonths: burnRate ? Math.max(1, Math.round((fundingTarget ?? 0) / burnRate)) : 0,
      valuation: currentValuation,
      fundingTarget,
    };

    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      financialProjections,
      fundingTarget,
      previousFunding,
      currentValuation,
      burnRate,
    };
  }

  fallback({ extraction: _extraction }: EvaluationPipelineInput): FinancialsEvaluation {
    return FinancialsEvaluationSchema.parse({
      ...baseEvaluation(20, "Financial evaluation incomplete — requires manual review"),
      founderPitchRecommendations: [],
    });
  }
}
