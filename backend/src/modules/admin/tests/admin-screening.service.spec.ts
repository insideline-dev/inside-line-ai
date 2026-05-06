import { describe, expect, it, jest } from "bun:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PipelinePhase } from "../../ai/interfaces/pipeline.interface";
import { AdminScreeningService } from "../admin-screening.service";
import { StartupStatus } from "../../startup/entities/startup.schema";

const STARTUP_ID = "11111111-1111-4111-8111-111111111111";

interface MockDb {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
}

function makeMockDb(startupRows: unknown[] = []): MockDb {
  const db: MockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(startupRows),
  };
  return db;
}

async function build(db: MockDb) {
  const pipelineService = {
    rerunFromPhase: jest.fn().mockResolvedValue(undefined),
    startPipeline: jest.fn().mockResolvedValue("pipeline-run-1"),
  };

  return {
    service: new AdminScreeningService({ db } as never, pipelineService as never),
    pipelineService,
  };
}

describe("AdminScreeningService", () => {
  it("reruns screening from the screening phase for approved startups", async () => {
    const db = makeMockDb([{ id: STARTUP_ID, status: StartupStatus.APPROVED }]);
    const { service, pipelineService } = await build(db);

    const out = await service.triggerScreeningForStartup(STARTUP_ID, "admin-1");

    expect(pipelineService.rerunFromPhase).toHaveBeenCalledWith(
      STARTUP_ID,
      PipelinePhase.SCREENING,
    );
    expect(out).toEqual({
      status: "queued",
      startupId: STARTUP_ID,
      phase: PipelinePhase.SCREENING,
      requestedBy: "admin-1",
      mode: "force_rerun",
    });
  });

  it("falls back to a full pipeline restart when no reusable state exists", async () => {
    const db = makeMockDb([{ id: STARTUP_ID, status: StartupStatus.APPROVED }]);
    const { service, pipelineService } = await build(db);
    pipelineService.rerunFromPhase.mockRejectedValueOnce(
      new Error(`Pipeline state for startup ${STARTUP_ID} not found`),
    );

    const out = await service.triggerScreeningForStartup(STARTUP_ID, "admin-1");

    expect(pipelineService.startPipeline).toHaveBeenCalledWith(STARTUP_ID, "admin-1");
    expect(out).toEqual({
      status: "queued",
      startupId: STARTUP_ID,
      phase: PipelinePhase.SCREENING,
      requestedBy: "admin-1",
      mode: "full_reanalysis_fallback",
    });
  });

  it("rejects startups that are not approved", async () => {
    const db = makeMockDb([{ id: STARTUP_ID, status: StartupStatus.SUBMITTED }]);
    const { service } = await build(db);

    await expect(
      service.triggerScreeningForStartup(STARTUP_ID, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when the startup does not exist", async () => {
    const db = makeMockDb([]);
    const { service } = await build(db);

    await expect(
      service.triggerScreeningForStartup(STARTUP_ID, "admin-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
