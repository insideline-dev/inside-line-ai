import { Injectable } from "@nestjs/common";
import { FinancialsEvaluationOpenAiSchema } from "../../schemas/evaluations/openai/financials-openai.schema";
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
import { normalizeBaseEvaluationCandidate } from "../../schemas";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";
import { OpenAiDirectClientService } from "../../services/openai-direct-client.service";

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

  /**
   * Convert array-based scenarios from OpenAI strict schema back to Record<string, number>
   * for the standard schema. OpenAI strict mode doesn't support z.record() (requires
   * additionalProperties: false), so we use an array of {name, value} in the OpenAI schema.
   */
  protected override normalizeOutputCandidate(candidate: unknown): unknown {
    const base = normalizeBaseEvaluationCandidate(candidate);
    if (!base || typeof base !== "object" || Array.isArray(base)) return base;

    const record = base as Record<string, unknown>;
    const charts = record.charts;
    if (!charts || typeof charts !== "object" || Array.isArray(charts)) return base;

    const chartsRecord = charts as Record<string, unknown>;
    const scenarioComparison = chartsRecord.scenarioComparison;
    if (!Array.isArray(scenarioComparison)) return base;

    const normalized = scenarioComparison.map((point: unknown) => {
      if (!point || typeof point !== "object" || Array.isArray(point)) return point;
      const p = point as Record<string, unknown>;
      const scenarios = p.scenarios;
      if (!Array.isArray(scenarios)) return point;

      const scenarioRecord: Record<string, number> = {};
      for (const entry of scenarios) {
        if (entry && typeof entry === "object" && "name" in entry && "value" in entry) {
          const e = entry as { name: string; value: number };
          scenarioRecord[e.name] = e.value;
        }
      }
      return { ...p, scenarios: scenarioRecord };
    });

    return {
      ...record,
      charts: { ...chartsRecord, scenarioComparison: normalized },
    };
  }

  protected override useDirectGenerateText(): boolean {
    return true;
  }

  protected override getAgentTemplateVariables(
    _pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    const structured = _pipelineData.extraction.deckStructuredData as
      | Record<string, Record<string, unknown>>
      | undefined;
    const financials = structured?.financials ?? {};
    const fundraising = structured?.fundraising ?? {};

    // Build structured KPIs from extraction
    const kpiLines: string[] = [];
    const kpiMap: Record<string, unknown> = {
      ARR: financials.arr,
      MRR: financials.mrr,
      Revenue: financials.revenue,
      "Growth Rate": financials.growthRate,
      "Growth Rate Period": financials.growthRatePeriod,
      "Gross Margin": financials.grossMargin,
      "Burn Rate": financials.burnRate,
      Runway: financials.runway,
      LTV: financials.ltv,
      CAC: financials.cac,
      NRR: financials.nrr,
      "Previous Funding": fundraising.previousFunding,
    };
    for (const [label, value] of Object.entries(kpiMap)) {
      if (value != null && value !== "") kpiLines.push(`- ${label}: ${String(value)}`);
    }

    // Use of funds from extraction
    const useOfFunds = Array.isArray(fundraising.useOfFunds)
      ? (fundraising.useOfFunds as string[]).filter(Boolean)
      : [];

    // Financial claims from scraping (no cap — pass everything relevant)
    const claims = Array.isArray(_pipelineData.scraping.notableClaims)
      ? _pipelineData.scraping.notableClaims.filter((claim) =>
          /revenue|mrr|arr|funding|raised|burn|runway|profit|margin|valuation|capital|cash|cost|expense|budget|forecast|projection|growth|ltv|cac|nrr|churn|unit econom/i.test(
            claim,
          ),
        )
      : [];

    // Financial lines from raw text (expanded regex, no arbitrary cap)
    const rawText = _pipelineData.extraction.rawText ?? "";
    const financialLines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          /revenue|mrr|arr|burn.?rate|runway|gross.?margin|unit.?economics|ltv|cac|ebitda|net.?income|recurring.?revenue|opex|capex|cash.?flow|operating.?margin|cost.?of|expense|budget|forecast|projection|nrr|churn|payback|break.?even|profit|loss|cogs|working.?capital/i.test(
            line,
          ),
      );

    return {
      valuation:
        _pipelineData.extraction.valuation?.toString() ??
        (fundraising.valuation as string) ??
        "Not provided",
      valuationType:
        _pipelineData.extraction.startupContext?.valuationType ?? "Not provided",
      roundSize:
        _pipelineData.extraction.fundingAsk?.toString() ??
        (fundraising.askAmount as string) ??
        "Not provided",
      roundCurrency:
        _pipelineData.extraction.startupContext?.roundCurrency ?? "USD",
      extractedKpis: kpiLines.length > 0 ? kpiLines.join("\n") : "None extracted",
      useOfFunds:
        useOfFunds.length > 0
          ? useOfFunds.map((f) => `- ${f}`).join("\n")
          : "Not provided",
      financialClaims:
        claims.length > 0 ? claims.map((c) => `- ${c}`).join("\n") : "None found",
      financialLines:
        financialLines.length > 0
          ? financialLines.join("\n")
          : "No financial lines found in deck text",
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
