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
import type { PipelineFallbackReason } from "../interfaces/agent.interface";
import { AiConfigService } from "./ai-config.service";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiModelExecutionService } from "./ai-model-execution.service";

const WEBSITE_TEXT_LIMIT = 12_000;
const DECK_CONTENT_LIMIT = 15_000;

const requiredNullableMetricSchema = z.string().nullable();

export const ResearchParametersSchema = z.object({
  specificMarket: z.string(),
  productDescription: z.string(),
  targetCustomers: z.string(),
  knownCompetitors: z.array(z.string()),
  geographicFocus: z.string(),
  businessModel: z.string(),
  fundingStage: z.string(),
  claimedMetrics: z.object({
    tam: requiredNullableMetricSchema,
    growthRate: requiredNullableMetricSchema,
    revenue: requiredNullableMetricSchema,
    customers: requiredNullableMetricSchema,
  }),
});

export interface ResearchParametersGenerationMeta {
  usedFallback: boolean;
  error?: string;
  fallbackReason?: PipelineFallbackReason;
  rawProviderError?: string;
}

export interface ResearchParametersGenerationOptions {
  onStart?: () => void;
  onComplete?: (meta: ResearchParametersGenerationMeta) => void;
}

@Injectable()
export class ResearchParametersService {
  private readonly logger = new Logger(ResearchParametersService.name);

  constructor(
    @Optional() private aiProvider?: AiProviderService,
    @Optional() private aiConfig?: AiConfigService,
    @Optional() private modelExecution?: AiModelExecutionService,
  ) {}

  async generate(
    extraction: ExtractionResult,
    scraping: ScrapingResult,
    enrichment?: EnrichmentResult,
    options?: ResearchParametersGenerationOptions,
  ): Promise<ResearchParameters> {
    const teamMembers = this.buildTeamMembers(extraction, scraping, enrichment);
    options?.onStart?.();

    if (!this.aiProvider || !this.aiConfig) {
      this.logger.warn("[ResearchParameters] AI provider not available; returning fallback");
      options?.onComplete?.({
        usedFallback: true,
        error: "AI provider not available",
        fallbackReason: "UNHANDLED_AGENT_EXCEPTION",
      });
      return this.buildFallback(extraction, teamMembers);
    }

    this.logger.log(`[ResearchParameters] Generating for ${extraction.companyName}`);

    try {
      const model = this.aiProvider.resolveModelForPurpose(ModelPurpose.RESEARCH);
      const prompt = this.buildPrompt(extraction, scraping, teamMembers);

      const response = this.modelExecution
        ? await this.modelExecution.generateText<z.infer<typeof ResearchParametersSchema>>({
            model,
            schema: ResearchParametersSchema,
            prompt,
          })
        : await generateText({
            model,
            prompt,
            output: Output.object({ schema: ResearchParametersSchema }),
          });

      const parsed = response.experimental_output ?? response.output ?? null;
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
      options?.onComplete?.({
        usedFallback: false,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[ResearchParameters] AI generation failed: ${message}`);
      options?.onComplete?.({
        usedFallback: true,
        error: message,
        fallbackReason: this.classifyFallbackReason(message),
        rawProviderError: this.sanitizeRawProviderError(message),
      });
      return this.buildFallback(extraction, teamMembers);
    }
  }

  private classifyFallbackReason(message: string): PipelineFallbackReason {
    const normalized = message.toLowerCase();
    if (normalized.includes("response_format") || normalized.includes("invalid schema")) {
      return "MODEL_OR_PROVIDER_ERROR";
    }
    if (normalized.includes("timed out") || normalized.includes("timeout")) {
      return "TIMEOUT";
    }
    if (normalized.includes("schema validation")) {
      return "SCHEMA_OUTPUT_INVALID";
    }
    if (normalized.includes("no object generated") || normalized.includes("empty")) {
      return "EMPTY_STRUCTURED_OUTPUT";
    }
    return "UNHANDLED_AGENT_EXCEPTION";
  }

  private sanitizeRawProviderError(message: string): string | undefined {
    const trimmed = message.trim();
    return trimmed.length > 0 ? trimmed : undefined;
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
