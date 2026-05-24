import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '../../database/schema';
import {
  investorThesis,
} from './entities/investor.schema';
import { investorDealbreakerRuleVersion } from './entities/dealbreaker-rule-version.schema';
import { investorEvent } from './entities/investor-event.schema';
import {
  dealbreakerSetsEqual,
  diffDealbreakerSets,
} from './dealbreaker-audit.util';
import { DealTriggerService } from '../startup/deal-trigger.service';
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
import { generateText, Output } from 'ai';
import { buildThesisSummary } from './thesis-summary.util';
import { InvestorOnboardingService } from './onboarding/investor-onboarding.service';
import {
  StructuredDealbreakerRuleListSchema,
  type StructuredDealbreakerRule,
} from './structured-dealbreaker';

const THESIS_SUMMARY_BATCH_SIZE = 10;
const MAX_GENERATED_STRUCTURED_DEALBREAKERS = 8;
const MAX_GENERATED_STRUCTURED_DEALBREAKER_CANDIDATES = 16;
const STRUCTURED_DEALBREAKER_GENERATION_SCHEMA = StructuredDealbreakerRuleListSchema.max(
  MAX_GENERATED_STRUCTURED_DEALBREAKER_CANDIDATES,
).transform((rules) => ({ rules }));

@Injectable()
export class ThesisService {
  private readonly logger = new Logger(ThesisService.name);

  constructor(
    private drizzle: DrizzleService,
    @Optional() private startupMatching?: StartupMatchingPipelineService,
    @Optional() private aiProviders?: AiProviderService,
    @Optional()
    @Inject(forwardRef(() => InvestorOnboardingService))
    private onboarding?: InvestorOnboardingService,
    @Optional() private dealTriggers?: DealTriggerService,
  ) {}

  async getDealbreakerHistory(userId: string, limit = 5) {
    return this.drizzle.withRLS(userId, async (db) => {
      return db
        .select()
        .from(investorDealbreakerRuleVersion)
        .where(eq(investorDealbreakerRuleVersion.investorUserId, userId))
        .orderBy(desc(investorDealbreakerRuleVersion.versionNumber))
        .limit(Math.min(Math.max(limit, 1), 20));
    });
  }

  /**
   * DS-E4-F3 — load the latest structured rule set for the investor.
   * Returns `[]` when no version has been authored yet.
   */
  async getStructuredDealbreakers(
    userId: string,
  ): Promise<StructuredDealbreakerRule[]> {
    return this.drizzle.withRLS(userId, async (db) => {
      const [row] = await db
        .select({ structuredRules: investorDealbreakerRuleVersion.structuredRules })
        .from(investorDealbreakerRuleVersion)
        .where(eq(investorDealbreakerRuleVersion.investorUserId, userId))
        .orderBy(desc(investorDealbreakerRuleVersion.versionNumber))
        .limit(1);
      return row?.structuredRules ?? [];
    });
  }

  /**
   * DS-E4-F3 — append a new dealbreaker rule version containing structured
   * rules. Carries the existing legacy text `rules` forward unchanged so the
   * narrative-term path (F4-F4) and structured path coexist on the same row.
   */
  async upsertStructuredDealbreakers(
    userId: string,
    rules: StructuredDealbreakerRule[],
  ): Promise<{ versionNumber: number; rules: StructuredDealbreakerRule[] }> {
    const validated = StructuredDealbreakerRuleListSchema.parse(rules);
    return this.drizzle.withRLS(userId, async (db) => {
      const [latest] = await db
        .select({
          versionNumber: investorDealbreakerRuleVersion.versionNumber,
          rules: investorDealbreakerRuleVersion.rules,
        })
        .from(investorDealbreakerRuleVersion)
        .where(eq(investorDealbreakerRuleVersion.investorUserId, userId))
        .orderBy(desc(investorDealbreakerRuleVersion.versionNumber))
        .limit(1);

      const nextVersion = Number(latest?.versionNumber ?? 0) + 1;
      const carriedRules = latest?.rules ?? [];

      await db.insert(investorDealbreakerRuleVersion).values({
        investorUserId: userId,
        versionNumber: nextVersion,
        rules: carriedRules,
        structuredRules: validated,
        createdBy: userId,
      });

      await db.insert(investorEvent).values({
        investorUserId: userId,
        type: 'dealbreakers.structured.updated',
        payload: {
          versionNumber: nextVersion,
          ruleCount: validated.length,
        },
      });

      return { versionNumber: nextVersion, rules: validated };
    });
  }

  async generateStructuredDealbreakers(
    userId: string,
    narrative: string,
  ): Promise<StructuredDealbreakerRule[]> {
    const trimmed = narrative.trim();
    if (trimmed.length < 12) return [];
    if (!this.aiProviders) {
      this.logger.warn(
        `Structured dealbreaker generation requested without AI providers configured for user ${userId}`,
      );
      return [];
    }

    const model = 'gpt-5.4-mini';
    const prompt = [
      'You convert an investor anti-portfolio narrative into structured dealbreaker rules.',
      'Return only explicit exclusions that the investor clearly stated.',
      'Prefer omission over guessing. Do not add adjacent concepts, synonyms, or broader categories unless they are explicitly named.',
      'Only use these fields: industry, stage, geography, raiseType, fundingTarget, valuation, teamSize.',
      'Use string-list rules when the narrative names categories like sectors, stages, geographies, or raise types.',
      'Use numeric rules only when the narrative explicitly gives a threshold or exact number.',
      'Default action to reject unless the investor clearly implies a softer rule, in which case use require_override.',
      'Write short professional labels that read well in a UI.',
      `Return at most ${MAX_GENERATED_STRUCTURED_DEALBREAKERS} rules.`,
      '',
      'Investor anti-portfolio narrative:',
      trimmed,
    ].join('\n');

    try {
      const { output } = await generateText({
        model: this.aiProviders.resolveModel(model),
        prompt,
        temperature: 0.1,
        maxOutputTokens: 900,
        output: Output.object({ schema: STRUCTURED_DEALBREAKER_GENERATION_SCHEMA }),
      });

      const generated = output?.rules ?? [];
      return this.normalizeGeneratedStructuredDealbreakers(generated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Structured dealbreaker generation failed for user ${userId}: ${msg}`,
      );
      return [];
    }
  }

  private normalizeGeneratedStructuredDealbreakers(
    rules: StructuredDealbreakerRule[],
  ): StructuredDealbreakerRule[] {
    const validated = StructuredDealbreakerRuleListSchema.safeParse(
      rules.slice(0, MAX_GENERATED_STRUCTURED_DEALBREAKER_CANDIDATES),
    );
    if (!validated.success) return [];

    const deduped = new Map<string, StructuredDealbreakerRule>();
    for (const rule of validated.data) {
      const normalized = 'values' in rule
        ? {
            ...rule,
            values: Array.from(
              new Set(rule.values.map((value) => value.trim()).filter(Boolean)),
            ),
          }
        : rule;

      if ('values' in normalized && normalized.values.length === 0) {
        continue;
      }

      const key = JSON.stringify({
        field: normalized.field,
        operator: normalized.operator,
        action: normalized.action,
        value: 'values' in normalized ? [...normalized.values].sort() : normalized.value,
      });
      if (!deduped.has(key)) {
        deduped.set(key, normalized);
      }
      if (deduped.size >= MAX_GENERATED_STRUCTURED_DEALBREAKERS) {
        break;
      }
    }

    return Array.from(deduped.values());
  }

  private async recordDealbreakerChange(
    db: PostgresJsDatabase<typeof schema>,
    userId: string,
    input: { before: string[]; after: string[] },
  ): Promise<void> {
    const rows = await db
      .select({
        maxVersion: sql<number>`coalesce(max(${investorDealbreakerRuleVersion.versionNumber}), 0)`,
      })
      .from(investorDealbreakerRuleVersion)
      .where(eq(investorDealbreakerRuleVersion.investorUserId, userId));

    const versionNumber = Number(rows[0]?.maxVersion ?? 0) + 1;
    const { added, removed } = diffDealbreakerSets(input.before, input.after);

    await db.insert(investorDealbreakerRuleVersion).values({
      investorUserId: userId,
      versionNumber,
      rules: input.after,
      createdBy: userId,
    });

    await db.insert(investorEvent).values({
      investorUserId: userId,
      type: 'dealbreakers.updated',
      payload: {
        before: input.before,
        after: input.after,
        added,
        removed,
        versionNumber,
      },
    });
  }

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
      const { skipRematching: _, regenerateSummary: _rs, ...dtoFields } = dto as Record<string, unknown>;
      const payload: Record<string, unknown> = { ...dtoFields };

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

      // DS-E3-F1-S3 — preserve manual edits to the summary. When the caller
      // explicitly passed a `thesisSummary` that differs from the current
      // value, treat it as a manual edit and skip auto-regeneration. The
      // user reverts to AI-generated by hitting the "Regenerate from
      // structured params" action (which clears the flag).
      const dtoSentSummary = Object.prototype.hasOwnProperty.call(
        dto,
        'thesisSummary',
      );
      const summaryChanged =
        dtoSentSummary && dto.thesisSummary !== existing?.thesisSummary;

      if (summaryChanged) {
        payload.thesisSummary = dto.thesisSummary;
        payload.thesisSummaryGeneratedAt = new Date();
        payload.thesisSummaryManuallyEdited = true;
      } else if (dto.regenerateSummary) {
        const thesisSummary = await this.generateAiSummaryWithFallback(mergedThesis);
        payload.thesisSummary = thesisSummary;
        payload.thesisSummaryGeneratedAt = new Date();
        payload.thesisSummaryManuallyEdited = false;
      } else {
        delete payload.thesisSummary;
        delete payload.thesisSummaryGeneratedAt;
      }

      const dtoSentDealBreakers = Object.prototype.hasOwnProperty.call(
        dto,
        'dealBreakers',
      );
      const nextDealBreakers = dtoSentDealBreakers
        ? ((dto.dealBreakers as string[] | null | undefined) ?? [])
        : (existing?.dealBreakers ?? []);
      const dealBreakersChanged =
        dtoSentDealBreakers &&
        !dealbreakerSetsEqual(existing?.dealBreakers, nextDealBreakers);

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

        if (dealBreakersChanged) {
          await this.recordDealbreakerChange(db, userId, {
            before: existing.dealBreakers ?? [],
            after: updated.dealBreakers ?? [],
          });
        }
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

        if (dtoSentDealBreakers && (created.dealBreakers?.length ?? 0) > 0) {
          await this.recordDealbreakerChange(db, userId, {
            before: [],
            after: created.dealBreakers ?? [],
          });
        }
      }

      if (dealBreakersChanged && this.dealTriggers) {
        void this.dealTriggers.notifyThesisUpdated(userId);
      }

      if (existing && this.startupMatching && !dto.skipRematching) {
        void this.triggerRematching(userId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to trigger re-matching after thesis update for user ${userId}: ${msg}`);
        });
      }

      // DS-E3-F1-S2 — re-scrape the fund website when it changes on an
      // already-registered investor (e.g. a partner pastes a new domain on
      // /investor/thesis). The onboarding service handles normalization,
      // dedup, and enqueues the scrape job; failures are logged but never
      // block the thesis save.
      const dtoSentWebsite = Object.prototype.hasOwnProperty.call(
        dto,
        'website',
      );
      const websiteValue =
        dtoSentWebsite && typeof (dto as { website?: unknown }).website === 'string'
          ? ((dto as { website: string }).website).trim()
          : '';
      const websiteChanged =
        dtoSentWebsite &&
        websiteValue.length > 0 &&
        websiteValue !== (existing?.website ?? '');

      if (websiteChanged && this.onboarding) {
        void this.onboarding
          .submitWebsite(userId, { website: websiteValue })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              `Failed to re-scrape investor website on thesis update for user ${userId}: ${msg}`,
            );
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

        const businessModels = Array.isArray(thesis.businessModels) ? (thesis.businessModels as string[]).join(', ') : '';
        const antiPortfolio = typeof thesis.antiPortfolio === 'string' ? thesis.antiPortfolio : '';
        const notes = typeof thesis.notes === 'string' ? thesis.notes : '';

        const prompt = [
          `Generate a professional investment thesis summary for this fund based on all available data.`,
          `Write exactly 2 paragraphs separated by a blank line:`,
          `- Paragraph 1: Who the fund is, what sectors/industries they focus on, preferred stages, check size range, and geographic focus.`,
          `- Paragraph 2: Their investment philosophy, what they look for in founders/companies, key differentiators, value-add, and any dealbreakers or strong preferences.`,
          `Keep it natural and authoritative — written as if by the fund itself for an LP or co-investor audience. No bullet points. About 100-150 words total.`,
          `\nStructured criteria:`,
          industries && `- Industries: ${industries}`,
          stages && `- Stages: ${stages}`,
          checkSize && `- Check size: ${checkSize}`,
          geography && `- Geography: ${geography}`,
          businessModels && `- Business models: ${businessModels}`,
          narrative && `- Thesis narrative: ${narrative}`,
          notes && `- Additional notes: ${notes}`,
          mustHaves && `- Must-haves: ${mustHaves}`,
          dealBreakers && `- Deal breakers: ${dealBreakers}`,
          antiPortfolio && `- Anti-portfolio / what they avoid: ${antiPortfolio}`,
        ]
          .filter(Boolean)
          .join('\n');

        const { text } = await generateText({
          model,
          prompt,
          maxOutputTokens: 500,
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
          // DS-E3-F1-S3 — explicit regenerate action resets the manual-edit
          // flag so subsequent upserts auto-regen until the user edits again.
          thesisSummaryManuallyEdited: false,
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
      levels: 4,
      nodes: getInvestorGeographyTaxonomy(),
    };
  }

}
