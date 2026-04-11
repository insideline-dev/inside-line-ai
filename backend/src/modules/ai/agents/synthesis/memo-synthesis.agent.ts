import { Injectable, Logger } from "@nestjs/common";
import { generateText, Output } from "ai";

import type { EvaluationFallbackReason } from "../../interfaces/agent.interface";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import type {
  EvaluationResult,
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
} from "../../interfaces/phase-results.interface";
import { AiProviderService } from "../../providers/ai-provider.service";
import { MemoSynthesisOutputOpenAiSchema } from "../../schemas/memo-synthesis-openai.schema";
import { MemoSynthesisOutputSchema } from "../../schemas/memo-synthesis.schema";
import type { MemoChunkSection } from "../../schemas/memo-synthesis.schema";
import { AiConfigService } from "../../services/ai-config.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { resolveProviderForModelName } from "../../services/ai-runtime-config.schema";
import { reconcileCitationMarkers, sanitizeNarrativeText } from "../../services/narrative-sanitizer";
import { OpenAiDirectClientService } from "../../services/openai-direct-client.service";
import { MEMO_SECTION_ORDER } from "./synthesis-chunk.config";
import {
  classifyFallbackReason,
  cleanStringArray,
  extractStructuredOutput,
  getRemainingBudgetMs,
  normalizeFallbackError,
  resolveRawOutputText,
  sanitizeRawProviderError,
  sanitizeStringArrayValues,
  shouldRetryFallbackReason,
  stripReasoningEffort,
  withTimeout,
} from "./synthesis-shared";

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface MemoSynthesisInput {
  extraction: ExtractionResult;
  scraping: ScrapingResult;
  research: ResearchResult;
  evaluation: EvaluationResult;
  stageWeights: Record<string, number>;
}

export interface MemoSynthesisOutput {
  executiveSummary: string;
  sections: MemoChunkSection[];
  keyDueDiligenceAreas: string[];
  dataConfidenceNotes: string;
}

export interface MemoSynthesisRunResult {
  output: MemoSynthesisOutput;
  inputPrompt: string;
  systemPrompt: string;
  outputText: string;
  outputJson: unknown;
  usedFallback: boolean;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
  attempt: number;
  retryCount: number;
}

// ─── Agent ──────────────────────────────────────────────────────────────────

@Injectable()
export class MemoSynthesisAgent {
  private readonly logger = new Logger(MemoSynthesisAgent.name);

  constructor(
    private readonly providers: AiProviderService,
    private readonly aiConfig: AiConfigService,
    private readonly promptService: AiPromptService,
    private readonly openAiDirect: OpenAiDirectClientService,
    private readonly modelExecution?: AiModelExecutionService,
  ) {}

  async runDetailed(input: MemoSynthesisInput): Promise<MemoSynthesisRunResult> {
    const hardTimeoutMs = this.aiConfig.getSynthesisAgentHardTimeoutMs();
    const startedAtMs = Date.now();
    let renderedPrompt = "";
    let systemPrompt = "";

    try {
      const promptConfig = await this.promptService.resolve({
        key: "synthesis.memo",
        stage: input.extraction.stage,
      });

      const execution = this.modelExecution
        ? await this.modelExecution.resolveForPrompt({
            key: "synthesis.memo",
            stage: input.extraction.stage,
          })
        : null;

      const model =
        execution?.generateTextOptions.model ??
        this.providers.resolveModelForPurpose(ModelPurpose.MEMO_SYNTHESIS);

      const providerOptions = execution?.generateTextOptions.providerOptions as
        | Record<string, unknown>
        | undefined;

      const resolvedModelName =
        execution?.resolvedConfig.modelName ??
        this.aiConfig.getModelForPurpose(ModelPurpose.MEMO_SYNTHESIS);
      const provider = resolveProviderForModelName(resolvedModelName);
      const useOpenAiDirect =
        provider === "openai" && this.openAiDirect.isConfigured();

      const promptVariables = this.buildPromptVariables(input);
      renderedPrompt = this.promptService.renderTemplate(
        promptConfig.userPrompt,
        promptVariables,
      );
      systemPrompt = promptConfig.systemPrompt;

      this.logger.debug(
        `[MemoSynthesis] Starting single-call | Company: ${input.extraction.companyName} | Stage: ${input.extraction.stage} | Path: ${useOpenAiDirect ? `openai-direct(${resolvedModelName})` : "ai-sdk"}`,
      );

      const callModel = async (
        remainingMs: number,
      ): Promise<{ parsedOutput: MemoSynthesisOutput; rawText: string; outputJson: unknown }> => {
        if (useOpenAiDirect) {
          const direct = await withTimeout(
            (abortSignal) =>
              this.openAiDirect.generateStructured({
                modelName: resolvedModelName,
                system: systemPrompt,
                prompt: renderedPrompt,
                schema: MemoSynthesisOutputOpenAiSchema,
                schemaName: "memo_synthesis_output",
                maxOutputTokens: 128000,
                reasoningEffort: "low",
                abortSignal,
              }),
            remainingMs,
            "Memo synthesis agent timed out",
          );
          const parsed = MemoSynthesisOutputSchema.parse(direct.output);
          const sanitized = this.sanitizeOutput(parsed);
          return { parsedOutput: sanitized, rawText: direct.rawText, outputJson: sanitized };
        }

        const strippedProviderOptions = stripReasoningEffort(providerOptions);
        const response = await withTimeout(
          (abortSignal) =>
            generateText({
              model: model as Parameters<typeof generateText>[0]["model"],
              output: Output.object({ schema: MemoSynthesisOutputSchema }),
              maxOutputTokens: 128000,
              system: systemPrompt,
              prompt: renderedPrompt,
              providerOptions: strippedProviderOptions as Parameters<typeof generateText>[0]["providerOptions"],
              abortSignal,
            }),
          remainingMs,
          "Memo synthesis agent timed out",
        );

        const rawOutput = extractStructuredOutput(response);
        const parsed = MemoSynthesisOutputSchema.parse(rawOutput);
        const sanitized = this.sanitizeOutput(parsed);
        return {
          parsedOutput: sanitized,
          rawText: resolveRawOutputText(response, rawOutput),
          outputJson: sanitized,
        };
      };

      const maxAttempts = 2;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const remainingMs = getRemainingBudgetMs(startedAtMs, hardTimeoutMs);
        if (remainingMs <= 0) {
          return this.buildFallbackResult(
            renderedPrompt, systemPrompt,
            new Error("Memo synthesis agent timed out"),
            attempt,
          );
        }

        try {
          const { parsedOutput, rawText, outputJson } = await callModel(remainingMs);

          this.logger.log(
            `[MemoSynthesis] Completed | Sections: ${parsedOutput.sections.length} | DDAs: ${parsedOutput.keyDueDiligenceAreas.length}`,
          );

          return {
            output: parsedOutput,
            inputPrompt: renderedPrompt,
            systemPrompt,
            outputText: rawText,
            outputJson,
            usedFallback: false,
            attempt,
            retryCount: attempt - 1,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const reason = classifyFallbackReason(error, message);

          if (shouldRetryFallbackReason(reason) && attempt < maxAttempts) {
            this.logger.warn(
              `[MemoSynthesis] Retryable failure (${reason}) on attempt ${attempt}; retrying`,
            );
            continue;
          }

          return this.buildFallbackResult(renderedPrompt, systemPrompt, error, attempt);
        }
      }
    } catch (error) {
      return this.buildFallbackResult(renderedPrompt, systemPrompt, error, 1);
    }

    return this.buildFallbackResult(
      renderedPrompt,
      systemPrompt,
      new Error("Memo synthesis attempts exhausted"),
      2,
    );
  }

  fallback(): MemoSynthesisOutput {
    return {
      executiveSummary: "Investor memo summary unavailable.",
      sections: [],
      keyDueDiligenceAreas: [],
      dataConfidenceNotes: "Confidence notes unavailable.",
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────

  private buildFallbackResult(
    renderedPrompt: string,
    systemPrompt: string,
    error: unknown,
    attempt: number,
  ): MemoSynthesisRunResult {
    const message = error instanceof Error ? error.message : String(error);
    const reason = classifyFallbackReason(error, message);

    this.logger.error(
      `[MemoSynthesis] Failed: ${normalizeFallbackError(reason, message)}`,
      error instanceof Error ? error.stack : undefined,
    );

    const fallbackOutput = this.fallback();
    return {
      output: fallbackOutput,
      inputPrompt: renderedPrompt,
      systemPrompt,
      outputText: JSON.stringify(fallbackOutput),
      outputJson: fallbackOutput,
      usedFallback: true,
      error: normalizeFallbackError(reason, message),
      fallbackReason: reason,
      rawProviderError: sanitizeRawProviderError(message),
      attempt,
      retryCount: Math.max(0, attempt - 1),
    };
  }

  buildPromptVariables(input: MemoSynthesisInput): Record<string, string> {
    return {
      companyName: input.extraction.companyName || "Unknown",
      stage: input.extraction.stage || "Unknown",
      sector: input.extraction.industry || "Unknown",
      location: input.extraction.location || "Not provided",
      website: input.extraction.website || "Not provided",
      stageWeights: JSON.stringify(input.stageWeights, null, 2),
      evaluationData: this.buildEvaluationData(input),
      evaluationRecommendations: this.buildEvaluationRecommendations(input),
    };
  }

  private buildEvaluationData(input: MemoSynthesisInput): string {
    const parts: string[] = [];

    // All 11 evaluation agents
    for (const section of MEMO_SECTION_ORDER) {
      const evalSection = input.evaluation[section.key] as Record<string, unknown> | undefined;
      if (!evalSection) continue;

      const score = typeof evalSection.score === "number" ? evalSection.score : null;
      const confidence = typeof evalSection.confidence === "string" ? evalSection.confidence : "unknown";
      const narrative =
        (typeof evalSection.narrativeSummary === "string" && evalSection.narrativeSummary.trim()) ||
        "No narrative available.";
      const keyFindings = cleanStringArray(evalSection.keyFindings);
      const risks = cleanStringArray(evalSection.risks);
      const dataGaps = cleanStringArray(evalSection.dataGaps);

      const weight = input.stageWeights[section.key] ?? 0;

      const payload = {
        dimension: section.title,
        dimensionKey: section.key,
        score,
        confidence,
        weight,
        narrative,
        keyFindings,
        risks,
        dataGaps,
      };

      parts.push(`<evaluation_data>\n${JSON.stringify(payload, null, 2)}\n</evaluation_data>`);
    }

    // Research reports
    const researchFields: Record<string, string | null> = {
      team: input.research.team,
      market: input.research.market,
      product: input.research.product,
      news: input.research.news,
      competitor: input.research.competitor,
    };

    const researchParts: string[] = [];
    for (const [key, content] of Object.entries(researchFields)) {
      if (content && content.trim().length > 0) {
        researchParts.push(`### ${key.charAt(0).toUpperCase() + key.slice(1)} Research\n${content.trim()}`);
      }
    }

    if (researchParts.length > 0) {
      parts.push(`\n=== RESEARCH REPORTS ===\n${researchParts.join("\n\n")}`);
    }

    // Research sources
    const sources = input.research.sources
      .filter((s) => s.url && s.url.length > 0)
      .slice(0, 30)
      .map((s) => `- [${s.name}] ${s.url}`)
      .join("\n");

    if (sources) {
      parts.push(`\n=== RESEARCH SOURCES ===\n${sources}`);
    }

    return parts.join("\n\n");
  }

  private buildEvaluationRecommendations(input: MemoSynthesisInput): string {
    const lines: string[] = [];

    // Gather founder pitch recommendations from evaluation agents
    const agentsWithRecs: Array<{ key: string; label: string }> = [
      { key: "team", label: "Team" },
      { key: "businessModel", label: "Business Model" },
      { key: "gtm", label: "Go-to-Market" },
      { key: "financials", label: "Financials" },
      { key: "legal", label: "Legal" },
    ];

    interface PitchRec {
      deckMissingElement: string;
      whyItMatters: string;
      recommendation: string;
    }

    const tagged: Array<{ source: string; rec: PitchRec }> = [];

    for (const { key, label } of agentsWithRecs) {
      const ev = input.evaluation[key as keyof EvaluationResult] as {
        founderPitchRecommendations?: PitchRec[];
      } | undefined;
      if (ev?.founderPitchRecommendations?.length) {
        for (const rec of ev.founderPitchRecommendations) {
          tagged.push({ source: label, rec });
        }
      }
    }

    if (tagged.length === 0) {
      return "No specific recommendations from evaluation agents.";
    }

    // Deduplicate by normalized deckMissingElement
    const seen = new Map<string, { sources: string[]; rec: PitchRec }>();
    for (const { source, rec } of tagged) {
      const normalizedKey = rec.deckMissingElement.toLowerCase().trim();
      const existing = seen.get(normalizedKey);
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      } else {
        seen.set(normalizedKey, { sources: [source], rec });
      }
    }

    // Cross-agent (raised by 2+ agents)
    const crossAgent = [...seen.values()].filter((entry) => entry.sources.length > 1);
    if (crossAgent.length > 0) {
      lines.push("CROSS-AGENT RECOMMENDATIONS (raised by multiple agents):");
      for (const { sources, rec } of crossAgent) {
        lines.push(`- Missing: ${rec.deckMissingElement} (flagged by: ${sources.join(", ")})`);
        lines.push(`  Why: ${rec.whyItMatters}`);
        lines.push(`  Action: ${rec.recommendation}`);
      }
      lines.push("");
    }

    // Per-agent unique recommendations
    const singleAgent = [...seen.values()].filter((entry) => entry.sources.length === 1);
    if (singleAgent.length > 0) {
      const bySource = new Map<string, PitchRec[]>();
      for (const entry of singleAgent) {
        const source = entry.sources[0]!;
        if (!bySource.has(source)) bySource.set(source, []);
        bySource.get(source)!.push(entry.rec);
      }
      for (const [source, recs] of bySource) {
        lines.push(`${source.toUpperCase()} AGENT RECOMMENDATIONS:`);
        for (const rec of recs) {
          lines.push(`- Missing: ${rec.deckMissingElement}`);
          lines.push(`  Why: ${rec.whyItMatters}`);
          lines.push(`  Action: ${rec.recommendation}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  private sanitizeOutput(parsed: {
    executiveSummary: string;
    sections: MemoChunkSection[];
    keyDueDiligenceAreas: string[];
    dataConfidenceNotes: string;
  }): MemoSynthesisOutput {
    return {
      executiveSummary: sanitizeNarrativeText(parsed.executiveSummary),
      sections: parsed.sections.map((section) => {
        const reconciled = reconcileCitationMarkers(
          sanitizeNarrativeText(section.memoNarrative),
          (section.sources ?? []).filter((s) => s.url.length > 0),
        );
        return {
          ...section,
          memoNarrative: reconciled.narrative,
          highlights: sanitizeStringArrayValues(section.highlights),
          concerns: sanitizeStringArrayValues(section.concerns),
          diligenceItems: sanitizeStringArrayValues(section.diligenceItems),
          sources: reconciled.sources,
        };
      }),
      keyDueDiligenceAreas: sanitizeStringArrayValues(parsed.keyDueDiligenceAreas),
      dataConfidenceNotes: sanitizeNarrativeText(parsed.dataConfidenceNotes),
    };
  }
}
