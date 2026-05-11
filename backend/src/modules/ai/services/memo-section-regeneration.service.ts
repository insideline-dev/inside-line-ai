import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DrizzleService } from "../../../database";
import { startupEvaluation } from "../../analysis/entities";
import { MEMO_SECTION_ORDER } from "../agents/synthesis/synthesis-chunk.config";
import {
  MemoSynthesisAgent,
  type MemoSectionRegenerationResult,
} from "../agents/synthesis/memo-synthesis.agent";
import type { EvaluationAgentKey } from "../interfaces/agent.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import type {
  EvaluationResult,
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
} from "../interfaces/phase-results.interface";
import type { MemoChunkSection } from "../schemas/memo-synthesis.schema";
import { PipelineStateService } from "./pipeline-state.service";
import { ScoreComputationService } from "./score-computation.service";

export interface PersistedMemoSectionSource {
  label: string;
  url: string;
}

export interface PersistedMemoSection {
  title: string;
  content: string;
  highlights?: string[];
  concerns?: string[];
  sources?: PersistedMemoSectionSource[];
  // DG-E1-F1-S2: stable identifier and audit timestamp written by the
  // section-scoped regenerate endpoint. Older memos may lack these; readers
  // must tolerate `undefined`.
  sectionKey?: EvaluationAgentKey;
  regeneratedAt?: string;
}

export interface PersistedInvestorMemo {
  executiveSummary?: string;
  sections?: PersistedMemoSection[];
  keyDueDiligenceAreas?: string[];
}

export interface RegenerateMemoSectionResult {
  startupId: string;
  sectionKey: EvaluationAgentKey;
  section: PersistedMemoSection;
  regeneratedAt: string;
  usedFallback: boolean;
  /**
   * True when the regenerated section overwrote operator edits in the same
   * section — the UI should confirm this with the user before invoking.
   * Today the memo has no per-section edit affordance, so this is always
   * false unless a prior `regeneratedAt` exists (signal that operator-driven
   * regenerations happened in this section).
   */
  overwroteOperatorEdits: boolean;
}

export interface ApplyOperatorRewriteOptions {
  /** Verbatim operator-edited section narrative. */
  newContent: string;
  /**
   * Optional source override. When omitted, the existing section's
   * `sources` array is preserved unchanged — load-bearing for the
   * inline-edit acceptance flow (DG-E1-F3-S1) where citation linkage
   * must survive the rewrite. Pass [] only to deliberately strip
   * sources.
   */
  sources?: PersistedMemoSectionSource[];
}

export interface ApplyOperatorRewriteResult {
  startupId: string;
  sectionKey: EvaluationAgentKey;
  section: PersistedMemoSection;
  regeneratedAt: string;
  overwroteOperatorEdits: boolean;
}

/**
 * Section-scoped memo regeneration (DG-E1-F1-S2).
 *
 * Re-runs the memo synthesis prompt for a single section and writes ONLY
 * that section's fields back into `startup_evaluations.investor_memo`. Other
 * sections, executive summary, and due-diligence areas survive the call so
 * operator edits elsewhere are preserved.
 *
 * Idempotency is enforced with an in-memory mutex keyed by
 * `(startupId, sectionKey)` — concurrent calls for the same key are
 * rejected with 409. Different sections on the same startup may run in
 * parallel; this is a deliberate choice to keep the operator flow snappy.
 */
@Injectable()
export class MemoSectionRegenerationService {
  private readonly logger = new Logger(MemoSectionRegenerationService.name);
  // The mutex guards both `regenerate` and `applyOperatorRewrite` for the
  // same (startupId, sectionKey). Stored as unknown-typed promises so the
  // single map can track both flavors of in-flight work — only the
  // membership check matters for race protection.
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly pipelineState: PipelineStateService,
    private readonly memoAgent: MemoSynthesisAgent,
    private readonly scoreComputation: ScoreComputationService,
  ) {}

  /** True if a regeneration is currently running for the given key. */
  isInFlight(startupId: string, sectionKey: EvaluationAgentKey): boolean {
    return this.inFlight.has(this.flightKey(startupId, sectionKey));
  }

  async regenerate(
    startupId: string,
    sectionKey: EvaluationAgentKey,
  ): Promise<RegenerateMemoSectionResult> {
    const sectionMeta = MEMO_SECTION_ORDER.find((s) => s.key === sectionKey);
    if (!sectionMeta) {
      throw new NotFoundException(`Unknown memo section: ${sectionKey}`);
    }

    const key = this.flightKey(startupId, sectionKey);
    const existing = this.inFlight.get(key);
    if (existing) {
      throw new ConflictException(
        `A regeneration for section "${sectionKey}" is already in progress for this startup. Wait for it to finish before retrying.`,
      );
    }

    const promise = this.runRegeneration(startupId, sectionKey, sectionMeta.title)
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * DG-E1-F3-S1 — persist an operator-accepted rewrite for a single memo
   * section. Skips the model call but reuses every guarantee
   * `regenerate()` provides: same in-flight mutex, same JSON-merge so
   * other sections / executive summary / DDAs survive, same
   * `overwroteOperatorEdits` semantics for downstream UI confirms.
   *
   * Citation linkage is preserved by default — when `options.sources` is
   * omitted we copy the existing section's `sources` forward verbatim.
   * The new `regeneratedAt` timestamp bumps so a subsequent regenerate
   * will surface the overwrite warning.
   */
  async applyOperatorRewrite(
    startupId: string,
    sectionKey: EvaluationAgentKey,
    options: ApplyOperatorRewriteOptions,
  ): Promise<ApplyOperatorRewriteResult> {
    const sectionMeta = MEMO_SECTION_ORDER.find((s) => s.key === sectionKey);
    if (!sectionMeta) {
      throw new NotFoundException(`Unknown memo section: ${sectionKey}`);
    }

    const trimmed = options.newContent.trim();
    if (trimmed.length === 0) {
      throw new NotFoundException(
        `Cannot apply rewrite for section "${sectionKey}" — newContent is empty.`,
      );
    }

    const key = this.flightKey(startupId, sectionKey);
    if (this.inFlight.has(key)) {
      throw new ConflictException(
        `A memo write for section "${sectionKey}" is already in progress for this startup. Wait for it to finish before retrying.`,
      );
    }

    const promise = this.runApplyOperatorRewrite(
      startupId,
      sectionKey,
      sectionMeta.title,
      trimmed,
      options.sources,
    ).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private async runApplyOperatorRewrite(
    startupId: string,
    sectionKey: EvaluationAgentKey,
    sectionTitle: string,
    newContent: string,
    sourcesOverride: PersistedMemoSectionSource[] | undefined,
  ): Promise<ApplyOperatorRewriteResult> {
    const existing = await this.loadEvaluationRow(startupId);
    if (!existing) {
      throw new NotFoundException(
        `Cannot apply rewrite for section "${sectionKey}" — startup evaluation row not found.`,
      );
    }

    const existingMemo =
      (existing.investorMemo as PersistedInvestorMemo | null) ?? null;
    const previousSection = this.findSectionInMemo(
      existingMemo,
      sectionKey,
      sectionTitle,
    );

    const sanitizedOverride = sourcesOverride?.filter(
      (s) => typeof s.url === "string" && s.url.trim().length > 0,
    );
    const preservedSources: PersistedMemoSectionSource[] =
      sanitizedOverride ?? previousSection?.sources ?? [];

    const regeneratedAt = new Date().toISOString();
    const nextSection: PersistedMemoSection = {
      title: previousSection?.title || sectionTitle,
      content: newContent,
      // Preserve operator-curated structural fields. Inline claim rewrite
      // changes prose only — highlights / concerns survive untouched
      // unless the operator-edit pipeline later supplies replacements.
      highlights: previousSection?.highlights ?? [],
      concerns: previousSection?.concerns ?? [],
      sources: preservedSources.map((s) => ({
        label: s.label && s.label.trim().length > 0 ? s.label : s.url,
        url: s.url,
      })),
      sectionKey,
      regeneratedAt,
    };

    const merged = this.mergeSection(
      existingMemo,
      sectionKey,
      sectionTitle,
      nextSection,
    );

    const overwroteOperatorEdits = Boolean(previousSection?.regeneratedAt);

    await this.drizzle.db
      .update(startupEvaluation)
      .set({
        investorMemo: merged as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(startupEvaluation.startupId, startupId));

    this.logger.log(
      `[MemoSectionRegen] Operator rewrite persisted | Startup: ${startupId} | Section: ${sectionKey} | Overwrote prior edits: ${overwroteOperatorEdits}`,
    );

    return {
      startupId,
      sectionKey,
      section: nextSection,
      regeneratedAt,
      overwroteOperatorEdits,
    };
  }

  private async runRegeneration(
    startupId: string,
    sectionKey: EvaluationAgentKey,
    sectionTitle: string,
  ): Promise<RegenerateMemoSectionResult> {
    const [extraction, scraping, research, evaluation, existing] =
      await Promise.all([
        this.pipelineState.getPhaseResult(startupId, PipelinePhase.EXTRACTION),
        this.pipelineState.getPhaseResult(startupId, PipelinePhase.SCRAPING),
        this.pipelineState.getPhaseResult(startupId, PipelinePhase.RESEARCH),
        this.pipelineState.getPhaseResult(startupId, PipelinePhase.EVALUATION),
        this.loadEvaluationRow(startupId),
      ]);

    if (!extraction || !scraping || !research || !evaluation) {
      throw new NotFoundException(
        `Cannot regenerate memo section "${sectionKey}" for startup ${startupId} — synthesis prerequisites are missing.`,
      );
    }
    if (!existing) {
      throw new NotFoundException(
        `Cannot regenerate memo section "${sectionKey}" — startup evaluation row not found.`,
      );
    }

    const stageWeights = await this.scoreComputation.getWeightsForStage(
      extraction.stage,
    );

    const agentResult = await this.memoAgent.regenerateSection(sectionKey, {
      extraction: extraction as ExtractionResult,
      scraping: scraping as ScrapingResult,
      research: research as ResearchResult,
      evaluation: evaluation as EvaluationResult,
      stageWeights: stageWeights as unknown as Record<string, number>,
    });

    const persistedSection = this.toPersistedSection(
      sectionKey,
      sectionTitle,
      agentResult,
    );

    const merged = this.mergeSection(
      (existing.investorMemo as PersistedInvestorMemo | null) ?? null,
      sectionKey,
      sectionTitle,
      persistedSection,
    );

    const previousSection = this.findSectionInMemo(
      existing.investorMemo as PersistedInvestorMemo | null,
      sectionKey,
      sectionTitle,
    );
    const overwroteOperatorEdits = Boolean(previousSection?.regeneratedAt);

    await this.drizzle.db
      .update(startupEvaluation)
      .set({
        investorMemo: merged as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(startupEvaluation.startupId, startupId));

    this.logger.log(
      `[MemoSectionRegen] Persisted | Startup: ${startupId} | Section: ${sectionKey} | Fallback: ${agentResult.usedFallback}`,
    );

    return {
      startupId,
      sectionKey,
      section: persistedSection,
      regeneratedAt: persistedSection.regeneratedAt ?? new Date().toISOString(),
      usedFallback: agentResult.usedFallback,
      overwroteOperatorEdits,
    };
  }

  private async loadEvaluationRow(startupId: string) {
    const [row] = await this.drizzle.db
      .select({ investorMemo: startupEvaluation.investorMemo })
      .from(startupEvaluation)
      .where(eq(startupEvaluation.startupId, startupId))
      .limit(1);
    return row ?? null;
  }

  // Convert the agent's `MemoChunkSection` shape into the persisted memo
  // section shape (`{title, content, highlights, concerns, sources}` +
  // section-regen metadata). Evidence linkage: only sources with a non-empty
  // url survive; matches the agent's own sanitization.
  private toPersistedSection(
    sectionKey: EvaluationAgentKey,
    sectionTitle: string,
    agentResult: MemoSectionRegenerationResult,
  ): PersistedMemoSection {
    const section = agentResult.section as MemoChunkSection;
    return {
      title: section.title || sectionTitle,
      content: section.memoNarrative,
      highlights: section.highlights ?? [],
      concerns: section.concerns ?? [],
      sources: (section.sources ?? [])
        .filter((s) => typeof s.url === "string" && s.url.trim().length > 0)
        .map((s) => ({
          label: s.label && s.label.trim().length > 0 ? s.label : s.url,
          url: s.url,
        })),
      sectionKey,
      regeneratedAt: new Date().toISOString(),
    };
  }

  /**
   * Merge a freshly-regenerated section into the existing `investorMemo`
   * JSON without disturbing anything else. Match priority:
   *  1. Existing section with the same `sectionKey` (preferred — set on
   *     prior regenerations).
   *  2. Existing section whose title normalizes to the regenerated section's
   *     title (legacy memos pre-DG-E1-F1-S2 have no sectionKey).
   *  3. Append (rare — happens if the original memo didn't include this key).
   */
  private mergeSection(
    existingMemo: PersistedInvestorMemo | null,
    sectionKey: EvaluationAgentKey,
    sectionTitle: string,
    next: PersistedMemoSection,
  ): PersistedInvestorMemo {
    const base: PersistedInvestorMemo = existingMemo ?? {};
    const sections: PersistedMemoSection[] = Array.isArray(base.sections)
      ? base.sections.map((s) => ({ ...s }))
      : [];

    const normalizedTarget = this.normalizeTitle(sectionTitle);

    let targetIndex = sections.findIndex(
      (s) => s.sectionKey === sectionKey,
    );
    if (targetIndex < 0) {
      targetIndex = sections.findIndex(
        (s) => this.normalizeTitle(s.title) === normalizedTarget,
      );
    }

    if (targetIndex >= 0) {
      sections[targetIndex] = next;
    } else {
      sections.push(next);
    }

    return {
      executiveSummary: base.executiveSummary,
      sections,
      keyDueDiligenceAreas: base.keyDueDiligenceAreas,
    };
  }

  private findSectionInMemo(
    memo: PersistedInvestorMemo | null,
    sectionKey: EvaluationAgentKey,
    sectionTitle: string,
  ): PersistedMemoSection | null {
    if (!memo?.sections) return null;
    const byKey = memo.sections.find((s) => s.sectionKey === sectionKey);
    if (byKey) return byKey;
    const normalizedTarget = this.normalizeTitle(sectionTitle);
    return (
      memo.sections.find(
        (s) => this.normalizeTitle(s.title) === normalizedTarget,
      ) ?? null
    );
  }

  private normalizeTitle(value: string | undefined | null): string {
    if (typeof value !== "string") return "";
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  private flightKey(startupId: string, sectionKey: EvaluationAgentKey): string {
    return `${startupId}::${sectionKey}`;
  }
}
