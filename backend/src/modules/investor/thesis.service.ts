import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { investorThesis } from './entities/investor.schema';
import { CreateThesis, UpdateThesis } from './dto';
import {
  canonicalizeGeographicFocus,
  GEOGRAPHY_TAXONOMY_VERSION,
  getInvestorGeographyTaxonomy,
  mapNodeIdsToLabels,
} from '../geography';

@Injectable()
export class ThesisService {
  private readonly logger = new Logger(ThesisService.name);

  constructor(private drizzle: DrizzleService) {}

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
        return updated;
      }

      const [created] = await db
        .insert(investorThesis)
        .values({
          userId,
          ...payload,
        })
        .returning();

      this.logger.log(`Created thesis for user ${userId}`);
      return created;
    });
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
