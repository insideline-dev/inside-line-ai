import {
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import {
  TaskProcessor,
  type TaskJobHandlerResult,
} from "../../../queue/processors/task.processor";
import type { TaskJobData } from "../../../queue/interfaces/job-data.interface";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { AiPromptService } from "../../ai/services/ai-prompt.service";
import { AiModelExecutionService } from "../../ai/services/ai-model-execution.service";
import { WebsiteScraperService } from "../../ai/services/website-scraper.service";
import {
  investorProfile,
  investorThesis,
} from "../entities/investor.schema";
import { MatchService } from "../match.service";
import {
  INVESTOR_ONBOARDING_SCRAPE_JOB,
  type InvestorOnboardingScrapeJobPayload,
} from "./investor-onboarding.constants";
import {
  OnboardingLlmOutputSchema,
  type OnboardingLlmOutput,
} from "./schemas/onboarding-llm-output.schema";

// Cap LLM input at 30k chars across homepage + portfolio + about pages —
// keeps cheap-tier prompts within context budget; truncation is segment-fair.
const MAX_LLM_INPUT_CHARS = 30_000;

const PORTFOLIO_PATHS = [
  "/portfolio",
  "/companies",
  "/investments",
  "/our-companies",
  "/our-portfolio",
];

const ABOUT_PATH_REGEX = /\/(about|company|team|leadership|founders|people)\b/i;
const PORTFOLIO_PATH_REGEX = /\/(portfolio|companies|investments|our-companies|our-portfolio)\b/i;

@Injectable()
export class InvestorOnboardingProcessor implements OnModuleInit {
  private readonly logger = new Logger(InvestorOnboardingProcessor.name);

  constructor(
    private readonly taskProcessor: TaskProcessor,
    private readonly drizzle: DrizzleService,
    private readonly scraper: WebsiteScraperService,
    private readonly modelExecution: AiModelExecutionService,
    private readonly promptService: AiPromptService,
    private readonly notifications: NotificationGateway,
    private readonly matchService: MatchService,
  ) {}

  onModuleInit(): void {
    this.taskProcessor.registerHandler(
      INVESTOR_ONBOARDING_SCRAPE_JOB,
      (job) => this.handle(job),
    );
  }

  async handle(job: Job<TaskJobData>): Promise<TaskJobHandlerResult> {
    const payload = this.extractPayload(job.data);
    return this.runScrape(payload);
  }

  async runScrape(
    payload: InvestorOnboardingScrapeJobPayload,
  ): Promise<TaskJobHandlerResult> {
    const { userId, website } = payload;
    this.logger.log(`Starting onboarding scrape for user ${userId} (${website})`);

    try {
      const scraped = await this.scraper.deepScrape(website, {
        manualPaths: PORTFOLIO_PATHS,
      });

      const promptInput = this.buildPromptInput(scraped);

      const promptConfig = await this.promptService.resolve({
        key: "investor.thesis_from_website",
      });
      const execution = await this.modelExecution.resolveForPrompt({
        key: "investor.thesis_from_website",
      });

      const userPrompt = this.promptService.renderTemplate(
        promptConfig.userPrompt,
        promptInput,
      );

      const response = await this.modelExecution.generateText<OnboardingLlmOutput>({
        model: execution.generateTextOptions.model,
        system: promptConfig.systemPrompt,
        prompt: userPrompt,
        schema: OnboardingLlmOutputSchema,
        temperature: 0.2,
      });

      const draft = this.resolveDraft(response);

      await this.persistDraft(userId, draft, scraped.metadata.logoUrl);

      await this.matchService.regenerateMatches(userId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Match regeneration after onboarding failed for user ${userId}: ${msg}`,
        );
      });

      this.notifications.sendInvestorEvent(
        userId,
        "investor.onboarding.completed",
        {
          userId,
          website,
          portfolioCount: draft.portfolioCompanies.length,
        },
      );

      this.logger.log(
        `Onboarding scrape complete for user ${userId} — ${draft.portfolioCompanies.length} portfolio companies`,
      );

      return {
        type: "task",
        result: {
          taskName: INVESTOR_ONBOARDING_SCRAPE_JOB,
          userId,
          website,
          portfolioCount: draft.portfolioCompanies.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Onboarding scrape failed for user ${userId} (${website}): ${message}`,
      );
      // Intentionally do NOT null thesis fields — preserve any prior state.
      this.notifications.sendInvestorEvent(
        userId,
        "investor.onboarding.failed",
        { userId, website, error: message },
      );
      throw error;
    }
  }

  private resolveDraft(response: {
    output?: OnboardingLlmOutput | undefined;
    experimental_output?: OnboardingLlmOutput | undefined;
    text: string;
  }): OnboardingLlmOutput {
    if (response.experimental_output) return response.experimental_output;
    if (response.output) return response.output;
    return OnboardingLlmOutputSchema.parse(JSON.parse(response.text));
  }

  private extractPayload(data: TaskJobData): InvestorOnboardingScrapeJobPayload {
    const website = (data.payload as { website?: unknown } | undefined)?.website;
    if (typeof website !== "string" || website.length === 0) {
      throw new Error("invalid investor onboarding payload: missing website");
    }
    return { userId: data.userId, website };
  }

  private buildPromptInput(scraped: {
    fullText: string;
    title: string;
    description: string;
    subpages: Array<{ url: string; title: string; content: string }>;
  }): { websiteText: string; portfolioPagesText: string; aboutPageText: string } {
    const homepageBudget = Math.floor(MAX_LLM_INPUT_CHARS * 0.3);
    const portfolioBudget = Math.floor(MAX_LLM_INPUT_CHARS * 0.45);
    const aboutBudget = MAX_LLM_INPUT_CHARS - homepageBudget - portfolioBudget;

    const websiteText = this.truncate(
      [scraped.title, scraped.description, scraped.fullText]
        .filter(Boolean)
        .join("\n\n"),
      homepageBudget,
    );

    const portfolioPagesText = this.truncate(
      this.formatSubpages(scraped.subpages.filter((p) => PORTFOLIO_PATH_REGEX.test(p.url))),
      portfolioBudget,
    );

    const aboutPageText = this.truncate(
      this.formatSubpages(scraped.subpages.filter((p) => ABOUT_PATH_REGEX.test(p.url))),
      aboutBudget,
    );

    return { websiteText, portfolioPagesText, aboutPageText };
  }

  private formatSubpages(
    pages: Array<{ url: string; title: string; content: string }>,
  ): string {
    if (pages.length === 0) return "(none)";
    return pages
      .map((p) => `## ${p.title || p.url}\n${p.url}\n\n${p.content}`)
      .join("\n\n---\n\n");
  }

  private truncate(input: string, max: number): string {
    if (input.length <= max) return input;
    return `${input.slice(0, max)}\n…[truncated]`;
  }

  private async persistDraft(
    userId: string,
    draft: OnboardingLlmOutput,
    faviconUrl: string | undefined,
  ): Promise<void> {
    await this.drizzle.withRLS(userId, async (db) => {
      const now = new Date();

      await db
        .update(investorThesis)
        .set({
          thesisSummary: draft.thesisSummary,
          thesisSummaryGeneratedAt: now,
          portfolioCompanies: draft.portfolioCompanies,
          portfolioGeneratedAt: now,
          updatedAt: now,
        })
        .where(eq(investorThesis.userId, userId));

      if (faviconUrl) {
        const [profile] = await db
          .select()
          .from(investorProfile)
          .where(eq(investorProfile.userId, userId))
          .limit(1);

        if (profile && !profile.logoUrl) {
          await db
            .update(investorProfile)
            .set({ logoUrl: faviconUrl, updatedAt: now })
            .where(eq(investorProfile.userId, userId));
        }
      }
    });
  }
}
