import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { startup } from "../../startup/entities";
import { startupEvaluation } from "../../analysis/entities";
import { NotificationType } from "../../../notification/entities";
import { NotificationService } from "../../../notification/notification.service";
import { PipelineStateService } from "./pipeline-state.service";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { EVALUATION_AGENT_KEYS } from "../constants/agent-keys";
import type {
  EvaluationResult,
  ExtractionResult,
  ResearchResult,
  SynthesisResult,
} from "../interfaces/phase-results.interface";
import {
  ScoreComputationService,
  type SectionScores,
} from "./score-computation.service";
import { SynthesisAgent } from "../agents/synthesis";
import type { SynthesisAgentInput, SynthesisAgentOutput } from "../agents/synthesis";
import { InvestorMatchingService } from "./investor-matching.service";
import { MemoGeneratorService } from "./memo-generator.service";

@Injectable()
export class SynthesisService {
  private readonly logger = new Logger(SynthesisService.name);

  constructor(
    private drizzle: DrizzleService,
    private pipelineState: PipelineStateService,
    private synthesisAgent: SynthesisAgent,
    private scoreComputation: ScoreComputationService,
    private investorMatching: InvestorMatchingService,
    private memoGenerator: MemoGeneratorService,
    private notificationService: NotificationService,
  ) {}

  async run(startupId: string): Promise<SynthesisResult> {
    const { extraction, research, evaluation, scraping } =
      await this.loadPhaseResults(startupId);

    const sectionScores = this.computeSectionScores(evaluation);
    const normalizedWeights = await this.scoreComputation.getWeightsForStage(extraction.stage);

    const generated = await this.synthesisAgent.run({
      extraction,
      scraping,
      research,
      evaluation,
      stageWeights: normalizedWeights as unknown as Record<string, number>,
    });

    const overallScore = this.scoreComputation.computeWeightedScore(sectionScores, normalizedWeights);

    const synthesis = this.buildSynthesisResult(
      generated,
      sectionScores,
      overallScore,
      evaluation,
    );

    await this.persistResults(startupId, synthesis, evaluation, research);

    await this.performPostSynthesisOps(startupId, synthesis, extraction);

    return { ...synthesis };
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
          ? `Degraded pipeline run: ${evaluation.summary.completedAgents}/${EVALUATION_AGENT_KEYS.length} evaluation agents completed without fallback`
          : "Full evaluation coverage completed without fallback"),
    };
  }

  private async persistResults(
    startupId: string,
    synthesis: SynthesisResult,
    evaluation: EvaluationResult,
    research: ResearchResult,
  ): Promise<void> {
    const { overallScore, sectionScores } = synthesis;
    const percentileRank =
      await this.scoreComputation.computePercentileRank(overallScore);

    const evaluationValues = {
      teamData: evaluation.team,
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
      sources: research.sources,
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

  private async performPostSynthesisOps(
    startupId: string,
    synthesis: SynthesisResult,
    extraction: ExtractionResult,
  ): Promise<void> {
    try {
      let startupRecord:
        | { location: string; geoPath: string[] | null }
        | undefined;

      try {
        const [found] = await this.drizzle.db
          .select({
            location: startup.location,
            geoPath: startup.geoPath,
          })
          .from(startup)
          .where(eq(startup.id, startupId))
          .limit(1);
        startupRecord = found;
      } catch {
        startupRecord = undefined;
      }

      const matching = await this.investorMatching.matchStartup({
        startupId,
        startup: {
          industry: extraction.industry,
          stage: extraction.stage,
          fundingTarget: extraction.fundingAsk,
          location: extraction.location || startupRecord?.location || "",
          geoPath: startupRecord?.geoPath ?? null,
        },
        synthesis,
      });

      if (matching.matches.length > 0) {
        await this.notificationService.createBulk(
          matching.matches.map((match) => ({
            userId: match.investorId,
            title: "New Startup Match",
            message: `A startup matched your thesis with ${match.thesisFitScore}% alignment.`,
            type: NotificationType.MATCH,
            link: `/investor/matches/${startupId}`,
          })),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Investor matching/notification failed for startup ${startupId}: ${message}`,
      );
    }

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
