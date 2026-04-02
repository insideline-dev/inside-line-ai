import { Injectable, Logger } from "@nestjs/common";
import { generateText, Output } from "ai";
import { z } from "zod";
import { type Startup } from "../../startup/entities";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiPromptService } from "./ai-prompt.service";
import { AiConfigService } from "./ai-config.service";
import { AiModelExecutionService } from "./ai-model-execution.service";

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
  companyName: z.string().min(1).optional(),
  tagline: z.string().optional(),
  founderNames: z.array(z.string().min(1)).optional(),
  industry: z.string().min(1).optional(),
  stage: z.string().min(1).optional(),
  location: z.string().optional(),
  website: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0 ? undefined : value,
    z.string().url().optional(),
  ),
  fundingAsk: z.number().nonnegative().optional(),
  valuation: z.number().nonnegative().optional(),
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

  private truncateForPrompt(text: string, maxLength?: number): string {
    const max = maxLength ?? this.aiConfig.getExtractionMaxInputLength();
    if (text.length <= max) {
      return text;
    }

    return `${text.slice(0, max)}\n\n[TRUNCATED]`;
  }
}
