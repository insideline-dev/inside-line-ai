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
  /**
   * Lens-class version (DS-E2-F1-S2). Always a stringified positive integer
   * (e.g. `"1"`, `"2"`). Persisted on `startup_lens_result.lens_version` so
   * historical decisions stay replayable when the active version flips.
   */
  lensVersion: string;
  /**
   * Prompt revision that produced this output (DS-E2-F1-S2). Mirrors the
   * `version` carried on the resolved prompt catalog entry. Persisted on
   * `startup_lens_result.prompt_version` so prompt rewrites can ship behind
   * a config flip without losing historical traceability.
   */
  promptVersion: string;
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
  /**
   * Lens-class version. Stringified positive integer ("1", "2", ...). Bumped
   * by spinning up a new lens class (e.g. `TeamLensV2`) — never edit a
   * deployed lens's `version` in place, as that would invalidate replay of
   * historical decisions persisted at the old version (DS-E2-F1-S2).
   */
  readonly version: string = "1";
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
    const lensVersion = this.version;
    // DS-E2-F1-S2 — capture the prompt revision used for this run so the
    // result row stays traceable even if the catalog's active version flips
    // between this lens completing and the persistence write. Resolved lazily
    // inside the try block; default to lensVersion for the fallback path so
    // the persisted row is never missing a value.
    let promptVersion = lensVersion;

    try {
      const resolved = await this.prompts.resolve({ key: this.promptKey });
      promptVersion = resolved.version ?? lensVersion;
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

      // DS-E9-F2-S1 — drop unlinked claims at persistence boundary so the
      // evidence graph never accumulates source-less assertions. The lens
      // schema permits optional `source` so the LLM doesn't fail-validate
      // on a thin run, but anything we keep MUST be linkable.
      const cleaned = this.dropUnlinkedEvidence(validated);

      return {
        key: this.key,
        lensVersion,
        promptVersion,
        output: cleaned,
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
        lensVersion,
        promptVersion,
        output: this.fallback(ctx, message),
        modelId,
        promptKey: this.promptKey,
        latencyMs: Date.now() - startedAt,
        usedFallback: true,
        error: message,
      };
    }
  }

  /**
   * Filters evidence items that lack a non-empty `source`. Logs at debug if
   * any are dropped so unusually thin LLM outputs surface in dev without
   * polluting prod logs. Pure: returns a new object; the input is unchanged.
   */
  private dropUnlinkedEvidence(out: TOutput): TOutput {
    const original = out.evidence;
    const linked = original.filter(
      (e) => typeof e.source === "string" && e.source.trim().length > 0,
    );
    if (linked.length === original.length) return out;

    const dropped = original.length - linked.length;
    this.logger.debug(
      `Lens '${this.key}' dropped ${dropped} unlinked evidence item(s) (kept ${linked.length}/${original.length})`,
    );
    return { ...out, evidence: linked };
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
