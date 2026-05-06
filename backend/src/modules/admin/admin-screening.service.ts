import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { PipelinePhase } from "../ai/interfaces/pipeline.interface";
import { PipelineService } from "../ai/services/pipeline.service";
import { startup, StartupStatus } from "../startup/entities/startup.schema";

/**
 * Lets admins re-trigger the SCREENING phase for an already-approved
 * startup without re-uploading the pitch deck. The rerun uses the latest
 * reusable pipeline state, clears downstream evaluation/synthesis state,
 * and lets the normal phase transitions re-queue evaluation once screening
 * completes.
 */
@Injectable()
export class AdminScreeningService {
  private readonly logger = new Logger(AdminScreeningService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly pipelineService: PipelineService,
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

    let mode: "force_rerun" | "full_reanalysis_fallback" = "force_rerun";

    try {
      await this.pipelineService.rerunFromPhase(startupId, PipelinePhase.SCREENING);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(`Pipeline state for startup ${startupId} not found`)) {
        throw error;
      }

      mode = "full_reanalysis_fallback";
      await this.pipelineService.startPipeline(startupId, requestedBy);
      this.logger.warn(
        `No reusable pipeline state for startup=${startupId}; falling back to full pipeline restart`,
      );
    }

    this.logger.log(
      `Queued screening rerun for startup=${startupId} requestedBy=${requestedBy} mode=${mode}`,
    );

    return {
      status: "queued" as const,
      startupId,
      phase: PipelinePhase.SCREENING,
      requestedBy,
      mode,
    };
  }
}
