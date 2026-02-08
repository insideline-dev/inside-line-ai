import { Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { generateObject } from "ai";
import { z } from "zod";
import { DrizzleService } from "../../../database";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import type { SynthesisResult } from "../interfaces/phase-results.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { investorThesis, startupMatch } from "../../investor/entities";
import { LocationNormalizerService } from "./location-normalizer.service";

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
  };
  synthesis: SynthesisResult;
  threshold?: number;
}

interface InvestorCandidate {
  id: string;
  userId: string;
  industries: string[] | null;
  stages: string[] | null;
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  geographicFocus: string[] | null;
  thesisNarrative: string | null;
  notes: string | null;
}

export interface InvestorMatchResult {
  investorId: string;
  thesisFitScore: number;
  fitRationale: string;
}

export interface InvestorMatchingOutput {
  candidatesEvaluated: number;
  matches: InvestorMatchResult[];
}

@Injectable()
export class InvestorMatchingService {
  private readonly logger = new Logger(InvestorMatchingService.name);

  constructor(
    private drizzle: DrizzleService,
    private providers: AiProviderService,
    private locationNormalizer: LocationNormalizerService,
  ) {}

  async matchStartup(input: StartupMatchInput): Promise<InvestorMatchingOutput> {
    const threshold = input.threshold ?? 80;
    const normalizedRegion = await this.locationNormalizer.normalize(
      input.startup.location,
    );

    const candidates = await this.drizzle.db
      .select({
        id: investorThesis.id,
        userId: investorThesis.userId,
        industries: investorThesis.industries,
        stages: investorThesis.stages,
        checkSizeMin: investorThesis.checkSizeMin,
        checkSizeMax: investorThesis.checkSizeMax,
        geographicFocus: investorThesis.geographicFocus,
        thesisNarrative: investorThesis.thesisNarrative,
        notes: investorThesis.notes,
      })
      .from(investorThesis)
      .where(eq(investorThesis.isActive, true));

    const firstFilterPassed = candidates.filter((candidate) =>
      this.passesFirstFilter(candidate, input, normalizedRegion),
    );

    const aligned = await Promise.all(
      firstFilterPassed.map(async (candidate) => {
        const fit = await this.alignThesis(candidate, input);
        await this.persistMatch(input, candidate.userId, fit);

        return {
          investorId: candidate.userId,
          thesisFitScore: fit.thesisFitScore,
          fitRationale: fit.fitRationale,
        } satisfies InvestorMatchResult;
      }),
    );

    return {
      candidatesEvaluated: firstFilterPassed.length,
      matches: aligned.filter((match) => match.thesisFitScore >= threshold),
    };
  }

  private passesFirstFilter(
    candidate: InvestorCandidate,
    input: StartupMatchInput,
    normalizedRegion: string,
  ): boolean {
    const industries = candidate.industries ?? [];
    const stages = candidate.stages ?? [];
    const geography = candidate.geographicFocus ?? [];
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

    const geographyOk =
      geography.length === 0 ||
      geography.some((region) => {
        const normalized = region.trim().toLowerCase();
        return normalized === "global" || normalized === normalizedRegion;
      });

    return industryOk && stageOk && checkSizeOk && geographyOk;
  }

  private async alignThesis(
    candidate: InvestorCandidate,
    input: StartupMatchInput,
  ): Promise<z.infer<typeof ThesisFitSchema>> {
    try {
      const { object } = await generateObject({
        model: this.providers.resolveModelForPurpose(
          ModelPurpose.THESIS_ALIGNMENT,
        ),
        schema: ThesisFitSchema,
        temperature: 0.2,
        maxOutputTokens: 500,
        prompt: [
          "Score fit between startup and investor thesis from 0-100.",
          "Use startup synthesis and thesis narrative only.",
          `Investor thesis: ${candidate.thesisNarrative ?? candidate.notes ?? "No thesis provided"}`,
          `Startup summary: ${input.synthesis.executiveSummary}`,
          `Startup recommendation: ${input.synthesis.recommendation}`,
          `Startup overall score: ${input.synthesis.overallScore}`,
        ].join("\n\n"),
      });

      return ThesisFitSchema.parse(object);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Thesis alignment fallback for investor ${candidate.userId}: ${message}`,
      );

      return {
        thesisFitScore: 50,
        fitRationale:
          "Alignment fallback used due to model/runtime issue; requires manual review.",
      };
    }
  }

  private async persistMatch(
    input: StartupMatchInput,
    investorId: string,
    fit: z.infer<typeof ThesisFitSchema>,
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
      overallScore: Math.round(input.synthesis.overallScore),
      marketScore: Math.round(input.synthesis.sectionScores.market),
      teamScore: Math.round(input.synthesis.sectionScores.team),
      productScore: Math.round(input.synthesis.sectionScores.product),
      tractionScore: Math.round(input.synthesis.sectionScores.traction),
      financialsScore: Math.round(input.synthesis.sectionScores.financials),
      matchReason: fit.fitRationale,
      thesisFitScore: fit.thesisFitScore,
      fitRationale: fit.fitRationale,
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
      overallScore: Math.round(input.synthesis.overallScore),
      marketScore: Math.round(input.synthesis.sectionScores.market),
      teamScore: Math.round(input.synthesis.sectionScores.team),
      productScore: Math.round(input.synthesis.sectionScores.product),
      tractionScore: Math.round(input.synthesis.sectionScores.traction),
      financialsScore: Math.round(input.synthesis.sectionScores.financials),
      matchReason: fit.fitRationale,
      thesisFitScore: fit.thesisFitScore,
      fitRationale: fit.fitRationale,
    });
  }

}
