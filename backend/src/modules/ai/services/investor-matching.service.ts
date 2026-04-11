import { Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
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
import { buildThesisSummary } from "../../investor/thesis-summary.util";

const ThesisFitSchema = z.object({
  thesisFitScore: z.number().int().min(0).max(100),
  fitRationale: z.string().min(1),
});

interface StartupMatchInput {
  startupId: string;
  startup: {
    industry: string;
    sectorIndustryGroup?: string | null;
    stage: string;
    fundingTarget?: number;
    location: string;
    geoPath?: string[] | null;
  };
  synthesis: SynthesisResult;
  threshold?: number;
  forceIncludeInvestorId?: string;
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
  businessModels: string[] | null;
  antiPortfolio: string | null;
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

    const candidateConditions = and(
      inArray(user.role, [UserRole.INVESTOR, UserRole.ADMIN]),
      or(
        isNull(investorThesis.id),
        eq(investorThesis.isActive, true),
      ),
    );

    const selectFields = {
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
      businessModels: investorThesis.businessModels,
      antiPortfolio: investorThesis.antiPortfolio,
      minThesisFitScore: investorThesis.minThesisFitScore,
      minStartupScore: investorThesis.minStartupScore,
    };

    let candidates = await this.drizzle.db
      .select(selectFields)
      .from(user)
      .leftJoin(investorThesis, eq(investorThesis.userId, user.id))
      .where(candidateConditions);

    // ALWAYS include the requesting investor, regardless of role or thesis status
    if (input.forceIncludeInvestorId) {
      const forcedUserExists = candidates.some(
        (c) => c.userId === input.forceIncludeInvestorId,
      );
      if (!forcedUserExists) {
        const [forcedUser] = await this.drizzle.db
          .select(selectFields)
          .from(user)
          .leftJoin(investorThesis, eq(investorThesis.userId, user.id))
          .where(eq(user.id, input.forceIncludeInvestorId))
          .limit(1);
        if (forcedUser) {
          candidates = [...candidates, forcedUser];
          this.logger.log(
            `Force-added user ${input.forceIncludeInvestorId} to candidates (was not in standard list)`,
          );
        } else {
          this.logger.warn(
            `Could not find user ${input.forceIncludeInvestorId} to force-add to candidates`,
          );
        }
      }
    }

    const firstFilterPassed = candidates.filter((candidate) =>
      candidate.userId === input.forceIncludeInvestorId ||
      this.passesFirstFilter(candidate, input, startupGeoPath),
    );

    const forcedInCandidates = input.forceIncludeInvestorId
      ? candidates.some((c) => c.userId === input.forceIncludeInvestorId)
      : false;
    const forcedInFiltered = input.forceIncludeInvestorId
      ? firstFilterPassed.some((c) => c.userId === input.forceIncludeInvestorId)
      : false;

    this.logger.log(
      `Matching ${input.startupId}: industry="${input.startup.industry}" ` +
        `group="${input.startup.sectorIndustryGroup ?? "null"}" ` +
        `stage="${input.startup.stage}" ` +
        `total=${candidates.length} passed=${firstFilterPassed.length}` +
        (input.forceIncludeInvestorId
          ? ` forceId=${input.forceIncludeInvestorId} inCandidates=${forcedInCandidates} inFiltered=${forcedInFiltered}`
          : ""),
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
    const startupGroup =
      input.startup.sectorIndustryGroup?.trim().toLowerCase() || null;

    const industryOk =
      industries.length === 0 ||
      industries.some((inv) => {
        const investorIndustry = inv.trim().toLowerCase();
        if (startupGroup && investorIndustry === startupGroup) return true;
        return investorIndustry === startupIndustry;
      });

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

      const userPrompt = this.promptService.renderTemplate(promptConfig.userPrompt, {
        investorThesisSummary:
          candidate.thesisSummary ??
          buildThesisSummary(candidate as unknown as Record<string, unknown>),
        investorThesis:
          candidate.thesisNarrative ?? candidate.notes ?? "Not available",
        startupSummary: input.synthesis.dealSnapshot,
        overallScore: input.synthesis.overallScore,
        startupProfile: JSON.stringify({
            overallScore: input.synthesis.overallScore,
            sectionScores: input.synthesis.sectionScores,
            strengths: input.synthesis.keyStrengths,
            risks: input.synthesis.keyRisks,
          }),
      });

      const resolvedModel =
        execution?.generateTextOptions.model ??
        this.providers.resolveModelForPurpose(ModelPurpose.THESIS_ALIGNMENT);

      const response = this.modelExecution
        ? await this.modelExecution.generateText<z.infer<typeof ThesisFitSchema>>({
            model: resolvedModel,
            schema: ThesisFitSchema,
            system: promptConfig.systemPrompt,
            prompt: userPrompt,
            maxOutputTokens: this.aiConfig.getMatchingMaxOutputTokens(),
            tools: execution?.generateTextOptions.tools,
            toolChoice: execution?.generateTextOptions.toolChoice,
            providerOptions: execution?.generateTextOptions.providerOptions,
          })
        : await generateText({
            model: resolvedModel,
            system: promptConfig.systemPrompt,
            prompt: userPrompt,
            maxOutputTokens: this.aiConfig.getMatchingMaxOutputTokens(),
            output: Output.object({ schema: ThesisFitSchema }),
          });

      const parsed = response.output ?? response.experimental_output ?? null;
      if (!parsed) {
        throw new Error("Model returned empty structured response.");
      }

      return {
        ...ThesisFitSchema.parse(parsed),
        usedFallback: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Thesis alignment fallback for investor ${candidate.userId}: ${message}${stack ? `\n${stack}` : ""}`,
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
      this.logger.log(
        `Updated match for investor=${investorId} startup=${input.startupId} thesisFitScore=${thesisFitScore}`,
      );
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
    this.logger.log(
      `Created match for investor=${investorId} startup=${input.startupId} thesisFitScore=${thesisFitScore}`,
    );
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
