import { Injectable, Logger } from "@nestjs/common";
import { generateObject } from "ai";
import { z } from "zod";
import { type Startup } from "../../startup/entities";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";

const ExtractedFieldsSchema = z.object({
  companyName: z.string().min(1).optional(),
  tagline: z.string().optional(),
  founderNames: z.array(z.string().min(1)).optional(),
  industry: z.string().min(1).optional(),
  stage: z.string().min(1).optional(),
  location: z.string().optional(),
  website: z.string().url().or(z.literal("")).optional(),
  fundingAsk: z.number().nonnegative().optional(),
  valuation: z.number().nonnegative().optional(),
});

export type ExtractedFields = z.infer<typeof ExtractedFieldsSchema>;

@Injectable()
export class FieldExtractorService {
  private readonly logger = new Logger(FieldExtractorService.name);

  constructor(
    private providers: AiProviderService,
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
    };

    try {
      const { object } = await generateObject({
        model: this.providers.resolveModelForPurpose(ModelPurpose.EXTRACTION),
        schema: ExtractedFieldsSchema,
        temperature: 0.1,
        prompt: [
          "Extract structured startup fields from the pitch deck text.",
          "Rules:",
          "- Return only fields supported by evidence in the text.",
          "- Do not invent financial numbers.",
          "- Keep founder names as plain names without titles.",
          `Startup context hints: ${JSON.stringify(context, null, 2)}`,
          "Pitch deck text:",
          this.truncateForPrompt(trimmed),
        ].join("\n\n"),
      });

      return ExtractedFieldsSchema.parse(object);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI field extraction failed, falling back to context only: ${message}`);
      return {};
    }
  }

  private truncateForPrompt(text: string, maxLength = 80_000): string {
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength)}\n\n[TRUNCATED]`;
  }
}
