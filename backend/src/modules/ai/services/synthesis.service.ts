import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DrizzleService } from "../../../database";
import { startup } from "../../startup/entities";
import { startupEvaluation } from "../../analysis/entities";
import { PipelineStateService } from "./pipeline-state.service";
import { ModelPurpose, PipelinePhase } from "../interfaces/pipeline.interface";
import { EVALUATION_AGENT_KEYS, MEMO_SYNTHESIS_AGENT_KEY, REPORT_SYNTHESIS_AGENT_KEY } from "../constants/agent-keys";
import type {
  EvaluationResult,
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
  SynthesisResult,
} from "../interfaces/phase-results.interface";
import { ExitScenarioSchema } from "../schemas/evaluations/exit-potential.schema";
import {
  ScoreComputationService,
  type SectionScores,
} from "./score-computation.service";
import { MemoSynthesisAgent } from "../agents/synthesis/memo-synthesis.agent";
import type { MemoSynthesisOutput } from "../agents/synthesis/memo-synthesis.agent";
import { ReportSynthesisAgent } from "../agents/synthesis/report-synthesis.agent";
import type { ReportSynthesisOutput } from "../agents/synthesis/report-synthesis.agent";
import type { SynthesisAgentOutput } from "../agents/synthesis";
import type { InvestorMemo, FounderReport } from "../schemas/synthesis.schema";
import type { EvaluationFallbackReason } from "../interfaces/agent.interface";
import { MemoGeneratorService } from "./memo-generator.service";
import { AiConfigService } from "./ai-config.service";
import { sanitizeNarrativeText } from "./narrative-sanitizer";

export const SYNTHESIS_AGENT_KEY = "synthesisagent";

export interface SynthesisRunTraceDetails {
  agentKey: string;
  status: "completed" | "fallback" | "failed";
  attempt: number;
  retryCount: number;
  usedFallback: boolean;
  inputPrompt: string;
  systemPrompt: string;
  outputText?: string;
  outputJson?: unknown;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
}

export interface SynthesisRunDetails {
  synthesis: SynthesisResult;
  traces: SynthesisRunTraceDetails[];
}

export interface SynthesisProgressCallbacks {
  onMemoStarted?: () => void;
  onMemoCompleted?: (trace: SynthesisRunTraceDetails) => void;
  onReportStarted?: () => void;
  onReportCompleted?: (trace: SynthesisRunTraceDetails) => void;
}

const EXIT_SCENARIO_ORDER = {
  conservative: 0,
  moderate: 1,
  optimistic: 2,
} as const;

@Injectable()
export class SynthesisService {
  private readonly logger = new Logger(SynthesisService.name);

  constructor(
    private drizzle: DrizzleService,
    private pipelineState: PipelineStateService,
    private memoSynthesisAgent: MemoSynthesisAgent,
    private reportSynthesisAgent: ReportSynthesisAgent,
    private scoreComputation: ScoreComputationService,
    private aiConfig: AiConfigService,
    private memoGenerator: MemoGeneratorService,
  ) {}

  async run(startupId: string): Promise<SynthesisResult> {
    const details = await this.runDetailed(startupId);
    return details.synthesis;
  }

  async runDetailed(startupId: string, callbacks?: SynthesisProgressCallbacks): Promise<SynthesisRunDetails> {
    this.logger.log(`[Synthesis] Starting synthesis run | Startup: ${startupId}`);

    const { extraction, research, evaluation, scraping } =
      await this.loadPhaseResults(startupId);

    const sectionScores = this.computeSectionScores(evaluation);
    const normalizedWeights = await this.scoreComputation.getWeightsForStage(extraction.stage);

    this.logger.debug(
      `[Synthesis] Loaded phase results | Company: ${extraction.companyName} | Research sources: ${research.sources?.length ?? 0}`,
    );

    // --- Agent 1: Memo Synthesis ---
    callbacks?.onMemoStarted?.();

    const memoResult = await this.memoSynthesisAgent.runDetailed({
      extraction, scraping, research, evaluation,
      stageWeights: normalizedWeights as unknown as Record<string, number>,
    });

    const memoOutput = memoResult.usedFallback
      ? await this.reusePreviousMemoOnFallback(startupId, memoResult.output)
      : memoResult.output;

    const memoTrace: SynthesisRunTraceDetails = {
      agentKey: MEMO_SYNTHESIS_AGENT_KEY,
      status: memoResult.usedFallback ? "fallback" : "completed",
      attempt: memoResult.attempt,
      retryCount: memoResult.retryCount,
      usedFallback: memoResult.usedFallback,
      inputPrompt: memoResult.inputPrompt,
      systemPrompt: memoResult.systemPrompt,
      outputText: memoResult.outputText,
      outputJson: memoOutput,
      error: memoResult.error,
      fallbackReason: memoResult.fallbackReason,
      rawProviderError: memoResult.rawProviderError,
    };
    callbacks?.onMemoCompleted?.(memoTrace);

    // --- Agent 2: Report Synthesis ---
    callbacks?.onReportStarted?.();

    const reportResult = await this.reportSynthesisAgent.runDetailed({
      extraction, scraping, research, evaluation,
      stageWeights: normalizedWeights as unknown as Record<string, number>,
      memoOutput,
    });

    const reportOutput = reportResult.usedFallback
      ? this.reusePreviousReportOnFallback(reportResult.output)
      : reportResult.output;

    const reportTrace: SynthesisRunTraceDetails = {
      agentKey: REPORT_SYNTHESIS_AGENT_KEY,
      status: reportResult.usedFallback ? "fallback" : "completed",
      attempt: reportResult.attempt,
      retryCount: reportResult.retryCount,
      usedFallback: reportResult.usedFallback,
      inputPrompt: reportResult.inputPrompt,
      systemPrompt: reportResult.systemPrompt,
      outputText: reportResult.outputText,
      outputJson: reportResult.outputJson,
      error: reportResult.error,
      fallbackReason: reportResult.fallbackReason,
      rawProviderError: reportResult.rawProviderError,
    };
    callbacks?.onReportCompleted?.(reportTrace);

    // --- Compose Final Output ---
    const exitScenarios = reportOutput.exitScenarios.length > 0
      ? reportOutput.exitScenarios
      : this.normalizeExitScenarios(evaluation.exitPotential?.exitScenarios);

    const composedOutput: SynthesisAgentOutput = {
      dealSnapshot: reportOutput.dealSnapshot,
      keyStrengths: reportOutput.keyStrengths,
      keyRisks: reportOutput.keyRisks,
      exitScenarios,
      investorMemo: {
        executiveSummary: memoOutput.executiveSummary,
        sections: memoOutput.sections.map((s) => ({
          title: s.title,
          content: s.memoNarrative,
          highlights: s.highlights,
          concerns: s.concerns,
          sources: s.sources,
        })),
        keyDueDiligenceAreas: memoOutput.keyDueDiligenceAreas,
      },
      founderReport: reportOutput.founderReport,
      dataConfidenceNotes: reportOutput.dataConfidenceNotes || memoOutput.dataConfidenceNotes || "",
    };

    const overallScore = this.scoreComputation.computeWeightedScore(sectionScores, normalizedWeights);

    this.logger.log(
      `[Synthesis] Agent output | Strengths: ${composedOutput.keyStrengths.length} | Risks: ${composedOutput.keyRisks.length}`,
    );

    const synthesis = this.buildSynthesisResult(
      composedOutput,
      sectionScores,
      overallScore,
      evaluation,
    );

    const confidenceScore = this.scoreComputation.computeConfidenceScore(
      evaluation as unknown as Record<string, unknown>,
      normalizedWeights,
    );
    synthesis.confidenceScore = confidenceScore;

    await this.persistResults(startupId, synthesis, evaluation, scraping, research, extraction);

    this.logger.log(
      `[Synthesis] ✅ Results persisted | Score: ${synthesis.overallScore} | KeyStrengths: ${synthesis.keyStrengths?.length} | KeyRisks: ${synthesis.keyRisks?.length}`,
    );

    // Fire-and-forget: PDF generation + upload is heavy (minutes) and its
    // output (memo URLs) is not required for the phase to complete or for any
    // frontend flow. Blocking the synthesis phase on it made the pipeline view
    // hang after agents finished.
    void this.performPostSynthesisOps(startupId, synthesis, extraction).catch(
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[Synthesis] Deferred post-synthesis ops failed for ${startupId}: ${message}`,
        );
      },
    );

    return {
      synthesis: { ...synthesis },
      traces: [memoTrace, reportTrace],
    };
  }

  private async loadPhaseResults(startupId: string) {
    const [extraction, research, scraping, evaluation] = await Promise.all([
      this.pipelineState.getPhaseResult(startupId, PipelinePhase.EXTRACTION),
      this.pipelineState.getPhaseResult(startupId, PipelinePhase.RESEARCH),
      this.pipelineState.getPhaseResult(startupId, PipelinePhase.SCRAPING),
      this.pipelineState.getPhaseResult(startupId, PipelinePhase.EVALUATION),
    ]);

    if (!extraction || !scraping || !research || !evaluation) {
      throw new Error(
        "Synthesis requires extraction, research, and evaluation results",
      );
    }

    return {
      extraction,
      research,
      scraping,
      evaluation,
    };
  }

  private computeSectionScores(evaluation: EvaluationResult): SectionScores {
    return {
      team: evaluation.team.score,
      market: evaluation.market.score,
      product: evaluation.product.score,
      traction: evaluation.traction.score,
      businessModel: evaluation.businessModel.score,
      gtm: evaluation.gtm.score,
      financials: evaluation.financials.score,
      competitiveAdvantage: evaluation.competitiveAdvantage.score,
      legal: evaluation.legal.score,
      dealTerms: evaluation.dealTerms.score,
      exitPotential: evaluation.exitPotential.score,
    };
  }

  private buildSynthesisResult(
    generated: SynthesisAgentOutput,
    sectionScores: SectionScores,
    overallScore: number,
    evaluation: EvaluationResult,
  ): SynthesisResult {
    return {
      ...generated,
      overallScore,
      sectionScores,
      dataConfidenceNotes:
        generated.dataConfidenceNotes ||
        (evaluation.summary.degraded
          ? `Degraded pipeline run: ${evaluation.summary.completedAgents}/${EVALUATION_AGENT_KEYS.length} evaluation agents completed; fallback used in ${evaluation.summary.fallbackAgents ?? 0} agent(s)`
          : "Full evaluation coverage completed without fallback"),
    };
  }

  private async persistResults(
    startupId: string,
    synthesis: SynthesisResult,
    evaluation: EvaluationResult,
    scraping: ScrapingResult,
    research: ResearchResult,
    extraction?: ExtractionResult,
  ): Promise<void> {
    const { overallScore, sectionScores } = synthesis;
    const evaluationWithMemoNarratives = this.applyMemoNarrativesFromSynthesis(
      evaluation,
      synthesis.investorMemo,
    );
    const persistedSources = this.buildPersistedSources(
      research.sources,
      evaluationWithMemoNarratives,
      synthesis,
    );

    const evaluationValues = {
      teamData: evaluationWithMemoNarratives.team,
      teamMemberEvaluations: this.buildTeamMemberEvaluations(
        evaluationWithMemoNarratives.team.teamMembers,
        scraping.teamMembers,
      ),
      marketData: evaluationWithMemoNarratives.market,
      productData: evaluationWithMemoNarratives.product,
      tractionData: evaluationWithMemoNarratives.traction,
      businessModelData: evaluationWithMemoNarratives.businessModel,
      gtmData: evaluationWithMemoNarratives.gtm,
      financialsData: evaluationWithMemoNarratives.financials,
      competitiveAdvantageData: evaluationWithMemoNarratives.competitiveAdvantage,
      legalData: evaluationWithMemoNarratives.legal,
      dealTermsData: evaluationWithMemoNarratives.dealTerms,
      exitPotentialData: evaluationWithMemoNarratives.exitPotential,
      teamScore: evaluationWithMemoNarratives.team.score,
      marketScore: evaluationWithMemoNarratives.market.score,
      productScore: evaluationWithMemoNarratives.product.score,
      tractionScore: evaluationWithMemoNarratives.traction.score,
      businessModelScore: evaluationWithMemoNarratives.businessModel.score,
      gtmScore: evaluationWithMemoNarratives.gtm.score,
      financialsScore: evaluationWithMemoNarratives.financials.score,
      competitiveAdvantageScore: evaluationWithMemoNarratives.competitiveAdvantage.score,
      legalScore: evaluationWithMemoNarratives.legal.score,
      dealTermsScore: evaluationWithMemoNarratives.dealTerms.score,
      exitPotentialScore: evaluationWithMemoNarratives.exitPotential.score,
      sectionScores,
      overallScore,
      confidenceScore: synthesis.confidenceScore ?? null,
      keyStrengths: synthesis.keyStrengths,
      keyRisks: synthesis.keyRisks,
      executiveSummary: synthesis.dealSnapshot,
      investorMemo: synthesis.investorMemo,
      founderReport: synthesis.founderReport,
      sources: persistedSources,
      dataConfidenceNotes: synthesis.dataConfidenceNotes,
      deckData: extraction?.deckStructuredData ?? null,
    };

    await this.drizzle.db.transaction(async (tx) => {
      await tx
        .insert(startupEvaluation)
        .values({ startupId, ...evaluationValues })
        .onConflictDoUpdate({
          target: startupEvaluation.startupId,
          set: evaluationValues,
        });

      await tx
        .update(startup)
        .set({ overallScore })
        .where(eq(startup.id, startupId));
    });
  }

  private applyMemoNarrativesFromSynthesis(
    evaluation: EvaluationResult,
    investorMemo: InvestorMemo | null | undefined,
  ): EvaluationResult {
    if (!investorMemo || !Array.isArray(investorMemo.sections)) {
      return evaluation;
    }

    const narrativeByKey = this.buildMemoNarrativeMap(investorMemo.sections);
    if (Object.keys(narrativeByKey).length === 0) {
      return evaluation;
    }

    const withNarrative = <T extends Record<string, unknown>>(
      sectionKey: keyof EvaluationResult,
      value: T,
    ): T => {
      const refined = narrativeByKey[sectionKey];
      if (!refined) {
        return value;
      }
      return {
        ...value,
        narrativeSummary: refined,
        memoNarrative: refined,
      };
    };

    return {
      ...evaluation,
      team: withNarrative("team", evaluation.team),
      market: withNarrative("market", evaluation.market),
      product: withNarrative("product", evaluation.product),
      traction: withNarrative("traction", evaluation.traction),
      businessModel: withNarrative("businessModel", evaluation.businessModel),
      gtm: withNarrative("gtm", evaluation.gtm),
      financials: withNarrative("financials", evaluation.financials),
      competitiveAdvantage: withNarrative(
        "competitiveAdvantage",
        evaluation.competitiveAdvantage,
      ),
      legal: withNarrative("legal", evaluation.legal),
      dealTerms: withNarrative("dealTerms", evaluation.dealTerms),
      exitPotential: withNarrative("exitPotential", evaluation.exitPotential),
    };
  }

  private buildMemoNarrativeMap(
    sections: Array<{ title?: string; content?: string }>,
  ): Partial<Record<keyof EvaluationResult, string>> {
    const map: Partial<Record<keyof EvaluationResult, string>> = {};

    const normalizedToKey: Record<string, keyof EvaluationResult> = {
      team: "team",
      market: "market",
      marketopportunity: "market",
      product: "product",
      producttechnology: "product",
      productandtechnology: "product",
      traction: "traction",
      tractionmetrics: "traction",
      tractionandmetrics: "traction",
      businessmodel: "businessModel",
      gotomarket: "gtm",
      gotomarketstrategy: "gtm",
      gtm: "gtm",
      financials: "financials",
      competitiveadvantage: "competitiveAdvantage",
      competitivelandscape: "competitiveAdvantage",
      legal: "legal",
      legalregulatory: "legal",
      legalandregulatory: "legal",
      dealterms: "dealTerms",
      exitpotential: "exitPotential",
    };

    for (const section of sections) {
      const title =
        typeof section.title === "string" ? section.title.trim().toLowerCase() : "";
      const content =
        typeof section.content === "string"
          ? sanitizeNarrativeText(section.content).trim()
          : "";
      if (!title || !content) {
        continue;
      }

      const normalized = title.replace(/[^a-z]/g, "");
      const key = normalizedToKey[normalized];
      if (!key) {
        continue;
      }

      map[key] = content;
    }

    return map;
  }

  private buildTeamMemberEvaluations(
    evaluatedMembers: Array<{
      name: string;
      role: string;
      relevance: string;
      strengths: string[];
      risks: string[];
    }>,
    scrapedMembers: Array<{
      name: string;
      role?: string;
      linkedinUrl?: string;
      enrichmentStatus: "success" | "not_configured" | "not_found" | "error";
      linkedinProfile?: {
        headline: string;
        summary: string;
        profilePictureUrl?: string;
        currentCompany?: {
          name: string;
          title: string;
        } | null;
        experience: Array<{
          title: string;
          company: string;
          duration: string;
          location?: string;
          description?: string;
          startDate?: string;
          endDate?: string | null;
        }>;
        education: Array<{
          school: string;
          degree: string;
          field: string;
          startDate?: string | null;
          endDate?: string | null;
          description?: string;
        }>;
      };
    }>,
  ): Array<Record<string, unknown>> {
    const scrapedByName = new Map(
      scrapedMembers.map((member) => [member.name.trim().toLowerCase(), member] as const),
    );

    const merged = evaluatedMembers.map((member) => {
      const scraped = scrapedByName.get(member.name.trim().toLowerCase());
      const linkedinProfile = scraped?.linkedinProfile;

      return {
        name: member.name,
        role: member.role || scraped?.role || "Team Member",
        relevance: member.relevance,
        strengths: member.strengths,
        risks: member.risks,
        scrapedCandidate: Boolean(scraped),
        linkedinUrl: scraped?.linkedinUrl,
        enrichmentStatus: scraped?.enrichmentStatus ?? "not_found",
        linkedinAnalysis: linkedinProfile
          ? {
              headline: linkedinProfile.headline,
              summary: linkedinProfile.summary,
              profilePictureUrl: linkedinProfile.profilePictureUrl,
              currentCompany: linkedinProfile.currentCompany,
              experience: linkedinProfile.experience,
              education: linkedinProfile.education,
            }
          : undefined,
      };
    });

    for (const scraped of scrapedMembers) {
      const key = scraped.name.trim().toLowerCase();
      if (merged.some((member) => String(member.name).trim().toLowerCase() === key)) {
        continue;
      }

      merged.push({
        name: scraped.name,
        role: scraped.role || "Team Member",
        relevance: "Relevance pending team evaluation analysis.",
        strengths: [],
        risks: [],
        scrapedCandidate: true,
        linkedinUrl: scraped.linkedinUrl,
        enrichmentStatus: scraped.enrichmentStatus,
        linkedinAnalysis: scraped.linkedinProfile
          ? {
              headline: scraped.linkedinProfile.headline,
              summary: scraped.linkedinProfile.summary,
              profilePictureUrl: scraped.linkedinProfile.profilePictureUrl,
              currentCompany: scraped.linkedinProfile.currentCompany,
              experience: scraped.linkedinProfile.experience,
              education: scraped.linkedinProfile.education,
            }
          : undefined,
      });
    }

    return merged;
  }

  private buildPersistedSources(
    researchSources: ResearchResult["sources"],
    evaluation: EvaluationResult,
    synthesis: SynthesisResult,
  ): Array<Record<string, unknown>> {
    const evaluationModel = this.aiConfig.getModelForPurpose(
      ModelPurpose.EVALUATION,
    );
    const synthesisModel = this.aiConfig.getModelForPurpose(
      ModelPurpose.SYNTHESIS,
    );
    const now = new Date().toISOString();

    const evaluationAgentSources: Array<Record<string, unknown>> = [
      {
        agent: "TeamAgent",
        description: "Team composition and founder-market fit analysis",
        score: Math.round(evaluation.team.score),
      },
      {
        agent: "MarketAgent",
        description: "Market opportunity and TAM/SAM/SOM analysis",
        score: Math.round(evaluation.market.score),
      },
      {
        agent: "ProductAgent",
        description: "Product quality and defensibility analysis",
        score: Math.round(evaluation.product.score),
      },
      {
        agent: "TractionAgent",
        description: "Growth trajectory and validation analysis",
        score: Math.round(evaluation.traction.score),
      },
      {
        agent: "BusinessModelAgent",
        description: "Business model and unit economics analysis",
        score: Math.round(evaluation.businessModel.score),
      },
      {
        agent: "GTMAgent",
        description: "Go-to-market strategy analysis",
        score: Math.round(evaluation.gtm.score),
      },
      {
        agent: "FinancialsAgent",
        description: "Financial health and runway analysis",
        score: Math.round(evaluation.financials.score),
      },
      {
        agent: "CompetitiveAdvantageAgent",
        description: "Competitive moat and positioning analysis",
        score: Math.round(evaluation.competitiveAdvantage.score),
      },
      {
        agent: "LegalRegulatoryAgent",
        description: "Legal, regulatory and IP analysis",
        score: Math.round(evaluation.legal.score),
      },
      {
        agent: "DealTermsAgent",
        description: "Deal terms and valuation analysis",
        score: Math.round(evaluation.dealTerms.score),
      },
      {
        agent: "ExitPotentialAgent",
        description: "Exit potential and M&A analysis",
        score: Math.round(evaluation.exitPotential.score),
      },
      {
        agent: "SynthesisAgent",
        description: "Final synthesis and investor memo generation",
        score: synthesis.overallScore != null ? Math.round(synthesis.overallScore) : undefined,
        model: synthesisModel,
      },
    ].map((entry) => ({
      ...entry,
      name: String(entry.model ?? evaluationModel),
      model: String(entry.model ?? evaluationModel),
      category: "api",
      type: "api",
      relevance:
        typeof entry.score === "number"
          ? `Score: ${entry.score}`
          : undefined,
      timestamp: now,
    }));

    return [
      ...researchSources.map((source) => ({ ...source })),
      ...evaluationAgentSources,
    ];
  }

  private async reusePreviousMemoOnFallback(
    startupId: string,
    fallbackOutput: MemoSynthesisOutput,
  ): Promise<MemoSynthesisOutput> {
    try {
      const [existing] = await this.drizzle.db
        .select({ investorMemo: startupEvaluation.investorMemo })
        .from(startupEvaluation)
        .where(eq(startupEvaluation.startupId, startupId))
        .limit(1);

      const memo = existing?.investorMemo as {
        executiveSummary?: string;
        sections?: Array<Record<string, unknown>>;
        keyDueDiligenceAreas?: string[];
        dataConfidenceNotes?: string;
      } | null;

      if (!memo?.sections?.length) return fallbackOutput;

      return {
        executiveSummary: memo.executiveSummary || fallbackOutput.executiveSummary,
        sections: fallbackOutput.sections.length > 0
          ? fallbackOutput.sections
          : memo.sections.map((s) => ({
              sectionKey: String(s.sectionKey ?? s.title ?? "unknown").toLowerCase().replace(/[^a-z]/g, ""),
              title: String(s.title ?? "Untitled"),
              memoNarrative: String(s.content ?? s.memoNarrative ?? "Narrative unavailable."),
              highlights: Array.isArray(s.highlights) ? s.highlights as string[] : [],
              concerns: Array.isArray(s.concerns) ? s.concerns as string[] : [],
              diligenceItems: Array.isArray(s.diligenceItems) ? s.diligenceItems as string[] : [],
              sources: Array.isArray(s.sources) ? s.sources as Array<{ label: string; url: string }> : [],
            })),
        keyDueDiligenceAreas: memo.keyDueDiligenceAreas ?? fallbackOutput.keyDueDiligenceAreas,
        dataConfidenceNotes: memo.dataConfidenceNotes || fallbackOutput.dataConfidenceNotes,
      };
    } catch {
      return fallbackOutput;
    }
  }

  private reusePreviousReportOnFallback(
    fallbackOutput: ReportSynthesisOutput,
  ): ReportSynthesisOutput {
    return fallbackOutput;
  }

  private normalizeExitScenarios(
    value: unknown,
  ): SynthesisAgentOutput["exitScenarios"] {
    const parsed = z.array(ExitScenarioSchema).length(3).safeParse(value);
    if (!parsed.success) {
      return [];
    }

    const uniqueScenarios = new Set(parsed.data.map((s) => s.scenario));
    if (
      uniqueScenarios.size !== 3 ||
      !uniqueScenarios.has("conservative") ||
      !uniqueScenarios.has("moderate") ||
      !uniqueScenarios.has("optimistic")
    ) {
      return [];
    }

    return [...parsed.data]
      .sort(
        (left, right) =>
          EXIT_SCENARIO_ORDER[left.scenario] -
          EXIT_SCENARIO_ORDER[right.scenario],
      )
      .map((scenario) => ({
        ...scenario,
        exitValuation: sanitizeNarrativeText(scenario.exitValuation).replace(/\s+/g, " ").trim(),
        timeline: sanitizeNarrativeText(scenario.timeline).replace(/\s+/g, " ").trim(),
        researchBasis: sanitizeNarrativeText(scenario.researchBasis).replace(/\s+/g, " ").trim(),
      }));
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private toObjectValue<T extends object>(value: unknown): T | null {
    return value !== null && typeof value === "object" ? (value as T) : null;
  }

  private sanitizeStringArray(values: string[]): string[] {
    return values
      .map((value) => sanitizeNarrativeText(value))
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private sanitizeInvestorMemo(memo: InvestorMemo | null): InvestorMemo | null {
    if (!memo) {
      return null;
    }

    return {
      ...memo,
      executiveSummary: sanitizeNarrativeText(memo.executiveSummary),
      sections: (memo.sections ?? []).map((section) => ({
        ...section,
        content: sanitizeNarrativeText(section.content),
        highlights: section.highlights
          ? this.sanitizeStringArray(section.highlights)
          : section.highlights,
        concerns: section.concerns
          ? this.sanitizeStringArray(section.concerns)
          : section.concerns,
      })),
      keyDueDiligenceAreas: this.sanitizeStringArray(
        memo.keyDueDiligenceAreas ?? [],
      ),
    };
  }

  private sanitizeFounderReport(
    report: FounderReport | null,
  ): FounderReport | null {
    if (!report) {
      return null;
    }

    return {
      ...report,
      summary: sanitizeNarrativeText(report.summary),
      whatsWorking: this.sanitizeStringArray(report.whatsWorking ?? []),
      pathToInevitability: this.sanitizeStringArray(report.pathToInevitability ?? []),
    };
  }

  private async performPostSynthesisOps(
    startupId: string,
    synthesis: SynthesisResult,
    _extraction: ExtractionResult,
  ): Promise<void> {
    try {
      const memo = await this.memoGenerator.generateAndUpload(
        startupId,
      );
      synthesis.investorMemoUrl = memo.investorMemoUrl;
      synthesis.founderReportUrl = memo.founderReportUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Memo generation failed for startup ${startupId}: ${message}`,
      );
    }
  }
}
