import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ScreeningOutputService } from "../../../contracts/screening-output";
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
  latestOutputForStartup: jest.Mock = jest.fn().mockResolvedValue(null),
): Promise<ScreeningTriageController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ScreeningTriageController],
    providers: [
      {
        provide: ScreeningTriageService,
        useValue: { latestForStartup },
      },
      {
        provide: ScreeningOutputService,
        useValue: { latestForStartup: latestOutputForStartup },
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

  // DS-E9-F1-S1 — ScreeningOutput v1 endpoint feeds the deal-card
  // evidence popover.
  it("GET :startupId/output returns the latest screening output", async () => {
    const output = {
      version: 1 as const,
      startupId: STARTUP_ID,
      pipelineRunId: null,
      generatedAt: "2026-04-30T10:00:00.000Z",
      overall: { score: 82, signal: "advance" as const, missingMaterials: [] },
      lenses: [
        {
          key: "market",
          score: 82,
          signal: "advance" as const,
          rationale: "Strong TAM",
          evidence: [
            {
              claim: "Market size $5B per Gartner 2025",
              source: "https://gartner.com/report",
              confidence: "high" as const,
            },
          ],
          modelId: "gpt-5.4-mini",
          promptKey: "lens.market",
          latencyMs: 1234,
          usedFallback: false,
        },
      ],
    };
    const latestOutput = jest.fn().mockResolvedValue(output);
    const controller = await buildController(jest.fn(), latestOutput);

    const out = await controller.getOutput(STARTUP_ID);

    expect(latestOutput).toHaveBeenCalledWith(STARTUP_ID);
    expect(out).toEqual(output);
  });

  it("GET :startupId/output throws 404 when no output exists", async () => {
    const latestOutput = jest.fn().mockResolvedValue(null);
    const controller = await buildController(jest.fn(), latestOutput);

    await expect(controller.getOutput(STARTUP_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
