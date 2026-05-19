import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { generateText, Output } from "ai";
import { AiProviderService } from "../ai/providers/ai-provider.service";
import { ModelPurpose } from "../ai/interfaces/pipeline.interface";
import { parseDealbreakerSuggestions } from "./parse-dealbreakers.util";

const ParseResultSchema = z.object({
  suggestions: z.array(z.string().min(1).max(40)).max(12),
});

@Injectable()
export class DealbreakerParseService {
  private readonly logger = new Logger(DealbreakerParseService.name);

  constructor(
    private readonly aiProviders: AiProviderService,
    private readonly config: ConfigService,
  ) {}

  async parseNarrative(narrative: string): Promise<string[]> {
    const trimmed = narrative.trim();
    if (!trimmed) return [];

    const hasAiKey = Boolean(this.config.get<string>("OPENAI_API_KEY"));
    if (!hasAiKey) {
      return parseDealbreakerSuggestions(trimmed);
    }

    try {
      const model = this.aiProviders.resolveModelForPurpose(ModelPurpose.EXTRACTION);
      const { output } = await generateText({
        model,
        system: `You extract structured dealbreaker exclusion terms from an investor's anti-portfolio narrative.
Return up to 12 short tags (industries, sectors, business models, themes) the investor wants to avoid.
Each tag must be 2-40 characters. No sentences — only discrete exclusion labels.`,
        prompt: `Anti-portfolio narrative:\n${trimmed}`,
        output: Output.object({ schema: ParseResultSchema }),
        temperature: 0.1,
      });

      if (output?.suggestions?.length) {
        return output.suggestions;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`LLM dealbreaker parse failed, using deterministic fallback: ${msg}`);
    }

    return parseDealbreakerSuggestions(trimmed);
  }
}
