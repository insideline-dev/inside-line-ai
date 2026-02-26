import { Injectable } from "@nestjs/common";
import { CONTENT_PATTERNS, URL_PATH_PATTERNS } from "../../constants";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { GtmEvaluationSchema, type GtmEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, tryPathname } from "./evaluation-utils";

@Injectable()
export class GtmEvaluationAgent extends BaseEvaluationAgent<GtmEvaluation> {
  readonly key = "gtm" as const;
  protected readonly schema = GtmEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating go-to-market strategy and distribution quality.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
  ) {
    super(providers, aiConfig, promptService, modelExecution);
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction, scraping } = pipelineData;
    const subpages = Array.isArray(scraping.website?.subpages)
      ? scraping.website.subpages
      : [];
    const notableClaims = Array.isArray(scraping.notableClaims)
      ? scraping.notableClaims
      : [];
    const websiteMarketingPages =
      subpages
        .filter(
          (page) =>
            typeof page?.url === "string" &&
            URL_PATH_PATTERNS.MARKETING.test(tryPathname(page.url)),
        )
        .map((page) => page.url) ?? [];

    const distributionChannels = Array.from(
      new Set([
        ...notableClaims
          .filter((claim) => CONTENT_PATTERNS.DISTRIBUTION.test(claim))
          .map((claim) => claim),
        "Founder-led sales",
      ]),
    );

    const marketContext = undefined;
    const productContext = undefined;
    const competitorContext = undefined;

    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      targetMarket: extraction.industry,
      websiteMarketingPages,
      distributionChannels,
      customerAcquisitionStrategy:
        scraping.websiteSummary ||
        "Blend of inbound education and founder-led outbound outreach",
      marketContext,
      productContext,
      competitorContext,
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): GtmEvaluation {
    return GtmEvaluationSchema.parse({
      ...baseEvaluation(22, "GTM evaluation incomplete — requires manual review"),
      customerSegments: ["SMB", "Mid-market"],
      acquisitionChannels: ["Founder-led sales", "Partnerships", "Inbound content"],
      salesStrategy: "Hybrid founder-led and inbound-assisted sales motion",
      pricingStrategy: "Tiered usage-based pricing with annual commitments",
    });
  }
}
