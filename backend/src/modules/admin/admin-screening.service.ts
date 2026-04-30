import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { QUEUE_NAMES, QueueService } from "../../queue";
import type { AiScreeningJobData } from "../../queue/interfaces";
import { startup } from "../startup/entities/startup.schema";
import { StartupStatus } from "../startup/entities/startup.schema";
import { pipelineRun } from "../ai/entities/pipeline.schema";

/**
 * Lets admins re-trigger the SCREENING phase for an already-approved
 * startup without re-running the entire pipeline. Useful for:
 *  - Validating the deal-card surface against real lens data
 *  - Re-running screening after a lens prompt update
 *  - Re-running screening after an investor's thesis update so the
 *    out-of-thesis-scope gate can fire (DS-E4-F1-S1 known limitation)
 *
 * Mirrors the AdminMatchingService pattern.
 */
@Injectable()
export class AdminScreeningService {
  private readonly logger = new Logger(AdminScreeningService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly queue: QueueService,
  ) {}

  async triggerScreeningForStartup(startupId: string, requestedBy: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup ${startupId} not found`);
    }

    if (found.status !== StartupStatus.APPROVED) {
      throw new BadRequestException(
        `Startup must be approved before re-screening. Current status: ${found.status}`,
      );
    }

    // Reuse the latest pipeline run so screening output attaches to a real
    // run and the contract builder can include it. Re-screen without a
    // prior run would orphan the lens rows from any pipeline context.
    const [latestRun] = await this.drizzle.db
      .select({ pipelineRunId: pipelineRun.pipelineRunId })
      .from(pipelineRun)
      .where(eq(pipelineRun.startupId, startupId))
      .orderBy(desc(pipelineRun.startedAt))
      .limit(1);

    if (!latestRun) {
      throw new BadRequestException(
        `Startup ${startupId} has no prior pipeline run. Run the full pipeline first.`,
      );
    }

    const jobData: AiScreeningJobData = {
      type: "ai_screening",
      userId: requestedBy,
      startupId,
      pipelineRunId: latestRun.pipelineRunId,
    };

    const jobId = await this.queue.addJob(QUEUE_NAMES.AI_SCREENING, jobData);
    this.logger.log(
      `Enqueued screening rerun for startup=${startupId} run=${latestRun.pipelineRunId} job=${jobId}`,
    );

    return {
      status: "queued" as const,
      jobId,
      pipelineRunId: latestRun.pipelineRunId,
      startupId,
    };
  }
}
