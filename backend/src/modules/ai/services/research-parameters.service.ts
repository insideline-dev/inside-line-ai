import { Injectable, Logger, Optional } from "@nestjs/common";
import { generateText, Output } from "ai";
import { z } from "zod";
import type {
  EnrichmentResult,
  ExtractionResult,
  ScrapingResult,
} from "../interfaces/phase-results.interface";
import type { ResearchParameters } from "../interfaces/research-parameters.interface";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiConfigService } from "./ai-config.service";
import { AiProviderService } from "../providers/ai-provider.service";

const WEBSITE_TEXT_LIMIT = 12_000;
const DECK_CONTENT_LIMIT = 15_000;

const ResearchParametersSchema = z.object({
  specificMarket: z.string(),
  productDescription: z.string(),
  targetCustomers: z.string(),
  knownCompetitors: z.array(z.string()),
  geographicFocus: z.string(),
  businessModel: z.string(),
  fundingStage: z.string(),
  claimedMetrics: z.object({
    tam: z.string().nullable().optional(),
    growthRate: z.string().nullable().optional(),
    revenue: z.string().nullable().optional(),
    customers: z.string().nullable().optional(),
  }),
});

@Injectable()
export class ResearchParametersService {
  private readonly logger = new Logger(ResearchParametersService.name);

  constructor(
    @Optional() private aiProvider?: AiProviderService,
    @Optional() private aiConfig?: AiConfigService,
  ) {}

  async generate(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
    enrichment?: EnrichmentResult,
  ): Promise<ResearchParameters> {
    const teamMembers = this.buildTeamMembers(extraction, scraping, enrichment);

    if (!this.aiProvider || !this.aiConfig) {
      this.logger.warn("[ResearchParameters] AI provider not available; returning fallback");
      return this.buildFallback(extraction, teamMembers);
    }

    this.logger.log(`[ResearchParameters] Generating for ${extraction.companyName}`);

    try {
      const model = this.aiProvider.resolveModelForPurpose(ModelPurpose.RESEARCH);
      const prompt = this.buildPrompt(extraction, scraping, teamMembers);

      const { experimental_output: output } = await generateText({
        model,
        prompt,
        output: Output.object({ schema: ResearchParametersSchema }),
      });

      const parsed = output ?? null;
      if (!parsed) {
        this.logger.warn("[ResearchParameters] Empty AI output; returning fallback");
        return this.buildFallback(extraction, teamMembers);
      }

      const result: ResearchParameters = {
        companyName: extraction.companyName,
        sector: extraction.industry,
        specificMarket: parsed.specificMarket,
        productDescription: parsed.productDescription,
        targetCustomers: parsed.targetCustomers,
        knownCompetitors: parsed.knownCompetitors,
        geographicFocus: parsed.geographicFocus,
        businessModel: parsed.businessModel,
        fundingStage: parsed.fundingStage,
        teamMembers,
        claimedMetrics: {
          tam: parsed.claimedMetrics.tam ?? undefined,
          growthRate: parsed.claimedMetrics.growthRate ?? undefined,
          revenue: parsed.claimedMetrics.revenue ?? undefined,
          customers: parsed.claimedMetrics.customers ?? undefined,
        },
      };

      this.logger.log(
        `[ResearchParameters] Generated successfully | market=${result.specificMarket.substring(0, 60)} | competitors=${result.knownCompetitors.length}`,
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[ResearchParameters] AI generation failed: ${message}`);
      return this.buildFallback(extraction, teamMembers);
    }
  }

  private buildPrompt(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
    teamMembers: ResearchParameters["teamMembers"],
  ): string {
    const websiteText = scraping.website?.fullText?.substring(0, WEBSITE_TEXT_LIMIT) ?? "";
    const deckContent = extraction.rawText?.substring(0, DECK_CONTENT_LIMIT) ?? "";
    const teamList =
      teamMembers.map((m) => `- ${m.name}: ${m.role}`).join("\n") || "No team members";

    return `Analyze this company's website and pitch deck to create comprehensive research parameters.

COMPANY: ${extraction.companyName}
SECTOR: ${extraction.industry}
WEBSITE: ${extraction.website}

=== WEBSITE CONTENT ===
${websiteText || "No website content"}

=== PITCH DECK CONTENT ===
${deckContent || "No deck content"}

=== TEAM MEMBERS ===
${teamList}

Generate research parameters for deep market research. Be SPECIFIC and use exact terms from materials:

Return JSON:
{
  "specificMarket": "Very specific market definition",
  "productDescription": "One paragraph describing exactly what the product does",
  "targetCustomers": "Specific customer segments",
  "knownCompetitors": ["List", "of", "competitors"],
  "geographicFocus": "Target regions/countries",
  "businessModel": "Revenue model details",
  "fundingStage": "Current stage",
  "claimedMetrics": {
    "tam": "If TAM mentioned" or null,
    "growthRate": "If growth mentioned" or null,
    "revenue": "If revenue mentioned" or null,
    "customers": "If customer count mentioned" or null
  }
}`;
  }

  private buildTeamMembers(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
    enrichment?: EnrichmentResult,
  ): ResearchParameters["teamMembers"] {
    const byName = new Map<string, ResearchParameters["teamMembers"][number]>();

    for (const member of scraping.teamMembers) {
      const key = member.name.trim().toLowerCase();
      byName.set(key, {
        name: member.name,
        role: member.role ?? "Unknown",
        linkedinUrl: member.linkedinUrl,
        highlights: member.linkedinProfile?.headline,
      });
    }

    const contextMembers = extraction.startupContext?.teamMembers ?? [];
    for (const member of contextMembers) {
      const key = member.name.trim().toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, {
          name: member.name,
          role: member.role ?? "Unknown",
          linkedinUrl: member.linkedinUrl,
        });
      }
    }

    if (enrichment?.discoveredFounders) {
      for (const founder of enrichment.discoveredFounders) {
        if (founder.confidence < 0.5) continue;
        const key = founder.name.trim().toLowerCase();
        if (!byName.has(key)) {
          byName.set(key, {
            name: founder.name,
            role: founder.role ?? "Founder",
            linkedinUrl: founder.linkedinUrl,
          });
        }
      }
    }

    return Array.from(byName.values());
  }

  private buildFallback(
    extraction: ExtractionResult,
    teamMembers: ResearchParameters["teamMembers"],
  ): ResearchParameters {
    return {
      companyName: extraction.companyName,
      sector: extraction.industry,
      specificMarket: extraction.industry,
      productDescription: "",
      targetCustomers: "",
      knownCompetitors: [],
      geographicFocus: "United States",
      businessModel: "SaaS",
      fundingStage: "seed",
      teamMembers,
      claimedMetrics: {},
    };
  }
}
