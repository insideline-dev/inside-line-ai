import { Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";
import { DrizzleService } from "../../../database";
import type { SynthesisResult } from "../interfaces/phase-results.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import { investorThesis, startupMatch } from "../../investor/entities";
import { user, UserRole } from "../../../auth/entities/auth.schema";
import { AiPromptService } from "./ai-prompt.service";
import { AiConfigService } from "./ai-config.service";
import { AiModelExecutionService } from "./ai-model-execution.service";
import {
  ScoreComputationService,
  type SectionScores,
} from "./score-computation.service";
import {
  canonicalizeGeographicFocus,
  geographySelectionMatchesStartupPath,
  normalizeStartupPathFromLocation,
} from "../../geography";

const ThesisFitSchema = z.object({
  thesisFitScore: z.number().int().min(0).max(100),
  fitRationale: z.string().min(1),
});

interface StartupMatchInput {
  startupId: string;
  startup: {
    industry: string;
    stage: string;
    fundingTarget?: number;
    location: string;
    geoPath?: string[] | null;
  };
  synthesis: SynthesisResult;
  threshold?: number;
}

interface InvestorCandidate {
  id: string | null;
  userId: string;
  industries: string[] | null;
  stages: string[] | null;
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  geographicFocus: string[] | null;
  geographicFocusNodes: string[] | null;
  thesisSummary: string | null;
  thesisNarrative: string | null;
  notes: string | null;
  minThesisFitScore: number | null;
  minStartupScore: number | null;
}

export interface InvestorMatchResult {
  investorId: string;
  overallScore: number;
  thesisFitScore: number;
  compositeFitScore: number;
  fitRationale: string;
}

export interface InvestorMatchingOutput {
  candidatesEvaluated: number;
  failedCandidates: number;
  matches: InvestorMatchResult[];
}

@Injectable()
export class InvestorMatchingService {
  private readonly logger = new Logger(InvestorMatchingService.name);
  private readonly candidateEvaluationConcurrency = 8;

  constructor(
    private drizzle: DrizzleService,
    private providers: AiProviderService,
    private promptService: AiPromptService,
    private aiConfig: AiConfigService,
    private scoreComputation: ScoreComputationService,
    private modelExecution?: AiModelExecutionService,
  ) {}

  async matchStartup(input: StartupMatchInput): Promise<InvestorMatchingOutput> {
    const explicitThreshold = input.threshold;
    const defaultThreshold = this.aiConfig.getMatchingMinThesisFitScore();
    const startupGeoPath =
      input.startup.geoPath?.length && input.startup.geoPath.length > 0
        ? input.startup.geoPath.map((value) => value.trim().toLowerCase())
        : normalizeStartupPathFromLocation(input.startup.location);

    const candidates = await this.drizzle.db
      .select({
        id: investorThesis.id,
        userId: user.id,
        industries: investorThesis.industries,
        stages: investorThesis.stages,
        checkSizeMin: investorThesis.checkSizeMin,
        checkSizeMax: investorThesis.checkSizeMax,
        geographicFocus: investorThesis.geographicFocus,
        geographicFocusNodes: investorThesis.geographicFocusNodes,
        thesisSummary: investorThesis.thesisSummary,
        thesisNarrative: investorThesis.thesisNarrative,
        notes: investorThesis.notes,
        minThesisFitScore: investorThesis.minThesisFitScore,
        minStartupScore: investorThesis.minStartupScore,
      })
      .from(user)
      .leftJoin(investorThesis, eq(investorThesis.userId, user.id))
      .where(
        and(
          eq(user.role, UserRole.INVESTOR),
          or(
            isNull(investorThesis.id),
            eq(investorThesis.isActive, true),
          ),
        ),
      );

    const firstFilterPassed = candidates.filter((candidate) =>
      this.passesFirstFilter(candidate, input, startupGeoPath),
    );

    type EvaluatedCandidate = InvestorMatchResult & {
      isMatch: boolean;
      usedFallback: boolean;
    };

    const aligned = await this.mapWithConcurrency(
      firstFilterPassed,
      this.candidateEvaluationConcurrency,
      async (candidate) => {
        const fit = await this.alignThesis(candidate, input);
        const weightedStartupScore = await this.computeInvestorWeightedScore(
          input,
          candidate.userId,
        );
        const compositeFitScore = this.computeCompositeFitScore(
          fit.thesisFitScore,
          weightedStartupScore,
        );
        await this.persistMatch(
          input,
          candidate.userId,
          fit.thesisFitScore,
          weightedStartupScore,
          compositeFitScore,
          fit.fitRationale,
          fit.usedFallback,
        );

        const candidateThreshold =
          explicitThreshold ??
          candidate.minThesisFitScore ??
          defaultThreshold;
        const minStartupScore = candidate.minStartupScore ?? 0;
        const isMatch =
          fit.thesisFitScore >= candidateThreshold &&
          weightedStartupScore >= minStartupScore &&
          compositeFitScore >= candidateThreshold;

        return {
          investorId: candidate.userId,
          overallScore: weightedStartupScore,
          thesisFitScore: fit.thesisFitScore,
          compositeFitScore,
          fitRationale: fit.fitRationale,
          isMatch,
          usedFallback: fit.usedFallback,
        } satisfies EvaluatedCandidate;
      },
    );

    await this.backfillLegacyFitRationale(input.startupId);

    return {
      candidatesEvaluated: firstFilterPassed.length,
      failedCandidates: aligned.filter((match) => match.usedFallback).length,
      matches: aligned.filter((match) => match.isMatch).map((match) => ({
        investorId: match.investorId,
        overallScore: match.overallScore,
        thesisFitScore: match.thesisFitScore,
        compositeFitScore: match.compositeFitScore,
        fitRationale: match.fitRationale,
      })),
    };
  }

  private passesFirstFilter(
    candidate: InvestorCandidate,
    input: StartupMatchInput,
    startupGeoPath: string[],
  ): boolean {
    const industries = candidate.industries ?? [];
    const stages = candidate.stages ?? [];
    const startupIndustry = input.startup.industry.trim().toLowerCase();

    const industryOk =
      industries.length === 0 ||
      industries.some((industry) => industry.trim().toLowerCase() === startupIndustry);

    const stageOk =
      stages.length === 0 ||
      stages.some((stage) => stage.trim().toLowerCase() === input.startup.stage);

    const checkMin = candidate.checkSizeMin;
    const checkMax = candidate.checkSizeMax;
    const fundingTarget = input.startup.fundingTarget;
    const checkSizeOk =
      typeof fundingTarget !== "number" ||
      ((typeof checkMin !== "number" || fundingTarget >= checkMin) &&
        (typeof checkMax !== "number" || fundingTarget <= checkMax));

    const normalizedGeoFocus = canonicalizeGeographicFocus({
      geographicFocusNodes: candidate.geographicFocusNodes,
      geographicFocus: candidate.geographicFocus,
    });
    const geographyOk = geographySelectionMatchesStartupPath(
      normalizedGeoFocus,
      startupGeoPath,
    );

    return industryOk && stageOk && checkSizeOk && geographyOk;
  }

  private async alignThesis(
    candidate: InvestorCandidate,
    input: StartupMatchInput,
  ): Promise<z.infer<typeof ThesisFitSchema> & { usedFallback: boolean }> {
    try {
      const promptConfig = await this.promptService.resolve({
        key: "matching.thesis",
        stage: input.startup.stage,
      });
      const execution = this.modelExecution
        ? await this.modelExecution.resolveForPrompt({
            key: "matching.thesis",
            stage: input.startup.stage,
          })
        : null;

      const { output } = await generateText({
        model:
          execution?.generateTextOptions.model ??
          this.providers.resolveModelForPurpose(ModelPurpose.THESIS_ALIGNMENT),
        output: Output.object({ schema: ThesisFitSchema }),
        temperature: this.aiConfig.getMatchingTemperature(),
        maxOutputTokens: this.aiConfig.getMatchingMaxOutputTokens(),
        system: promptConfig.systemPrompt,
        tools: execution?.generateTextOptions.tools,
        toolChoice: execution?.generateTextOptions.toolChoice,
        providerOptions: execution?.generateTextOptions.providerOptions,
        prompt: this.promptService.renderTemplate(promptConfig.userPrompt, {
          investorThesisSummary: candidate.thesisSummary ?? "Not available",
          investorThesis:
            candidate.thesisNarrative ?? candidate.notes ?? "Not available",
          startupSummary: input.synthesis.executiveSummary,
          recommendation: input.synthesis.recommendation,
          overallScore: input.synthesis.overallScore,
          startupProfile: JSON.stringify(input.synthesis),
        }),
      });

      return {
        ...ThesisFitSchema.parse(output),
        usedFallback: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Thesis alignment fallback for investor ${candidate.userId}: ${message}`,
      );

      return {
        thesisFitScore: this.aiConfig.getMatchingFallbackScore(),
        fitRationale:
          "Alignment fallback used due to model/runtime issue; requires manual review.",
        usedFallback: true,
      };
    }
  }

  private async computeInvestorWeightedScore(
    input: StartupMatchInput,
    investorId: string,
  ): Promise<number> {
    const sectionScores: SectionScores = {
      team: input.synthesis.sectionScores.team,
      market: input.synthesis.sectionScores.market,
      product: input.synthesis.sectionScores.product,
      traction: input.synthesis.sectionScores.traction,
      businessModel: input.synthesis.sectionScores.businessModel,
      gtm: input.synthesis.sectionScores.gtm,
      financials: input.synthesis.sectionScores.financials,
      competitiveAdvantage: input.synthesis.sectionScores.competitiveAdvantage,
      legal: input.synthesis.sectionScores.legal,
      dealTerms: input.synthesis.sectionScores.dealTerms,
      exitPotential: input.synthesis.sectionScores.exitPotential,
    };

    return this.scoreComputation.computeWithInvestorPreferences(
      sectionScores,
      input.startup.stage,
      investorId,
    );
  }

  private computeCompositeFitScore(
    thesisFitScore: number,
    weightedStartupScore: number,
  ): number {
    return Math.round(thesisFitScore * 0.7 + weightedStartupScore * 0.3);
  }

  private async persistMatch(
    input: StartupMatchInput,
    investorId: string,
    thesisFitScore: number,
    weightedStartupScore: number,
    compositeFitScore: number,
    fitRationale: string,
    thesisFitFallback = false,
  ): Promise<void> {
    const [existing] = await this.drizzle.db
      .select({ id: startupMatch.id })
      .from(startupMatch)
      .where(
        and(
          eq(startupMatch.investorId, investorId),
          eq(startupMatch.startupId, input.startupId),
        ),
      )
      .limit(1);

    const updatePayload = {
      overallScore: Math.round(weightedStartupScore),
      marketScore: Math.round(input.synthesis.sectionScores.market),
      teamScore: Math.round(input.synthesis.sectionScores.team),
      productScore: Math.round(input.synthesis.sectionScores.product),
      tractionScore: Math.round(input.synthesis.sectionScores.traction),
      financialsScore: Math.round(input.synthesis.sectionScores.financials),
      matchReason: `Composite fit ${compositeFitScore}/100 (thesis ${thesisFitScore}, weighted startup ${Math.round(weightedStartupScore)}). ${fitRationale}`,
      thesisFitScore,
      fitRationale,
      thesisFitFallback,
      updatedAt: new Date(),
    };

    if (existing) {
      await this.drizzle.db
        .update(startupMatch)
        .set(updatePayload)
        .where(eq(startupMatch.id, existing.id));
      return;
    }

    await this.drizzle.db.insert(startupMatch).values({
      investorId,
      startupId: input.startupId,
      overallScore: Math.round(weightedStartupScore),
      marketScore: Math.round(input.synthesis.sectionScores.market),
      teamScore: Math.round(input.synthesis.sectionScores.team),
      productScore: Math.round(input.synthesis.sectionScores.product),
      tractionScore: Math.round(input.synthesis.sectionScores.traction),
      financialsScore: Math.round(input.synthesis.sectionScores.financials),
      matchReason: `Composite fit ${compositeFitScore}/100 (thesis ${thesisFitScore}, weighted startup ${Math.round(weightedStartupScore)}). ${fitRationale}`,
      thesisFitScore,
      fitRationale,
      thesisFitFallback,
    });
  }

  private async backfillLegacyFitRationale(startupId: string): Promise<void> {
    await this.drizzle.db
      .update(startupMatch)
      .set({
        fitRationale: sql`coalesce(${startupMatch.matchReason}, 'Legacy match rationale unavailable. Review this match manually.')`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(startupMatch.startupId, startupId),
          isNull(startupMatch.fitRationale),
        ),
      );
  }

  private async mapWithConcurrency<TInput, TOutput>(
    items: TInput[],
    concurrency: number,
    mapper: (item: TInput, index: number) => Promise<TOutput>,
  ): Promise<TOutput[]> {
    if (items.length === 0) {
      return [];
    }

    const limit = Math.max(1, Math.floor(concurrency));
    const results = new Array<TOutput>(items.length);
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        results[index] = await mapper(items[index]!, index);
      }
    };

    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      () => worker(),
    );
    await Promise.all(workers);
    return results;
  }

}
