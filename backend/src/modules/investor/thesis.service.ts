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

  getGeographyTaxonomy() {
    return {
      version: GEOGRAPHY_TAXONOMY_VERSION,
      levels: 3,
      nodes: getInvestorGeographyTaxonomy(),
    };
  }
}
