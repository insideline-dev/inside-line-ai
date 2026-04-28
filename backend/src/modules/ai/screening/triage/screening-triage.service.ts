import { Inject, Injectable, Logger } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DrizzleService } from "../../../../database";
import {
  screeningDecision,
  type ScreeningDecisionLensSnapshot,
  type ScreeningDecisionRow,
} from "../../entities/screening-decision.schema";

/**
 * Triage policy v1 — deliberately simple, transparent, and pluggable.
 *
 *   1. If ANY lens has signal === 'reject' → classification = 'reject'
 *      (reasonCode `lens.<key>.reject` per offending lens).
 *   2. Else compute `overallScore` = round(mean(lens.score)).
 *   3. If `overallScore < 40`              → 'reject'  (`low_overall_score`).
 *   4. Else if any lens.signal === 'review' → 'review'
 *      (reasonCode `lens.<key>.review` per such lens).
 *   5. Else if 40 <= overallScore < 60      → 'review'
 *      (reasonCode `borderline_overall_score`).
 *   6. Else                                 → 'advance'  (no reason codes).
 *
 * Edge cases:
 *  - Empty lens list → 'review' with reason `no_lens_signals`.
 *  - DS-E7-F4 will inject `missing_materials` reason codes; this service
 *    accepts none today but leaves the array open-ended in the schema.
 *
 * This file is the SINGLE place to change the formula. Keep it pure and
 * obvious — investors should be able to read the docstring above and predict
 * the output.
 */
export const POLICY_VERSION = 1 as const;

/**
 * Snapshot of every constant that participates in the triage decision.
 * Exposed so tests can lock the tuple — any change to a threshold without
 * also bumping POLICY_VERSION fails the snapshot test, forcing historical
 * decisions to remain interpretable across formula changes.
 */
export const POLICY_SNAPSHOT = {
  POLICY_VERSION,
  LOW_SCORE_THRESHOLD: 40,
  ADVANCE_SCORE_THRESHOLD: 60,
} as const;

const { LOW_SCORE_THRESHOLD, ADVANCE_SCORE_THRESHOLD } = POLICY_SNAPSHOT;

export const TriageLensSignalSchema = z.enum(["advance", "review", "reject"]);
export type TriageLensSignal = z.infer<typeof TriageLensSignalSchema>;

export const TriageLensInputSchema = z.object({
  key: z.string().min(1),
  score: z.number().int().min(0).max(100),
  signal: TriageLensSignalSchema,
});
export type TriageLensInput = z.infer<typeof TriageLensInputSchema>;

export const TriageDecideInputSchema = z.object({
  startupId: z.string().uuid(),
  pipelineRunId: z.string().nullable().optional(),
  lensResults: z.array(TriageLensInputSchema),
});
export type TriageDecideInput = z.infer<typeof TriageDecideInputSchema>;

export const ScreeningDecisionSchema = z.object({
  id: z.string().uuid(),
  startupId: z.string().uuid(),
  pipelineRunId: z.string().nullable(),
  classification: TriageLensSignalSchema,
  overallScore: z.number().int().min(0).max(100),
  reasonCodes: z.array(z.string()),
  lensSnapshot: z.array(TriageLensInputSchema),
  policyVersion: z.number().int().min(1),
  createdAt: z.string().datetime(),
});
export type ScreeningDecision = z.infer<typeof ScreeningDecisionSchema>;

interface TriageOutcome {
  classification: TriageLensSignal;
  overallScore: number;
  reasonCodes: string[];
}

/**
 * Pure triage policy — no I/O. Exported so unit tests and dry-runs can
 * exercise the formula without touching the DB.
 */
export function applyTriagePolicy(lenses: TriageLensInput[]): TriageOutcome {
  if (lenses.length === 0) {
    return {
      classification: "review",
      overallScore: 0,
      reasonCodes: ["no_lens_signals"],
    };
  }

  const rejecting = lenses.filter((l) => l.signal === "reject");
  const overallScore = Math.round(
    lenses.reduce((sum, l) => sum + l.score, 0) / lenses.length,
  );

  if (rejecting.length > 0) {
    return {
      classification: "reject",
      overallScore,
      reasonCodes: rejecting.map((l) => `lens.${l.key}.reject`),
    };
  }

  if (overallScore < LOW_SCORE_THRESHOLD) {
    return {
      classification: "reject",
      overallScore,
      reasonCodes: ["low_overall_score"],
    };
  }

  const reviewing = lenses.filter((l) => l.signal === "review");
  const borderline = overallScore < ADVANCE_SCORE_THRESHOLD;

  if (reviewing.length > 0 || borderline) {
    const reasonCodes: string[] = reviewing.map(
      (l) => `lens.${l.key}.review`,
    );
    if (borderline) {
      reasonCodes.push("borderline_overall_score");
    }
    return {
      classification: "review",
      overallScore,
      reasonCodes,
    };
  }

  return {
    classification: "advance",
    overallScore,
    reasonCodes: [],
  };
}

@Injectable()
export class ScreeningTriageService {
  private readonly logger = new Logger(ScreeningTriageService.name);

  constructor(
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
  ) {}

  async decide(input: TriageDecideInput): Promise<ScreeningDecision> {
    const parsed = TriageDecideInputSchema.parse(input);
    const outcome = applyTriagePolicy(parsed.lensResults);
    const snapshot: ScreeningDecisionLensSnapshot[] = parsed.lensResults.map(
      ({ key, score, signal }) => ({ key, score, signal }),
    );

    const [row] = await this.drizzle.db
      .insert(screeningDecision)
      .values({
        startupId: parsed.startupId,
        pipelineRunId: parsed.pipelineRunId ?? null,
        classification: outcome.classification,
        overallScore: outcome.overallScore,
        reasonCodes: outcome.reasonCodes,
        lensSnapshot: snapshot,
        policyVersion: POLICY_VERSION,
      })
      .returning();

    if (!row) {
      throw new Error("ScreeningTriageService.decide: insert returned no row");
    }

    this.logger.log(
      `Triage v${POLICY_VERSION} startup=${parsed.startupId} → ${outcome.classification} (score=${outcome.overallScore}, reasons=${outcome.reasonCodes.join(",") || "-"})`,
    );

    return this.toDecision(row);
  }

  async latestForStartup(startupId: string): Promise<ScreeningDecision | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(screeningDecision)
      .where(eq(screeningDecision.startupId, startupId))
      .orderBy(desc(screeningDecision.createdAt))
      .limit(1);

    return row ? this.toDecision(row) : null;
  }

  private toDecision(row: ScreeningDecisionRow): ScreeningDecision {
    return {
      id: row.id,
      startupId: row.startupId,
      pipelineRunId: row.pipelineRunId,
      classification: row.classification as TriageLensSignal,
      overallScore: row.overallScore,
      reasonCodes: row.reasonCodes,
      lensSnapshot: row.lensSnapshot,
      policyVersion: row.policyVersion,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
