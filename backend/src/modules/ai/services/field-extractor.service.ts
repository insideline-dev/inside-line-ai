import { Injectable, Logger } from "@nestjs/common";
import { generateText, Output } from "ai";
import { z } from "zod";
import { type Startup } from "../../startup/entities";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiPromptService } from "./ai-prompt.service";
import { AiConfigService } from "./ai-config.service";
import { AiModelExecutionService } from "./ai-model-execution.service";
import {
  DeckStructuredDataAiSchema,
  type DeckStructuredData,
} from "../schemas/deck-structured-data.schema";

const DeckClassificationSchema = z.object({
  deckIndex: z
    .number()
    .int()
    .describe(
      "0-based index of the most likely pitch deck, or -1 if none is a pitch deck",
    ),
  confidence: z.number().min(0).max(1),
});

const ExtractedFieldsSchema = z.object({
  companyName: z.string().min(1).nullable().optional(),
  description: z
    .string()
    .min(20)
    .nullable()
    .optional()
    .describe(
      "A concise 1-2 sentence description of what the company does, grounded strictly in the pitch deck content. Minimum 20 characters. No marketing fluff, no first-person.",
    ),
  tagline: z.string().nullable().optional(),
  founderNames: z.array(z.string().min(1)).nullable().optional(),
  industry: z.string().min(1).nullable().optional(),
  stage: z.string().min(1).nullable().optional(),
  location: z.string().nullable().optional(),
  website: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0 ? null : value,
    z.string().nullable().optional(),
  ),
  fundingAsk: z.number().nonnegative().nullable().optional(),
  valuation: z.number().nonnegative().nullable().optional(),
});

export type ExtractedFields = z.infer<typeof ExtractedFieldsSchema>;

@Injectable()
export class FieldExtractorService {
  private readonly logger = new Logger(FieldExtractorService.name);

  constructor(
    private providers: AiProviderService,
    private promptService: AiPromptService,
    private aiConfig: AiConfigService,
    private modelExecution?: AiModelExecutionService,
  ) {}

  async extractFields(
    rawText: string,
    startupContext?: Partial<Startup>,
  ): Promise<ExtractedFields> {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return {};
    }

    const context = {
      companyName: startupContext?.name,
      tagline: startupContext?.tagline,
      industry: startupContext?.industry,
      stage: startupContext?.stage,
      location: startupContext?.location,
      website: startupContext?.website,
      fundingAsk: startupContext?.fundingTarget,
      valuation: startupContext?.valuation,
      teamMembers: startupContext?.teamMembers,
      startupFormContext: {
        sectorIndustryGroup: startupContext?.sectorIndustryGroup,
        sectorIndustry: startupContext?.sectorIndustry,
        pitchDeckPath: startupContext?.pitchDeckPath,
        pitchDeckUrl: startupContext?.pitchDeckUrl,
        demoUrl: startupContext?.demoUrl,
        demoVideoUrl: startupContext?.demoVideoUrl,
        roundCurrency: startupContext?.roundCurrency,
        valuationKnown: startupContext?.valuationKnown,
        valuationType: startupContext?.valuationType,
        raiseType: startupContext?.raiseType,
        leadSecured: startupContext?.leadSecured,
        leadInvestorName: startupContext?.leadInvestorName,
        hasPreviousFunding: startupContext?.hasPreviousFunding,
        previousFundingAmount: startupContext?.previousFundingAmount,
        previousFundingCurrency: startupContext?.previousFundingCurrency,
        previousInvestors: startupContext?.previousInvestors,
        previousRoundType: startupContext?.previousRoundType,
        technologyReadinessLevel: startupContext?.technologyReadinessLevel,
        productDescription: startupContext?.productDescription,
        productScreenshots: startupContext?.productScreenshots,
        files: startupContext?.files,
      },
    };

    try {
      const promptConfig = await this.promptService.resolve({
        key: "extraction.fields",
        stage: startupContext?.stage,
      });
      const execution = this.modelExecution
        ? await this.modelExecution.resolveForPrompt({
            key: "extraction.fields",
            stage: startupContext?.stage,
          })
        : null;
      const prompt = this.promptService.renderTemplate(promptConfig.userPrompt, {
        startupContextJson: JSON.stringify(context),
        pitchDeckText: this.truncateForPrompt(trimmed),
      });

      const response = this.modelExecution
        ? await this.modelExecution.generateText<ExtractedFields>({
            model:
              execution?.generateTextOptions.model ??
              this.providers.resolveModelForPurpose(ModelPurpose.EXTRACTION),
            schema: ExtractedFieldsSchema,
            temperature: this.aiConfig.getExtractionTemperature(),
            system: promptConfig.systemPrompt,
            prompt,
            tools: execution?.generateTextOptions.tools,
            toolChoice: execution?.generateTextOptions.toolChoice,
            providerOptions: execution?.generateTextOptions.providerOptions,
          })
        : await generateText({
            output: Output.object({ schema: ExtractedFieldsSchema }),
            temperature: this.aiConfig.getExtractionTemperature(),
            system: promptConfig.systemPrompt,
            prompt,
            model:
              execution?.generateTextOptions.model ??
              this.providers.resolveModelForPurpose(ModelPurpose.EXTRACTION),
            tools: execution?.generateTextOptions.tools,
            toolChoice: execution?.generateTextOptions.toolChoice,
            providerOptions: execution?.generateTextOptions.providerOptions,
          });

      return ExtractedFieldsSchema.parse(response.output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI field extraction failed, falling back to context only: ${message}`);
      return {};
    }
  }

  async classifyBestPitchDeck(
    documents: Array<{ name: string; snippet: string }>,
  ): Promise<{ deckIndex: number; confidence: number } | null> {
    if (documents.length === 0) return null;

    const docList = documents
      .map(
        (d, i) =>
          `[Document ${i}] "${d.name}":\n${d.snippet.slice(0, 800)}`,
      )
      .join("\n---\n");

    try {
      const response = this.modelExecution
        ? await this.modelExecution.generateText<{ deckIndex: number; confidence: number }>({
            model: this.providers.resolveModelForPurpose(ModelPurpose.EXTRACTION),
            schema: DeckClassificationSchema,
            temperature: 0,
            system:
              "You classify documents. Identify which document is a startup pitch deck (company overview, problem/solution, market opportunity, team, business model, funding ask). Return the 0-based index, or -1 if none is a pitch deck. Financial reports, earnings supplements, annual reports, and cap tables are NOT pitch decks.",
            prompt: `Which of these documents is a startup pitch deck?\n\n${docList}`,
          })
        : await generateText({
            output: Output.object({ schema: DeckClassificationSchema }),
            temperature: 0,
            system:
              "You classify documents. Identify which document is a startup pitch deck (company overview, problem/solution, market opportunity, team, business model, funding ask). Return the 0-based index, or -1 if none is a pitch deck. Financial reports, earnings supplements, annual reports, and cap tables are NOT pitch decks.",
            prompt: `Which of these documents is a startup pitch deck?\n\n${docList}`,
            model: this.providers.resolveModelForPurpose(ModelPurpose.EXTRACTION),
          });

      return DeckClassificationSchema.parse(response.output);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI deck classification failed: ${message}`);
      return null;
    }
  }

  async extractDeckStructuredData(
    rawText: string,
    options?: { pages?: Array<{ num: number; text: string }> },
  ): Promise<DeckStructuredData | null> {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return null;
    }

    // DS-E12-F1 — if the parser gave us per-page text, fold it into the
    // prompt with explicit `--- Page N ---` markers so the LLM can return
    // accurate `sourcePages` for each section. Falls back to the flat text
    // when the parser path didn't preserve pages (OCR, pptx, etc.).
    const paginatedPrompt = this.buildPaginatedPrompt(options?.pages);
    const promptBody = paginatedPrompt ?? this.truncateForPrompt(trimmed);

    const systemPrompt = `You are a financial analyst extracting structured metrics from a startup pitch deck.

Extract every quantitative metric and key fact you can find. For each value, preserve the exact format from the deck (e.g. "$2.5M", "150% YoY", "~72%").

Rules:
- Only extract values explicitly stated in the deck text. Do not infer or calculate.
- If a metric is not present, leave it as null.
- Keep company/startup growth separate from market/industry growth.
- financials.growthRate / growthRateKpi are only for startup traction or company performance growth.
- market.marketGrowthRate is only for market / industry / category growth explicitly stated in the uploaded file text.
- Never copy a startup/company growth figure into market.marketGrowthRate.
- If the deck does not explicitly state market or industry growth, leave market.marketGrowthRate as null.
- For growthRatePeriod, you MUST identify the time period of the growth rate: "MoM" (month-over-month), "QoQ" (quarter-over-quarter), or "YoY" (year-over-year). Infer from context — e.g. "monthly growth" or consecutive monthly revenue figures → "MoM", "annual growth" or "CAGR" → "YoY". Only use null if absolutely no growth rate is stated.
- For notableClaims, extract up to 5 standout traction/business claims.
- For useOfFunds, extract the breakdown items (e.g. "40% Engineering", "30% Sales").
- For keyFeatures, extract up to 5 key product features.
- For keyMembers, extract founder/executive names and roles.
- For arrKpi: only populate if an ARR or annual recurring revenue figure is explicitly stated on identifiable deck pages. Extract the value verbatim (e.g. "$2.5M"), the currency code (default "USD" if not stated), the period it refers to verbatim (e.g. "Q1 2026", "current", "FY2025"), and sourcePages for the exact pages where that ARR figure appears.
- For growthRateKpi: only populate if a growth rate is explicitly stated on identifiable deck pages. Extract the value verbatim (e.g. "15%"), identify the basis — "MoM" for monthly, "QoQ" for quarterly, "YoY" for annual/yearly, "CAGR" for compound annual. Use "unknown" only when context gives zero signal about the time basis. Extract the period verbatim if stated (default "current") and sourcePages for the exact pages where that growth figure appears.
- For grossMarginKpi: only populate if a gross margin percentage is explicitly stated on identifiable deck pages. Extract the value verbatim (e.g. "72%"), the period it applies to (default "current"), and sourcePages for the exact pages where that gross margin figure appears.
- For tamKpi: only populate if a total addressable market (TAM) figure is explicitly stated on identifiable deck pages. Extract the value verbatim (e.g. "4.5"), identify the scale — "M" for millions, "B" for billions, "T" for trillions — the currency code (default "USD"), and sourcePages for the exact pages where that TAM figure appears.
- For every non-null KPI object (arrKpi, growthRateKpi, grossMarginKpi, tamKpi), sourcePages is mandatory and must contain at least one 1-based page number. If you cannot identify the page for a KPI, return that KPI as null instead of returning an unsourced object.
- For problem.statement: a one-sentence summary of the pain the startup addresses, verbatim from the deck if possible.
- For problem.painPoints: up to 5 concrete pain points the deck names.
- For solution.statement: a one-sentence summary of the startup's solution, verbatim from the deck if possible.
- For solution.keyDifferentiators: up to 5 specific differentiators the deck claims.
- For competitors.namedCompetitors: every named competitor in the deck with optional positioning ("low-cost", "incumbent", etc.). If a competitor matrix is present, prefer that.
- For competitors.moat: one short sentence on why the startup wins against the named competitors, verbatim if stated.
- For EVERY section (financials, traction, market, fundraising, product, team, problem, solution, competitors): populate sourcePages with the 1-based deck page numbers you read each field from. If a section spans pages 3-5, include [3,4,5]. If you cannot identify a page, leave the array empty. This is the page-level provenance that lets downstream consumers deep-link back into the deck without re-reading it.`;

    try {
      const model = this.providers.resolveModelForPurpose(ModelPurpose.EXTRACTION);

      const response = this.modelExecution
        ? await this.modelExecution.generateText({
            model,
            schema: DeckStructuredDataAiSchema,
            temperature: 0,
            system: systemPrompt,
            prompt: promptBody,
          })
        : await generateText({
            output: Output.object({ schema: DeckStructuredDataAiSchema }),
            temperature: 0,
            system: systemPrompt,
            prompt: promptBody,
            model,
          });

      const parsed = DeckStructuredDataAiSchema.parse(response.output);
      return { ...parsed, extractedAt: new Date().toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Deck structured data extraction failed (non-fatal): ${message}`,
      );
      return null;
    }
  }

  /**
   * DS-E12-F1 — render per-page text with `--- Page N ---` separators so the
   * structured-extraction LLM can fill each section's `sourcePages` with real
   * deck pages. Returns null if no pages are supplied; the caller falls back
   * to the flat text path.
   */
  private buildPaginatedPrompt(
    pages: Array<{ num: number; text: string }> | undefined,
  ): string | null {
    if (!pages || pages.length === 0) {
      return null;
    }

    const ordered = [...pages].sort((a, b) => a.num - b.num);
    const max = this.aiConfig.getExtractionMaxInputLength();
    const parts: string[] = [];
    let used = 0;

    for (const page of ordered) {
      const body = page.text?.trim();
      if (!body) continue;
      const marker = `--- Page ${page.num} ---\n`;
      const segment = `${marker}${body}\n`;
      if (used + segment.length > max) {
        parts.push("\n[TRUNCATED]");
        break;
      }
      parts.push(segment);
      used += segment.length;
    }

    return parts.length > 0 ? parts.join("\n") : null;
  }

  private truncateForPrompt(text: string, maxLength?: number): string {
    const max = maxLength ?? this.aiConfig.getExtractionMaxInputLength();
    if (text.length <= max) {
      return text;
    }

    return `${text.slice(0, max)}\n\n[TRUNCATED]`;
  }
}
