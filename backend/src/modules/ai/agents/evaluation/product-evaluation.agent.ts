import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { ProductEvaluationSchema, type ProductEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, stageMultiplier } from "./evaluation-utils";

@Injectable()
export class ProductEvaluationAgent extends BaseEvaluationAgent<ProductEvaluation> {
  readonly key = "product" as const;
  protected readonly schema = ProductEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating product quality and technical differentiation.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService) {
    super(providers, aiConfig);
  }

  buildContext({ extraction, scraping, research }: EvaluationPipelineInput) {
    const scrapedProductPages =
      scraping.website?.subpages
        .filter((page) =>
          /\/(product|products|platform|solution|solutions|features|demo)/i.test(
            new URL(page.url).pathname,
          ),
        )
        .map((page) => page.url) ?? [];

    const scrapedDemoLinks =
      scraping.website?.links
        .filter((link) => /(demo|book)/i.test(link.text) || /\/demo/i.test(link.url))
        .map((link) => link.url) ?? [];

    const websiteProductPages = Array.from(
      new Set([
        ...scrapedProductPages,
        ...scrapedDemoLinks,
        ...(research.product?.productPages ?? []),
        ...(research.product?.sources ?? []),
      ]),
    ).filter((url) =>
      /(product|products|platform|solution|solutions|feature|demo)/i.test(url),
    );

    const demoUrl = websiteProductPages.find((url) => /\/demo/i.test(url));
    const extractedFeatures =
      research.product?.features.length
        ? research.product.features
        : ["Core product workflow details are limited"];

    return {
      deckProductSection: extraction.rawText || extraction.tagline,
      productResearch: research.product,
      websiteProductPages,
      demoUrl,
      extractedFeatures,
    };
  }

  fallback({ extraction }: EvaluationPipelineInput): ProductEvaluation {
    return ProductEvaluationSchema.parse({
      ...baseEvaluation(58 + stageMultiplier(extraction.stage), "Product signal is present but moat proof is limited"),
      productDescription: extraction.rawText || "Product description is limited",
      uniqueValue: "Differentiation exists but needs stronger external proof",
      technologyStack: ["Unknown"],
      keyFeatures: ["Core workflow automation", "Operator analytics"],
      productMaturity: extraction.stage,
    });
  }
}
