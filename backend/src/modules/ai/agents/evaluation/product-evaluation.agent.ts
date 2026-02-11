import { Injectable } from "@nestjs/common";
import { CONTENT_PATTERNS, URL_PATH_PATTERNS } from "../../constants";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { ProductEvaluationSchema, type ProductEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, tryPathname } from "./evaluation-utils";

@Injectable()
export class ProductEvaluationAgent extends BaseEvaluationAgent<ProductEvaluation> {
  readonly key = "product" as const;
  protected readonly schema = ProductEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating product quality and technical differentiation.";

  constructor(providers: AiProviderService, aiConfig: AiConfigService, promptService: AiPromptService) {
    super(providers, aiConfig, promptService);
  }

  buildContext({ extraction, scraping, research }: EvaluationPipelineInput) {
    const scrapedProductPages =
      scraping.website?.subpages
        .filter((page) => URL_PATH_PATTERNS.PRODUCT.test(tryPathname(page.url)))
        .map((page) => page.url) ?? [];

    const scrapedDemoLinks =
      scraping.website?.links
        .filter(
          (link) =>
            CONTENT_PATTERNS.DEMO_LINK.test(link.text) ||
            URL_PATH_PATTERNS.DEMO.test(link.url),
        )
        .map((link) => link.url) ?? [];

    const websiteProductPages = Array.from(
      new Set([
        ...scrapedProductPages,
        ...scrapedDemoLinks,
        ...(research.product?.productPages ?? []),
        ...(research.product?.sources ?? []),
      ]),
    ).filter((url) => URL_PATH_PATTERNS.PRODUCT.test(url));

    const demoUrl = websiteProductPages.find((url) => URL_PATH_PATTERNS.DEMO.test(url));
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
      ...baseEvaluation(25, "Product evaluation incomplete — requires manual review"),
      productDescription: extraction.rawText || "Product description is limited",
      uniqueValue: "Differentiation exists but needs stronger external proof",
      technologyStack: ["Unknown"],
      keyFeatures: ["Core workflow automation", "Operator analytics"],
      productMaturity: extraction.stage,
    });
  }
}
