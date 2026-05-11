import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { DrizzleService } from "../../../database";
import { CalibrationService } from "../calibration.service";

const INVESTOR_ID = "11111111-1111-4111-8111-111111111111";

interface MockDb {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
}

function makeMockDb(
  rows: {
    verdict: string;
    triage: string | null;
    reasonTags?: string[];
    startupId?: string;
    decidedAt?: Date | string;
  }[],
): MockDb {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(
      rows.map((row, index) => ({
        reasonTags: [],
        startupId: `startup-${index + 1}`,
        decidedAt: new Date(`2026-04-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`),
        ...row,
      })),
    ),
  };
}

async function build(
  rows: {
    verdict: string;
    triage: string | null;
    reasonTags?: string[];
    startupId?: string;
    decidedAt?: Date | string;
  }[],
) {
  const db = makeMockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      CalibrationService,
      { provide: DrizzleService, useValue: { db } },
    ],
  }).compile();
  return moduleRef.get(CalibrationService);
}

describe("CalibrationService.getStatsForInvestor", () => {
  it("returns zero stats when no decisions exist", async () => {
    const svc = await build([]);
    const out = await svc.getStatsForInvestor(INVESTOR_ID);
    expect(out).toEqual({
      totalDecisions: 0,
      decisionsWithTriage: 0,
      aligned: 0,
      falsePositive: 0,
      falseNegative: 0,
      softMismatch: 0,
      alignmentRate: null,
      topOverrideReasons: [],
      recentMismatches: [],
      lensDeltas: [],
    });
  });

  it("counts decisions without triage snapshot but excludes them from rate", async () => {
    const svc = await build([
      { verdict: "advance", triage: null },
      { verdict: "pass", triage: null },
    ]);
    const out = await svc.getStatsForInvestor(INVESTOR_ID);
    expect(out.totalDecisions).toBe(2);
    expect(out.decisionsWithTriage).toBe(0);
    expect(out.alignmentRate).toBeNull();
  });

  it("classifies false_positive when triage=advance but investor passed", async () => {
    const svc = await build([
      { verdict: "pass", triage: "advance" },
      { verdict: "pass", triage: "advance" },
    ]);
    const out = await svc.getStatsForInvestor(INVESTOR_ID);
    expect(out.falsePositive).toBe(2);
    expect(out.aligned).toBe(0);
    expect(out.alignmentRate).toBe(0);
  });

  it("classifies false_negative when triage=reject but investor advanced", async () => {
    const svc = await build([{ verdict: "advance", triage: "reject" }]);
    const out = await svc.getStatsForInvestor(INVESTOR_ID);
    expect(out.falseNegative).toBe(1);
    expect(out.alignmentRate).toBe(0);
  });

  it("classifies soft_mismatch when triage=review and investor decisive", async () => {
    const svc = await build([
      { verdict: "advance", triage: "review" },
      { verdict: "pass", triage: "review" },
    ]);
    const out = await svc.getStatsForInvestor(INVESTOR_ID);
    expect(out.softMismatch).toBe(2);
    expect(out.aligned).toBe(0);
  });

  it("treats matching buckets as aligned", async () => {
    const svc = await build([
      { verdict: "advance", triage: "advance" },
      { verdict: "pass", triage: "reject" },
      { verdict: "hold", triage: "review" },
      { verdict: "hold", triage: "advance" },
    ]);
    const out = await svc.getStatsForInvestor(INVESTOR_ID);
    expect(out.aligned).toBe(4);
    expect(out.alignmentRate).toBe(1);
  });

  it("computes alignmentRate from decisions-with-triage only", async () => {
    const svc = await build([
      { verdict: "advance", triage: "advance" },
      { verdict: "pass", triage: "advance" },
      { verdict: "pass", triage: null },
    ]);
    const out = await svc.getStatsForInvestor(INVESTOR_ID);
    expect(out.totalDecisions).toBe(3);
    expect(out.decisionsWithTriage).toBe(2);
    expect(out.aligned).toBe(1);
    expect(out.falsePositive).toBe(1);
    expect(out.alignmentRate).toBe(0.5);
  });

  it("surfaces the most common override reasons and recent mismatches", async () => {
    const svc = await build([
      {
        verdict: "pass",
        triage: "advance",
        reasonTags: ["pricing", "team"],
        startupId: "startup-1",
        decidedAt: "2026-04-30T12:00:00.000Z",
      },
      {
        verdict: "advance",
        triage: "reject",
        reasonTags: ["team", "timing"],
        startupId: "startup-2",
        decidedAt: "2026-04-29T12:00:00.000Z",
      },
      {
        verdict: "pass",
        triage: "review",
        reasonTags: ["pricing"],
        startupId: "startup-3",
        decidedAt: "2026-04-28T12:00:00.000Z",
      },
      {
        verdict: "hold",
        triage: "advance",
        reasonTags: ["pricing"],
        startupId: "startup-4",
        decidedAt: "2026-04-27T12:00:00.000Z",
      },
    ]);

    const out = await svc.getStatsForInvestor(INVESTOR_ID);

    expect(out.falsePositive).toBe(1);
    expect(out.falseNegative).toBe(1);
    expect(out.softMismatch).toBe(1);
    expect(out.topOverrideReasons).toEqual([
      { reasonTag: "pricing", count: 2 },
      { reasonTag: "team", count: 2 },
      { reasonTag: "timing", count: 1 },
    ]);
    expect(out.recentMismatches).toHaveLength(3);
    expect(out.recentMismatches[0]).toMatchObject({
      startupId: "startup-1",
      mismatchType: "false_positive",
      modelVerdict: "advance",
      investorVerdict: "pass",
      reasonTags: ["pricing", "team"],
    });
  });
});
