import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { GtmEvaluationSchema, type GtmEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, stageMultiplier } from "./evaluation-utils";

const tryPathname = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
};

@Injectable()
export class GtmEvaluationAgent extends BaseEvaluationAgent<GtmEvaluation> {
  readonly key = "gtm" as const;
  protected readonly schema = GtmEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating go-to-market strategy and distribution quality.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService) {
    super(providers, aiConfig);
  }

  buildContext({ extraction, scraping }: EvaluationPipelineInput) {
    const websiteMarketingPages =
      scraping.website?.subpages
        .filter((page) =>
          /\/(customers|case-studies|blog|news|press|solutions|pricing|demo)/i.test(
            tryPathname(page.url),
          ),
        )
        .map((page) => page.url) ?? [];

    const distributionChannels = Array.from(
      new Set([
        ...scraping.notableClaims
          .filter((claim) => /(partner|channel|inbound|outbound|sales)/i.test(claim))
          .map((claim) => claim),
        "Founder-led sales",
      ]),
    );

    return {
      targetMarket: extraction.industry,
      websiteMarketingPages,
      distributionChannels,
      customerAcquisitionStrategy:
        scraping.websiteSummary ||
        "Blend of inbound education and founder-led outbound outreach",
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): GtmEvaluation {
    return GtmEvaluationSchema.parse({
      ...baseEvaluation(38 + stageMultiplier(extraction.stage) / 2, "GTM appears coherent but needs channel efficiency proof"),
      customerSegments: ["SMB", "Mid-market"],
      acquisitionChannels: ["Founder-led sales", "Partnerships", "Inbound content"],
      salesStrategy: "Hybrid founder-led and inbound-assisted sales motion",
      pricingStrategy: "Tiered usage-based pricing with annual commitments",
    });
  }
}
