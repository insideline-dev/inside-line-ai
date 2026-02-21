import {
  Injectable,
  Logger,
  NotFoundException,
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

      const thesisSummary = this.buildThesisSummary({
        ...(existing ?? {}),
        ...payload,
      } as Record<string, unknown>);

      payload.thesisSummary = thesisSummary;
      payload.thesisSummaryGeneratedAt = thesisSummary ? new Date() : null;

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

  private buildThesisSummary(thesis: Record<string, unknown>): string | null {
    const sections: string[] = [];

    const readString = (value: unknown): string | null => {
      if (typeof value !== 'string') {
        return null;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const readStringArray = (value: unknown): string[] => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    };

    const readNumber = (value: unknown): number | null => {
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    };

    const narrative = readString(thesis.thesisNarrative);
    if (narrative) {
      sections.push(narrative);
    }

    const notes = readString(thesis.notes);
    if (notes) {
      sections.push(`Notes: ${notes}`);
    }

    const formatList = (values: string[]): string | null => {
      if (values.length === 0) {
        return null;
      }

      return values.join(', ');
    };

    const industries = formatList(readStringArray(thesis.industries));
    if (industries) {
      sections.push(`Focus industries: ${industries}.`);
    }

    const stages = formatList(readStringArray(thesis.stages));
    if (stages) {
      sections.push(`Preferred stages: ${stages}.`);
    }

    const geographies = formatList(readStringArray(thesis.geographicFocus));
    if (geographies) {
      sections.push(`Geographic focus: ${geographies}.`);
    }

    const checkSizeMin = readNumber(thesis.checkSizeMin);
    const checkSizeMax = readNumber(thesis.checkSizeMax);
    if (
      typeof checkSizeMin === 'number' ||
      typeof checkSizeMax === 'number'
    ) {
      const minText =
        typeof checkSizeMin === 'number'
          ? checkSizeMin.toLocaleString('en-US')
          : '0';
      const maxText =
        typeof checkSizeMax === 'number'
          ? checkSizeMax.toLocaleString('en-US')
          : 'any';
      sections.push(`Check size: ${minText} to ${maxText} USD.`);
    }

    const businessModels = formatList(readStringArray(thesis.businessModels));
    if (businessModels) {
      sections.push(`Business model preference: ${businessModels}.`);
    }

    const mustHaveFeatures = formatList(
      readStringArray(thesis.mustHaveFeatures),
    );
    if (mustHaveFeatures) {
      sections.push(`Must-have signals: ${mustHaveFeatures}.`);
    }

    const dealBreakers = formatList(readStringArray(thesis.dealBreakers));
    if (dealBreakers) {
      sections.push(`Deal breakers: ${dealBreakers}.`);
    }

    const antiPortfolio = readString(thesis.antiPortfolio);
    if (antiPortfolio) {
      sections.push(`Anti-portfolio constraints: ${antiPortfolio}.`);
    }

    if (sections.length === 0) {
      return null;
    }

    return sections.join(' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
  }
}
