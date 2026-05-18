import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DrizzleService } from "../../../../database";
import type { Env } from "../../../../config/env.schema";
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
 * Triage policy v4 — deliberately simple, transparent, and pluggable.
 *
 *   PRE-PASS — applied to each lens before the main pipeline. Both checks
 *   run on the ORIGINAL, unmodified lens signals so a lens that trips both
 *   the count rule AND the confidence rule emits both reason codes. The
 *   downgrades are applied after both checks resolve.
 *     a. **Evidence count** (DS-E7-F2-S1 v3): if a lens has
 *        signal === 'advance' and its evidence is thin
 *        (`evidenceCount < MIN_ADVANCE_EVIDENCE_COUNT` OR no item has
 *        `confidence === 'high'`), it is downgraded to 'review'.
 *        Reason code `lens.<key>.low_evidence` is recorded.
 *     b. **Confidence floor** (DS-E7-F2-S1 v4): if a lens has
 *        signal === 'advance' and its weighted evidence-confidence score
 *        (sum of per-item weights / count) falls below
 *        `ADVANCE_CONFIDENCE_FLOOR`, it is downgraded to 'review'.
 *        Reason code `lens.<key>.low_confidence_evidence` is recorded.
 *        Weights: `high=1.0`, `medium=0.5`, `low=0.2`. The floor is a
 *        tunable knob — see `SCREENING_ADVANCE_CONFIDENCE_FLOOR` env var.
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
 * Versioning:
 *  - v1 → v3: evidence pre-pass + thesis-scope short-circuit +
 *    backend-owned dealbreaker enforcement.
 *  - v3 → v4 (DS-E7-F2-S1): tunable evidence-confidence floor + canonical
 *    weighted-confidence formula; reason code `lens.<key>.low_confidence_evidence`
 *    introduced as a sibling of `lens.<key>.low_evidence`.
 *
 * Older `screening_decision` rows remain interpretable via their
 * `policyVersion` column.
 */
export const POLICY_VERSION = 4 as const;

/**
 * Per-confidence-tier weights used by the evidence-confidence floor check.
 * Exported so tests and admin tooling can reuse the canonical formula.
 *
 * Rationale (DS-E7-F2-S1): high = "directly observed, independently sourced",
 * medium = "second-hand or partially attested", low = "self-reported,
 * unverified". A medium-only lens earns 0.5 — just below the default floor of
 * 0.6 so the gate downgrades it without further tuning. A mixed lens with at
 * least one `high` per medium pulls back above the floor.
 */
export const EVIDENCE_CONFIDENCE_WEIGHTS = {
  high: 1.0,
  medium: 0.5,
  low: 0.2,
} as const satisfies Record<"low" | "medium" | "high", number>;

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
  /**
   * Default weighted-evidence-confidence score below which an `advance`
   * lens gets downgraded to `review`. Tunable via
   * `SCREENING_ADVANCE_CONFIDENCE_FLOOR` env var; the value here is the
   * documented fallback.
   */
  ADVANCE_CONFIDENCE_FLOOR: 0.6,
  EVIDENCE_CONFIDENCE_WEIGHTS,
} as const;

const {
  LOW_SCORE_THRESHOLD,
  ADVANCE_SCORE_THRESHOLD,
  OUT_OF_SCOPE_THESIS_THRESHOLD,
  MIN_ADVANCE_EVIDENCE_COUNT,
} = POLICY_SNAPSHOT;

const DEFAULT_ADVANCE_CONFIDENCE_FLOOR =
  POLICY_SNAPSHOT.ADVANCE_CONFIDENCE_FLOOR;

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
  /** User ID of the investor who owns this startup (used to fetch their thesis). */
  userId: string | null;
  industry: string | null;
  sectorIndustry: string | null;
  sectorIndustryGroup: string | null;
  /** Funding stage, e.g. 'seed', 'series_a'. */
  stage: string | null;
  /** Location string, e.g. 'Dubai, UAE'. */
  location: string | null;
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

/** Structured thesis boundaries for the startup-owner investor (DS-E4-F1). */
interface OwnerThesisBoundarySnapshot {
  stages: string[] | null;
  industries: string[] | null;
  geographicFocus: string[] | null;
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

/** Case-insensitive bidirectional substring match. */
function fuzzyMatchesAny(haystack: readonly string[], needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return false;
  return haystack.some((h) => {
    const hh = h.trim().toLowerCase();
    if (!hh) return false;
    return hh === n || hh.includes(n) || n.includes(hh);
  });
}

/**
 * DS-E4-F1: Deterministic structural thesis-boundary checks.
 * Returns reason codes for deals that fall outside the owner investor's
 * configured thesis dimensions (stage, industry, geography). Only fires
 * when the thesis dimension is explicitly configured (non-empty array) AND
 * the startup has a value for that field — never false-flags missing data.
 */
export function collectThesisBoundaryViolations(
  startupSnapshot: ScreeningStartupSnapshot | null,
  ownerThesis: OwnerThesisBoundarySnapshot | null,
): string[] {
  if (!startupSnapshot || !ownerThesis) return [];

  const violations: string[] = [];

  // Stage check: exact case-insensitive match (stage is a controlled enum).
  if (ownerThesis.stages && ownerThesis.stages.length > 0 && startupSnapshot.stage) {
    const stageMatch = ownerThesis.stages.some(
      (s) => s.trim().toLowerCase() === startupSnapshot.stage!.trim().toLowerCase(),
    );
    if (!stageMatch) {
      violations.push("out_of_stage");
    }
  }

  // Industry check: bidirectional fuzzy match handles taxonomy mismatches
  // (e.g. "B2B SaaS" vs "SaaS").
  if (ownerThesis.industries && ownerThesis.industries.length > 0) {
    const industryFields = [
      startupSnapshot.industry,
      startupSnapshot.sectorIndustry,
      startupSnapshot.sectorIndustryGroup,
    ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    if (industryFields.length > 0) {
      const industryMatch = industryFields.some((field) =>
        fuzzyMatchesAny(ownerThesis.industries!, field),
      );
      if (!industryMatch) {
        violations.push("out_of_scope");
      }
    }
  }

  // Geography check: bidirectional fuzzy match handles "GCC" ↔ "Dubai, UAE".
  if (
    ownerThesis.geographicFocus &&
    ownerThesis.geographicFocus.length > 0 &&
    startupSnapshot.location
  ) {
    const geoMatch = fuzzyMatchesAny(ownerThesis.geographicFocus, startupSnapshot.location);
    if (!geoMatch) {
      violations.push("out_of_geo");
    }
  }

  return violations;
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
 * Returns true when the lens's evidence is too thin (by count + at-least-one-
 * high-confidence rule) to justify an `advance` verdict. A lens with no
 * `evidence` array supplied is trusted as-is (the evidence gate is opt-in for
 * callers that have evidence info).
 */
function hasThinEvidence(lens: TriageLensInput): boolean {
  if (!lens.evidence) return false;
  if (lens.evidence.length < MIN_ADVANCE_EVIDENCE_COUNT) return true;
  const hasHighConfidence = lens.evidence.some((e) => e.confidence === "high");
  return !hasHighConfidence;
}

/**
 * Computes the weighted evidence-confidence score for a lens — `sum(weights) /
 * count`, where each item's weight comes from `EVIDENCE_CONFIDENCE_WEIGHTS`.
 * Returns `null` when the lens supplied no evidence array (caller decides what
 * to do; the floor gate treats null as "skip this check"). Returns `0` when
 * the array is empty, since "zero items" is itself a strong "no confidence"
 * signal.
 */
export function computeEvidenceConfidenceScore(
  lens: TriageLensInput,
): number | null {
  if (!lens.evidence) return null;
  if (lens.evidence.length === 0) return 0;
  const sum = lens.evidence.reduce(
    (acc, item) => acc + EVIDENCE_CONFIDENCE_WEIGHTS[item.confidence],
    0,
  );
  return sum / lens.evidence.length;
}

/**
 * Returns true when an `advance` lens fails the weighted-confidence floor
 * (DS-E7-F2-S1 v4). Lenses with no evidence array are trusted as-is so
 * pre-evidence callers stay backward-compatible.
 */
function hasLowConfidenceEvidence(
  lens: TriageLensInput,
  floor: number,
): boolean {
  const score = computeEvidenceConfidenceScore(lens);
  if (score === null) return false;
  return score < floor;
}

/**
 * Pure triage policy — no I/O. Exported so unit tests and dry-runs can
 * exercise the formula without touching the DB.
 *
 *  - `thesisFitScore` (DS-E4-F1-S1) is optional; below
 *    `OUT_OF_SCOPE_THESIS_THRESHOLD` short-circuits to reject.
 *  - `advanceConfidenceFloor` (DS-E7-F2-S1 v4) is the per-lens weighted
 *    evidence-confidence cutoff. Defaults to
 *    `POLICY_SNAPSHOT.ADVANCE_CONFIDENCE_FLOOR`. Pass an explicit value to
 *    A/B stricter or looser triage without touching the constant — the
 *    `ScreeningTriageService` reads
 *    `SCREENING_ADVANCE_CONFIDENCE_FLOOR` once at construction and threads
 *    it through here.
 */
export function applyTriagePolicy(
  lenses: TriageLensInput[],
  options?: {
    thesisFitScore?: number | null;
    dealbreakerReasonCodes?: readonly string[];
    advanceConfidenceFloor?: number;
  },
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

  // DS-E7-F2-S1 — evidence pre-pass. Two parallel checks operate on the
  // ORIGINAL `signal` (NOT the post-downgrade value) so a lens that trips
  // BOTH the count rule and the confidence-floor rule emits BOTH reason
  // codes. Apply the downgrade only after both checks resolve.
  const floor =
    options?.advanceConfidenceFloor ?? DEFAULT_ADVANCE_CONFIDENCE_FLOOR;
  const lowEvidenceKeys: string[] = [];
  const lowConfidenceKeys: string[] = [];
  const effectiveLenses = lenses.map((lens) => {
    if (lens.signal !== "advance") return lens;
    const thin = hasThinEvidence(lens);
    const lowConfidence = hasLowConfidenceEvidence(lens, floor);
    if (thin) lowEvidenceKeys.push(lens.key);
    if (lowConfidence) lowConfidenceKeys.push(lens.key);
    if (thin || lowConfidence) {
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

  // Synthetically-downgraded lenses (low_evidence / low_confidence_evidence)
  // are NOT reported as "lens.X.review" — the lens actually said advance;
  // the downgrade is a triage-policy decision. Report the explicit
  // downgrade code instead so the reason is unambiguous.
  const downgradedKeys = new Set([...lowEvidenceKeys, ...lowConfidenceKeys]);
  const reviewing = effectiveLenses.filter(
    (l) => l.signal === "review" && !downgradedKeys.has(l.key),
  );
  const borderline = overallScore < ADVANCE_SCORE_THRESHOLD;

  if (
    reviewing.length > 0 ||
    lowEvidenceKeys.length > 0 ||
    lowConfidenceKeys.length > 0 ||
    borderline
  ) {
    const reasonCodes: string[] = [
      ...reviewing.map((l) => `lens.${l.key}.review`),
      ...lowEvidenceKeys.map((key) => `lens.${key}.low_evidence`),
      ...lowConfidenceKeys.map(
        (key) => `lens.${key}.low_confidence_evidence`,
      ),
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
  /**
   * Resolved once at construction. Env-driven so funds can A/B stricter or
   * looser triage without a code change; the value falls back to
   * `POLICY_SNAPSHOT.ADVANCE_CONFIDENCE_FLOOR` when the env var is missing.
   * Kept off the per-request path so the triage policy itself stays pure.
   */
  private readonly advanceConfidenceFloor: number;

  constructor(
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
    config: ConfigService<Env, true>,
  ) {
    const configured = config.get<number>(
      "SCREENING_ADVANCE_CONFIDENCE_FLOOR",
      { infer: true },
    );
    this.advanceConfidenceFloor =
      typeof configured === "number" && Number.isFinite(configured)
        ? configured
        : DEFAULT_ADVANCE_CONFIDENCE_FLOOR;
  }

  async decide(input: TriageDecideInput): Promise<ScreeningDecision> {
    const parsed = TriageDecideInputSchema.parse(input);
    const startupSnapshot = await this.fetchMaterialsInput(parsed.startupId);
    const dealbreakerReasonCodes = await this.fetchDealbreakerReasonCodes(
      startupSnapshot,
    );
    const outcome = applyTriagePolicy(parsed.lensResults, {
      thesisFitScore: parsed.thesisFitScore ?? null,
      dealbreakerReasonCodes,
      advanceConfidenceFloor: this.advanceConfidenceFloor,
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
        userId: startup.userId,
        industry: startup.industry,
        sectorIndustry: startup.sectorIndustry,
        sectorIndustryGroup: startup.sectorIndustryGroup,
        stage: startup.stage,
        location: startup.location,
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

  /**
   * Fetch the owner investor's thesis boundaries for structural checks.
   * Returns null when the startup has no owner or owner has no thesis.
   */
  private async fetchOwnerThesisBoundary(
    ownerUserId: string | null,
  ): Promise<OwnerThesisBoundarySnapshot | null> {
    if (!ownerUserId) return null;
    const [row] = await this.drizzle.db
      .select({
        stages: investorThesis.stages,
        industries: investorThesis.industries,
        geographicFocus: investorThesis.geographicFocus,
      })
      .from(investorThesis)
      .where(eq(investorThesis.userId, ownerUserId))
      .limit(1);
    return row ?? null;
  }

  private async fetchDealbreakerReasonCodes(
    startupSnapshot: ScreeningStartupSnapshot | null,
  ): Promise<string[]> {
    if (!startupSnapshot) return [];

    // Explicit dealbreaker tag matching across all active investor theses.
    const rows = await this.drizzle.db
      .select({ dealBreakers: investorThesis.dealBreakers })
      .from(investorThesis)
      .where(eq(investorThesis.isActive, true))
      .orderBy(desc(investorThesis.createdAt))
      .limit(1000);

    const tagCodes = collectDealbreakerReasonCodes(startupSnapshot, rows);

    // DS-E4-F1 — structural thesis-boundary violations for the owner investor.
    const ownerThesis = await this.fetchOwnerThesisBoundary(startupSnapshot.userId);
    const boundaryCodes = collectThesisBoundaryViolations(startupSnapshot, ownerThesis);

    return dedupeStrings([...tagCodes, ...boundaryCodes]);
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
