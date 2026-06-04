import { Injectable, Logger, ForbiddenException, NotFoundException, Optional } from '@nestjs/common';
import { eq, and, gte, sql, inArray } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { startup, DataGateStatus } from './entities/startup.schema';
import { dataRoom } from './entities/data-room.schema';
import { investorThesis, startupMatch } from '../investor/entities/investor.schema';
import { PipelineService } from '../ai/services/pipeline.service';
import { PipelinePhase } from '../ai/interfaces/pipeline.interface';
import { DealEventService } from './deal-event.service';
import { OpenQuestionService } from '../dd/open-question.service';
import { UserRole, user } from '../../auth/entities/auth.schema';

export interface DataGateInfo {
  dataGateStatus: string | null;
  docRequestedAt: string | null;
  openQuestions: Array<{ id: string; summary: string; status: string }>;
  missingMaterials: string[];
  requiredDocTypes: string[];
  presentDocTypes: string[];
  founderEmail: string | null;
}

export type DataGateAutoAdvanceResult =
  | { status: 'not_pending' }
  | { status: 'no_investor_context' }
  | { status: 'no_thesis' }
  | { status: 'auto_advance_disabled'; missingMaterials: string[] }
  | { status: 'no_required_docs' }
  | { status: 'advanced' }
  | { status: 'already_advanced' }
  | { status: 'missing_docs_pending'; missingMaterials: string[] };

@Injectable()
export class DataGateService {
  private readonly logger = new Logger(DataGateService.name);

  constructor(
    private drizzle: DrizzleService,
    private dealEvents: DealEventService,
    private openQuestionService: OpenQuestionService,
    @Optional() private pipelineCoreService?: PipelineService,
  ) {}

  async assertOwnership(
    startupId: string,
    userId: string,
    role?: UserRole,
  ): Promise<void> {
    if (role === UserRole.ADMIN) return;

    const [row] = await this.drizzle.db
      .select({ userId: startup.userId })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row) throw new NotFoundException(`Startup ${startupId} not found`);
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not have access to this startup');
    }
  }

  /**
   * Resolves the investor whose thesis governs this deal's data gate.
   *
   * The gate is conceptually per-(startup, acting-investor). A startup usually
   * has many active matches, so we cannot just pick an arbitrary one — we must
   * honour the investor who is actually acting on the deal when the caller knows
   * them (the investor advancing from screening, or the investor a Clara
   * conversation belongs to).
   *
   * Resolution order:
   *   1. actingInvestorId — if supplied and that investor has an active match for
   *      this startup OR owns the startup (self-submission) → use it.
   *   2. startup.userId — if the submitter is themselves an investor
   *      (self-submitted private deal, no startupMatch row) → use it.
   *   3. Most-advanced active match (engaged → reviewing → new).
   *   4. null — no investor context (e.g. admin viewing an unmatched deal).
   */
  private async resolveOwningInvestorId(
    startupId: string,
    actingInvestorId?: string | null,
  ): Promise<string | null> {
    const matches = await this.drizzle.db
      .select({ investorId: startupMatch.investorId, status: startupMatch.status })
      .from(startupMatch)
      .where(
        and(
          eq(startupMatch.startupId, startupId),
          inArray(startupMatch.status, ['engaged', 'reviewing', 'new']),
        ),
      );

    const [startupRow] = await this.drizzle.db
      .select({ userId: startup.userId })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);
    const ownerUserId = startupRow?.userId ?? null;

    // (1) Acting investor wins when they actually participate in this deal.
    if (actingInvestorId) {
      const hasMatch = matches.some((m) => m.investorId === actingInvestorId);
      if (hasMatch || actingInvestorId === ownerUserId) {
        return actingInvestorId;
      }
    }

    // (2) Self-submission: the submitter is themselves an investor.
    if (ownerUserId && (await this.isInvestor(ownerUserId))) {
      return ownerUserId;
    }

    // (3) Fall back to the most-advanced active match.
    if (matches.length > 0) {
      const priority: Record<string, number> = { engaged: 0, reviewing: 1, new: 2 };
      const [top] = [...matches].sort(
        (a, b) => (priority[a.status] ?? 99) - (priority[b.status] ?? 99),
      );
      return top.investorId;
    }

    // (4) No investor context.
    return null;
  }

  private async isInvestor(userId: string): Promise<boolean> {
    const [row] = await this.drizzle.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return row?.role === UserRole.INVESTOR;
  }

  async getDataGateInfo(
    startupId: string,
    viewerUserId: string,
    viewerRole?: UserRole,
  ): Promise<DataGateInfo> {
    const [row] = await this.drizzle.db
      .select({
        dataGateStatus: startup.dataGateStatus,
        docRequestedAt: startup.docRequestedAt,
        contactEmail: startup.contactEmail,
        userId: startup.userId,
        pitchDeckPath: startup.pitchDeckPath,
        pitchDeckUrl: startup.pitchDeckUrl,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row) throw new NotFoundException(`Startup ${startupId} not found`);

    const founderEmail = await this.resolveFounderEmail(
      row.contactEmail,
      row.userId,
    );

    // A non-admin viewer IS the investor acting on this deal. Admin viewers have
    // no acting-investor context, so resolution falls back to self-submission /
    // most-advanced match.
    const actingInvestorId =
      viewerRole === UserRole.ADMIN ? undefined : viewerUserId;
    const investorId = await this.resolveOwningInvestorId(
      startupId,
      actingInvestorId,
    );

    const [thesis] = investorId
      ? await this.drizzle.db
          .select({ requiredDocTypes: investorThesis.requiredDocTypes })
          .from(investorThesis)
          .where(eq(investorThesis.userId, investorId))
          .limit(1)
      : [];

    const requiredDocTypes = thesis?.requiredDocTypes ?? ['pitch_deck', 'financial'];

    const docs = await this.drizzle.db
      .select({ category: dataRoom.category })
      .from(dataRoom)
      .where(
        and(
          eq(dataRoom.startupId, startupId),
          eq(dataRoom.classificationStatus, 'completed'),
        ),
      );

    // The originally-submitted pitch deck lives on the startup record (not the
    // data room table), so count it as a present `pitch_deck` document too.
    const hasSubmittedDeck = Boolean(row.pitchDeckPath || row.pitchDeckUrl);
    const presentDocTypes = [
      ...new Set([
        ...docs.map((d) => d.category),
        ...(hasSubmittedDeck ? ['pitch_deck'] : []),
      ]),
    ];
    const missingMaterials = requiredDocTypes.filter(
      (req) => !presentDocTypes.includes(req),
    );

    let openQuestions: DataGateInfo['openQuestions'] = [];
    try {
      const qs = await this.openQuestionService.listForStartup(
        startupId,
        viewerUserId,
        viewerRole,
      );
      openQuestions = qs.map((q) => ({
        id: q.id,
        summary: q.summary,
        status: q.status,
      }));
    } catch {
      // open questions may not exist for all deals
    }

    return {
      dataGateStatus: row.dataGateStatus,
      docRequestedAt: row.docRequestedAt?.toISOString() ?? null,
      openQuestions,
      missingMaterials,
      requiredDocTypes,
      presentDocTypes,
      founderEmail,
    };
  }

  /**
   * Resolves the founder email the document request will be sent to. Mirrors
   * ClaraService.resolveMissingInfoRecipient so the surfaced value matches what
   * Clara will actually use: prefer the startup's contact email, else fall back
   * to the owner account's email; null when neither is a valid address.
   */
  private async resolveFounderEmail(
    contactEmail: string | null,
    ownerUserId: string | null,
  ): Promise<string | null> {
    const normalizedContact = contactEmail?.trim().toLowerCase() ?? null;
    if (normalizedContact && this.isValidEmail(normalizedContact)) {
      return normalizedContact;
    }

    if (!ownerUserId) return null;

    const [owner] = await this.drizzle.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, ownerUserId))
      .limit(1);

    const ownerEmail = owner?.email?.trim().toLowerCase() ?? null;
    if (ownerEmail && this.isValidEmail(ownerEmail)) {
      return ownerEmail;
    }

    return null;
  }

  private isValidEmail(value: string): boolean {
    return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
  }

  async skip(startupId: string, userId: string): Promise<void> {
    // Ensure the startup exists so we can still surface a 404 even when the gate
    // has already advanced.
    await this.assertStartupExists(startupId);

    // Compare-and-swap: only transition (and fire the DD pipeline) when the gate
    // is genuinely PENDING. Re-invoking on an already-advanced gate is a no-op,
    // preventing a double DD pipeline run.
    const [updated] = await this.drizzle.db
      .update(startup)
      .set({ dataGateStatus: DataGateStatus.SKIPPED })
      .where(
        and(
          eq(startup.id, startupId),
          eq(startup.dataGateStatus, DataGateStatus.PENDING),
        ),
      )
      .returning({ id: startup.id });

    if (!updated) return;

    void this.dealEvents.record({
      startupId,
      actorUserId: userId,
      type: 'due_diligence.data_gate_skipped',
      payload: {},
    });

    await this.triggerDdPipeline(startupId, userId);
  }

  async complete(startupId: string, userId: string): Promise<void> {
    await this.assertStartupExists(startupId);

    const [updated] = await this.drizzle.db
      .update(startup)
      .set({ dataGateStatus: DataGateStatus.COMPLETE })
      .where(
        and(
          eq(startup.id, startupId),
          eq(startup.dataGateStatus, DataGateStatus.PENDING),
        ),
      )
      .returning({ id: startup.id });

    if (!updated) return;

    void this.dealEvents.record({
      startupId,
      actorUserId: userId,
      type: 'due_diligence.data_gate_complete',
      payload: {},
    });

    await this.triggerDdPipeline(startupId, userId);
  }

  private async assertStartupExists(startupId: string): Promise<void> {
    const [row] = await this.drizzle.db
      .select({ id: startup.id })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);
    if (!row) throw new NotFoundException(`Startup ${startupId} not found`);
  }

  async checkAutoAdvance(
    startupId: string,
    actingInvestorId?: string | null,
  ): Promise<DataGateAutoAdvanceResult> {
    const [row] = await this.drizzle.db
      .select({
        dataGateStatus: startup.dataGateStatus,
        docRequestedAt: startup.docRequestedAt,
        contactEmail: startup.contactEmail,
        userId: startup.userId,
        pitchDeckPath: startup.pitchDeckPath,
        pitchDeckUrl: startup.pitchDeckUrl,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row || row.dataGateStatus !== DataGateStatus.PENDING) {
      return { status: 'not_pending' };
    }

    // Resolve the investor whose thesis governs the gate. When the caller knows
    // the acting investor (advancing from screening, Clara conversation owner)
    // we honour it; otherwise we fall back to self-submission / match lookup.
    const investorId = await this.resolveOwningInvestorId(
      startupId,
      actingInvestorId,
    );

    if (!investorId) return { status: 'no_investor_context' };

    const [thesis] = await this.drizzle.db
      .select({
        requiredDocTypes: investorThesis.requiredDocTypes,
        autoAdvanceDataGate: investorThesis.autoAdvanceDataGate,
      })
      .from(investorThesis)
      .where(eq(investorThesis.userId, investorId))
      .limit(1);

    if (!thesis) return { status: 'no_thesis' };

    const requiredDocTypes = thesis.requiredDocTypes ?? ['pitch_deck', 'financial'];
    if (requiredDocTypes.length === 0) return { status: 'no_required_docs' };

    const docs = await this.drizzle.db
      .select({ category: dataRoom.category })
      .from(dataRoom)
      .where(
        and(
          eq(dataRoom.startupId, startupId),
          eq(dataRoom.classificationStatus, 'completed'),
        ),
      );

    const presentCategories = new Set(docs.map((d) => d.category));
    // The originally-submitted pitch deck lives on the startup record, not the
    // data room table — count it so the gate doesn't flag it as missing.
    if (row.pitchDeckPath || row.pitchDeckUrl) presentCategories.add('pitch_deck');
    const missingMaterials = requiredDocTypes.filter(
      (req) => !presentCategories.has(req),
    );
    const allPresent = missingMaterials.length === 0;

    if (!thesis.autoAdvanceDataGate && !allPresent) {
      return { status: 'auto_advance_disabled', missingMaterials };
    }

    if (allPresent) {
      if (!thesis.autoAdvanceDataGate) {
        return { status: 'auto_advance_disabled', missingMaterials: [] };
      }

      const [advanced] = await this.drizzle.db
        .update(startup)
        .set({ dataGateStatus: DataGateStatus.COMPLETE })
        .where(
          and(
            eq(startup.id, startupId),
            eq(startup.dataGateStatus, DataGateStatus.PENDING),
          ),
        )
        .returning({ id: startup.id });

      if (!advanced) {
        this.logger.debug(
          `[DataGate] Auto-advance skipped for ${startupId} — already advanced by another thread`,
        );
        return { status: 'already_advanced' };
      }

      this.logger.log(
        `[DataGate] Auto-advancing startup ${startupId} — all required doc types present`,
      );

      void this.dealEvents.record({
        startupId,
        actorUserId: investorId,
        type: 'due_diligence.data_gate_complete',
        payload: { trigger: 'auto_advance' },
      });

      await this.triggerDdPipeline(startupId, investorId);
      return { status: 'advanced' };
    }

    return { status: 'missing_docs_pending', missingMaterials };
  }

  private async hasNewDocsSinceExtraction(startupId: string): Promise<boolean> {
    const [row] = await this.drizzle.db
      .select({ lastExtractionAt: startup.lastExtractionAt })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row?.lastExtractionAt) return true;

    // `lastExtractionAt` is stamped when the extraction phase STARTS (see
    // onPhaseStarted in pipeline.service.ts), so any doc uploaded during a run
    // has uploadedAt >= the stamp and is conservatively treated as new — it is
    // never silently skipped. `gte` (not `gt`) errs toward re-extracting on the
    // boundary where uploadedAt exactly equals the stamp.
    const [result] = await this.drizzle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(dataRoom)
      .where(
        and(
          eq(dataRoom.startupId, startupId),
          gte(dataRoom.uploadedAt, row.lastExtractionAt),
        ),
      );

    return (result?.count ?? 0) > 0;
  }

  private async triggerDdPipeline(
    startupId: string,
    userId: string,
  ): Promise<void> {
    if (!this.pipelineCoreService) {
      this.logger.warn(`[DataGate] PipelineService not available — cannot start DD pipeline for ${startupId}`);
      return;
    }

    const needsReExtraction = await this.hasNewDocsSinceExtraction(startupId);
    const startPhase = needsReExtraction
      ? PipelinePhase.CLASSIFICATION
      : PipelinePhase.RESEARCH;

    this.logger.log(
      `[DataGate] Starting DD pipeline for ${startupId} from ${startPhase}${needsReExtraction ? ' (new documents detected — re-extracting)' : ''}`,
    );

    try {
      await this.pipelineCoreService.rerunFromPhase(startupId, startPhase);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isStateMissing = /not found/i.test(message);
      if (!isStateMissing) {
        this.logger.error(
          `[DataGate] Failed to start DD pipeline for ${startupId}: ${message}`,
        );
        return;
      }

      try {
        await this.pipelineCoreService.startPipeline(startupId, userId);
      } catch (fallbackErr) {
        const fallbackMessage =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        this.logger.error(
          `[DataGate] Failed to start full pipeline for ${startupId}: ${fallbackMessage}`,
        );
      }
    }
  }
}
