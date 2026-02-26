import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { startup } from "../../startup/entities";
import { startupEvaluation } from "../../analysis/entities";
import { PipelineStateService } from "./pipeline-state.service";
import { ModelPurpose, PipelinePhase } from "../interfaces/pipeline.interface";
import { EVALUATION_AGENT_KEYS } from "../constants/agent-keys";
import type {
  EvaluationResult,
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
  SynthesisResult,
} from "../interfaces/phase-results.interface";
import {
  ScoreComputationService,
  type SectionScores,
} from "./score-computation.service";
import { SynthesisAgent } from "../agents/synthesis";
import type { SynthesisAgentOutput } from "../agents/synthesis";
import type { InvestorMemo, FounderReport } from "../schemas/synthesis.schema";
import type { EvaluationFallbackReason } from "../interfaces/agent.interface";
import { MemoGeneratorService } from "./memo-generator.service";
import { AiConfigService } from "./ai-config.service";
import { sanitizeNarrativeText } from "./narrative-sanitizer";

export const SYNTHESIS_AGENT_KEY = "synthesisagent";

export interface SynthesisRunTraceDetails {
  agentKey: typeof SYNTHESIS_AGENT_KEY;
  status: "completed" | "fallback";
  attempt: number;
  retryCount: number;
  usedFallback: boolean;
  inputPrompt?: string;
  outputText?: string;
  outputJson?: unknown;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
}

export interface SynthesisRunDetails {
  synthesis: SynthesisResult;
  trace: SynthesisRunTraceDetails;
}

@Injectable()
export class SynthesisService {
  private readonly logger = new Logger(SynthesisService.name);

  constructor(
    private drizzle: DrizzleService,
    private pipelineState: PipelineStateService,
    private synthesisAgent: SynthesisAgent,
    private scoreComputation: ScoreComputationService,
    private aiConfig: AiConfigService,
    private memoGenerator: MemoGeneratorService,
  ) {}

  async run(startupId: string): Promise<SynthesisResult> {
    const details = await this.runDetailed(startupId);
    return details.synthesis;
  }

  async runDetailed(startupId: string): Promise<SynthesisRunDetails> {
    this.logger.log(`[Synthesis] Starting synthesis run | Startup: ${startupId}`);

    const { extraction, research, evaluation, scraping } =
      await this.loadPhaseResults(startupId);

    const sectionScores = this.computeSectionScores(evaluation);
    const normalizedWeights = await this.scoreComputation.getWeightsForStage(extraction.stage);

    this.logger.debug(
      `[Synthesis] Loaded phase results | Company: ${extraction.companyName} | Research sources: ${research.sources?.length ?? 0}`,
    );

    const generated = await this.synthesisAgent.runDetailed({
      extraction,
      scraping,
      research,
      evaluation,
      stageWeights: normalizedWeights as unknown as Record<string, number>,
    });
    const synthesizedOutput = generated.usedFallback
      ? await this.reusePreviousNarrativeOnFallback(startupId, generated.output)
      : generated.output;

    const overallScore = this.scoreComputation.computeWeightedScore(sectionScores, normalizedWeights);

    this.logger.log(
      `[Synthesis] Agent output | Strengths: ${synthesizedOutput.strengths.length} | Concerns: ${synthesizedOutput.concerns.length}`,
    );

    const synthesis = this.buildSynthesisResult(
      synthesizedOutput,
      sectionScores,
      overallScore,
      evaluation,
    );

    const percentileRank = await this.scoreComputation.computePercentileRank(synthesis.overallScore);
    synthesis.percentileRank = percentileRank;

    await this.persistResults(startupId, synthesis, evaluation, scraping, research);

    this.logger.log(
      `[Synthesis] ✅ Results persisted | Score: ${synthesis.overallScore} | KeyStrengths: ${synthesis.strengths?.length} | KeyRisks: ${synthesis.concerns?.length}`,
    );

    await this.performPostSynthesisOps(startupId, synthesis, extraction);

    return {
      synthesis: { ...synthesis },
      trace: {
        agentKey: SYNTHESIS_AGENT_KEY,
        status: generated.usedFallback ? "fallback" : "completed",
        attempt: generated.attempt,
        retryCount: generated.retryCount,
        usedFallback: generated.usedFallback,
        inputPrompt: generated.inputPrompt,
        outputText: generated.outputText,
        outputJson: generated.outputJson,
        error: generated.error,
        fallbackReason: generated.fallbackReason,
        rawProviderError: generated.rawProviderError,
      },
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

    return { extraction, research, scraping, evaluation };
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
  ): Promise<void> {
    const { overallScore, sectionScores } = synthesis;
    const percentileRank =
      await this.scoreComputation.computePercentileRank(overallScore);
    const persistedSources = this.buildPersistedSources(
      research.sources,
      evaluation,
      synthesis,
    );

    const evaluationValues = {
      teamData: evaluation.team,
      teamMemberEvaluations: this.buildTeamMemberEvaluations(
        evaluation.team.teamMembers,
        scraping.teamMembers,
      ),
      marketData: evaluation.market,
      productData: evaluation.product,
      tractionData: evaluation.traction,
      businessModelData: evaluation.businessModel,
      gtmData: evaluation.gtm,
      financialsData: evaluation.financials,
      competitiveAdvantageData: evaluation.competitiveAdvantage,
      legalData: evaluation.legal,
      dealTermsData: evaluation.dealTerms,
      exitPotentialData: evaluation.exitPotential,
      teamScore: evaluation.team.score,
      marketScore: evaluation.market.score,
      productScore: evaluation.product.score,
      tractionScore: evaluation.traction.score,
      businessModelScore: evaluation.businessModel.score,
      gtmScore: evaluation.gtm.score,
      financialsScore: evaluation.financials.score,
      competitiveAdvantageScore: evaluation.competitiveAdvantage.score,
      legalScore: evaluation.legal.score,
      dealTermsScore: evaluation.dealTerms.score,
      exitPotentialScore: evaluation.exitPotential.score,
      sectionScores,
      overallScore,
      percentileRank,
      keyStrengths: synthesis.strengths,
      keyRisks: synthesis.concerns,
      recommendations: synthesis.nextSteps,
      executiveSummary: synthesis.executiveSummary,
      investorMemo: synthesis.investorMemo,
      founderReport: synthesis.founderReport,
      sources: persistedSources,
      dataConfidenceNotes: synthesis.dataConfidenceNotes,
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
        .set({ overallScore, percentileRank })
        .where(eq(startup.id, startupId));
    });
  }

  private buildTeamMemberEvaluations(
    evaluatedMembers: Array<{
      name: string;
      role: string;
      background: string;
      strengths: string[];
      concerns: string[];
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
        background: member.background,
        strengths: member.strengths,
        concerns: member.concerns,
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
        background: "Background pending team evaluation analysis.",
        strengths: [],
        concerns: [],
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
        score: Math.round(synthesis.overallScore),
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

  private async reusePreviousNarrativeOnFallback(
    startupId: string,
    fallbackOutput: SynthesisAgentOutput,
  ): Promise<SynthesisAgentOutput> {
    try {
      const [existing] = await this.drizzle.db
        .select({
          executiveSummary: startupEvaluation.executiveSummary,
          keyStrengths: startupEvaluation.keyStrengths,
          keyRisks: startupEvaluation.keyRisks,
          recommendations: startupEvaluation.recommendations,
          investorMemo: startupEvaluation.investorMemo,
          founderReport: startupEvaluation.founderReport,
          dataConfidenceNotes: startupEvaluation.dataConfidenceNotes,
        })
        .from(startupEvaluation)
        .where(eq(startupEvaluation.startupId, startupId))
        .limit(1);

      if (!existing) {
        return fallbackOutput;
      }

      const executiveSummary =
        typeof existing.executiveSummary === "string"
          ? sanitizeNarrativeText(existing.executiveSummary.trim())
          : "";
      const strengths = this.sanitizeStringArray(
        this.toStringArray(existing.keyStrengths),
      );
      const risks = this.sanitizeStringArray(this.toStringArray(existing.keyRisks));
      const recommendations = this.sanitizeStringArray(
        this.toStringArray(existing.recommendations),
      );
      const investorMemo = this.sanitizeInvestorMemo(
        this.toObjectValue<InvestorMemo>(existing.investorMemo),
      );
      const founderReport = this.sanitizeFounderReport(
        this.toObjectValue<FounderReport>(existing.founderReport),
      );

      const hasReusableNarrative =
        executiveSummary.length > 0 ||
        strengths.length > 0 ||
        risks.length > 0 ||
        recommendations.length > 0 ||
        Boolean(investorMemo) ||
        Boolean(founderReport);

      if (!hasReusableNarrative) {
        return fallbackOutput;
      }

      const previousConfidenceNotes =
        typeof existing.dataConfidenceNotes === "string"
          ? sanitizeNarrativeText(existing.dataConfidenceNotes.trim())
          : "";
      const preservationNote =
        "Latest synthesis attempt returned empty structured output; previous narrative was preserved.";

      return {
        ...fallbackOutput,
        executiveSummary:
          executiveSummary.length > 0
            ? executiveSummary
            : fallbackOutput.executiveSummary,
        strengths:
          strengths.length > 0 ? strengths : fallbackOutput.strengths,
        concerns: risks.length > 0 ? risks : fallbackOutput.concerns,
        nextSteps:
          recommendations.length > 0
            ? recommendations
            : fallbackOutput.nextSteps,
        investorMemo: investorMemo ?? fallbackOutput.investorMemo,
        founderReport: founderReport ?? fallbackOutput.founderReport,
        dataConfidenceNotes: [previousConfidenceNotes, preservationNote]
          .filter((item) => item.length > 0)
          .join(" "),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Synthesis] Unable to preserve previous narrative after fallback: ${message}`,
      );
      return fallbackOutput;
    }
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
      summary:
        typeof memo.summary === "string"
          ? sanitizeNarrativeText(memo.summary)
          : memo.summary,
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
      dealHighlights: this.sanitizeStringArray(memo.dealHighlights ?? []),
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
      sections: (report.sections ?? []).map((section) => ({
        ...section,
        content: sanitizeNarrativeText(section.content),
        highlights: section.highlights
          ? this.sanitizeStringArray(section.highlights)
          : section.highlights,
        concerns: section.concerns
          ? this.sanitizeStringArray(section.concerns)
          : section.concerns,
      })),
      actionItems: this.sanitizeStringArray(report.actionItems ?? []),
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
        synthesis,
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
