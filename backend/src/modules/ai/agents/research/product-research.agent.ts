import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import type { ProductResearch } from "../../schemas";
import { ProductResearchSchema } from "../../schemas";
import {
  PRODUCT_RESEARCH_HUMAN_PROMPT,
  PRODUCT_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/product-research.prompt";
import { toValidUrl } from "./url.util";

const tryPathname = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
};

export const ProductResearchAgent: ResearchAgentConfig<ProductResearch> = {
  key: "product",
  name: "Product Research",
  systemPrompt: PRODUCT_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: PRODUCT_RESEARCH_HUMAN_PROMPT,
  schema: ProductResearchSchema,
  contextBuilder: ({ extraction, scraping, gapReport }) => ({
    productDescription: extraction.rawText,
    knownCompetitors: [],
    websiteProductPages:
      scraping.website?.subpages
        .filter((page) =>
          /\/(product|products|platform|solution|solutions|features)/i.test(
            tryPathname(page.url),
          ),
        )
        .map((page) => page.url) ?? [],
    demoUrl: undefined,
    // Page headings provided as context signals, not confirmed product features
    websiteHeadings:
      scraping.website?.headings.filter((heading) => heading.trim().length > 0) ?? [],
    gapDirectives: gapReport?.categories.find(c => c.category === "product")?.researchDirectives ?? [],
    gapPriority: gapReport?.categories.find(c => c.category === "product")?.priority ?? "medium",
  }),
  fallback: ({ extraction }) => {
    const websiteUrl = toValidUrl(extraction.website);

    return {
      productPages: websiteUrl ? [websiteUrl] : [],
      features: ["Core workflow automation"],
      techStack: ["Unknown"],
      integrations: [],
      customerReviews: {
        summary:
          "Public customer review coverage is limited in deterministic fallback mode.",
        sentiment: "neutral",
      },
      sources: websiteUrl ? [websiteUrl] : [],
    };
  },
};
