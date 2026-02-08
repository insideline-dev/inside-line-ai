import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { startup } from "../../startup/entities";
import { startupEvaluation } from "../../analysis/entities";
import { NotificationType } from "../../../notification/entities";
import { NotificationService } from "../../../notification/notification.service";
import { PipelineStateService } from "./pipeline-state.service";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { SynthesisResult } from "../interfaces/phase-results.interface";
import {
  ScoreComputationService,
  type SectionScores,
} from "./score-computation.service";
import { SynthesisAgentService } from "./synthesis-agent.service";
import type { SynthesisAgentOutput } from "./synthesis-agent.service";
import { InvestorMatchingService } from "./investor-matching.service";
import { MemoGeneratorService } from "./memo-generator.service";
import { AiConfigService } from "./ai-config.service";

@Injectable()
export class SynthesisService {
  private readonly logger = new Logger(SynthesisService.name);

  constructor(
    private drizzle: DrizzleService,
    private pipelineState: PipelineStateService,
    private synthesisAgent: SynthesisAgentService,
    private scoreComputation: ScoreComputationService,
    private investorMatching: InvestorMatchingService,
    private memoGenerator: MemoGeneratorService,
    private notificationService: NotificationService,
    private aiConfig: AiConfigService,
  ) {}

  async run(startupId: string): Promise<SynthesisResult> {
    const extraction = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.EXTRACTION,
    );
    const research = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.RESEARCH,
    );
    const scraping = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.SCRAPING,
    );
    const evaluation = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.EVALUATION,
    );

    if (!extraction || !scraping || !research || !evaluation) {
      throw new Error(
        "Synthesis requires extraction, research, and evaluation results",
      );
    }

    const sectionScores: SectionScores = {
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

    const generated = await this.generateWithRetry({
      extraction,
      scraping,
      research,
      evaluation,
    });

    const normalizedWeights = await this.scoreComputation.getWeightsForStage(
      extraction.stage,
    );
    const overallScore = this.scoreComputation.computeWeightedScore(
      sectionScores,
      normalizedWeights,
    );
    const percentileRank =
      await this.scoreComputation.computePercentileRank(overallScore);

    const synthesis: SynthesisResult = {
      ...generated,
      overallScore,
      sectionScores,
      dataConfidenceNotes:
        generated.dataConfidenceNotes ||
        (evaluation.summary.degraded
          ? `Degraded pipeline run: ${evaluation.summary.completedAgents}/11 evaluation agents completed without fallback`
          : "Full evaluation coverage completed without fallback"),
    };

    await this.drizzle.db.transaction(async (tx) => {
      await tx
        .insert(startupEvaluation)
        .values({
          startupId,
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
        })
        .onConflictDoUpdate({
          target: startupEvaluation.startupId,
          set: {
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
          },
        });

      await tx
        .update(startup)
        .set({
          overallScore,
          percentileRank,
        })
        .where(eq(startup.id, startupId));
    });

    const matching = await this.investorMatching.matchStartup({
      startupId,
      startup: {
        industry: extraction.industry,
        stage: extraction.stage,
        fundingTarget: extraction.fundingAsk,
        location: extraction.location,
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

    try {
      const memo = await this.memoGenerator.generateAndUpload(startupId, synthesis);
      synthesis.investorMemoUrl = memo.investorMemoUrl;
      synthesis.founderReportUrl = memo.founderReportUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Memo generation failed for startup ${startupId}: ${message}`,
      );
    }

    return {
      ...synthesis,
    };
  }

  private async generateWithRetry(
    input: Parameters<SynthesisAgentService["generate"]>[0],
  ): Promise<SynthesisAgentOutput> {
    const maxAttempts = Math.max(1, this.aiConfig.getMaxRetries());
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.synthesisAgent.generate(input);
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          this.logger.warn(
            `Synthesis generation attempt ${attempt} failed, retrying...`,
          );
        }
      }
    }

    throw lastError;
  }
}
