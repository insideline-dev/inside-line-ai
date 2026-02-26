import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import { z } from "zod";
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

export const ProductResearchAgent: ResearchAgentConfig<string> = {
  key: "product",
  name: "Product Research",
  systemPrompt: PRODUCT_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: PRODUCT_RESEARCH_HUMAN_PROMPT,
  schema: z.string(),
  contextBuilder: ({ extraction, scraping, researchParameters }) => ({
    productDescription: researchParameters?.productDescription ?? extraction.rawText,
    knownCompetitors: researchParameters?.knownCompetitors ?? [],
    websiteProductPages:
      scraping.website?.subpages
        .filter((page) =>
          /\/(product|products|platform|solution|solutions|features)/i.test(
            tryPathname(page.url),
          ),
        )
        .map((page) => page.url) ?? [],
    demoUrl: undefined,
    websiteHeadings:
      scraping.website?.headings.filter((heading) => heading.trim().length > 0) ?? [],
    businessModel: researchParameters?.businessModel,
    specificMarket: researchParameters?.specificMarket,
  }),
  fallback: ({ extraction }) => {
    const websiteUrl = toValidUrl(extraction.website);
    return [
      `Product Research Report: ${extraction.companyName}`,
      "",
      "Executive Summary",
      "Deterministic fallback mode captured only baseline product signals.",
      "",
      "Initial Product Signal",
      `Company positioning indicates workflow automation focus within ${extraction.industry}.`,
      "",
      "Evidence Gap",
      "Automated review did not collect sufficient technical, customer, or deployment evidence for high-confidence product diligence.",
      "",
      "Primary Source",
      websiteUrl ?? "No verified primary source URL available.",
    ].join("\n");
  },
};
