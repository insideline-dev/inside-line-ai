import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ScreeningTriageController } from "../screening-triage.controller";
import {
  POLICY_VERSION,
  ScreeningTriageService,
  type ScreeningDecision,
} from "../screening-triage.service";

const STARTUP_ID = "11111111-1111-4111-8111-111111111111";

function buildDecision(): ScreeningDecision {
  return {
    id: "decision-1",
    startupId: STARTUP_ID,
    pipelineRunId: null,
    classification: "advance",
    overallScore: 82,
    reasonCodes: [],
    lensSnapshot: [{ key: "market", score: 82, signal: "advance" }],
    policyVersion: POLICY_VERSION,
    createdAt: "2026-04-28T10:00:00.000Z",
  };
}

async function buildController(
  latestForStartup: jest.Mock,
): Promise<ScreeningTriageController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ScreeningTriageController],
    providers: [
      {
        provide: ScreeningTriageService,
        useValue: { latestForStartup },
      },
    ],
  }).compile();
  return moduleRef.get(ScreeningTriageController);
}

describe("ScreeningTriageController", () => {
  it("GET :startupId/decision returns the latest decision", async () => {
    const decision = buildDecision();
    const latestForStartup = jest.fn().mockResolvedValue(decision);
    const controller = await buildController(latestForStartup);

    const out = await controller.getLatest(STARTUP_ID);

    expect(latestForStartup).toHaveBeenCalledWith(STARTUP_ID);
    expect(out).toEqual(decision);
  });

  it("GET :startupId/decision throws 404 when no decision exists", async () => {
    const latestForStartup = jest.fn().mockResolvedValue(null);
    const controller = await buildController(latestForStartup);

    await expect(controller.getLatest(STARTUP_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
