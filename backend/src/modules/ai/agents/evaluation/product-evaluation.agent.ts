import { Injectable } from "@nestjs/common";
import { CONTENT_PATTERNS, URL_PATH_PATTERNS } from "../../constants";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { ProductEvaluationSchema, type ProductEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, tryPathname } from "./evaluation-utils";

@Injectable()
export class ProductEvaluationAgent extends BaseEvaluationAgent<ProductEvaluation> {
  readonly key = "product" as const;
  protected readonly schema = ProductEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating product quality and technical differentiation.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
  ) {
    super(providers, aiConfig, promptService, modelExecution);
  }

  protected override getAgentTemplateVariables(
    pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    return {
      productResearchOutput: pipelineData.research.product ?? "Not provided",
    };
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction, scraping } = pipelineData;
    const subpages = Array.isArray(scraping.website?.subpages)
      ? scraping.website.subpages
      : [];
    const links = Array.isArray(scraping.website?.links)
      ? scraping.website.links
      : [];
    const notableClaims = Array.isArray(scraping.notableClaims)
      ? scraping.notableClaims
      : [];
    const scrapedProductPages =
      subpages
        .filter(
          (page) =>
            typeof page?.url === "string" &&
            URL_PATH_PATTERNS.PRODUCT.test(tryPathname(page.url)),
        )
        .map((page) => page.url) ?? [];

    const scrapedDemoLinks =
      links
        .filter(
          (link) =>
            (typeof link?.text === "string" &&
              CONTENT_PATTERNS.DEMO_LINK.test(link.text)) ||
            (typeof link?.url === "string" && URL_PATH_PATTERNS.DEMO.test(link.url)),
        )
        .filter(
          (link): link is { url: string; text: string } =>
            typeof link.url === "string",
        )
        .map((link) => link.url) ?? [];

    const websiteProductPages = Array.from(
      new Set([
        ...scrapedProductPages,
        ...scrapedDemoLinks,
      ]),
    ).filter((url) => URL_PATH_PATTERNS.PRODUCT.test(url));

    const demoUrl = websiteProductPages.find((url) => URL_PATH_PATTERNS.DEMO.test(url));
    const extractedFeatures =
      notableClaims.length > 0
        ? notableClaims.slice(0, 8)
        : ["Core product workflow details are limited"];

    return {
      researchReportText: this.buildResearchReportText(pipelineData),
      deckProductSection: extraction.rawText || extraction.tagline,
      websiteProductPages,
      demoUrl,
      extractedFeatures,
    };
  }

  protected override getMaxOutputTokens(): number {
    return 120_000;
  }

  fallback({ extraction }: EvaluationPipelineInput): ProductEvaluation {
    return ProductEvaluationSchema.parse({
      ...baseEvaluation(25, "Product evaluation incomplete — requires manual review"),
      productSummary: {
        description: extraction.rawText || "Product description is limited",
        techStage: "idea",
      },
      productOverview: {
        whatItDoes: extraction.tagline || "Unknown",
        targetUser: "Unknown",
        productCategory: extraction.industry || "Unknown",
        coreValueProp: "Unknown",
      },
      strengths: [],
      keyFeatures: ["Core workflow automation", "Operator analytics"],
      technologyStack: ["Unknown"],
      founderPitchRecommendations: [],
    });
  }
}
