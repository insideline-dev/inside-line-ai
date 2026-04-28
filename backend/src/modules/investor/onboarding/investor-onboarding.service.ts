import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { QueueService } from "../../../queue/queue.service";
import { QUEUE_NAMES } from "../../../queue/queue.config";
import {
  investorProfile,
  investorThesis,
} from "../entities/investor.schema";
import {
  INVESTOR_ONBOARDING_SCRAPE_JOB,
  type InvestorOnboardingScrapeJobPayload,
} from "./investor-onboarding.constants";
import type { SubmitWebsite } from "./dto/submit-website.dto";

@Injectable()
export class InvestorOnboardingService {
  private readonly logger = new Logger(InvestorOnboardingService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly queue: QueueService,
  ) {}

  async submitWebsite(userId: string, dto: SubmitWebsite) {
    const website = this.normalizeWebsite(dto.website);

    await this.drizzle.withRLS(userId, async (db) => {
      const now = new Date();
      const [existingThesis] = await db
        .select()
        .from(investorThesis)
        .where(eq(investorThesis.userId, userId))
        .limit(1);

      if (existingThesis) {
        await db
          .update(investorThesis)
          .set({ website, websiteScrapedAt: now, updatedAt: now })
          .where(eq(investorThesis.userId, userId));
      } else {
        await db.insert(investorThesis).values({
          userId,
          website,
          websiteScrapedAt: now,
        });
      }

      const [profile] = await db
        .select()
        .from(investorProfile)
        .where(eq(investorProfile.userId, userId))
        .limit(1);

      if (profile && !profile.website) {
        await db
          .update(investorProfile)
          .set({ website, updatedAt: now })
          .where(eq(investorProfile.userId, userId));
      }
    });

    await this.enqueueScrapeJob({ userId, website });

    this.logger.log(
      `Investor onboarding website submitted for user ${userId} (${website})`,
    );

    return { status: "queued" as const, website };
  }

  private async enqueueScrapeJob(
    payload: InvestorOnboardingScrapeJobPayload,
  ): Promise<void> {
    const taskQueue = this.queue.getQueue(QUEUE_NAMES.TASK);
    if (!taskQueue) {
      throw new Error(`Queue ${QUEUE_NAMES.TASK} is not initialized`);
    }

    await taskQueue.add(
      INVESTOR_ONBOARDING_SCRAPE_JOB,
      {
        type: "task",
        userId: payload.userId,
        name: INVESTOR_ONBOARDING_SCRAPE_JOB,
        payload: { website: payload.website },
      },
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 5_000 },
      },
    );
  }

  /**
   * Force https:// scheme; allow input without scheme. Reject anything else.
   */
  private normalizeWebsite(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new BadRequestException("website is required");
    }

    const candidate = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new BadRequestException("website must be a valid URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new BadRequestException("website must use http or https");
    }

    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      throw new BadRequestException("website must include a valid hostname");
    }

    parsed.protocol = "https:";
    return parsed.toString();
  }
}
