import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { z } from "zod";
import {
  LensInputSchema,
  type LensInput,
  type LensOutput,
} from "../schemas/lens";
import { AiModelExecutionService } from "../services/ai-model-execution.service";
import { AiPromptService } from "../services/ai-prompt.service";
import { AiProviderService } from "../providers/ai-provider.service";
import type { AiPromptKey } from "../services/ai-prompt-catalog";

/**
 * Public marker used in the rationale of fallback rows so downstream consumers
 * (notably the v1 ScreeningOutput contract builder) can detect synthetic
 * fallback outputs without a dedicated DB column. Treated as a stable contract
 * — do not rename without bumping DS-E2-F1-S2.
 */
export const LENS_FALLBACK_RATIONALE_PREFIX = "Lens unavailable";

/** Result wrapper returned by `BaseLensAgent.run()`. */
export interface LensRunResult<TOutput extends LensOutput> {
  key: string;
  output: TOutput;
  modelId: string;
  promptKey: AiPromptKey;
  latencyMs: number;
  usedFallback: boolean;
  error?: string;
}

/**
 * Lightweight base for screening lenses. Deliberately *not* a subclass of
 * `BaseEvaluationAgent` — that base is tuned for long polling / 11-agent
 * fan-out. Lenses are short structured `generateText` calls under 30s.
 *
 * Subclasses provide:
 *  - `key` and `description` (used for the Vercel `tool()` wrapper)
 *  - `inputSchema` (Zod) — the tool-call argument shape
 *  - `outputSchema` (Zod) — the structured response shape (extends LensOutputSchema)
 *  - `promptKey` — which prompt-catalog entry to render
 *
 * The base wires prompt resolution → model resolution → structured generation
 * → fallback → telemetry. Subclasses rarely need to override anything else.
 */
@Injectable()
export abstract class BaseLensAgent<TOutput extends LensOutput> {
  protected readonly logger: Logger;

  abstract readonly key: string;
  abstract readonly description: string;
  abstract readonly promptKey: AiPromptKey;
  abstract readonly outputSchema: z.ZodType<TOutput>;
  /** Argument shape for the Vercel AI SDK tool wrapper. */
  readonly inputSchema = LensInputSchema;

  constructor(
    protected readonly modelExec: AiModelExecutionService,
    protected readonly prompts: AiPromptService,
    protected readonly providers: AiProviderService,
    protected readonly config: ConfigService,
  ) {
    this.logger = new Logger(`Lens(${this.constructor.name})`);
  }

  /** Build the variables passed into the prompt template. */
  protected buildVariables(ctx: LensInput): Record<string, string> {
    return {
      startupName: ctx.startupName,
      startupDescription: ctx.startupDescription,
      sector: ctx.sector,
      stage: ctx.stage,
      contextNotes: ctx.contextNotes,
    };
  }

  /**
   * Synchronous fallback used when the LLM call fails. Subclasses may override
   * to provide lens-specific shapes, but the default neutral "review" signal
   * is intentionally non-blocking — phase ordering must never depend on a
   * lens succeeding.
   */
  protected fallback(_ctx: LensInput, reason: string): TOutput {
    const base: LensOutput = {
      score: 0,
      signal: "review",
      rationale: `${LENS_FALLBACK_RATIONALE_PREFIX} (${reason}). Defer to evaluation.`,
      evidence: [],
    };
    return base as unknown as TOutput;
  }

  /** Run the lens and return a typed `LensRunResult`. */
  async run(rawCtx: LensInput): Promise<LensRunResult<TOutput>> {
    const ctx = this.inputSchema.parse(rawCtx);
    const startedAt = Date.now();
    const modelId = this.resolveModelId();

    try {
      const resolved = await this.prompts.resolve({ key: this.promptKey });
      const variables = this.buildVariables(ctx);
      const system = this.prompts.renderTemplate(
        resolved.systemPrompt,
        variables,
      );
      const userPrompt = this.prompts.renderTemplate(
        resolved.userPrompt,
        variables,
      );

      const model = this.resolveModel(modelId);
      const { output } = await this.modelExec.generateText<TOutput>({
        model,
        system,
        prompt: userPrompt,
        schema: this.outputSchema,
        temperature: 0.2,
      });

      if (!output) {
        throw new Error("Lens model returned empty structured output");
      }

      // Belt-and-suspenders: AI SDK already validated, but enforce again so
      // a corrupt cached response cannot poison persistence.
      const validated = this.outputSchema.parse(output);

      return {
        key: this.key,
        output: validated,
        modelId,
        promptKey: this.promptKey,
        latencyMs: Date.now() - startedAt,
        usedFallback: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Lens '${this.key}' failed, using fallback: ${message}`,
      );
      return {
        key: this.key,
        output: this.fallback(ctx, message),
        modelId,
        promptKey: this.promptKey,
        latencyMs: Date.now() - startedAt,
        usedFallback: true,
        error: message,
      };
    }
  }

  protected resolveModelId(): string {
    return this.config.get<string>(
      "SCREENING_LENS_MODEL",
      "gpt-5.4-mini",
    );
  }

  /**
   * Resolve a provider-specific model handle. Lenses don't need brave/web-
   * search tooling so we skip `resolveForPrompt` and go straight through the
   * provider router. Latency stays predictable.
   */
  protected resolveModel(modelId: string): Parameters<
    AiModelExecutionService["generateText"]
  >[0]["model"] {
    return this.providers.resolveModel(modelId) as Parameters<
      AiModelExecutionService["generateText"]
    >[0]["model"];
  }
}
