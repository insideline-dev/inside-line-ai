import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DrizzleService } from "../../database";
import {
  screeningDecision,
  type ScreeningDecisionLensSnapshot,
  type ScreeningDecisionThesisFit,
} from "../ai/entities/screening-decision.schema";
import { startupLensResult } from "../ai/entities/lens-result.schema";
import {
  ThesisFitService,
  type InvestorThesisInput,
  type StartupProfileInput,
} from "../ai/agents/thesis-fit";
import { investorThesis } from "./entities/investor.schema";
import { startup } from "../startup/entities/startup.schema";

export type Verdict = "review" | "advance" | "reject";

export interface ScreeningQueueLensScore {
  key: "market" | "team" | "traction";
  label: string;
  score: number;
  signal: string;
  /** First line of rationale (truncated) — used as the card subtitle. */
  note?: string;
  /** Full prose rationale — surfaced on the detail page. */
  rationale?: string;
}

export interface ScreeningQueueRow {
  id: string;
  companyName: string;
  industry: string | null;
  stage: string | null;
  /** Raw website URL; favicon resolution happens client-side with chained CDN fallbacks. */
  website: string | null;
  /** Public URL to the pitch deck PDF. */
  pitchDeckUrl: string | null;
  /** Storage-bucket path to the pitch deck. */
  pitchDeckPath: string | null;
  /** Short founder-supplied description (used on the detail page). */
  description: string | null;
  /** Round size in USD, if known. */
  fundingTarget: number | null;
  /** Country/region the company is based in. */
  location: string | null;
  verdict: Verdict;
  overallScore: number;
  fit: ScreeningDecisionThesisFit | null;
  lensScores: ScreeningQueueLensScore[];
  triageRationale: string;
  reasonCodes: string[];
  submittedAt: string;
  dealbreakerNote: string | null;
}

const LENS_LABELS: Record<string, string> = {
  market: "Market",
  team: "Team",
  traction: "Traction",
};

export function isVerdict(value: string): value is Verdict {
  return value === "review" || value === "advance" || value === "reject";
}

/**
 * Build the short triage rationale shown at the bottom of the modal.
 * - Drops `missing_materials` entirely — for screening, the deck being
 *   absent is not a useful signal; the question is "is this worth the
 *   investor's time?", and the lens prompts already treat missing deck
 *   as low-confidence evidence, not a rejection criterion.
 * - Prefers the thesis-fit rationale when available (it is the AI's own
 *   compact summary across all axes).
 * - Falls back to a humanised lens-flag summary when no fit object exists.
 */
export function buildTriageRationale(
  codes: string[],
  fit: ScreeningDecisionThesisFit | null,
): string {
  if (fit?.rationale && fit.rationale.trim().length > 0) {
    return fit.rationale.trim();
  }
  const interesting = codes.filter((c) => c !== "missing_materials");
  if (interesting.length === 0) return "All lens signals are aligned.";
  return interesting
    .map((code) => {
      if (code.startsWith("lens.")) {
        const [, lens, verdict] = code.split(".");
        return `${LENS_LABELS[lens] ?? lens} lens ${verdict ?? "flagged"}`;
      }
      return code.replace(/_/g, " ");
    })
    .join(" · ");
}


const BOUNDARY_CODE_LABELS: Record<string, string> = {
  out_of_stage: "Stage is outside this investor's thesis",
  out_of_scope: "Industry is outside this investor's thesis",
  out_of_geo: "Geography is outside this investor's thesis",
};

export function dealbreakerNoteFromReasonCodes(codes: string[]): string | null {
  // Only surface genuine thesis dealbreakers/exclusions — not lens evaluation
  // outcomes (lens.*.reject). Lens results are surfaced in the lens write-up
  // cards, not as a banner note.
  //
  // Priority: structural boundary violations first (DS-E4-F1), then explicit
  // dealbreaker tags (DS-E4-F3).
  const boundaryCode = codes.find((c) => c in BOUNDARY_CODE_LABELS);
  if (boundaryCode) return BOUNDARY_CODE_LABELS[boundaryCode]!;

  const breaker = codes.find(
    (c) =>
      !c.startsWith("lens.") &&
      (c.includes("dealbreaker") || c.includes("exclusion")),
  );
  return breaker ? breaker.replace(/_/g, " ") : null;
}

@Injectable()
export class ScreeningQueueService {
  private readonly logger = new Logger(ScreeningQueueService.name);

  constructor(
    private drizzle: DrizzleService,
    private thesisFit: ThesisFitService,
  ) {}

  /**
   * Returns the investor's screening triage queue: every startup they submitted
   * (or that's been routed to them) that has at least one triage decision, with
   * its latest classification + lens snapshot + lens rationales.
   *
   * No new pipeline runs here — this surfaces what the existing screening
   * processor already writes to `screening_decision` + `startup_lens_result`.
   * Thesis-fit per-axis output is `null` until ThesisFitService is wired into
   * the pipeline (planned follow-up); the UI shows a "fit pending" state.
   */
  /**
   * Investor scope: only startups owned by the calling investor.
   * Admin scope (allStartups=true): every startup in the DB, irrespective of
   * owner. Admin surface is the global screening dashboard.
   */
  async getQueue(
    investorUserId: string,
    options?: { allStartups?: boolean },
  ): Promise<ScreeningQueueRow[]> {
    const db = this.drizzle.db;

    // Latest screening_decision per startup, restricted to startups owned by
    // this investor. We use a window function + filter rather than a Drizzle
    // subquery so the join stays compact.
    interface DecisionRow {
      startup_id: string;
      pipeline_run_id: string | null;
      decision_id: string;
      classification: string;
      overall_score: number;
      reason_codes: string[];
      lens_snapshot: ScreeningDecisionLensSnapshot[];
      thesis_fit: ScreeningDecisionThesisFit | null;
      created_at: Date;
      startup_name: string;
      startup_stage: string | null;
      startup_location: string | null;
      startup_description: string | null;
      startup_website: string | null;
      industry: string | null;
      sector_industry: string | null;
      funding_target: number | null;
      pitch_deck_url: string | null;
      pitch_deck_path: string | null;
      submitted_at: Date;
    }
    const decisionRows = (await db.execute(sql`
      with latest as (
        select distinct on (sd.startup_id)
          sd.id as decision_id,
          sd.startup_id,
          sd.pipeline_run_id,
          sd.classification,
          sd.overall_score,
          sd.reason_codes,
          sd.lens_snapshot,
          sd.thesis_fit,
          sd.created_at
        from screening_decision sd
        order by sd.startup_id, sd.created_at desc
      )
      select
        l.decision_id,
        l.startup_id,
        l.pipeline_run_id,
        l.classification,
        l.overall_score,
        l.reason_codes,
        l.lens_snapshot,
        l.thesis_fit,
        l.created_at,
        s.name as startup_name,
        s.stage as startup_stage,
        s.location as startup_location,
        s.description as startup_description,
        s.industry,
        s.sector_industry,
        s.website as startup_website,
        s.funding_target,
        s.pitch_deck_url,
        s.pitch_deck_path,
        s.created_at as submitted_at
      from latest l
      join startups s on s.id = l.startup_id
      where ${options?.allStartups ? sql`true` : sql`s.user_id = ${investorUserId}`}
      order by s.created_at desc
    `)) as unknown as DecisionRow[] | { rows: DecisionRow[] };

    const rows: DecisionRow[] = Array.isArray(decisionRows)
      ? decisionRows
      : (decisionRows.rows ?? []);
    if (rows.length === 0) return [];

    const startupIds = rows.map((r) => r.startup_id);
    const pipelineRunIds = rows
      .map((r) => r.pipeline_run_id)
      .filter((v): v is string => Boolean(v));

    // Per-lens rationale lookup for the (startup, pipelineRun) pairs we care
    // about. The `lens_snapshot` JSONB on screening_decision has score/signal
    // but not the prose rationale — we pull that from `startup_lens_result`.
    const lensRows = await db
      .select({
        startupId: startupLensResult.startupId,
        pipelineRunId: startupLensResult.pipelineRunId,
        lensKey: startupLensResult.lensKey,
        score: startupLensResult.score,
        signal: startupLensResult.signal,
        rationale: startupLensResult.rationale,
      })
      .from(startupLensResult)
      .where(
        and(
          inArray(startupLensResult.startupId, startupIds),
          pipelineRunIds.length > 0
            ? inArray(startupLensResult.pipelineRunId, pipelineRunIds)
            : sql`true`,
        ),
      )
      .orderBy(desc(startupLensResult.createdAt));

    const lensByPair = new Map<
      string,
      Map<string, { score: number; signal: string; rationale: string }>
    >();
    for (const row of lensRows) {
      const pairKey = `${row.startupId}::${row.pipelineRunId ?? ""}`;
      if (!lensByPair.has(pairKey)) lensByPair.set(pairKey, new Map());
      const inner = lensByPair.get(pairKey)!;
      if (!inner.has(row.lensKey)) {
        inner.set(row.lensKey, {
          score: row.score,
          signal: row.signal,
          rationale: row.rationale,
        });
      }
    }

    // Pull investor thesis once — needed for lazy fit backfill.
    const [thesisRow] = await db
      .select()
      .from(investorThesis)
      .where(eq(investorThesis.userId, investorUserId))
      .limit(1);

    const out: ScreeningQueueRow[] = [];
    for (const r of rows) {
      const verdict = isVerdict(r.classification) ? r.classification : "review";
      const pairKey = `${r.startup_id}::${r.pipeline_run_id ?? ""}`;
      const lensMap = lensByPair.get(pairKey) ?? new Map();
      const lensScores: ScreeningQueueLensScore[] = (r.lens_snapshot ?? []).map(
        (snap: ScreeningDecisionLensSnapshot) => {
          const detail = lensMap.get(snap.key);
          return {
            key: (snap.key as ScreeningQueueLensScore["key"]) ?? "market",
            label: LENS_LABELS[snap.key] ?? snap.key,
            score: snap.score,
            signal: snap.signal,
            note: detail?.rationale.split("\n")[0]?.slice(0, 140),
            rationale: detail?.rationale,
          };
        },
      );

      // Screening intentionally does NOT surface missing materials.
      // The question at this stage is "is this worth the investor's time?";
      // a missing deck is handled by the lens prompts (low-confidence
      // evidence, not auto-reject) and a Due Diligence concern.
      const reasonCodes = (r.reason_codes ?? []).filter(
        (c) => c !== "missing_materials",
      );

      let fit: ScreeningDecisionThesisFit | null = r.thesis_fit;
      if (!fit && thesisRow) {
        try {
          fit = await this.computeAndPersistFit(
            r.decision_id,
            thesisRow,
            r,
          );
        } catch (err) {
          this.logger.warn(
            `[ScreeningQueue] thesis-fit backfill failed for startup ${r.startup_id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      out.push({
        id: r.startup_id,
        companyName: r.startup_name,
        industry: r.sector_industry ?? r.industry ?? null,
        stage: r.startup_stage,
        website: r.startup_website,
        pitchDeckUrl: r.pitch_deck_url,
        pitchDeckPath: r.pitch_deck_path,
        description: r.startup_description,
        fundingTarget: r.funding_target,
        location: r.startup_location,
        verdict,
        overallScore: r.overall_score,
        fit,
        lensScores,
        triageRationale: buildTriageRationale(reasonCodes, fit),
        reasonCodes,
        submittedAt:
          r.submitted_at instanceof Date
            ? r.submitted_at.toISOString()
            : String(r.submitted_at),
        dealbreakerNote: dealbreakerNoteFromReasonCodes(reasonCodes),
      });
    }
    return out;
  }

  /**
   * Lazy backfill: call ThesisFitService for a decision that pre-dates the
   * thesis_fit column (or had a transient failure). Persists the result back
   * so subsequent reads are instant.
   */
  private async computeAndPersistFit(
    decisionId: string,
    thesisRow: { industries: string[] | null; stages: string[] | null; checkSizeMin: number | null; checkSizeMax: number | null; geographicFocus: string[] | null; businessModels: string[] | null; mustHaveFeatures: string[] | null; dealBreakers: string[] | null; thesisNarrative: string | null },
    decision: {
      startup_name: string;
      startup_stage: string | null;
      startup_location: string | null;
      startup_description: string | null;
      industry: string | null;
      sector_industry: string | null;
      funding_target: number | null;
    },
  ): Promise<ScreeningDecisionThesisFit> {
    const thesisInput: InvestorThesisInput = {
      industries: thesisRow.industries,
      stages: thesisRow.stages,
      checkSizeMin: thesisRow.checkSizeMin,
      checkSizeMax: thesisRow.checkSizeMax,
      geographicFocus: thesisRow.geographicFocus,
      businessModels: thesisRow.businessModels,
      mustHaveFeatures: thesisRow.mustHaveFeatures,
      dealBreakers: thesisRow.dealBreakers,
      thesisNarrative: thesisRow.thesisNarrative,
    };
    const startupInput: StartupProfileInput = {
      companyName: decision.startup_name,
      industry: decision.sector_industry ?? decision.industry,
      stage: decision.startup_stage,
      geography: decision.startup_location,
      checkContext: decision.funding_target
        ? `raising $${decision.funding_target.toLocaleString()}`
        : null,
      classification: {
        sector: decision.sector_industry,
        industry: decision.industry,
        stage: decision.startup_stage,
      },
      additionalSignals: decision.startup_description,
    };
    const fit = await this.thesisFit.assess(thesisInput, startupInput);
    await this.drizzle.db
      .update(screeningDecision)
      .set({ thesisFit: fit })
      .where(eq(screeningDecision.id, decisionId));
    return fit;
  }
}
