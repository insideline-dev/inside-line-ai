import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DrizzleService } from "../../../../database";
import { LENS_FALLBACK_RATIONALE_PREFIX } from "../../lenses/base-lens.agent";
import {
  startupLensResult,
  type StartupLensResult,
} from "../../entities/lens-result.schema";
import { screeningDecision } from "../../entities/screening-decision.schema";
import { startup } from "../../../startup/entities/startup.schema";
import {
  detectMissingMaterials,
  type MaterialsInput,
} from "./missing-materials";
import { resolveCanonicalScreeningOutcome } from "./screening-outcome";
import type {
  ScreeningEvidence,
  ScreeningHandoff,
  ScreeningHandoffEvidence,
  ScreeningHandoffIssue,
  ScreeningLensV1,
  ScreeningOutputV1,
  ScreeningOverallV1,
  ScreeningSignal,
} from "./v1.schema";

/**
 * Builds the public {@link ScreeningOutputV1} contract from persisted
 * `startup_lens_result` rows.
 *
 * This service is intentionally the ONLY component allowed to bridge between
 * Screening's storage layer and the public DD-facing contract. Future schema
 * changes (lens weights, new signals, etc.) bump the contract version in a
 * sibling file; this builder learns the new shape, but DD code keeps consuming
 * v1 until it opts in.
 */
@Injectable()
export class ScreeningOutputService {
  private readonly logger = new Logger(ScreeningOutputService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Build a v1 ScreeningOutput for a startup. If `pipelineRunId` is supplied,
   * only rows from that run are considered; otherwise the most recent row per
   * lens key (across all runs) is used.
   *
   * Returns a contract even if zero lenses are present — the lens array will
   * be empty, overall.signal defaults to `review`, and overall.score to 0.
   * Callers wanting "no data" semantics should use {@link latestForStartup}.
   */
  async buildForStartup(
    startupId: string,
    pipelineRunId?: string | null,
  ): Promise<ScreeningOutputV1> {
    const runId = pipelineRunId ?? null;
    const rows = await this.fetchRows(startupId, runId);
    const latestPerLens = this.pickLatestPerLens(rows);
    const materials = await this.fetchMaterialsInput(startupId);
    const decision = await this.fetchDecisionSnapshot(startupId, runId);
    return this.assemble(
      startupId,
      runId,
      latestPerLens,
      materials,
      decision,
    );
  }

  /**
   * Returns the contract for the most recent pipeline run that produced at
   * least one lens row for this startup. Returns `null` when no rows exist.
   */
  async latestForStartup(
    startupId: string,
  ): Promise<ScreeningOutputV1 | null> {
    const rows = await this.fetchRows(startupId, null);
    if (rows.length === 0) {
      return null;
    }

    // Newest row wins; its pipelineRunId scopes the contract. Rows without a
    // run id (null) fall back to the cross-run "latest per lens" view.
    const newest = rows[0];
    const materials = await this.fetchMaterialsInput(startupId);
    if (newest.pipelineRunId) {
      const scoped = rows.filter(
        (row) => row.pipelineRunId === newest.pipelineRunId,
      );
      const latestPerLens = this.pickLatestPerLens(scoped);
      const decision = await this.fetchDecisionSnapshot(
        startupId,
        newest.pipelineRunId,
      );
      return this.assemble(
        startupId,
        newest.pipelineRunId,
        latestPerLens,
        materials,
        decision,
      );
    }

    const latestPerLens = this.pickLatestPerLens(rows);
    const decision = await this.fetchDecisionSnapshot(startupId, null);
    return this.assemble(startupId, null, latestPerLens, materials, decision);
  }

  /**
   * DS-E7-F4-S1 — fetch the minimal startup projection needed by the
   * missing-materials checker. Returns null when the startup is missing
   * (the contract still builds; missingMaterials surfaces "all" as missing
   * at that point — the screening pipeline shouldn't run for a deleted
   * startup but defensive default beats throwing).
   */
  private async fetchMaterialsInput(
    startupId: string,
  ): Promise<MaterialsInput | null> {
    const [row] = await this.drizzle.db
      .select({
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

  private async fetchDecisionSnapshot(
    startupId: string,
    pipelineRunId: string | null,
  ): Promise<
    | {
        signal: ScreeningSignal;
        score: number;
        reasonCodes: string[];
      }
    | null
  > {
    const where =
      pipelineRunId === null
        ? eq(screeningDecision.startupId, startupId)
        : and(
            eq(screeningDecision.startupId, startupId),
            eq(screeningDecision.pipelineRunId, pipelineRunId),
          );

    const [row] = await this.drizzle.db
      .select({
        classification: screeningDecision.classification,
        overallScore: screeningDecision.overallScore,
        reasonCodes: screeningDecision.reasonCodes,
      })
      .from(screeningDecision)
      .where(where)
      .orderBy(desc(screeningDecision.createdAt))
      .limit(1);

    if (!row) return null;

    return {
      signal: row.classification as ScreeningSignal,
      score: row.overallScore,
      reasonCodes: row.reasonCodes,
    };
  }

  private async fetchRows(
    startupId: string,
    pipelineRunId: string | null,
  ): Promise<StartupLensResult[]> {
    const where =
      pipelineRunId === null
        ? eq(startupLensResult.startupId, startupId)
        : and(
            eq(startupLensResult.startupId, startupId),
            eq(startupLensResult.pipelineRunId, pipelineRunId),
          );

    return this.drizzle.db
      .select()
      .from(startupLensResult)
      .where(where)
      .orderBy(desc(startupLensResult.createdAt));
  }

  private pickLatestPerLens(
    rows: StartupLensResult[],
  ): StartupLensResult[] {
    // Rows arrive newest-first; first occurrence per key is the latest.
    const seen = new Set<string>();
    const out: StartupLensResult[] = [];
    for (const row of rows) {
      if (seen.has(row.lensKey)) continue;
      seen.add(row.lensKey);
      out.push(row);
    }
    return out;
  }

  private assemble(
    startupId: string,
    pipelineRunId: string | null,
    rows: StartupLensResult[],
    materials: MaterialsInput | null,
    decision: { signal: ScreeningSignal; score: number; reasonCodes: string[] } | null,
  ): ScreeningOutputV1 {
    const lenses = rows.map((row) => this.toContractLens(row));
    const overall = this.computeOverall(lenses, materials, decision);
    return {
      version: 1,
      startupId,
      pipelineRunId,
      generatedAt: new Date().toISOString(),
      overall,
      handoff: this.buildHandoff(lenses, overall, decision),
      lenses,
    };
  }

  private toContractLens(row: StartupLensResult): ScreeningLensV1 {
    return {
      key: row.lensKey,
      score: row.score,
      signal: this.coerceSignal(row.signal),
      rationale: row.rationale,
      evidence: this.coerceEvidence(row.evidence),
      modelId: row.modelId,
      promptKey: row.promptKey,
      latencyMs: row.latencyMs,
      // The lens base class writes a stable prefix on synthetic fallback
      // outputs (see LENS_FALLBACK_RATIONALE_PREFIX) so we can detect them
      // without a dedicated column. DS-E2-F1-S2 will replace this with a
      // real boolean column on `startup_lens_result`.
      usedFallback: row.rationale.startsWith(LENS_FALLBACK_RATIONALE_PREFIX),
    };
  }

  private coerceSignal(raw: string): ScreeningSignal {
    if (raw === "advance" || raw === "review" || raw === "reject") {
      return raw;
    }
    // Defensive: persisted rows are written by the screening processor with a
    // validated enum, but a stray value should not crash DD callers.
    this.logger.warn(
      `[ScreeningOutput] Unknown lens signal '${raw}' — coercing to 'review'.`,
    );
    return "review";
  }

  private coerceEvidence(raw: unknown): ScreeningEvidence[] {
    if (!Array.isArray(raw)) return [];
    const out: ScreeningEvidence[] = [];
    for (const item of raw) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { claim?: unknown }).claim === "string"
      ) {
        const candidate = item as {
          claim: string;
          source?: unknown;
          confidence?: unknown;
        };
        out.push({
          claim: candidate.claim,
          source:
            typeof candidate.source === "string" ? candidate.source : undefined,
          confidence:
            candidate.confidence === "low" ||
            candidate.confidence === "medium" ||
            candidate.confidence === "high"
              ? candidate.confidence
              : "low",
        });
      }
    }
    return out;
  }

  /**
   * v1 aggregation policy:
   *   - score: use the persisted triage score when available; otherwise fall
   *     back to the simple unweighted average of lens scores.
   *   - signal: canonicalize the triage classification with the missing
   *     materials gate so the contract mirrors the decision and the UI gate.
   *   - nextAction: shared user-facing action derived from the same canonical
   *     state.
   */
  private computeOverall(
    lenses: ScreeningLensV1[],
    materials: MaterialsInput | null,
    decision: { signal: ScreeningSignal; score: number; reasonCodes: string[] } | null,
  ): ScreeningOverallV1 {
    const missingMaterials = materials ? detectMissingMaterials(materials) : [];
    const canonicalBase = decision ?? this.computeFallbackDecision(lenses);
    const canonical = resolveCanonicalScreeningOutcome({
      signal: canonicalBase.signal,
      reasonCodes: canonicalBase.reasonCodes,
      missingMaterials,
    });

    return {
      score: canonicalBase.score,
      signal: canonical.signal,
      nextAction: canonical.nextAction,
      missingMaterials: canonical.missingMaterials,
    };
  }

  private buildHandoff(
    lenses: ScreeningLensV1[],
    overall: ScreeningOverallV1,
    decision: { reasonCodes: string[] } | null,
  ): ScreeningHandoff {
    return {
      evidenceSeeds: this.collectEvidenceSeeds(lenses),
      openIssues: this.collectOpenIssues(lenses, overall, decision),
    };
  }

  private collectEvidenceSeeds(
    lenses: ScreeningLensV1[],
  ): ScreeningHandoffEvidence[] {
    const seen = new Set<string>();
    const rows: ScreeningHandoffEvidence[] = [];

    for (const lens of lenses) {
      const lensLabel = this.formatLensLabel(lens.key);

      for (const evidence of lens.evidence) {
        const claim = evidence.claim.trim();
        if (!claim) continue;

        const source = evidence.source?.trim() || undefined;
        const dedupeKey = [lens.key, claim.toLowerCase(), source?.toLowerCase() ?? ""].join("|");
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        rows.push({
          lensKey: lens.key,
          lensLabel,
          claim,
          source,
          confidence: evidence.confidence,
          lensScore: lens.score,
          signal: lens.signal,
        });
      }
    }

    return rows;
  }

  private collectOpenIssues(
    lenses: ScreeningLensV1[],
    overall: ScreeningOverallV1,
    decision: { reasonCodes: string[] } | null,
  ): ScreeningHandoffIssue[] {
    const seen = new Set<string>();
    const rows: ScreeningHandoffIssue[] = [];
    const push = (seed: ScreeningHandoffIssue) => {
      const dedupeKey = `${seed.label.toLowerCase()}|${seed.summary.toLowerCase()}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      rows.push(seed);
    };

    for (const code of overall.missingMaterials) {
      const label = this.formatMissingMaterialLabel(code);
      push({
        key: `missing:${code}`,
        label,
        summary: `${label} is still missing from screening.`,
        source: "screening-output",
      });
    }

    if (decision?.reasonCodes.length) {
      for (const code of decision.reasonCodes) {
        if (code === "missing_materials") continue;
        push({
          key: `decision:${code}`,
          label: this.buildReasonCodeFollowUpLabel(code),
          summary: this.buildReasonCodeFollowUpSummary(code),
          source: "triage-decision",
        });
      }
      return rows;
    }

    for (const lens of lenses) {
      if (lens.signal === "advance") continue;
      const label = this.formatLensLabel(lens.key);
      push({
        key: `lens:${lens.key}:${lens.signal}`,
        label,
        summary:
          lens.signal === "reject"
            ? `${label} is still a screening blocker.`
            : `${label} still needs follow-up before DD can rely on it.`,
        source: "screening-output",
      });
    }

    return rows;
  }

  private formatLensLabel(value: string): string {
    const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
    const overrides: Record<string, string> = {
      team: "Team",
      market: "Market",
      product: "Product",
      traction: "Traction",
      businessmodel: "Business Model",
      gtm: "Go-to-Market",
      financials: "Financials",
      competitiveadvantage: "Competitive Advantage",
      legal: "Legal",
      dealterms: "Deal Terms",
      exitpotential: "Exit Potential",
      synthesis: "Synthesis",
    };
    const override = overrides[normalized];
    if (override) return override;

    return value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private formatMissingMaterialLabel(value: string): string {
    const labels: Record<string, string> = {
      deck: "Pitch deck",
      product_description: "Product description",
      team: "Team info",
      deal_terms: "Deal terms",
      website: "Website",
    };

    return labels[value] ?? this.formatLensLabel(value);
  }

  private buildReasonCodeFollowUpLabel(code: string): string {
    const lensMatch = code.match(/^lens\.([^.]+)\.(reject|review|low_evidence)$/);
    if (lensMatch) {
      const lensLabel = this.formatLensLabel(lensMatch[1]);
      const suffix =
        lensMatch[2] === "reject"
          ? "blocker"
          : lensMatch[2] === "review"
            ? "needs follow-up"
            : "needs more evidence";
      return `${lensLabel} ${suffix}`;
    }

    const dealbreakerMatch = code.match(/^dealbreaker:(.+)$/i);
    if (dealbreakerMatch) {
      return `Dealbreaker hit: ${dealbreakerMatch[1].trim()}`;
    }

    return this.labelForReasonCode(code);
  }

  private buildReasonCodeFollowUpSummary(code: string): string {
    const lensMatch = code.match(/^lens\.([^.]+)\.(reject|review|low_evidence)$/);
    if (lensMatch) {
      const lensLabel = this.formatLensLabel(lensMatch[1]);
      switch (lensMatch[2]) {
        case "reject":
          return `${lensLabel} remains a screening blocker.`;
        case "review":
          return `${lensLabel} still needs follow-up before DD can rely on it.`;
        case "low_evidence":
          return `${lensLabel} needs more evidence before DD can rely on it.`;
      }
    }

    const dealbreakerMatch = code.match(/^dealbreaker:(.+)$/i);
    if (dealbreakerMatch) {
      const term = dealbreakerMatch[1].trim();
      return `Investor thesis excludes ${term ? `"${term}"` : "this dealbreaker"}.`;
    }

    switch (code) {
      case "low_overall_score":
        return "The overall screening score is still too low to treat the deal as cleared.";
      case "borderline_overall_score":
        return "The overall screening score is still in the review band.";
      case "missing_materials":
        return "Screening still needs the missing materials before it can be treated as complete.";
      case "out_of_thesis_scope":
        return "Confirm whether this startup fits the current investment thesis.";
      case "no_lens_signals":
        return "Screening did not produce enough usable lens signals yet.";
      default:
        return `${this.labelForReasonCode(code)} still needs follow-up.`;
    }
  }

  private labelForReasonCode(code: string): string {
    const labels: Record<string, string> = {
      low_overall_score: "Low overall score",
      borderline_overall_score: "Borderline scores",
      missing_materials: "Missing materials",
      out_of_thesis_scope: "Out of thesis scope",
      no_lens_signals: "No lens signals",
    };

    return labels[code] ?? code.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private computeFallbackDecision(
    lenses: ScreeningLensV1[],
  ): { signal: ScreeningSignal; score: number; reasonCodes: string[] } {
    if (lenses.length === 0) {
      return { signal: "review", score: 0, reasonCodes: ["no_lens_signals"] };
    }

    const total = lenses.reduce((sum, lens) => sum + lens.score, 0);
    const score = Math.round(total / lenses.length);

    let signal: ScreeningSignal = "advance";
    for (const lens of lenses) {
      if (lens.signal === "reject") {
        signal = "reject";
        break;
      }
      if (lens.signal === "review") {
        signal = "review";
      }
    }

    const reasonCodes: string[] = [];
    if (signal === "review" && score < 60) {
      reasonCodes.push("borderline_overall_score");
    }

    return { signal, score, reasonCodes };
  }
}
