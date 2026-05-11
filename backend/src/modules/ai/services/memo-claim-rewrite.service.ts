import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

import type { EvaluationAgentKey } from "../interfaces/agent.interface";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiConfigService } from "./ai-config.service";
import { AiModelExecutionService } from "./ai-model-execution.service";
import { AiPromptService } from "./ai-prompt.service";

const PROMPT_KEY = "memo.claim.rewrite" as const;

/**
 * Max output tokens for the claim rewrite call. Rewrites are tiny
 * (sentence-to-paragraph scale) so the budget is intentionally small —
 * keeps P95 latency well below the issue's 8s target. Configurable so
 * operators can crank it up for unusually long claims without redeploying.
 */
const REWRITE_MAX_OUTPUT_TOKENS_KEY = "AI_MEMO_CLAIM_REWRITE_MAX_OUTPUT_TOKENS";
const REWRITE_MAX_OUTPUT_TOKENS_DEFAULT = 1000;

/**
 * Maximum number of rewrites we ever return — the issue caps at 3. We
 * still ask the model for up to 3 and then filter, so the response may
 * legitimately have 0..3 entries.
 */
const MAX_REWRITES = 3;

const ModelRewriteSchema = z.object({
  rewrites: z
    .array(
      z.object({
        text: z.string().min(1),
      }),
    )
    .max(10),
});
type ModelRewrite = z.infer<typeof ModelRewriteSchema>;

export interface RewriteClaimInput {
  startupId: string;
  sectionKey: EvaluationAgentKey;
  sectionTitle: string;
  originalText: string;
  instruction?: string;
  /** Source identifiers (label or url) — used in prompt context only. */
  sourceIds?: string[];
}

export interface RewriteCandidate {
  text: string;
  /**
   * Best-effort diff marker. Intentionally minimal — the frontend computes
   * the visual diff against `originalText`. We just flag whether the
   * candidate is non-trivially different (empty when identical).
   */
  diff: string;
}

export interface RewriteClaimResult {
  startupId: string;
  sectionKey: EvaluationAgentKey;
  originalText: string;
  rewrites: RewriteCandidate[];
  /** Count of rewrites the model returned before the source-preservation guard ran. */
  candidateCountBeforeFilter: number;
  usedFallback: boolean;
}

/**
 * DG-E1-F3-S1 — pure rewrite suggestion service.
 *
 * Asks the model for up to 3 rewrites of an operator-selected claim and
 * filters out any candidate that introduces a factual marker (number,
 * percentage, year, monetary value, all-caps acronym, named entity) that
 * isn't already present in the original. This is a best-effort guard, not
 * an exhaustive verifier — the prompt is the primary defense; the filter
 * is the safety net.
 *
 * Persistence is NOT done here. The caller's accept-flow runs
 * `MemoSectionRegenerationService.applyOperatorRewrite()`.
 */
@Injectable()
export class MemoClaimRewriteService {
  private readonly logger = new Logger(MemoClaimRewriteService.name);

  constructor(
    private readonly promptService: AiPromptService,
    private readonly providers: AiProviderService,
    private readonly aiConfig: AiConfigService,
    private readonly modelExecution: AiModelExecutionService,
    private readonly config: ConfigService,
  ) {}

  async rewriteClaim(input: RewriteClaimInput): Promise<RewriteClaimResult> {
    const originalText = input.originalText.trim();
    if (originalText.length === 0) {
      throw new BadRequestException("originalText must not be empty");
    }

    const promptConfig = await this.promptService.resolve({
      key: PROMPT_KEY,
    });

    const renderedUserPrompt = this.renderUserPrompt(promptConfig.userPrompt, {
      originalText,
      instruction: input.instruction?.trim(),
      sourceIds: input.sourceIds ?? [],
      sectionTitle: input.sectionTitle,
    });

    const execution = await this.modelExecution
      .resolveForPrompt({ key: PROMPT_KEY })
      .catch((err: unknown) => {
        this.logger.warn(
          `[MemoClaimRewrite] resolveForPrompt failed (${err instanceof Error ? err.message : String(err)}) — falling back to MEMO_SYNTHESIS provider`,
        );
        return null;
      });

    const model =
      execution?.generateTextOptions.model ??
      this.providers.resolveModelForPurpose(ModelPurpose.MEMO_SYNTHESIS);

    const maxOutputTokens = this.config.get<number>(
      REWRITE_MAX_OUTPUT_TOKENS_KEY,
      REWRITE_MAX_OUTPUT_TOKENS_DEFAULT,
    );

    let raw: ModelRewrite | undefined;
    let usedFallback = false;
    try {
      const response = await this.modelExecution.generateText<ModelRewrite>({
        model,
        system: promptConfig.systemPrompt,
        prompt: renderedUserPrompt,
        schema: ModelRewriteSchema,
        maxOutputTokens,
        providerOptions: execution?.generateTextOptions.providerOptions,
      });
      raw =
        response.output ??
        response.experimental_output ??
        this.parseRawText(response.text);
    } catch (error) {
      this.logger.warn(
        `[MemoClaimRewrite] Model call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      usedFallback = true;
    }

    if (!raw) {
      return {
        startupId: input.startupId,
        sectionKey: input.sectionKey,
        originalText,
        rewrites: [],
        candidateCountBeforeFilter: 0,
        usedFallback: true,
      };
    }

    const candidates = raw.rewrites
      .map((r) => r.text.trim())
      .filter((text) => text.length > 0);

    const dedupedAgainstOriginal = candidates.filter(
      (text) => normalizeForCompare(text) !== normalizeForCompare(originalText),
    );

    const filtered = dedupedAgainstOriginal.filter((text) =>
      preservesFactualMarkers(originalText, text),
    );

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const text of filtered) {
      const key = normalizeForCompare(text);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(text);
    }

    const capped = unique.slice(0, MAX_REWRITES);

    const rewrites: RewriteCandidate[] = capped.map((text) => ({
      text,
      diff: text === originalText ? "" : "edit",
    }));

    return {
      startupId: input.startupId,
      sectionKey: input.sectionKey,
      originalText,
      rewrites,
      candidateCountBeforeFilter: candidates.length,
      usedFallback,
    };
  }

  private renderUserPrompt(
    template: string,
    vars: {
      originalText: string;
      instruction: string | undefined;
      sourceIds: string[];
      sectionTitle: string;
    },
  ): string {
    const sourcesBlock =
      vars.sourceIds.length > 0
        ? vars.sourceIds.map((s, i) => `- [${i + 1}] ${s}`).join("\n")
        : "(no cited sources — keep wording grounded in the original claim only)";
    const instruction = vars.instruction && vars.instruction.length > 0
      ? vars.instruction
      : "(none)";

    return template
      .replace(/{{originalText}}/g, vars.originalText)
      .replace(/{{instruction}}/g, instruction)
      .replace(/{{sourcesBlock}}/g, sourcesBlock)
      .replace(/{{sectionTitle}}/g, vars.sectionTitle);
  }

  private parseRawText(text: string | undefined): ModelRewrite | undefined {
    if (!text || text.trim().length === 0) return undefined;
    try {
      const parsed = JSON.parse(text) as unknown;
      const result = ModelRewriteSchema.safeParse(parsed);
      return result.success ? result.data : undefined;
    } catch {
      return undefined;
    }
  }
}

// ── Source-preservation guard helpers (exported for direct testing) ──

const NUMBER_PATTERN = /\d[\d.,]*%?/g;
const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;
const CURRENCY_PATTERN = /[$€£¥]\s?\d[\d.,]*[KkMmBb]?/g;
const ACRONYM_PATTERN = /\b[A-Z]{3,}\b/g;
const PROPER_NOUN_PATTERN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;

// Common sentence-leading capitalized tokens that the model adds or drops
// without changing meaning. Compared case-insensitively to be permissive
// across "In 2024" vs "in 2024" rephrasings.
const STOPWORD_PROPER_NOUNS = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "we",
  "our",
  "their",
  "it",
  "they",
  "he",
  "she",
  "his",
  "her",
  "i",
  "a",
  "an",
  "in",
  "on",
  "at",
  "by",
  "for",
  "from",
  "to",
  "with",
  "of",
  "as",
  "after",
  "before",
  "during",
  "since",
  "while",
  "and",
  "or",
  "but",
  "if",
  "when",
  "where",
  "however",
  "additionally",
  "meanwhile",
  "still",
  "yet",
  "founders",
  "team",
  "company",
  "product",
  "market",
]);

function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractMarkers(text: string): {
  strict: Set<string>;
  vocabulary: Set<string>;
} {
  const strict = new Set<string>();
  for (const re of [NUMBER_PATTERN, YEAR_PATTERN, CURRENCY_PATTERN, ACRONYM_PATTERN]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      strict.add(normalizeMarker(match[0]));
    }
  }

  // Multi-word proper noun phrases (e.g. "Path Robotics") are strict
  // markers — adding a new one means the model invented an entity.
  PROPER_NOUN_PATTERN.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = PROPER_NOUN_PATTERN.exec(text)) !== null) {
    const token = pm[0];
    if (!token.includes(" ")) continue;
    strict.add(normalizeMarker(token));
  }

  // Vocabulary is the lowercased word set of the source — we use it to
  // forgive single-word "proper nouns" in a candidate as long as the
  // word appears anywhere in the original (capitalization-insensitive).
  // This makes sentence-leading capitalization variants permissive
  // ("Two pilots" vs "two pilots") without losing the ability to flag
  // truly novel entities.
  const vocabulary = new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0),
  );

  return { strict, vocabulary };
}

function extractSingleWordProperNouns(text: string): string[] {
  const out: string[] = [];
  PROPER_NOUN_PATTERN.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = PROPER_NOUN_PATTERN.exec(text)) !== null) {
    const token = pm[0];
    if (token.includes(" ")) continue;
    if (STOPWORD_PROPER_NOUNS.has(token.toLowerCase())) continue;
    out.push(token);
  }
  return out;
}

function normalizeMarker(value: string): string {
  return value
    .toLowerCase()
    // Strip leading/trailing punctuation that the regexes sometimes
    // capture greedily (e.g. "2024," or "2024.").
    .replace(/^[.,;:!?]+|[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true iff every factual marker in `candidate` is also present in
 * `original`. This is intentionally permissive on synonyms and word-order
 * but strict on novel numbers, percentages, currency amounts, years,
 * acronyms, and multi-word proper nouns. Best-effort guard, not a
 * fact-checker.
 */
export function preservesFactualMarkers(
  original: string,
  candidate: string,
): boolean {
  const { strict: originalStrict, vocabulary: originalVocab } =
    extractMarkers(original);
  const { strict: candidateStrict } = extractMarkers(candidate);

  for (const marker of candidateStrict) {
    if (!originalStrict.has(marker)) return false;
  }

  // Single-word proper nouns are forgiven if their lowercased form is in
  // the original's vocabulary (handles capitalization shifts). Truly new
  // entities like "Microsoft" introduced into a non-Microsoft sentence
  // are rejected because they have no vocabulary anchor.
  for (const token of extractSingleWordProperNouns(candidate)) {
    if (!originalVocab.has(token.toLowerCase())) return false;
  }
  return true;
}
