import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { startup } from "../startup/entities/startup.schema";
import { StartupStatus } from "../startup/entities/startup.schema";
import { PipelineStateService } from "../ai/services/pipeline-state.service";
import { InvestorMatchingService } from "../ai/services/investor-matching.service";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/entities";
import { PipelinePhase } from "../ai/interfaces/pipeline.interface";
import type { SynthesisResult } from "../ai/interfaces/phase-results.interface";

@Injectable()
export class AdminMatchingService {
  private readonly logger = new Logger(AdminMatchingService.name);

  constructor(
    private drizzle: DrizzleService,
    private pipelineState: PipelineStateService,
    private investorMatching: InvestorMatchingService,
    private notificationService: NotificationService,
  ) {}

  async triggerMatchForStartup(startupId: string) {
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

    const synthesis = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.SYNTHESIS,
    );

    if (!synthesis) {
      throw new BadRequestException(
        "No synthesis data available. The AI pipeline must complete before matching.",
      );
    }

    const matching = await this.investorMatching.matchStartup({
      startupId,
      startup: {
        industry: found.industry,
        stage: found.stage,
        fundingTarget: found.fundingTarget,
        location: found.location ?? "",
        geoPath: found.geoPath ?? null,
      },
      synthesis: synthesis as SynthesisResult,
    });

    if (matching.matches.length > 0) {
      await this.notificationService.createBulk(
        matching.matches.map((match) => ({
          userId: match.investorId,
          type: NotificationType.MATCH,
          title: "New Startup Match",
          message: `A startup matched your thesis with ${match.thesisFitScore}% alignment.`,
          link: `/investor/startup/${startupId}`,
        })),
      );
    }

    this.logger.log(
      `Matching complete for startup ${startupId}: ${matching.matches.length} matches from ${matching.candidatesEvaluated} candidates`,
    );

    return {
      candidatesEvaluated: matching.candidatesEvaluated,
      matchesFound: matching.matches.length,
    };
  }
}
