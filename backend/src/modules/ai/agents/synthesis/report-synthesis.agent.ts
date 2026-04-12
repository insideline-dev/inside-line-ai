import { Injectable, Logger } from "@nestjs/common";
import { generateText, Output } from "ai";

import { AiProviderService } from "../../providers/ai-provider.service";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { resolveProviderForModelName } from "../../services/ai-runtime-config.schema";
import { OpenAiDirectClientService } from "../../services/openai-direct-client.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import type {
  EvaluationResult,
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
} from "../../interfaces/phase-results.interface";
import type {
  EvaluationFallbackReason,
  OpenAiResponseTelemetry,
} from "../../interfaces/agent.interface";
import type { ExitScenario } from "../../schemas/evaluations/exit-potential.schema";
import type { FounderPitchRecommendation } from "../../schemas/simple-evaluation.schema";
import type { FounderRecommendation } from "../../schemas/evaluations/team.schema";
import { ReportSynthesisOutputOpenAiSchema } from "../../schemas/report-synthesis-openai.schema";
import { ReportSynthesisSchema } from "../../schemas/report-synthesis.schema";
import type { ReportSynthesis } from "../../schemas/report-synthesis.schema";
import { sanitizeNarrativeText } from "../../services/narrative-sanitizer";
import {
  withTimeout,
  getRemainingBudgetMs,
  classifyFallbackReason,
  shouldRetryFallbackReason,
  normalizeFallbackError,
  sanitizeRawProviderError,
  resolveRawOutputText,
  extractStructuredOutput,
  safeStringify,
  sanitizeStringArrayValues,
  normalizeWhitespace,
  formatDimensionLabel,
} from "./synthesis-shared";

// ─── Re-export MemoSynthesisOutput from the canonical source ────────
import type { MemoSynthesisOutput } from "./memo-synthesis.agent";
export type { MemoSynthesisOutput };

// ─── Agent interfaces ───────────────────────────────────────────────

export interface ReportSynthesisInput {
  extraction: ExtractionResult;
  scraping: ScrapingResult;
  research: ResearchResult;
  evaluation: EvaluationResult;
  stageWeights: Record<string, number>;
  memoOutput: MemoSynthesisOutput;
}

export interface ReportSynthesisOutput {
  dealSnapshot: string;
  keyStrengths: string[];
  keyRisks: string[];
  exitScenarios: ExitScenario[];
  founderReport: {
    summary: string;
    whatsWorking: string[];
    pathToInevitability: string[];
  };
  dataConfidenceNotes: string;
}

export interface ReportSynthesisRunResult {
  output: ReportSynthesisOutput;
  inputPrompt: string;
  systemPrompt: string;
  outputText: string;
  outputJson: unknown;
  meta?: Record<string, unknown>;
  usedFallback: boolean;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
  attempt: number;
  retryCount: number;
}

// ─── Agent ──────────────────────────────────────────────────────────

@Injectable()
export class ReportSynthesisAgent {
  private readonly logger = new Logger(ReportSynthesisAgent.name);

  constructor(
    private readonly providers: AiProviderService,
    private readonly aiConfig: AiConfigService,
    private readonly promptService: AiPromptService,
    private readonly openAiDirect: OpenAiDirectClientService,
    private readonly modelExecution?: AiModelExecutionService,
  ) {}

  async runDetailed(input: ReportSynthesisInput): Promise<ReportSynthesisRunResult> {
    const maxAttempts = 2;
    const hardTimeoutMs = this.aiConfig.getSynthesisAgentHardTimeoutMs();
    const startedAtMs = Date.now();
    let renderedPrompt = "";
    let systemPrompt = "";

    try {
      const promptConfig = await this.promptService.resolve({
        key: "synthesis.report",
        stage: input.extraction.stage,
      });

      const execution = this.modelExecution
        ? await this.modelExecution.resolveForPrompt({
            key: "synthesis.report",
            stage: input.extraction.stage,
          })
        : null;

      const model =
        execution?.generateTextOptions.model ??
        this.providers.resolveModelForPurpose(ModelPurpose.REPORT_SYNTHESIS);

      const providerOptions = execution?.generateTextOptions.providerOptions;

      const resolvedModelName =
        execution?.resolvedConfig.modelName ??
        this.aiConfig.getModelForPurpose(ModelPurpose.REPORT_SYNTHESIS);
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
        `[ReportSynthesis] Starting | Company: ${input.extraction.companyName} | Stage: ${input.extraction.stage} | Path: ${useOpenAiDirect ? `openai-direct(${resolvedModelName})` : "ai-sdk"}`,
      );

      const callModel = async (
        remainingMs: number,
      ): Promise<{
        parsedOutput: ReportSynthesisOutput;
        rawText: string;
        outputJson: unknown;
        meta?: Record<string, unknown>;
      }> => {
        if (useOpenAiDirect) {
          const direct = await withTimeout(
            (abortSignal) =>
              this.openAiDirect.generateStructured({
                modelName: resolvedModelName,
                system: systemPrompt,
                prompt: renderedPrompt,
                schema: ReportSynthesisOutputOpenAiSchema,
                schemaName: "report_synthesis_output",
                maxOutputTokens: 8000,
                reasoningEffort: "low",
                jobKey: `${input.extraction.companyName}:report_synthesis`,
                abortSignal,
              }),
            remainingMs,
            "Report synthesis agent timed out",
          );
          const parsed = ReportSynthesisSchema.parse(direct.output);
          const sanitized = this.sanitizeOutput(parsed);
          return {
            parsedOutput: sanitized,
            rawText: direct.rawText,
            outputJson: sanitized,
            meta: this.buildTelemetryMeta(direct.telemetry),
          };
        }

        const response = await withTimeout(
          (abortSignal) =>
            generateText({
              model: model as Parameters<typeof generateText>[0]["model"],
              output: Output.object({ schema: ReportSynthesisSchema }),
              maxOutputTokens: 8000,
              system: systemPrompt,
              prompt: renderedPrompt,
              providerOptions:
                providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
              abortSignal,
            }),
          remainingMs,
          "Report synthesis agent timed out",
        );

        const rawOutput = extractStructuredOutput(response);
        const parsed = ReportSynthesisSchema.parse(rawOutput);
        const sanitized = this.sanitizeOutput(parsed);
        return {
          parsedOutput: sanitized,
          rawText: resolveRawOutputText(response, rawOutput),
          outputJson: sanitized,
        };
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const remainingBudgetMs = getRemainingBudgetMs(startedAtMs, hardTimeoutMs);
        if (remainingBudgetMs <= 0) {
          return this.buildFallbackResult(renderedPrompt, systemPrompt, new Error("Report synthesis agent timed out"), attempt);
        }

        try {
          const { parsedOutput, rawText, outputJson, meta } = await callModel(remainingBudgetMs);

          this.logger.log(
            `[ReportSynthesis] Completed | Strengths: ${parsedOutput.keyStrengths.length} | Risks: ${parsedOutput.keyRisks.length}`,
          );

          return {
            output: parsedOutput,
            inputPrompt: renderedPrompt,
            systemPrompt,
            outputText: rawText,
            outputJson,
            meta,
            usedFallback: false,
            attempt,
            retryCount: attempt - 1,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const fallbackReason = classifyFallbackReason(error, message);

          if (shouldRetryFallbackReason(fallbackReason) && attempt < maxAttempts) {
            this.logger.warn(
              `[ReportSynthesis] Retryable failure (${fallbackReason}) on attempt ${attempt}; retrying`,
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
      new Error("Report synthesis attempts exhausted"),
      maxAttempts,
    );
  }

  fallback(): ReportSynthesisOutput {
    return {
      dealSnapshot: "Deal snapshot unavailable.",
      keyStrengths: ["Data available in evaluation sections"],
      keyRisks: ["Report synthesis could not complete — review evaluation data"],
      exitScenarios: [],
      founderReport: {
        summary: "Founder report synthesis unavailable.",
        whatsWorking: [],
        pathToInevitability: [],
      },
      dataConfidenceNotes: "Report synthesis failed; unable to generate structured analysis.",
    };
  }

  // ─── Private ────────────────────────────────────────────────────────

  private buildFallbackResult(
    renderedPrompt: string,
    systemPrompt: string,
    error: unknown,
    attempt: number,
  ): ReportSynthesisRunResult {
    const message = error instanceof Error ? error.message : String(error);
    const fallbackReason = classifyFallbackReason(error, message);
    const normalizedError = normalizeFallbackError(fallbackReason, message);
    const rawProviderError = sanitizeRawProviderError(message);

    this.logger.error(
      `[ReportSynthesis] Failed: ${normalizedError}`,
      error instanceof Error ? error.stack : undefined,
    );

    const fallbackOutput = this.fallback();
    return {
      output: fallbackOutput,
      inputPrompt: renderedPrompt,
      systemPrompt,
      outputText: safeStringify(fallbackOutput),
      outputJson: fallbackOutput,
      usedFallback: true,
      error: normalizedError,
      fallbackReason,
      rawProviderError,
      attempt,
      retryCount: Math.max(0, attempt - 1),
    };
  }

  private buildTelemetryMeta(
    telemetry: OpenAiResponseTelemetry | undefined,
    baseMeta?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!telemetry) {
      return baseMeta;
    }

    return {
      ...(baseMeta ?? {}),
      openaiTelemetry: telemetry,
    };
  }

  private buildPromptVariables(input: ReportSynthesisInput): Record<string, string> {
    return {
      companyName: input.extraction.companyName || "Unknown",
      stage: input.extraction.stage || "Unknown",
      sector: input.extraction.industry || "Unknown",
      location: input.extraction.location || "Not provided",
      website: input.extraction.website || "Not provided",
      executiveSummary: input.memoOutput.executiveSummary || "Not available",
      memoSectionsSummary: this.buildMemoSectionsSummary(input.memoOutput),
      keyDueDiligenceAreas: input.memoOutput.keyDueDiligenceAreas.join("; ") || "None identified",
      evaluationBrief: this.buildEvaluationBrief(input),
      evaluationRecommendations: this.buildEvaluationRecommendations(input.evaluation),
      stageWeights: JSON.stringify(input.stageWeights),
    };
  }

  private buildEvaluationBrief(input: ReportSynthesisInput): string {
    const lines: string[] = [];
    const dimensionKeys = [
      "team", "market", "product", "traction", "businessModel",
      "gtm", "financials", "competitiveAdvantage", "legal", "dealTerms", "exitPotential",
    ] as const;

    let weightedSum = 0;
    let weightTotal = 0;

    for (const key of dimensionKeys) {
      const ev = input.evaluation[key] as {
        score?: number;
        confidence?: string;
        keyFindings?: string[];
        risks?: string[];
        exitScenarios?: Array<Record<string, unknown>>;
      } | undefined;

      if (!ev) continue;

      const label = formatDimensionLabel(key);
      const score = ev.score ?? 0;
      const confidence = ev.confidence ?? "unknown";
      const findings = (ev.keyFindings ?? []).slice(0, 3).join("; ");
      const risks = (ev.risks ?? []).slice(0, 3).join("; ");
      const weight = input.stageWeights[key] ?? 0;

      weightedSum += score * weight;
      weightTotal += weight;

      lines.push(`${label}: ${score}/100 (${confidence} confidence)`);
      if (findings) lines.push(`  Findings: ${findings}`);
      if (risks) lines.push(`  Risks: ${risks}`);

      // Include exit scenario data for the report agent to produce exit scenarios
      if (key === "exitPotential" && ev.exitScenarios && Array.isArray(ev.exitScenarios) && ev.exitScenarios.length > 0) {
        lines.push(`  Exit Scenarios: ${JSON.stringify(ev.exitScenarios)}`);
      }
    }

    const overallScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
    lines.unshift(`WEIGHTED OVERALL SCORE: ${overallScore}/100\n`);

    return lines.join("\n");
  }

  private buildMemoSectionsSummary(memoOutput: MemoSynthesisOutput): string {
    if (!memoOutput.sections || memoOutput.sections.length === 0) {
      return "No memo sections available.";
    }

    return memoOutput.sections
      .map((section) => {
        const truncated = section.memoNarrative.length > 300
          ? `${section.memoNarrative.slice(0, 300)}...`
          : section.memoNarrative;
        return `[${section.title}] ${truncated}`;
      })
      .join("\n\n");
  }

  private buildEvaluationRecommendations(evaluation: EvaluationResult): string {
    const AGENTS_WITH_PITCH_RECS: Array<{
      key: keyof EvaluationResult;
      label: string;
    }> = [
      { key: "team", label: "Team" },
      { key: "businessModel", label: "Business Model" },
      { key: "gtm", label: "Go-to-Market" },
      { key: "financials", label: "Financials" },
      { key: "legal", label: "Legal" },
    ];

    const tagged: Array<{ source: string; rec: FounderPitchRecommendation }> = [];

    for (const { key, label } of AGENTS_WITH_PITCH_RECS) {
      const ev = evaluation[key] as { founderPitchRecommendations?: FounderPitchRecommendation[] } | undefined;
      if (ev?.founderPitchRecommendations?.length) {
        for (const rec of ev.founderPitchRecommendations) {
          tagged.push({ source: label, rec });
        }
      }
    }

    const teamEv = evaluation.team as { founderRecommendations?: FounderRecommendation[] } | undefined;
    const founderRecs = teamEv?.founderRecommendations ?? [];

    if (tagged.length === 0 && founderRecs.length === 0) {
      return "No specific recommendations from evaluation agents.";
    }

    // Deduplicate by normalized deckMissingElement
    const seen = new Map<string, { sources: string[]; rec: FounderPitchRecommendation }>();
    for (const { source, rec } of tagged) {
      const normalizedKey = rec.deckMissingElement.toLowerCase().trim();
      const existing = seen.get(normalizedKey);
      if (existing) {
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
      } else {
        seen.set(normalizedKey, { sources: [source], rec });
      }
    }

    const lines: string[] = [];

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
      const bySource = new Map<string, Array<{ rec: FounderPitchRecommendation }>>();
      for (const entry of singleAgent) {
        const source = entry.sources[0]!;
        if (!bySource.has(source)) bySource.set(source, []);
        bySource.get(source)!.push({ rec: entry.rec });
      }
      for (const [source, entries] of bySource) {
        lines.push(`${source.toUpperCase()} AGENT RECOMMENDATIONS:`);
        for (const { rec } of entries) {
          lines.push(`- Missing: ${rec.deckMissingElement}`);
          lines.push(`  Why: ${rec.whyItMatters}`);
          lines.push(`  Action: ${rec.recommendation}`);
        }
        lines.push("");
      }
    }

    // Team-specific founder recommendations
    if (founderRecs.length > 0) {
      lines.push("TEAM AGENT — FOUNDER RECOMMENDATIONS:");
      for (const rec of founderRecs) {
        const label = rec.action.trim().toUpperCase();
        lines.push(`- [${label}] ${rec.recommendation}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private sanitizeOutput(output: ReportSynthesis): ReportSynthesisOutput {
    return {
      dealSnapshot: normalizeWhitespace(sanitizeNarrativeText(output.dealSnapshot)),
      keyStrengths: sanitizeStringArrayValues(output.keyStrengths),
      keyRisks: sanitizeStringArrayValues(output.keyRisks),
      exitScenarios: (output.exitScenarios ?? []).map((scenario) => ({
        ...scenario,
        exitValuation: sanitizeNarrativeText(scenario.exitValuation).replace(/\s+/g, " ").trim(),
        timeline: sanitizeNarrativeText(scenario.timeline).replace(/\s+/g, " ").trim(),
        researchBasis: sanitizeNarrativeText(scenario.researchBasis).replace(/\s+/g, " ").trim(),
      })),
      founderReport: {
        summary: normalizeWhitespace(sanitizeNarrativeText(output.founderReport.summary)),
        whatsWorking: sanitizeStringArrayValues(output.founderReport.whatsWorking),
        pathToInevitability: sanitizeStringArrayValues(output.founderReport.pathToInevitability),
      },
      dataConfidenceNotes: normalizeWhitespace(output.dataConfidenceNotes),
    };
  }
}
