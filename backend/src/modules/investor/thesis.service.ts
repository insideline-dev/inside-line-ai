import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import {
  investorThesis,
} from './entities/investor.schema';
import { CreateThesis, UpdateThesis } from './dto';
import {
  canonicalizeGeographicFocus,
  GEOGRAPHY_TAXONOMY_VERSION,
  getInvestorGeographyTaxonomy,
  mapNodeIdsToLabels,
} from '../geography';
import { startup, StartupStatus } from '../startup/entities/startup.schema';
import { StartupMatchingPipelineService } from '../ai/services/startup-matching-pipeline.service';
import { AiProviderService } from '../ai/providers/ai-provider.service';
import { ModelPurpose } from '../ai/interfaces/pipeline.interface';
import { generateText } from 'ai';
import { buildThesisSummary } from './thesis-summary.util';

const THESIS_SUMMARY_BATCH_SIZE = 10;

@Injectable()
export class ThesisService {
  private readonly logger = new Logger(ThesisService.name);

  constructor(
    private drizzle: DrizzleService,
    @Optional() private startupMatching?: StartupMatchingPipelineService,
    @Optional() private aiProviders?: AiProviderService,
  ) {}

  async findOne(userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      const [thesis] = await db
        .select()
        .from(investorThesis)
        .where(eq(investorThesis.userId, userId))
        .limit(1);

      return thesis ?? null;
    });
  }

  async upsert(userId: string, dto: CreateThesis | UpdateThesis) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.findOne(userId);
      const payload: Record<string, unknown> = { ...dto };

      const shouldNormalizeGeography =
        Object.prototype.hasOwnProperty.call(dto, 'geographicFocus') ||
        Object.prototype.hasOwnProperty.call(dto, 'geographicFocusNodes');

      if (shouldNormalizeGeography) {
        const geographicFocusNodes = canonicalizeGeographicFocus({
          geographicFocusNodes: dto.geographicFocusNodes,
          geographicFocus: dto.geographicFocus,
        });

        payload.geographicFocusNodes = geographicFocusNodes;
        payload.geographicFocus = mapNodeIdsToLabels(geographicFocusNodes);
      }

      const mergedThesis = {
        ...(existing ?? {}),
        ...payload,
      } as Record<string, unknown>;

      const thesisSummary = await this.generateAiSummaryWithFallback(mergedThesis);

      payload.thesisSummary = thesisSummary;
      payload.thesisSummaryGeneratedAt = new Date();

      let result: typeof investorThesis.$inferSelect;
      if (existing) {
        const [updated] = await db
          .update(investorThesis)
          .set({
            ...payload,
            updatedAt: new Date(),
          })
          .where(eq(investorThesis.userId, userId))
          .returning();

        this.logger.log(`Updated thesis for user ${userId}`);
        result = updated;
      } else {
        const [created] = await db
          .insert(investorThesis)
          .values({
            userId,
            ...payload,
          })
          .returning();

        this.logger.log(`Created thesis for user ${userId}`);
        result = created;
      }

      // Trigger re-matching for all approved startups when thesis is updated
      if (existing && this.startupMatching) {
        void this.triggerRematching(userId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to trigger re-matching after thesis update for user ${userId}: ${msg}`);
        });
      }

      return result;
    });
  }

  private async triggerRematching(investorUserId: string): Promise<void> {
    if (!this.startupMatching) return;

    const approvedStartups = await this.drizzle.db
      .select({ id: startup.id })
      .from(startup)
      .where(eq(startup.status, StartupStatus.APPROVED));

    if (approvedStartups.length === 0) {
      this.logger.log(`No approved startups to re-match after thesis update for investor ${investorUserId}`);
      return;
    }

    this.logger.log(`Triggering re-matching for ${approvedStartups.length} approved startups after thesis update for investor ${investorUserId}`);

    // Process in batches to avoid overwhelming the queue
    for (let i = 0; i < approvedStartups.length; i += THESIS_SUMMARY_BATCH_SIZE) {
      const batch = approvedStartups.slice(i, i + THESIS_SUMMARY_BATCH_SIZE);
      await Promise.all(
        batch.map((s) =>
          this.startupMatching!.queueStartupMatching({
            startupId: s.id,
            requestedBy: investorUserId,
            triggerSource: 'thesis_update',
            requireApproved: false,
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Failed to queue re-matching for startup ${s.id}: ${msg}`);
          }),
        ),
      );
    }

    this.logger.log(`Re-matching queued for ${approvedStartups.length} startups after thesis update`);
  }

  private async generateAiSummaryWithFallback(thesis: Record<string, unknown>): Promise<string> {
    if (this.aiProviders) {
      try {
        const model = this.aiProviders.resolveModelForPurpose(ModelPurpose.THESIS_ALIGNMENT);

        const industries = Array.isArray(thesis.industries) ? (thesis.industries as string[]).join(', ') : '';
        const stages = Array.isArray(thesis.stages) ? (thesis.stages as string[]).join(', ') : '';
        const geography = Array.isArray(thesis.geographicFocus) ? (thesis.geographicFocus as string[]).join(', ') : '';
        const checkMin = typeof thesis.checkSizeMin === 'number' ? `$${(thesis.checkSizeMin / 1000).toFixed(0)}K` : null;
        const checkMax = typeof thesis.checkSizeMax === 'number' ? `$${(thesis.checkSizeMax / 1000).toFixed(0)}K` : null;
        const checkSize = checkMin && checkMax ? `${checkMin}–${checkMax}` : checkMin ?? checkMax ?? '';
        const narrative = typeof thesis.thesisNarrative === 'string' ? thesis.thesisNarrative : '';
        const mustHaves = Array.isArray(thesis.mustHaveFeatures) ? (thesis.mustHaveFeatures as string[]).join(', ') : '';
        const dealBreakers = Array.isArray(thesis.dealBreakers) ? (thesis.dealBreakers as string[]).join(', ') : '';

        const prompt = [
          `Generate a concise, professional investment thesis summary for this investor based on their criteria.`,
          `Write it as a 2-3 sentence paragraph that captures their investment focus and preferences.`,
          `\nCriteria:`,
          industries && `- Industries: ${industries}`,
          stages && `- Stages: ${stages}`,
          checkSize && `- Check size: ${checkSize}`,
          geography && `- Geography: ${geography}`,
          narrative && `- Thesis narrative: ${narrative}`,
          mustHaves && `- Must-haves: ${mustHaves}`,
          dealBreakers && `- Deal breakers: ${dealBreakers}`,
        ]
          .filter(Boolean)
          .join('\n');

        const { text } = await generateText({
          model,
          prompt,
          maxOutputTokens: 300,
          temperature: 0.3,
        });

        const trimmed = text.trim();
        if (trimmed.length > 0) {
          return trimmed.slice(0, 2000);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`AI thesis summary generation failed, using rule-based fallback: ${msg}`);
      }
    }

    return buildThesisSummary(thesis);
  }

  async delete(userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.findOne(userId);

      if (!existing) {
        throw new NotFoundException('Thesis not found');
      }

      await db.delete(investorThesis).where(eq(investorThesis.userId, userId));

      this.logger.log(`Deleted thesis for user ${userId}`);
    });
  }

  async hasThesis(userId: string): Promise<boolean> {
    const thesis = await this.findOne(userId);
    return thesis !== null && thesis.isActive;
  }

  async generateSummary(userId: string) {
    const thesis = await this.findOne(userId);
    if (!thesis) {
      throw new NotFoundException('Thesis not found');
    }

    const summary = this.composeSummary(thesis);

    return this.drizzle.withRLS(userId, async (db) => {
      const [updated] = await db
        .update(investorThesis)
        .set({
          thesisSummary: summary,
          thesisSummaryGeneratedAt: new Date(),
        })
        .where(eq(investorThesis.userId, userId))
        .returning();

      this.logger.log(`Generated thesis summary for user ${userId}`);
      return updated;
    });
  }

  private composeSummary(
    thesis: typeof investorThesis.$inferSelect,
  ): string {
    const parts: string[] = [];

    if (thesis.stages?.length) {
      parts.push(
        `Invests at the ${thesis.stages.join(', ')} stage${thesis.stages.length > 1 ? 's' : ''}.`,
      );
    }

    if (thesis.industries?.length) {
      parts.push(`Focused on ${thesis.industries.join(', ')}.`);
    }

    if (thesis.checkSizeMin != null || thesis.checkSizeMax != null) {
      const fmt = (n: number) =>
        n >= 1_000_000
          ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
          : `$${(n / 1_000).toFixed(0)}K`;
      if (thesis.checkSizeMin != null && thesis.checkSizeMax != null) {
        parts.push(
          `Check size ranges from ${fmt(thesis.checkSizeMin)} to ${fmt(thesis.checkSizeMax)}.`,
        );
      } else if (thesis.checkSizeMin != null) {
        parts.push(`Minimum check size of ${fmt(thesis.checkSizeMin)}.`);
      } else if (thesis.checkSizeMax != null) {
        parts.push(`Maximum check size of ${fmt(thesis.checkSizeMax)}.`);
      }
    }

    if (thesis.geographicFocus?.length) {
      parts.push(
        `Geographic focus: ${thesis.geographicFocus.join(', ')}.`,
      );
    }

    if (thesis.businessModels?.length) {
      parts.push(
        `Preferred business models: ${thesis.businessModels.join(', ')}.`,
      );
    }

    if (thesis.fundSize != null) {
      const fundStr =
        thesis.fundSize >= 1_000_000
          ? `$${(thesis.fundSize / 1_000_000).toFixed(thesis.fundSize % 1_000_000 === 0 ? 0 : 1)}M`
          : `$${thesis.fundSize.toLocaleString()}`;
      parts.push(`Fund size: ${fundStr}.`);
    }

    if (thesis.thesisNarrative) {
      parts.push(thesis.thesisNarrative);
    }

    if (thesis.antiPortfolio) {
      parts.push(`Will not invest in: ${thesis.antiPortfolio}`);
    }

    return parts.join(' ') || 'No thesis details available.';
  }

  getGeographyTaxonomy() {
    return {
      version: GEOGRAPHY_TAXONOMY_VERSION,
      levels: 3,
      nodes: getInvestorGeographyTaxonomy(),
    };
  }

}
