import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { startup } from "../startup/entities/startup.schema";
import { StartupStatus } from "../startup/entities/startup.schema";
import { StartupMatchingPipelineService } from "../ai/services/startup-matching-pipeline.service";

@Injectable()
export class AdminMatchingService {
  constructor(
    private drizzle: DrizzleService,
    private startupMatching: StartupMatchingPipelineService,
  ) {}

  async triggerMatchForStartup(startupId: string, requestedBy: string) {
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
        `Startup must be approved before matching. Current status: ${found.status}`,
      );
    }

    return this.startupMatching.queueStartupMatching({
      startupId,
      requestedBy,
      triggerSource: "manual",
    });
  }

  async getLatestMatchingStatus(startupId: string) {
    const [found] = await this.drizzle.db
      .select({ id: startup.id })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Startup ${startupId} not found`);
    }

    return this.startupMatching.getLatestMatchingStatus(startupId);
  }
}
