import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { ScrapingProcessor } from "../../processors/scraping.processor";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
} from "../../interfaces/pipeline.interface";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { PipelineService } from "../../services/pipeline.service";
import type { PipelineAgentTraceService } from "../../services/pipeline-agent-trace.service";
import type {
  ScrapingRunOptions,
  ScrapingService,
} from "../../services/scraping.service";
import {
  SCRAPING_AGENT_LINKEDIN_KEY,
  SCRAPING_AGENT_WEBSITE_KEY,
} from "../../services/scraping.service";
import type { NotificationGateway } from "../../../../notification/notification.gateway";
import type { AiScrapingJobData } from "../../../../queue/interfaces";

function createScrapingResult() {
  return {
    website: {
      url: "https://inside-line.test/",
      title: "Inside Line",
      description: "AI startup analysis",
      fullText: "content",
      headings: [],
      subpages: [],
      links: [],
      teamBios: [],
      customerLogos: [],
      testimonials: [],
      metadata: {
        scrapedAt: new Date().toISOString(),
        pageCount: 1,
        hasAboutPage: true,
        hasTeamPage: true,
        hasPricingPage: false,
      },
    },
    websiteUrl: "https://inside-line.test/",
    websiteSummary: "AI startup analysis",
    teamMembers: [
      {
        name: "Alex Founder",
        role: "CEO",
        linkedinUrl: "https://www.linkedin.com/in/alex-founder",
        enrichmentStatus: "success",
      },
    ],
    notableClaims: ["Industry: SaaS"],
    scrapeErrors: [],
  };
}

describe("ScrapingProcessor", () => {
  let processor: ScrapingProcessor;
  let config: jest.Mocked<ConfigService>;
  let scrapingService: jest.Mocked<ScrapingService>;
  let pipelineState: jest.Mocked<PipelineStateService>;
  let pipelineService: jest.Mocked<PipelineService>;
  let notificationGateway: jest.Mocked<NotificationGateway>;
  let pipelineAgentTrace: jest.Mocked<PipelineAgentTraceService>;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") return "redis://localhost:6379";
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    scrapingService = {
      run: jest.fn().mockImplementation(async (_startupId: string, options?: ScrapingRunOptions) => {
        options?.onAgentStart?.(SCRAPING_AGENT_WEBSITE_KEY);
        options?.onAgentComplete?.({
          agentKey: SCRAPING_AGENT_WEBSITE_KEY,
          status: "completed",
          outputText: "Website scraping completed",
          outputJson: { scraped: true, pageCount: 1 },
          attempt: 1,
          retryCount: 0,
        });
        options?.onAgentStart?.(SCRAPING_AGENT_LINKEDIN_KEY);
        options?.onAgentComplete?.({
          agentKey: SCRAPING_AGENT_LINKEDIN_KEY,
          status: "completed",
          outputText: "LinkedIn enrichment completed",
          outputJson: { requestedTeamMembers: 1, verifiedTeamMembers: 1 },
          meta: {
            phase: "linkedin_enrichment",
            associationTypes: { current: 1, historical: 0, unknown: 0 },
          },
          attempt: 1,
          retryCount: 0,
        });
        return createScrapingResult();
      }),
    } as unknown as jest.Mocked<ScrapingService>;

    pipelineState = {
      get: jest.fn().mockResolvedValue({
        pipelineRunId: "run-1",
        startupId: "startup-1",
        userId: "user-1",
        status: PipelineStatus.RUNNING,
        quality: "standard",
        currentPhase: PipelinePhase.SCRAPING,
        phases: {
          [PipelinePhase.EXTRACTION]: { status: PhaseStatus.PENDING },
          [PipelinePhase.ENRICHMENT]: { status: PhaseStatus.COMPLETED },
          [PipelinePhase.SCRAPING]: { status: PhaseStatus.PENDING },
          [PipelinePhase.RESEARCH]: { status: PhaseStatus.PENDING },
          [PipelinePhase.EVALUATION]: { status: PhaseStatus.PENDING },
          [PipelinePhase.SYNTHESIS]: { status: PhaseStatus.PENDING },
        },
        results: {},
        retryCounts: {},
        telemetry: {
          startedAt: new Date().toISOString(),
          totalTokens: { input: 0, output: 0 },
          phases: {
            [PipelinePhase.EXTRACTION]: {
              phase: PipelinePhase.EXTRACTION,
              agentCount: 0,
              successCount: 0,
              failedCount: 0,
            },
            [PipelinePhase.ENRICHMENT]: {
              phase: PipelinePhase.ENRICHMENT,
              agentCount: 0,
              successCount: 0,
              failedCount: 0,
            },
            [PipelinePhase.SCRAPING]: {
              phase: PipelinePhase.SCRAPING,
              agentCount: 0,
              successCount: 0,
              failedCount: 0,
            },
            [PipelinePhase.RESEARCH]: {
              phase: PipelinePhase.RESEARCH,
              agentCount: 0,
              successCount: 0,
              failedCount: 0,
            },
            [PipelinePhase.EVALUATION]: {
              phase: PipelinePhase.EVALUATION,
              agentCount: 0,
              successCount: 0,
              failedCount: 0,
            },
            [PipelinePhase.SYNTHESIS]: {
              phase: PipelinePhase.SYNTHESIS,
              agentCount: 0,
              successCount: 0,
              failedCount: 0,
            },
          },
          agents: {},
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      updatePhase: jest.fn().mockResolvedValue(undefined),
      setPhaseResult: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineStateService>;

    pipelineService = {
      onPhaseStarted: jest.fn().mockResolvedValue(undefined),
      onPhaseCompleted: jest.fn().mockResolvedValue(undefined),
      onPhaseFailed: jest.fn().mockResolvedValue(undefined),
      onAgentProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineService>;

    notificationGateway = {
      sendJobStatus: jest.fn(),
    } as unknown as jest.Mocked<NotificationGateway>;

    pipelineAgentTrace = {
      recordRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PipelineAgentTraceService>;

    processor = new ScrapingProcessor(
      config as unknown as ConfigService,
      scrapingService as unknown as ScrapingService,
      pipelineState as unknown as PipelineStateService,
      pipelineService as unknown as PipelineService,
      notificationGateway as unknown as NotificationGateway,
      pipelineAgentTrace as unknown as PipelineAgentTraceService,
    );
  });

  it("emits scraping sub-agent progress and trace records for website + linkedin enrichment", async () => {
    const job = {
      id: "job-1",
      data: {
        type: "ai_scraping",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiScrapingJobData,
    } as unknown as Job<AiScrapingJobData>;

    const result = await (
      processor as unknown as {
        process: (input: Job<AiScrapingJobData>) => Promise<{ type: string }>;
      }
    ).process(job);

    expect(scrapingService.run).toHaveBeenCalledWith(
      "startup-1",
      expect.objectContaining({
        onAgentStart: expect.any(Function),
        onAgentComplete: expect.any(Function),
      }),
    );

    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SCRAPING,
        key: SCRAPING_AGENT_WEBSITE_KEY,
        status: "running",
      }),
    );
    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SCRAPING,
        key: SCRAPING_AGENT_LINKEDIN_KEY,
        status: "completed",
      }),
    );
    expect(pipelineAgentTrace.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SCRAPING,
        agentKey: SCRAPING_AGENT_WEBSITE_KEY,
        status: "completed",
      }),
    );
    expect(pipelineAgentTrace.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.SCRAPING,
        agentKey: SCRAPING_AGENT_LINKEDIN_KEY,
        status: "completed",
        meta: expect.objectContaining({
          phase: "linkedin_enrichment",
        }),
      }),
    );
    expect(result.type).toBe("ai_scraping");
  });
});
