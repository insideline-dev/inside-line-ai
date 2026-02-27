import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import type { DrizzleService } from "../../../../database";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import {
  OPENAI_DEEP_RESEARCH_STEP_KEY,
  PipelineAgentTraceService,
} from "../../services/pipeline-agent-trace.service";

describe("PipelineAgentTraceService deep research checkpoints", () => {
  let drizzle: jest.Mocked<DrizzleService>;
  let config: ConfigService;
  let insertValuesMock: ReturnType<typeof jest.fn>;
  let selectLimitMock: ReturnType<typeof jest.fn>;
  let service: PipelineAgentTraceService;
  let originalBuildId: string | undefined;
  let originalCommitSha: string | undefined;

  beforeEach(() => {
    originalBuildId = process.env.APP_BUILD_ID;
    originalCommitSha = process.env.APP_COMMIT_SHA;
    delete process.env.APP_BUILD_ID;
    delete process.env.APP_COMMIT_SHA;
    insertValuesMock = jest.fn().mockResolvedValue(undefined);
    selectLimitMock = jest.fn().mockResolvedValue([]);
    drizzle = {
      db: {
        insert: jest.fn(() => ({ values: insertValuesMock })),
        select: jest.fn(() => ({
          from: jest.fn(() => ({
            where: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                limit: selectLimitMock,
              })),
            })),
          })),
        })),
      },
    } as unknown as jest.Mocked<DrizzleService>;
    config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;
    service = new PipelineAgentTraceService(drizzle, config);
  });

  afterEach(() => {
    if (originalBuildId === undefined) {
      delete process.env.APP_BUILD_ID;
    } else {
      process.env.APP_BUILD_ID = originalBuildId;
    }

    if (originalCommitSha === undefined) {
      delete process.env.APP_COMMIT_SHA;
    } else {
      process.env.APP_COMMIT_SHA = originalCommitSha;
    }
  });

  it("injects runtime metadata even when trace meta is omitted", async () => {
    await service.recordRun({
      startupId: "startup-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.EVALUATION,
      agentKey: "team",
      status: "completed",
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          runtime: expect.objectContaining({
            buildId: "dev",
            commitSha: "unknown",
            processPid: process.pid,
            startedAt: expect.any(String),
          }),
        }),
      }),
    );
  });

  it("merges custom runtime meta fields while preserving runtime fingerprint", async () => {
    process.env.APP_BUILD_ID = "build-123";
    process.env.APP_COMMIT_SHA = "sha-456";
    service = new PipelineAgentTraceService(drizzle, config);

    await service.recordRun({
      startupId: "startup-2",
      pipelineRunId: "run-2",
      phase: PipelinePhase.RESEARCH,
      agentKey: "market",
      status: "fallback",
      meta: {
        correlationId: "corr-1",
        runtime: { region: "us-east-1" },
      },
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          correlationId: "corr-1",
          runtime: expect.objectContaining({
            region: "us-east-1",
            buildId: "build-123",
            commitSha: "sha-456",
            processPid: process.pid,
            startedAt: expect.any(String),
          }),
        }),
      }),
    );
  });

  it("records deep research checkpoints as phase-step traces", async () => {
    await service.recordDeepResearchCheckpoint({
      startupId: "startup-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.RESEARCH,
      agentKey: "market",
      responseId: "resp_123",
      status: "in_progress",
      modelName: "o4-mini-deep-research",
      phaseRetryCount: 1,
      agentAttemptId: "run-1:research:market:phase-1:attempt-1",
      checkpointEvent: "resumed",
      pollIntervalMs: 15000,
      timeoutMs: 30000,
    });

    expect(drizzle.db.insert).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    const payload = insertValuesMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.traceKind).toBe("phase_step");
    expect(payload.stepKey).toBe(OPENAI_DEEP_RESEARCH_STEP_KEY);
    expect(payload.phase).toBe(PipelinePhase.RESEARCH);
    expect(payload.agentKey).toBe("market");
    expect(payload.status).toBe("running");
    expect(payload.retryCount).toBe(1);

    const meta = payload.meta as { deepResearch?: Record<string, unknown> };
    expect(meta.deepResearch?.responseId).toBe("resp_123");
    expect(meta.deepResearch?.status).toBe("in_progress");
    expect(meta.deepResearch?.checkpointEvent).toBe("resumed");
  });

  it("reads latest checkpoint response id from stored trace metadata", async () => {
    const startedAt = new Date("2026-02-27T00:00:00.000Z");
    selectLimitMock.mockResolvedValueOnce([
      {
        meta: {
          deepResearch: {
            responseId: "resp_resume",
            status: "in_progress",
            modelName: "o4-mini-deep-research",
            resumed: true,
            phaseRetryCount: 2,
            agentAttemptId: "run-1:research:team:phase-2:attempt-1",
            checkpointEvent: "resumed",
          },
        },
        startedAt,
        completedAt: null,
      },
    ]);

    const checkpoint = await service.getLatestDeepResearchCheckpoint({
      startupId: "startup-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.RESEARCH,
      agentKey: "team",
    });

    expect(checkpoint).toEqual(
      expect.objectContaining({
        responseId: "resp_resume",
        status: "in_progress",
        resumed: true,
        phaseRetryCount: 2,
        agentAttemptId: "run-1:research:team:phase-2:attempt-1",
        checkpointEvent: "resumed",
        startedAt,
      }),
    );
  });
});
