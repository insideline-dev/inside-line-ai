import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import {
  TaskProcessor,
  type TaskJobHandlerResult,
} from "../../queue/processors/task.processor";
import type { TaskJobData } from "../../queue/interfaces/job-data.interface";
import { DrizzleService } from "../../database";
import { DealEventService } from "../startup/deal-event.service";
import { startup, StartupStatus } from "../startup/entities/startup.schema";
import { DataRoomService } from "../startup/data-room.service";
import { PipelineService } from "../ai/services/pipeline.service";
import { StartupMatchingPipelineService } from "../ai/services/startup-matching-pipeline.service";
import { ScreeningProcessor } from "../ai/processors/screening.processor";
import { PipelineStateService } from "../ai/services/pipeline-state.service";
import { PipelineStatus } from "../ai/interfaces/pipeline.interface";
import { randomBytes } from "node:crypto";
import {
  DEAL_TRIGGER_JOB,
  type DealTriggerPayload,
} from "./deal-trigger.constants";

@Injectable()
export class DealTriggerProcessor implements OnModuleInit {
  private readonly logger = new Logger(DealTriggerProcessor.name);

  constructor(
    private readonly taskProcessor: TaskProcessor,
    private readonly drizzle: DrizzleService,
    private readonly dealEvents: DealEventService,
    private readonly dataRoom: DataRoomService,
    @Optional() private readonly pipeline?: PipelineService,
    @Optional() private readonly startupMatching?: StartupMatchingPipelineService,
    @Optional() private readonly screeningProcessor?: ScreeningProcessor,
    @Optional() private readonly pipelineState?: PipelineStateService,
  ) {}

  onModuleInit(): void {
    this.taskProcessor.registerHandler(DEAL_TRIGGER_JOB, (job) => this.handle(job));
  }

  async handle(job: Job<TaskJobData>): Promise<TaskJobHandlerResult> {
    const payload = this.extractPayload(job.data);
    this.logger.log(`Processing deal trigger: ${payload.type}`);

    switch (payload.type) {
      case "doc.uploaded":
        await this.handleDocUploaded(payload);
        break;
      case "deck.revised":
        await this.handleDeckRevised(payload);
        break;
      case "thesis.updated":
        await this.handleThesisUpdated(payload);
        break;
    }

    return {
      type: "task",
      result: { taskName: DEAL_TRIGGER_JOB, ...payload },
    };
  }

  private async handleDocUploaded(
    payload: Extract<DealTriggerPayload, { type: "doc.uploaded" }>,
  ): Promise<void> {
    void this.dealEvents.record({
      startupId: payload.startupId,
      type: "agent.refresh",
      payload: { trigger: "doc.uploaded", fileId: payload.fileId },
    });

    try {
      await this.dataRoom.reclassifyAll(payload.startupId, undefined, {
        onlyPending: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Data room reclassify after doc upload failed for ${payload.startupId}: ${msg}`,
      );
    }

    await this.tryRescreen(payload.startupId, "doc.uploaded");
  }

  private async handleDeckRevised(
    payload: Extract<DealTriggerPayload, { type: "deck.revised" }>,
  ): Promise<void> {
    void this.dealEvents.record({
      startupId: payload.startupId,
      type: "agent.refresh",
      payload: { trigger: "deck.revised" },
    });

    const [row] = await this.drizzle.db
      .select({ userId: startup.userId })
      .from(startup)
      .where(eq(startup.id, payload.startupId))
      .limit(1);

    if (!row?.userId || !this.pipeline) {
      await this.tryRescreen(payload.startupId, "deck.revised");
      return;
    }

    const state = await this.pipelineState?.get(payload.startupId);
    if (state?.status === PipelineStatus.RUNNING) {
      this.logger.log(
        `Skipping full pipeline for ${payload.startupId} — already running`,
      );
      return;
    }

    try {
      await this.pipeline.startPipeline(payload.startupId, row.userId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Pipeline restart after deck revision failed for ${payload.startupId}: ${msg}`,
      );
      await this.tryRescreen(payload.startupId, "deck.revised");
    }
  }

  private async handleThesisUpdated(
    payload: Extract<DealTriggerPayload, { type: "thesis.updated" }>,
  ): Promise<void> {
    if (!this.startupMatching) return;

    const approved = await this.drizzle.db
      .select({ id: startup.id })
      .from(startup)
      .where(eq(startup.status, StartupStatus.APPROVED));

    await Promise.all(
      approved.map(async ({ id: startupId }) => {
        void this.dealEvents.record({
          startupId,
          type: "agent.refresh",
          payload: {
            trigger: "thesis.updated",
            investorUserId: payload.investorUserId,
          },
        });

        try {
          await this.startupMatching!.queueStartupMatching({
            startupId,
            requestedBy: payload.investorUserId,
            triggerSource: "thesis_update",
            requireApproved: true,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Thesis-update matching failed for startup ${startupId}: ${msg}`,
          );
        }

        await this.tryRescreen(startupId, "thesis.updated");
      }),
    );
  }

  private async tryRescreen(
    startupId: string,
    trigger: string,
  ): Promise<void> {
    if (!this.screeningProcessor) return;

    const pipelineRunId = `trigger_${randomBytes(8).toString("hex")}`;
    try {
      await this.screeningProcessor.runScreening(startupId, pipelineRunId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Screening re-run after ${trigger} failed for ${startupId}: ${msg}`,
      );
    }
  }

  private extractPayload(data: TaskJobData): DealTriggerPayload {
    const raw = data.payload;
    if (!raw || typeof raw !== "object" || !("type" in raw)) {
      throw new Error("Invalid deal trigger payload");
    }
    return raw as DealTriggerPayload;
  }
}
