import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import type { DrizzleService } from "../../../../database";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import { PipelineAgentTraceService } from "../../services/pipeline-agent-trace.service";

describe("PipelineAgentTraceService", () => {
  let drizzle: jest.Mocked<DrizzleService>;
  let config: jest.Mocked<ConfigService>;
  let insertValues: ReturnType<typeof jest.fn>;
  let originalBuildId: string | undefined;
  let originalCommitSha: string | undefined;

  beforeEach(() => {
    originalBuildId = process.env.APP_BUILD_ID;
    originalCommitSha = process.env.APP_COMMIT_SHA;
    delete process.env.APP_BUILD_ID;
    delete process.env.APP_COMMIT_SHA;

    insertValues = jest.fn().mockResolvedValue(undefined);
    drizzle = {
      db: {
        insert: jest.fn().mockReturnValue({
          values: insertValues,
        }),
      },
    } as unknown as jest.Mocked<DrizzleService>;

    config = {
      get: jest.fn().mockImplementation(
        <T>(_: string, fallback?: T): T | undefined => fallback,
      ),
    } as unknown as jest.Mocked<ConfigService>;
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
    const service = new PipelineAgentTraceService(
      drizzle as unknown as DrizzleService,
      config as unknown as ConfigService,
    );

    await service.recordRun({
      startupId: "startup-1",
      pipelineRunId: "run-1",
      phase: PipelinePhase.EVALUATION,
      agentKey: "team",
      status: "completed",
    });

    expect(insertValues).toHaveBeenCalledWith(
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

    const service = new PipelineAgentTraceService(
      drizzle as unknown as DrizzleService,
      config as unknown as ConfigService,
    );

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

    expect(insertValues).toHaveBeenCalledWith(
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
});
