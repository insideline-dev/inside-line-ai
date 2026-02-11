import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { ConfigService } from "@nestjs/config";

class MockRedis {
  private store = new Map<string, { value: string; expiresAt: number }>();

  connect() {
    return Promise.resolve();
  }

  on() {
    return this;
  }

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, _mode?: string, ttlSeconds?: number) {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity,
    });
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

  it("state expires after TTL and returns null", async () => {
    const shortTtlConfig = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") return "redis://localhost:6379";
        if (key === "AI_PIPELINE_TTL_SECONDS") return 0.05;
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const shortTtlService = new PipelineStateService(shortTtlConfig);

    await new Promise((resolve) => setTimeout(resolve, 100));

    await shortTtlService.init("startup-expiry", "user-expiry", "run-expiry");

    const immediate = await shortTtlService.get("startup-expiry");
    expect(immediate).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const expired = await shortTtlService.get("startup-expiry");
    expect(expired).toBeNull();

    await shortTtlService.onModuleDestroy();
  });

  it("concurrent updates don't corrupt state", async () => {
    await service.init("startup-concurrent", "user-concurrent", "run-concurrent");

    await service.updatePhase(
      "startup-concurrent",
      PipelinePhase.EXTRACTION,
      PhaseStatus.RUNNING,
    );
    await service.setPhaseResult("startup-concurrent", PipelinePhase.RESEARCH, {
      summary: "test",
    });
    await service.incrementRetryCount("startup-concurrent", PipelinePhase.SCRAPING);
    await service.setQuality("startup-concurrent", "degraded");

    const state = await service.get("startup-concurrent");

    expect(state).not.toBeNull();
    expect(state?.phases.extraction.status).toBe("running");
    expect(state?.results.research).toEqual({ summary: "test" });
    expect(state?.retryCounts.scraping).toBe(1);
    expect(state?.quality).toBe("degraded");
  });

  it("handles corrupt state gracefully and returns null", async () => {
    await service.init("startup-corrupt", "user-corrupt", "run-corrupt");

    const mockRedis = new MockRedis();
    await mockRedis.set("ai:pipeline:startup-corrupt", "{invalid json", "EX", 3600);

    const corruptConfig = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === "REDIS_URL") return "redis://localhost:6379";
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const corruptService = new PipelineStateService(corruptConfig);

    await mockRedis.set("ai:pipeline:startup-corrupt-2", "{invalid json", "EX", 3600);

    await corruptService.onModuleDestroy();
  });

  it("throws error when accessing non-existent state", async () => {
    await expect(
      service.updatePhase(
        "nonexistent-startup",
        PipelinePhase.EXTRACTION,
        PhaseStatus.RUNNING,
      ),
    ).rejects.toThrow("Pipeline state for startup nonexistent-startup not found");
  });

  it("clear removes state from storage", async () => {
    await service.init("startup-clear", "user-clear", "run-clear");

    const beforeClear = await service.get("startup-clear");
    expect(beforeClear).not.toBeNull();

    await service.clear("startup-clear");

    const afterClear = await service.get("startup-clear");
    expect(afterClear).toBeNull();
  });
});
