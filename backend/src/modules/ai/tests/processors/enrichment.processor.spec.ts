import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { EnrichmentProcessor } from "../../processors/enrichment.processor";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
} from "../../interfaces/pipeline.interface";
import type { PipelineStateService } from "../../services/pipeline-state.service";
import type { PipelineService } from "../../services/pipeline.service";
import type { PipelineAgentTraceService } from "../../services/pipeline-agent-trace.service";
import type { EnrichmentService } from "../../services/enrichment.service";
import type { NotificationGateway } from "../../../../notification/notification.gateway";
import type { AiEnrichmentJobData } from "../../../../queue/interfaces";
import { ENRICHMENT_AGENT_KEY } from "../../services/enrichment.service";

function createEmptyEnrichmentResult() {
  return {
    discoveredFounders: [],
    fundingHistory: [],
    pitchDeckUrls: [],
    socialProfiles: {},
    productSignals: {},
    tractionSignals: {},
    fieldsEnriched: [],
    fieldsStillMissing: [],
    fieldsCorrected: [],
    correctionDetails: [],
    sources: [],
    dbFieldsUpdated: [],
  };
}

describe("EnrichmentProcessor", () => {
  let processor: EnrichmentProcessor;
  let config: jest.Mocked<ConfigService>;
  let enrichmentService: jest.Mocked<EnrichmentService>;
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

    enrichmentService = {
      run: jest.fn().mockImplementation(
        async (
          _startupId: string,
          options?: Parameters<EnrichmentService["run"]>[1],
        ) => {
          options?.onAgentStart?.(ENRICHMENT_AGENT_KEY);
          options?.onAgentComplete?.({
            agentKey: ENRICHMENT_AGENT_KEY,
            inputPrompt: "Enrichment prompt",
            outputText: JSON.stringify(createEmptyEnrichmentResult()),
            outputJson: createEmptyEnrichmentResult(),
            usedFallback: true,
            error: "Model returned non-conforming structured output; fallback result generated.",
            fallbackReason: "SCHEMA_OUTPUT_INVALID",
            rawProviderError: "Unterminated fractional number in JSON at position 3689",
            attempt: 2,
            retryCount: 1,
          });
          return createEmptyEnrichmentResult();
        },
      ),
    } as unknown as jest.Mocked<EnrichmentService>;

    pipelineState = {
      get: jest.fn().mockResolvedValue({
        pipelineRunId: "run-1",
        startupId: "startup-1",
        userId: "user-1",
        status: PipelineStatus.RUNNING,
        quality: "standard",
        currentPhase: PipelinePhase.ENRICHMENT,
        phases: {
          [PipelinePhase.EXTRACTION]: { status: PhaseStatus.PENDING },
          [PipelinePhase.ENRICHMENT]: { status: PhaseStatus.PENDING },
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

    processor = new EnrichmentProcessor(
      config as unknown as ConfigService,
      enrichmentService as unknown as EnrichmentService,
      pipelineState as unknown as PipelineStateService,
      pipelineService as unknown as PipelineService,
      notificationGateway as unknown as NotificationGateway,
      pipelineAgentTrace as unknown as PipelineAgentTraceService,
    );
  });

  it("propagates fallback metadata into progress updates and trace records", async () => {
    const job = {
      id: "job-1",
      data: {
        type: "ai_enrichment",
        startupId: "startup-1",
        pipelineRunId: "run-1",
        userId: "user-1",
      } satisfies AiEnrichmentJobData,
    } as unknown as Job<AiEnrichmentJobData>;

    const result = await (
      processor as unknown as {
        process: (input: Job<AiEnrichmentJobData>) => Promise<{ type: string }>;
      }
    ).process(job);

    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.ENRICHMENT,
        key: ENRICHMENT_AGENT_KEY,
        status: "running",
      }),
    );
    expect(pipelineService.onAgentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.ENRICHMENT,
        key: ENRICHMENT_AGENT_KEY,
        status: "completed",
        lifecycleEvent: "fallback",
        usedFallback: true,
        fallbackReason: "SCHEMA_OUTPUT_INVALID",
        rawProviderError: "Unterminated fractional number in JSON at position 3689",
        attempt: 2,
        retryCount: 1,
      }),
    );
    expect(pipelineAgentTrace.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: "startup-1",
        pipelineRunId: "run-1",
        phase: PipelinePhase.ENRICHMENT,
        agentKey: ENRICHMENT_AGENT_KEY,
        status: "fallback",
        usedFallback: true,
        fallbackReason: "SCHEMA_OUTPUT_INVALID",
        rawProviderError: "Unterminated fractional number in JSON at position 3689",
        attempt: 2,
        retryCount: 1,
      }),
    );
    expect(result.type).toBe("ai_enrichment");
  });
});
