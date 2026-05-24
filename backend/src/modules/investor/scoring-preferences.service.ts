import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import {
  investorScoringPreference,
  stageScoringWeight,
  ScoringWeights,
} from './entities/investor.schema';
import { StartupStage } from '../startup/entities/startup.schema';
import { UpdateScoringPreferences } from './dto';

@Injectable()
export class ScoringPreferencesService {
  private readonly logger = new Logger(ScoringPreferencesService.name);

  constructor(private drizzle: DrizzleService) {}

  async getAll(userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      return db
        .select()
        .from(investorScoringPreference)
        .where(eq(investorScoringPreference.investorId, userId));
    });
  }

  async getByStage(userId: string, stage: StartupStage) {
    return this.drizzle.withRLS(userId, async (db) => {
      const [pref] = await db
        .select()
        .from(investorScoringPreference)
        .where(
          and(
            eq(investorScoringPreference.investorId, userId),
            eq(investorScoringPreference.stage, stage),
          ),
        )
        .limit(1);

      return pref ?? null;
    });
  }

  async getEffectiveWeights(
    userId: string,
    stage: StartupStage,
  ): Promise<ScoringWeights> {
    return this.drizzle.withRLS(userId, async (db) => {
      const [pref] = await db
        .select()
        .from(investorScoringPreference)
        .where(
          and(
            eq(investorScoringPreference.investorId, userId),
            eq(investorScoringPreference.stage, stage),
          ),
        )
        .limit(1);

      if (pref?.useCustomWeights && pref.customWeights) {
        return pref.customWeights;
      }

      // Fall back to admin stage defaults
      const [stageDefault] = await db
        .select()
        .from(stageScoringWeight)
        .where(eq(stageScoringWeight.stage, stage))
        .limit(1);

      if (!stageDefault) {
        throw new NotFoundException(
          `No default weights configured for stage ${stage}`,
        );
      }

      return stageDefault.weights;
    });
  }

  async upsert(userId: string, stage: StartupStage, dto: UpdateScoringPreferences) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.getByStage(userId, stage);

      if (existing) {
        const [updated] = await db
          .update(investorScoringPreference)
          .set({
            useCustomWeights: dto.useCustomWeights,
            customWeights: dto.customWeights ?? null,
            customRationale: dto.customRationale ?? null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(investorScoringPreference.investorId, userId),
              eq(investorScoringPreference.stage, stage),
            ),
          )
          .returning();

        this.logger.log(`Updated scoring preference for ${userId} stage ${stage}`);
        return updated;
      }

      const [created] = await db
        .insert(investorScoringPreference)
        .values({
          investorId: userId,
          stage,
          useCustomWeights: dto.useCustomWeights,
          customWeights: dto.customWeights ?? null,
          customRationale: dto.customRationale ?? null,
        })
        .returning();

      this.logger.log(`Created scoring preference for ${userId} stage ${stage}`);
      return created;
    });
  }

  async reset(userId: string, stage: StartupStage) {
    return this.drizzle.withRLS(userId, async (db) => {
      const existing = await this.getByStage(userId, stage);

      if (!existing) {
        throw new NotFoundException(
          `No scoring preference found for stage ${stage}`,
        );
      }

      await db
        .delete(investorScoringPreference)
        .where(
          and(
            eq(investorScoringPreference.investorId, userId),
            eq(investorScoringPreference.stage, stage),
          ),
        );

      this.logger.log(`Reset scoring preference for ${userId} stage ${stage}`);
    });
  }

  async resetAll(userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      await db
        .delete(investorScoringPreference)
        .where(eq(investorScoringPreference.investorId, userId));

      this.logger.log(`Reset all scoring preferences for ${userId}`);
    });
  }

  /**
   * DS-E11-F3-S1 — apply a calibration-approved adjustment to the three
   * screening lens weights (team / market / traction) across every stage
   * the investor has on file (or starting from admin defaults when they
   * don't have a custom row yet). Other 8 lens weights are untouched.
   *
   * Each `adjustment` is a signed point delta. We apply it to the target
   * lens, then redistribute the negated total proportionally across the
   * other two screening lenses so the all-11-lens sum stays at 100.
   * Final values are clamped to [0, 100].
   *
   * Returns the list of (stage, before, after) pairs the loop touched so
   * the caller can audit-log + show a preview. Idempotent — re-running
   * with the same adjustments compounds, so the caller (proposal approve
   * path) must guard re-runs via status transitions.
   */
  async applyScreeningLensAdjustments(
    userId: string,
    adjustments: Array<{ lensKey: "team" | "market" | "traction"; adjustment: number }>,
  ): Promise<Array<{ stage: StartupStage; before: ScoringWeights; after: ScoringWeights }>> {
    const meaningful = adjustments.filter((a) => Math.abs(a.adjustment) > 0);
    if (meaningful.length === 0) return [];

    return this.drizzle.withRLS(userId, async (db) => {
      const stages = Object.values(StartupStage) as StartupStage[];
      const audit: Array<{ stage: StartupStage; before: ScoringWeights; after: ScoringWeights }> = [];

      for (const stage of stages) {
        const before = await this.getEffectiveWeights(userId, stage);
        const after = applyAdjustmentsToWeights(before, meaningful);

        const existing = await this.getByStage(userId, stage);
        if (existing) {
          await db
            .update(investorScoringPreference)
            .set({
              useCustomWeights: true,
              customWeights: after,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(investorScoringPreference.investorId, userId),
                eq(investorScoringPreference.stage, stage),
              ),
            );
        } else {
          await db.insert(investorScoringPreference).values({
            investorId: userId,
            stage,
            useCustomWeights: true,
            customWeights: after,
            customRationale: null,
          });
        }

        audit.push({ stage, before, after });
      }

      this.logger.log(
        `[DS-E11-F3] Applied calibration adjustments for ${userId}: ${meaningful
          .map((a) => `${a.lensKey}${a.adjustment >= 0 ? "+" : ""}${a.adjustment}`)
          .join(", ")} across ${audit.length} stages`,
      );
      return audit;
    });
  }
}

/**
 * Apply a list of signed point adjustments to the three screening lenses
 * inside a ScoringWeights row, redistributing the inverse proportionally
 * across the other two screening lenses so the all-11 sum stays at 100.
 * Pure function so the proposal service can preview without writing.
 */
export function applyAdjustmentsToWeights(
  before: ScoringWeights,
  adjustments: Array<{ lensKey: "team" | "market" | "traction"; adjustment: number }>,
): ScoringWeights {
  const next: ScoringWeights = { ...before };
  const SCREENING_LENSES = ["team", "market", "traction"] as const;

  for (const { lensKey, adjustment } of adjustments) {
    if (adjustment === 0) continue;

    const others = SCREENING_LENSES.filter((k) => k !== lensKey);
    const otherTotal = others.reduce((sum, k) => sum + (next[k] ?? 0), 0);

    // Target lens gets the signed delta, clamped to [0, 100].
    const targetBefore = next[lensKey] ?? 0;
    const targetAfter = Math.max(0, Math.min(100, targetBefore + adjustment));
    const realApplied = targetAfter - targetBefore;
    next[lensKey] = targetAfter;

    // Other two screening lenses absorb the inverse, proportional to their
    // current share. Skip when there's nothing to redistribute against
    // (avoid divide-by-zero); the clamp guarantees we never overflow.
    if (realApplied !== 0 && otherTotal > 0) {
      for (const other of others) {
        const share = (next[other] ?? 0) / otherTotal;
        const candidate = (next[other] ?? 0) - realApplied * share;
        next[other] = Math.max(0, Math.min(100, Math.round(candidate * 100) / 100));
      }
    }
  }
  return next;
}
