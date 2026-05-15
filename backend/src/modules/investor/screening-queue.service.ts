import { Injectable } from "@nestjs/common";
import { and, desc, inArray, sql } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { type ScreeningDecisionLensSnapshot } from "../ai/entities/screening-decision.schema";
import { startupLensResult } from "../ai/entities/lens-result.schema";

export type Verdict = "review" | "advance" | "reject";

export interface ScreeningQueueLensScore {
  key: "market" | "team" | "traction";
  label: string;
  score: number;
  signal: string;
  note?: string;
}

export interface ScreeningQueueRow {
  id: string;
  companyName: string;
  industry: string | null;
  verdict: Verdict;
  overallScore: number;
  fit: null; // populated when ThesisFitService is wired into the pipeline (PR5b)
  lensScores: ScreeningQueueLensScore[];
  missingMaterials: string[];
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

function isVerdict(value: string): value is Verdict {
  return value === "review" || value === "advance" || value === "reject";
}

function rationaleFromReasonCodes(codes: string[]): string {
  if (codes.length === 0) return "Triage produced no reason codes.";
  return codes
    .map((code) => {
      if (code === "missing_materials") return "Materials still missing";
      if (code.startsWith("lens.")) {
        const [, lens, verdict] = code.split(".");
        return `${LENS_LABELS[lens] ?? lens} lens ${verdict ?? "flagged"}`;
      }
      return code.replace(/_/g, " ");
    })
    .join(" · ");
}

function dealbreakerNoteFromReasonCodes(codes: string[]): string | null {
  const breaker = codes.find(
    (c) =>
      c.includes("dealbreaker") ||
      c.includes("exclusion") ||
      c.endsWith(".reject"),
  );
  return breaker ? breaker.replace(/_/g, " ") : null;
}

@Injectable()
export class ScreeningQueueService {
  constructor(private drizzle: DrizzleService) {}

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
  async getQueue(investorUserId: string): Promise<ScreeningQueueRow[]> {
    const db = this.drizzle.db;

    // Latest screening_decision per startup, restricted to startups owned by
    // this investor. We use a window function + filter rather than a Drizzle
    // subquery so the join stays compact.
    interface DecisionRow {
      startup_id: string;
      pipeline_run_id: string | null;
      classification: string;
      overall_score: number;
      reason_codes: string[];
      lens_snapshot: ScreeningDecisionLensSnapshot[];
      created_at: Date;
      startup_name: string;
      industry: string | null;
      sector_industry: string | null;
      submitted_at: Date;
    }
    const decisionRows = (await db.execute(sql`
      with latest as (
        select distinct on (sd.startup_id)
          sd.startup_id,
          sd.pipeline_run_id,
          sd.classification,
          sd.overall_score,
          sd.reason_codes,
          sd.lens_snapshot,
          sd.created_at
        from screening_decision sd
        order by sd.startup_id, sd.created_at desc
      )
      select
        l.startup_id,
        l.pipeline_run_id,
        l.classification,
        l.overall_score,
        l.reason_codes,
        l.lens_snapshot,
        l.created_at,
        s.name as startup_name,
        s.industry,
        s.sector_industry,
        s.created_at as submitted_at
      from latest l
      join startups s on s.id = l.startup_id
      where s.user_id = ${investorUserId}
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

    return rows.map((r): ScreeningQueueRow => {
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
          };
        },
      );

      const reasonCodes = r.reason_codes ?? [];
      const missingMaterials = reasonCodes.includes("missing_materials")
        ? ["Pitch deck or supporting materials"]
        : [];

      return {
        id: r.startup_id,
        companyName: r.startup_name,
        industry: r.sector_industry ?? r.industry ?? null,
        verdict,
        overallScore: r.overall_score,
        fit: null,
        lensScores,
        missingMaterials,
        triageRationale: rationaleFromReasonCodes(reasonCodes),
        reasonCodes,
        submittedAt:
          r.submitted_at instanceof Date
            ? r.submitted_at.toISOString()
            : String(r.submitted_at),
        dealbreakerNote: dealbreakerNoteFromReasonCodes(reasonCodes),
      };
    });
  }
}
