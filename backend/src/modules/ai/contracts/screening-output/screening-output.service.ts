import { Injectable, Logger, Optional } from "@nestjs/common";
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
  type MaterialsInput,
} from "./missing-materials";
import { resolveCanonicalScreeningOutcome } from "./screening-outcome";
import type {
  ScreeningEvidence,
  ScreeningEvidenceConfidence,
  ScreeningHandoff,
  ScreeningHandoffEvidence,
  ScreeningHandoffIssue,
  ScreeningLensV1,
  ScreeningOutputV1,
  ScreeningOverallV1,
  ScreeningSignal,
} from "./v1.schema";
import type {
  ScreeningLensScoreV2,
  ScreeningOutputV2,
} from "./v2.schema";
import type {
  ScreeningDealbreakerObservation,
  ScreeningOutputV3,
  ScreeningOverallConfidence,
} from "./v3.schema";
import type { ThesisFitOutput } from "../../schemas/thesis-fit.schema";
import { normalizeLensEvidenceLink } from "../../schemas/lens";
import { PipelineStateService } from "../../services/pipeline-state.service";
import { PipelinePhase } from "../../interfaces/pipeline.interface";

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

  constructor(
    private readonly drizzle: DrizzleService,
    @Optional() private readonly pipelineState?: PipelineStateService,
  ) {}

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
   * DS-E10-F1 — v3 contract with hydrated DB inputs. Same hydration path as
   * `buildForStartup` but routes through `buildV3` so callers get the
   * dealbreakersObserved / reasoning / confidence additions.
   *
   * `thesisFit` defaults to null because the live persisted decision row
   * carries thesis-fit on a sibling column; supply it explicitly when you
   * need it — the rest of the contract is correct without it.
   */
  async buildForStartupV3(
    startupId: string,
    pipelineRunId?: string | null,
    thesisFit: ThesisFitOutput | null = null,
  ): Promise<ScreeningOutputV3> {
    const runId = pipelineRunId ?? null;
    const rows = await this.fetchRows(startupId, runId);
    const latestPerLens = this.pickLatestPerLens(rows);
    const materials = await this.fetchMaterialsInput(startupId);
    const decision = await this.fetchDecisionSnapshot(startupId, runId);
    return this.buildV3(
      startupId,
      runId,
      latestPerLens,
      materials,
      decision,
      thesisFit,
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
    if (!row) return null;

    // DS-E7-F4 part (c) — pull the deck's traction snapshot from the live
    // extraction phase result when available. `tractionSnapshot` stays
    // `undefined` when we couldn't inspect the deck (no PipelineStateService
    // injected OR no cached extraction); the materials checker treats that
    // as "no signal in either direction" and skips the `traction_data` flag.
    // We only emit a concrete object (possibly with all-null fields) when
    // we DID inspect the extraction and it had a traction block.
    const materials: MaterialsInput = { ...row };
    if (this.pipelineState) {
      try {
        const extraction = await this.pipelineState.getPhaseResult(
          startupId,
          PipelinePhase.EXTRACTION,
        );
        const deck = (extraction as { deckStructuredData?: unknown } | null | undefined)
          ?.deckStructuredData as
          | {
              traction?: {
                customers?: string | null;
                users?: string | null;
                churnRate?: string | null;
                notableClaims?: string[];
              };
            }
          | undefined;
        if (deck) {
          materials.tractionSnapshot = deck.traction
            ? {
                customers: deck.traction.customers ?? null,
                users: deck.traction.users ?? null,
                churnRate: deck.traction.churnRate ?? null,
                notableClaims: deck.traction.notableClaims ?? [],
              }
            : null;
        }
      } catch {
        // Pipeline state cache miss is non-fatal — silent miss path above.
      }
    }

    return materials;
  }

  private async fetchDecisionSnapshot(
    startupId: string,
    pipelineRunId: string | null,
  ): Promise<
    | {
        signal: ScreeningSignal;
        score: number;
        reasonCodes: string[];
        thesisFit: ThesisFitOutput | null;
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
        thesisFit: screeningDecision.thesisFit,
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
      thesisFit: (row.thesisFit as ThesisFitOutput) ?? null,
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
    decision: { signal: ScreeningSignal; score: number; reasonCodes: string[]; thesisFit?: ThesisFitOutput | null } | null,
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
      thesisFit: decision?.thesisFit ?? null,
    };
  }

  /**
   * Build a v2 ScreeningOutput. Identical to v1's shape on the inherited
   * fields, with `thesisFit` (nullable when no thesis was on file) and
   * `lensScores` (compact roll-up keyed by lens) added on top.
   *
   * Pulled out as a separate method so v1 callers stay on the frozen
   * contract; new callers (Screening UI, DD handoff post-PR4) opt in to v2.
   */
  buildV2(
    startupId: string,
    pipelineRunId: string | null,
    rows: StartupLensResult[],
    materials: MaterialsInput | null,
    decision: { signal: ScreeningSignal; score: number; reasonCodes: string[] } | null,
    thesisFit: ThesisFitOutput | null,
  ): ScreeningOutputV2 {
    const v1 = this.assemble(
      startupId,
      pipelineRunId,
      rows,
      materials,
      decision,
    );
    const lensScores: ScreeningLensScoreV2[] = v1.lenses
      .filter((l): l is ScreeningLensV1 & { key: "market" | "team" | "traction" } =>
        l.key === "market" || l.key === "team" || l.key === "traction",
      )
      .map((l) => ({
        key: l.key,
        score: l.score,
        signal: l.signal,
        rationale: l.rationale,
      }));
    return {
      ...v1,
      version: 2,
      thesisFit,
      lensScores,
    };
  }

  /**
   * DS-E10-F1 — v3 closes the typed-contract gaps: dealbreakersObserved[],
   * reasoning, and overall confidence. v2 stays the default `latest` for now
   * so existing callers don't break; opt in by calling buildV3 explicitly.
   */
  buildV3(
    startupId: string,
    pipelineRunId: string | null,
    rows: StartupLensResult[],
    materials: MaterialsInput | null,
    decision: { signal: ScreeningSignal; score: number; reasonCodes: string[] } | null,
    thesisFit: ThesisFitOutput | null,
  ): ScreeningOutputV3 {
    const v2 = this.buildV2(
      startupId,
      pipelineRunId,
      rows,
      materials,
      decision,
      thesisFit,
    );
    const reasonCodes = decision?.reasonCodes ?? [];
    return {
      ...v2,
      version: 3,
      dealbreakersObserved: buildDealbreakersObserved(reasonCodes),
      reasoning: this.buildOverallReasoning(v2, reasonCodes),
      confidence: v2.overall.confidence,
    };
  }

  /**
   * One-paragraph narrative summarising the verdict. Pulls the strongest
   * per-lens rationale + the leading reason codes so the consumer doesn't
   * have to scan the lens array to know what the verdict means.
   */
  private buildOverallReasoning(
    v2: ScreeningOutputV2,
    reasonCodes: string[],
  ): string {
    const verdictLabel = v2.overall.signal.toUpperCase();
    const pickedLens =
      v2.lenses.find((l) => l.signal === "reject") ??
      v2.lenses.find((l) => l.signal === "review") ??
      v2.lenses.find((l) => l.signal === "advance");
    const lensSnippet = pickedLens
      ? `${pickedLens.key}: ${truncate(pickedLens.rationale, 200)}`
      : "no per-lens rationale available";
    const topCodes = reasonCodes.slice(0, 4).join(", ");
    const codeSuffix = topCodes ? ` Reason codes: ${topCodes}.` : "";
    const score = v2.overall.score;
    const overall = `Overall score ${score}/100, verdict ${verdictLabel}.`;
    return truncate(`${overall} ${lensSnippet}.${codeSuffix}`, 1200);
  }

  /**
   * Roll up per-lens evidence into a single Low/Med/High band. Uses the
   * same EVIDENCE_CONFIDENCE_WEIGHTS shape the triage policy uses so the
   * contract's confidence agrees with the F7-F2 gate decision.
   */
  private deriveOverallConfidence(
    lenses: readonly ScreeningLensV1[],
  ): ScreeningOverallConfidence {
    const items = lenses.flatMap((l) => l.evidence);
    if (items.length === 0) return "low";
    const weight = (c: ScreeningEvidenceConfidence): number =>
      c === "high" ? 1 : c === "medium" ? 0.5 : 0.2;
    const avg =
      items.reduce((sum, e) => sum + weight(e.confidence), 0) / items.length;
    if (avg >= 0.8) return "high";
    if (avg >= 0.5) return "medium";
    return "low";
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
          sourceType?: unknown;
          sourceLabel?: unknown;
          sourceRef?: unknown;
          url?: unknown;
          pageNumber?: unknown;
          quote?: unknown;
        };
        const source =
          typeof candidate.source === "string" ? candidate.source.trim() : undefined;
        const normalized = source ? normalizeLensEvidenceLink(source) : null;
        out.push({
          claim: candidate.claim,
          source,
          confidence:
            candidate.confidence === "low" ||
            candidate.confidence === "medium" ||
            candidate.confidence === "high"
              ? candidate.confidence
              : "low",
          sourceType:
            typeof candidate.sourceType === "string"
              ? (candidate.sourceType as ScreeningEvidence["sourceType"])
              : normalized?.sourceType,
          sourceLabel:
            typeof candidate.sourceLabel === "string"
              ? candidate.sourceLabel
              : normalized?.sourceLabel,
          sourceRef:
            typeof candidate.sourceRef === "string"
              ? candidate.sourceRef
              : normalized?.sourceRef,
          url: typeof candidate.url === "string" ? candidate.url : normalized?.url,
          pageNumber:
            typeof candidate.pageNumber === "number"
              ? candidate.pageNumber
              : normalized?.pageNumber,
          quote: typeof candidate.quote === "string" ? candidate.quote : undefined,
        });
      }
    }
    return out;
  }

  /**
   * v1 aggregation policy:
   *   - score: use the persisted triage score when available; otherwise fall
   *     back to the simple unweighted average of lens scores.
   *   - signal: canonicalize the triage classification only from screening
   *     judgment. Required document checks belong to Epic 113 Data Gates after
   *     a deal advances into DD, never to DS.
   *   - nextAction: shared user-facing action derived from the canonical state.
   */
  private computeOverall(
    lenses: ScreeningLensV1[],
    _materials: MaterialsInput | null,
    decision: { signal: ScreeningSignal; score: number; reasonCodes: string[] } | null,
  ): ScreeningOverallV1 {
    const canonicalBase = decision ?? this.computeFallbackDecision(lenses);
    const canonical = resolveCanonicalScreeningOutcome({
      signal: canonicalBase.signal,
      reasonCodes: canonicalBase.reasonCodes,
      missingMaterials: [],
    });

    return {
      score: canonicalBase.score,
      signal: canonical.signal,
      nextAction: canonical.nextAction,
      confidence: this.deriveOverallConfidence(lenses),
      missingMaterials: canonical.missingMaterials,
    };
  }

  private buildHandoff(
    lenses: ScreeningLensV1[],
    overall: ScreeningOverallV1,
    decision: { signal?: string; reasonCodes: string[] } | null,
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
          sourceType: evidence.sourceType,
          sourceLabel: evidence.sourceLabel,
          sourceRef: evidence.sourceRef,
          url: evidence.url,
          pageNumber: evidence.pageNumber,
          quote: evidence.quote,
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
    decision: { signal?: string; reasonCodes: string[] } | null,
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

    if (decision?.signal && decision.signal !== "advance" && decision.reasonCodes.length) {
      for (const code of decision.reasonCodes) {
        if (code === "missing_materials") continue;
        push({
          key: `decision:${code}`,
          label: this.buildReasonCodeFollowUpLabel(code),
          summary: this.buildReasonCodeFollowUpSummary(code),
          source: "triage-decision",
        });
      }
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
      evidence_claims: "Source-linked evidence (≥3 claims)",
      traction_data: "Early traction data",
    };

    return labels[value] ?? this.formatLensLabel(value);
  }

  private buildReasonCodeFollowUpLabel(code: string): string {
    const lensMatch = code.match(
      /^lens\.([^.]+)\.(reject|review|low_evidence|low_confidence_evidence)$/,
    );
    if (lensMatch) {
      const lensLabel = this.formatLensLabel(lensMatch[1]);
      const suffix =
        lensMatch[2] === "reject"
          ? "blocker"
          : lensMatch[2] === "review"
            ? "needs follow-up"
            : lensMatch[2] === "low_evidence"
              ? "needs more evidence"
              : "needs stronger evidence";
      return `${lensLabel} ${suffix}`;
    }

    const dealbreakerMatch = code.match(/^dealbreaker:(.+)$/i);
    if (dealbreakerMatch) {
      return `Dealbreaker hit: ${dealbreakerMatch[1].trim()}`;
    }

    return this.labelForReasonCode(code);
  }

  private buildReasonCodeFollowUpSummary(code: string): string {
    const lensMatch = code.match(
      /^lens\.([^.]+)\.(reject|review|low_evidence|low_confidence_evidence)$/,
    );
    if (lensMatch) {
      const lensLabel = this.formatLensLabel(lensMatch[1]);
      switch (lensMatch[2]) {
        case "reject":
          return `${lensLabel} remains a screening blocker.`;
        case "review":
          return `${lensLabel} still needs follow-up before DD can rely on it.`;
        case "low_evidence":
          return `${lensLabel} needs more evidence before DD can rely on it.`;
        case "low_confidence_evidence":
          return `${lensLabel} evidence is below the confidence floor — DD needs stronger-sourced claims before this advances.`;
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

// DS-E10-F1 helpers — pulled out of the class so the v3 builder + tests
// can call them without instantiating the service.

const BOUNDARY_CODE_LABELS: Record<string, string> = {
  out_of_stage: "Stage outside thesis boundary",
  out_of_scope: "Industry outside thesis boundary",
  out_of_geo: "Geography outside thesis boundary",
};

/**
 * Parse the triage decision's `reason_codes[]` into a typed array of
 * dealbreaker observations. The four kinds correspond to the four
 * sources that emit reject signals today:
 *
 *  - boundary  → DS-E4-F1 out_of_stage / out_of_scope / out_of_geo
 *  - portfolio → DS-E4-F2 portfolio_conflict:<name>
 *  - tag       → DS-E4-F4 dealbreaker:<term> (excluding structured)
 *  - structured → DS-E4-F3 dealbreaker:structured:<rule-id>:<action>
 *
 * Anything outside this taxonomy (lens.* codes, score gate codes,
 * missing materials) is intentionally not surfaced — those are
 * advisory, not dealbreakers.
 */
export function buildDealbreakersObserved(
  reasonCodes: readonly string[],
): ScreeningDealbreakerObservation[] {
  const observations: ScreeningDealbreakerObservation[] = [];
  for (const raw of reasonCodes) {
    const code = raw.trim();
    if (!code) continue;

    // 1. Structured rules. Format: dealbreaker:structured:<rule-id>:<action>
    if (code.startsWith("dealbreaker:structured:")) {
      const tail = code.slice("dealbreaker:structured:".length);
      const lastColon = tail.lastIndexOf(":");
      const ruleId = lastColon >= 0 ? tail.slice(0, lastColon) : tail;
      const action = lastColon >= 0 ? tail.slice(lastColon + 1) : "reject";
      observations.push({
        code,
        kind: "structured",
        label: `Structured rule "${ruleId}" matched`,
        ref: ruleId,
        action: action === "require_override" ? "require_override" : "reject",
      });
      continue;
    }

    // 2. Generic dealbreaker tags. Format: dealbreaker:<term>
    if (code.startsWith("dealbreaker:")) {
      const term = code.slice("dealbreaker:".length).trim();
      observations.push({
        code,
        kind: "tag",
        label: `Matches dealbreaker term "${term}"`,
        ref: term || null,
        action: "reject",
      });
      continue;
    }

    // 3. Portfolio conflicts. Format: portfolio_conflict:<name>
    if (code.startsWith("portfolio_conflict:")) {
      const name = code.slice("portfolio_conflict:".length).trim();
      observations.push({
        code,
        kind: "portfolio",
        label: name
          ? `Conflicts with portfolio company "${name}"`
          : "Conflicts with an existing portfolio company",
        ref: name || null,
        action: "reject",
      });
      continue;
    }

    // 4. Thesis-boundary codes (DS-E4-F1).
    if (code in BOUNDARY_CODE_LABELS) {
      observations.push({
        code,
        kind: "boundary",
        label: BOUNDARY_CODE_LABELS[code]!,
        ref: code.replace(/^out_of_/, ""),
        action: "reject",
      });
      continue;
    }
  }
  return observations;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}
