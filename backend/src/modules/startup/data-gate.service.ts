import { Injectable, Logger, ForbiddenException, NotFoundException, Optional } from '@nestjs/common';
import { eq, and, gt, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { startup, DataGateStatus } from './entities/startup.schema';
import { dataRoom } from './entities/data-room.schema';
import { investorThesis } from '../investor/entities/investor.schema';
import { PipelineService } from '../ai/services/pipeline.service';
import { PipelinePhase } from '../ai/interfaces/pipeline.interface';
import { DealEventService } from './deal-event.service';
import { OpenQuestionService } from '../dd/open-question.service';
import { UserRole } from '../../auth/entities/auth.schema';

export interface DataGateInfo {
  dataGateStatus: string | null;
  docRequestedAt: string | null;
  openQuestions: Array<{ id: string; summary: string; status: string }>;
  missingMaterials: string[];
  requiredDocTypes: string[];
  presentDocTypes: string[];
}

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

  async getDataGateInfo(
    startupId: string,
    viewerUserId: string,
    viewerRole?: UserRole,
  ): Promise<DataGateInfo> {
    const [row] = await this.drizzle.db
      .select({
        dataGateStatus: startup.dataGateStatus,
        docRequestedAt: startup.docRequestedAt,
        userId: startup.userId,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row) throw new NotFoundException(`Startup ${startupId} not found`);

    const investorId = viewerRole === UserRole.ADMIN ? row.userId : viewerUserId;
    const [thesis] = await this.drizzle.db
      .select({ requiredDocTypes: investorThesis.requiredDocTypes })
      .from(investorThesis)
      .where(eq(investorThesis.userId, investorId))
      .limit(1);

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

    const presentDocTypes = [...new Set(docs.map((d) => d.category))];
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
    };
  }

  async skip(startupId: string, userId: string): Promise<void> {
    const [updated] = await this.drizzle.db
      .update(startup)
      .set({ dataGateStatus: DataGateStatus.SKIPPED })
      .where(eq(startup.id, startupId))
      .returning({ id: startup.id });

    if (!updated) throw new NotFoundException(`Startup ${startupId} not found`);

    void this.dealEvents.record({
      startupId,
      actorUserId: userId,
      type: 'due_diligence.data_gate_skipped',
      payload: {},
    });

    await this.triggerDdPipeline(startupId, userId);
  }

  async complete(startupId: string, userId: string): Promise<void> {
    const [updated] = await this.drizzle.db
      .update(startup)
      .set({ dataGateStatus: DataGateStatus.COMPLETE })
      .where(eq(startup.id, startupId))
      .returning({ id: startup.id });

    if (!updated) throw new NotFoundException(`Startup ${startupId} not found`);

    void this.dealEvents.record({
      startupId,
      actorUserId: userId,
      type: 'due_diligence.data_gate_complete',
      payload: {},
    });

    await this.triggerDdPipeline(startupId, userId);
  }

  async checkAutoAdvance(startupId: string): Promise<void> {
    const [row] = await this.drizzle.db
      .select({
        dataGateStatus: startup.dataGateStatus,
        userId: startup.userId,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row || row.dataGateStatus !== DataGateStatus.PENDING) return;

    const [thesis] = await this.drizzle.db
      .select({
        requiredDocTypes: investorThesis.requiredDocTypes,
        autoAdvanceDataGate: investorThesis.autoAdvanceDataGate,
      })
      .from(investorThesis)
      .where(eq(investorThesis.userId, row.userId))
      .limit(1);

    if (!thesis?.autoAdvanceDataGate) return;

    const requiredDocTypes = thesis.requiredDocTypes ?? ['pitch_deck', 'financial'];
    if (requiredDocTypes.length === 0) return;

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
    const allPresent = requiredDocTypes.every((req) => presentCategories.has(req));

    if (allPresent) {
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
        return;
      }

      this.logger.log(
        `[DataGate] Auto-advancing startup ${startupId} — all required doc types present`,
      );

      void this.dealEvents.record({
        startupId,
        actorUserId: row.userId,
        type: 'due_diligence.data_gate_complete',
        payload: { trigger: 'auto_advance' },
      });

      await this.triggerDdPipeline(startupId, row.userId);
    }
  }

  private async hasNewDocsSinceExtraction(startupId: string): Promise<boolean> {
    const [row] = await this.drizzle.db
      .select({ lastExtractionAt: startup.lastExtractionAt })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row?.lastExtractionAt) return true;

    const [result] = await this.drizzle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(dataRoom)
      .where(
        and(
          eq(dataRoom.startupId, startupId),
          gt(dataRoom.uploadedAt, row.lastExtractionAt),
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
