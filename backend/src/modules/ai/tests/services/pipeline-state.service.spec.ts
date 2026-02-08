import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { ConfigService } from "@nestjs/config";

class MockRedis {
  private store = new Map<string, string>();

  connect() {
    return Promise.resolve();
  }

  on() {
    return this;
  }

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.store.set(key, value);
    return "OK";
  }

  async del(key: string) {
    this.store.delete(key);
    return 1;
  }

  async quit() {
    return "OK";
  }
}

mock.module("ioredis", () => ({
  default: MockRedis,
}));

import { PipelineStateService } from "../../services/pipeline-state.service";
import {
  PhaseStatus,
  PipelinePhase,
  PipelineStatus,
} from "../../interfaces/pipeline.interface";

describe("PipelineStateService", () => {
  let config: jest.Mocked<ConfigService>;
  let service: PipelineStateService;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") return "redis://localhost:6379";
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new PipelineStateService(config);
  });

  it("initializes and retrieves pipeline state", async () => {
    await service.init("startup-1", "user-1", "run-1");

    const state = await service.get("startup-1");

    expect(state).not.toBeNull();
    expect(state?.pipelineRunId).toBe("run-1");
    expect(state?.phases.extraction.status).toBe("pending");
  });

  it("updates phase status and timestamps", async () => {
    await service.init("startup-2", "user-2", "run-2");

    await service.updatePhase(
      "startup-2",
      PipelinePhase.EXTRACTION,
      PhaseStatus.RUNNING,
    );
    await service.updatePhase(
      "startup-2",
      PipelinePhase.EXTRACTION,
      PhaseStatus.COMPLETED,
    );

    const state = await service.get("startup-2");

    expect(state?.phases.extraction.status).toBe("completed");
    expect(state?.phases.extraction.startedAt).toBeDefined();
    expect(state?.phases.extraction.completedAt).toBeDefined();
  });

  it("stores and reads phase results", async () => {
    await service.init("startup-3", "user-3", "run-3");

    await service.setPhaseResult("startup-3", PipelinePhase.RESEARCH, {
      summary: "ok",
    });
    const result = await service.getPhaseResult(
      "startup-3",
      PipelinePhase.RESEARCH,
    );

    expect(result).toEqual({ summary: "ok" });
  });

  it("tracks retry counters per phase", async () => {
    await service.init("startup-4", "user-4", "run-4");

    const first = await service.incrementRetryCount(
      "startup-4",
      PipelinePhase.RESEARCH,
    );
    const second = await service.incrementRetryCount(
      "startup-4",
      PipelinePhase.RESEARCH,
    );

    expect(first).toBe(1);
    expect(second).toBe(2);

    await service.resetRetryCount("startup-4", PipelinePhase.RESEARCH);
    const state = await service.get("startup-4");
    expect(state?.retryCounts.research).toBe(0);
  });

  it("updates top-level pipeline status", async () => {
    await service.init("startup-5", "user-5", "run-5");
    await service.setStatus("startup-5", PipelineStatus.CANCELLED);

    const state = await service.get("startup-5");
    expect(state?.status).toBe(PipelineStatus.CANCELLED);
    expect(state?.telemetry.completedAt).toBeDefined();
  });
});
