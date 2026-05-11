import { Inject, Injectable, Logger } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DrizzleService } from "../../../../database";
import {
  screeningDecision,
  type ScreeningDecisionLensSnapshot,
  type ScreeningDecisionRow,
} from "../../entities/screening-decision.schema";
import { startup } from "../../../startup/entities/startup.schema";
import { investorThesis } from "../../../investor/entities/investor.schema";
import {
  ScreeningNextActionSchema,
  ScreeningSignalSchema,
  resolveCanonicalScreeningOutcome,
  type ScreeningNextAction,
  type ScreeningSignal,
} from "../../contracts/screening-output/screening-outcome";
import {
  detectMissingMaterials,
  type MaterialsInput,
  type MissingMaterialCode,
} from "../../contracts/screening-output/missing-materials";

/**
 * Triage policy v2 — deliberately simple, transparent, and pluggable.
 *
 *   PRE-PASS — applied to each lens before the main pipeline:
 *     a. If a lens has signal === 'advance' but its evidence is thin
 *        (DS-E7-F2-S1: no auto-advance without evidence), it is
 *        *downgraded* to signal === 'review' for the purposes of triage.
 *        Reason code `lens.<key>.low_evidence` is recorded.
 *        Thin = `evidenceCount < MIN_ADVANCE_EVIDENCE_COUNT` OR no
 *        evidence item has `confidence === 'high'`.
 *
 *   MAIN PASS — operates on the (possibly-downgraded) lens signals:
 *     1. If a structured dealbreaker matches the startup → 'reject'
 *        (reason codes `dealbreaker:<term>`). Short-circuits everything else.
 *     2. If `thesisFitScore` is provided AND below
 *        `OUT_OF_SCOPE_THESIS_THRESHOLD` (DS-E4-F1-S1) → 'reject' with
 *        reason `out_of_thesis_scope`. Short-circuits everything else.
 *     3. If ANY lens has signal === 'reject' → 'reject'
 *        (reasonCode `lens.<key>.reject` per offending lens).
 *     4. Else compute `overallScore` = round(mean(lens.score)).
 *     5. If `overallScore < 40`              → 'reject'  (`low_overall_score`).
 *     6. Else if any lens.signal === 'review' → 'review'
 *        (reasonCode `lens.<key>.review` per such lens).
 *     7. Else if 40 <= overallScore < 60      → 'review'
 *        (reasonCode `borderline_overall_score`).
 *     8. Else                                 → 'advance'  (no reason codes).
 *
 * Edge cases:
 *  - Empty lens list → 'review' with reason `no_lens_signals`.
 *  - DS-E7-F4 will inject `missing_materials` reason codes; this service now
 *    canonicalizes that hold as a subtype of `review` so the decision and the
 *    contract stay aligned.
 *
 * This file is the SINGLE place to change the formula. Keep it pure and
 * obvious — investors should be able to read the docstring above and predict
 * the output.
 *
 * Versioning: bumped 1 → 3 with the addition of the evidence pre-pass,
 * thesis-scope short-circuit, and backend-owned dealbreaker enforcement.
 * Older `screening_decision` rows remain interpretable via their
 * `policyVersion` column.
 */
export const POLICY_VERSION = 3 as const;

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
  OUT_OF_SCOPE_THESIS_THRESHOLD: 30,
  MIN_ADVANCE_EVIDENCE_COUNT: 2,
} as const;

const {
  LOW_SCORE_THRESHOLD,
  ADVANCE_SCORE_THRESHOLD,
  OUT_OF_SCOPE_THESIS_THRESHOLD,
  MIN_ADVANCE_EVIDENCE_COUNT,
} = POLICY_SNAPSHOT;

export const TriageLensSignalSchema = ScreeningSignalSchema;
export type TriageLensSignal = ScreeningSignal;

export const TriageNextActionSchema = ScreeningNextActionSchema;
export type TriageNextAction = ScreeningNextAction;

/**
 * Lightweight evidence shape — mirrors a *projection* of `LensEvidence` so
 * the triage policy stays decoupled from the lens schema. The screening
 * processor passes `{ confidence }` per evidence item; full evidence stays
 * on `startup_lens_result`.
 */
export const TriageEvidenceSchema = z.object({
  confidence: z.enum(["low", "medium", "high"]),
});
export type TriageEvidence = z.infer<typeof TriageEvidenceSchema>;

export const TriageLensInputSchema = z.object({
  key: z.string().min(1),
  score: z.number().int().min(0).max(100),
  signal: TriageLensSignalSchema,
  /**
   * Evidence projection used by the evidence pre-pass. Optional for backward
   * compatibility with policy v1 callers; when omitted, the lens's signal is
   * trusted as-is (no downgrade applied).
   */
  evidence: z.array(TriageEvidenceSchema).optional(),
});
export type TriageLensInput = z.infer<typeof TriageLensInputSchema>;

/**
 * Lens-version map persisted onto the `screening_decision` row (DS-E2-F1-S2).
 * Shape: `{ market: '1', team: '1', traction: '1' }`.
 */
export const TriageLensVersionsSchema = z.record(
  z.string().min(1),
  z.string().min(1),
);
export type TriageLensVersions = z.infer<typeof TriageLensVersionsSchema>;

export const TriageDecideInputSchema = z.object({
  startupId: z.string().uuid(),
  pipelineRunId: z.string().nullable().optional(),
  lensResults: z.array(TriageLensInputSchema),
  /**
   * Optional thesis-fit score for the deal (0-100). When supplied, a value
   * below `OUT_OF_SCOPE_THESIS_THRESHOLD` short-circuits to a hard reject.
   * The screening processor computes this as the max thesis-fit across
   * active investors — if no one's thesis even loosely matches, no point
   * burning DD attention on the deal.
   */
  thesisFitScore: z.number().int().min(0).max(100).nullable().optional(),
  /**
   * Active lens versions at decision time (DS-E2-F1-S2). Empty object means
   * the caller didn't supply versions; the decision row falls back to `{}`
   * and looks like a pre-S2 row. Provide one entry per logical lens key.
   */
  lensVersions: TriageLensVersionsSchema.optional(),
});
export type TriageDecideInput = z.infer<typeof TriageDecideInputSchema>;

interface ScreeningStartupSnapshot {
  industry: string | null;
  sectorIndustry: string | null;
  sectorIndustryGroup: string | null;
  pitchDeckUrl: string | null;
  pitchDeckPath: string | null;
  productDescription: string | null;
  description: string | null;
  teamMembers: { name: string; role: string; linkedinUrl?: string }[] | null;
  fundingTarget: number | null;
  valuation: number | null;
  raiseType: string | null;
  website: string | null;
}

interface ActiveInvestorThesisSnapshot {
  dealBreakers: string[] | null;
}

const DEALBREAKER_REASON_PREFIX = "dealbreaker:";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesTermInField(field: string, term: string): boolean {
  const trimmedTerm = term.trim();
  if (!trimmedTerm) return false;
  const pattern = new RegExp(`\\b${escapeRegex(trimmedTerm)}\\b`, "i");
  return pattern.test(field);
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function collectDealbreakerReasonCodes(
  startupSnapshot: ScreeningStartupSnapshot | null,
  theses: ActiveInvestorThesisSnapshot[],
): string[] {
  if (!startupSnapshot) return [];
  const fields = [
    startupSnapshot.industry,
    startupSnapshot.sectorIndustry,
    startupSnapshot.sectorIndustryGroup,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (fields.length === 0) return [];

  const matches: string[] = [];
  for (const thesis of theses) {
    for (const breaker of thesis.dealBreakers ?? []) {
      const trimmedBreaker = breaker.trim();
      if (!trimmedBreaker) continue;
      if (!fields.some((field) => matchesTermInField(field, trimmedBreaker))) continue;
      matches.push(`${DEALBREAKER_REASON_PREFIX}${trimmedBreaker}`);
    }
  }

  return dedupeStrings(matches);
}

export const ScreeningDecisionSchema = z.object({
  id: z.string().uuid(),
  startupId: z.string().uuid(),
  pipelineRunId: z.string().nullable(),
  classification: TriageLensSignalSchema,
  nextAction: TriageNextActionSchema,
  overallScore: z.number().int().min(0).max(100),
  reasonCodes: z.array(z.string()),
  lensSnapshot: z.array(TriageLensInputSchema),
  /**
   * Active lens versions at decision time (DS-E2-F1-S2). Empty object on
   * pre-S2 rows; one entry per logical lens key otherwise.
   */
  lensVersions: TriageLensVersionsSchema,
  policyVersion: z.number().int().min(1),
  createdAt: z.string().datetime(),
});
export type ScreeningDecision = z.infer<typeof ScreeningDecisionSchema>;

interface TriageOutcome {
  classification: TriageLensSignal;
  overallScore: number;
  reasonCodes: string[];
}

interface CanonicalTriageOutcome {
  classification: TriageLensSignal;
  nextAction: TriageNextAction;
  reasonCodes: string[];
}

/**
 * Returns true when the lens's evidence is too thin to justify an `advance`
 * verdict. A lens with no `evidence` array supplied is trusted as-is (the
 * evidence gate is opt-in for callers that have evidence info).
 */
function hasThinEvidence(lens: TriageLensInput): boolean {
  if (!lens.evidence) return false;
  if (lens.evidence.length < MIN_ADVANCE_EVIDENCE_COUNT) return true;
  const hasHighConfidence = lens.evidence.some((e) => e.confidence === "high");
  return !hasHighConfidence;
}

/**
 * Pure triage policy — no I/O. Exported so unit tests and dry-runs can
 * exercise the formula without touching the DB.
 *
 * `thesisFitScore` (DS-E4-F1-S1) is optional. When supplied below the
 * out-of-scope threshold, the function short-circuits to a hard reject
 * regardless of lens signals.
 */
export function applyTriagePolicy(
  lenses: TriageLensInput[],
  options?: { thesisFitScore?: number | null; dealbreakerReasonCodes?: readonly string[] },
): TriageOutcome {
  const overallScore =
    lenses.length === 0
      ? 0
      : Math.round(lenses.reduce((sum, l) => sum + l.score, 0) / lenses.length);

  const dealbreakerReasonCodes = dedupeStrings(
    (options?.dealbreakerReasonCodes ?? [])
      .map((code) => code.trim())
      .filter((code) => code.length > 0),
  );
  if (dealbreakerReasonCodes.length > 0) {
    return {
      classification: "reject",
      overallScore,
      reasonCodes: dealbreakerReasonCodes,
    };
  }

  // DS-E4-F1-S1 — short-circuit out-of-scope deals before lens evaluation
  // even runs. Caller may pass null to opt out (e.g. when no investor
  // thesis is registered yet).
  const thesisFitScore = options?.thesisFitScore;
  if (
    thesisFitScore !== null &&
    thesisFitScore !== undefined &&
    thesisFitScore < OUT_OF_SCOPE_THESIS_THRESHOLD
  ) {
    return {
      classification: "reject",
      overallScore,
      reasonCodes: ["out_of_thesis_scope"],
    };
  }

  if (lenses.length === 0) {
    return {
      classification: "review",
      overallScore,
      reasonCodes: ["no_lens_signals"],
    };
  }

  // DS-E7-F2-S1 — evidence pre-pass. Any lens that says "advance" without
  // enough or strong-enough evidence gets quietly downgraded to "review"
  // before the main pipeline runs. This preserves auditability (the
  // original lens row still shows signal=advance) while preventing the
  // triage decision from auto-advancing on confident-but-empty output.
  const lowEvidenceKeys: string[] = [];
  const effectiveLenses = lenses.map((lens) => {
    if (lens.signal === "advance" && hasThinEvidence(lens)) {
      lowEvidenceKeys.push(lens.key);
      return { ...lens, signal: "review" as const };
    }
    return lens;
  });

  const rejecting = effectiveLenses.filter((l) => l.signal === "reject");

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

  // Synthetically-downgraded lenses (low_evidence) are NOT reported as
  // "lens.X.review" — the lens actually said advance; the downgrade is
  // a triage-policy decision. Report `low_evidence` instead so the
  // reason is unambiguous.
  const lowEvidenceSet = new Set(lowEvidenceKeys);
  const reviewing = effectiveLenses.filter(
    (l) => l.signal === "review" && !lowEvidenceSet.has(l.key),
  );
  const borderline = overallScore < ADVANCE_SCORE_THRESHOLD;

  if (reviewing.length > 0 || lowEvidenceKeys.length > 0 || borderline) {
    const reasonCodes: string[] = [
      ...reviewing.map((l) => `lens.${l.key}.review`),
      ...lowEvidenceKeys.map((key) => `lens.${key}.low_evidence`),
    ];
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

function canonicalizeDecision(
  outcome: TriageOutcome,
  missingMaterials: MissingMaterialCode[],
): CanonicalTriageOutcome {
  const canonical = resolveCanonicalScreeningOutcome({
    signal: outcome.classification,
    reasonCodes: outcome.reasonCodes,
    missingMaterials,
  });

  return {
    classification: canonical.signal,
    nextAction: canonical.nextAction,
    reasonCodes: canonical.reasonCodes,
  };
}

function buildMissingMaterials(
  input: MaterialsInput | null,
): MissingMaterialCode[] {
  return input ? detectMissingMaterials(input) : [];
}

@Injectable()
export class ScreeningTriageService {
  private readonly logger = new Logger(ScreeningTriageService.name);

  constructor(
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
  ) {}

  async decide(input: TriageDecideInput): Promise<ScreeningDecision> {
    const parsed = TriageDecideInputSchema.parse(input);
    const startupSnapshot = await this.fetchMaterialsInput(parsed.startupId);
    const dealbreakerReasonCodes = await this.fetchDealbreakerReasonCodes(
      startupSnapshot,
    );
    const outcome = applyTriagePolicy(parsed.lensResults, {
      thesisFitScore: parsed.thesisFitScore ?? null,
      dealbreakerReasonCodes,
    });
    const materials = buildMissingMaterials(startupSnapshot);
    const canonical = canonicalizeDecision(outcome, materials);
    const snapshot: ScreeningDecisionLensSnapshot[] = parsed.lensResults.map(
      ({ key, score, signal }) => ({ key, score, signal }),
    );

    const [row] = await this.drizzle.db
      .insert(screeningDecision)
      .values({
        startupId: parsed.startupId,
        pipelineRunId: parsed.pipelineRunId ?? null,
        classification: canonical.classification,
        overallScore: outcome.overallScore,
        reasonCodes: canonical.reasonCodes,
        lensSnapshot: snapshot,
        lensVersions: parsed.lensVersions ?? {},
        policyVersion: POLICY_VERSION,
      })
      .returning();

    if (!row) {
      throw new Error("ScreeningTriageService.decide: insert returned no row");
    }

    this.logger.log(
      `Triage v${POLICY_VERSION} startup=${parsed.startupId} → ${canonical.classification} (score=${outcome.overallScore}, reasons=${canonical.reasonCodes.join(",") || "-"}, next=${canonical.nextAction})`,
    );

    return this.toDecision(row, materials);
  }

  async latestForStartup(startupId: string): Promise<ScreeningDecision | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(screeningDecision)
      .where(eq(screeningDecision.startupId, startupId))
      .orderBy(desc(screeningDecision.createdAt))
      .limit(1);

    if (!row) return null;

    const materials = buildMissingMaterials(
      await this.fetchMaterialsInput(startupId),
    );
    return this.toDecision(row, materials);
  }

  private async fetchMaterialsInput(
    startupId: string,
  ): Promise<ScreeningStartupSnapshot | null> {
    const [row] = await this.drizzle.db
      .select({
        industry: startup.industry,
        sectorIndustry: startup.sectorIndustry,
        sectorIndustryGroup: startup.sectorIndustryGroup,
        pitchDeckUrl: startup.pitchDeckUrl,
        pitchDeckPath: startup.pitchDeckPath,
        productDescription: startup.productDescription,
        description: startup.description,
        teamMembers: startup.teamMembers,
        fundingTarget: startup.fundingTarget,
        valuation: startup.valuation,
        raiseType: startup.raiseType,
        website: startup.website,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);
    return row ?? null;
  }

  private async fetchDealbreakerReasonCodes(
    startupSnapshot: ScreeningStartupSnapshot | null,
  ): Promise<string[]> {
    if (!startupSnapshot) return [];

    const rows = await this.drizzle.db
      .select({ dealBreakers: investorThesis.dealBreakers })
      .from(investorThesis)
      .where(eq(investorThesis.isActive, true))
      .orderBy(desc(investorThesis.createdAt))
      .limit(1000);

    return collectDealbreakerReasonCodes(startupSnapshot, rows);
  }

  private toDecision(
    row: ScreeningDecisionRow,
    missingMaterials: MissingMaterialCode[],
  ): ScreeningDecision {
    const canonical = canonicalizeDecision(
      {
        classification: row.classification as TriageLensSignal,
        overallScore: row.overallScore,
        reasonCodes: row.reasonCodes,
      },
      missingMaterials,
    );

    return {
      id: row.id,
      startupId: row.startupId,
      pipelineRunId: row.pipelineRunId,
      classification: canonical.classification,
      nextAction: canonical.nextAction,
      overallScore: row.overallScore,
      reasonCodes: canonical.reasonCodes,
      lensSnapshot: row.lensSnapshot,
      lensVersions: row.lensVersions,
      policyVersion: row.policyVersion,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
