import { describe, expect, it } from "bun:test";
import {
  buildTriageRationale,
  dealbreakerNoteFromReasonCodes,
  isVerdict,
  shouldHideByInvestorThresholds,
} from "../screening-queue.service";
import type { ScreeningDecisionThesisFit } from "../../ai/entities/screening-decision.schema";

const fit: ScreeningDecisionThesisFit = {
  geography: { status: "match", note: "Paris, France fits Europe thesis" },
  stage: { status: "match", note: "Series A matches focus" },
  sector: { status: "match", note: "AI/audio fits AI/software" },
  checkSize: { status: "borderline", note: "$4M above $500k-$3M" },
  overall: 78,
  rationale: "Strong on geo/stage/sector; check size is the main gap.",
};

describe("buildTriageRationale", () => {
  it("prefers the thesis-fit rationale when present", () => {
    expect(buildTriageRationale(["lens.team.review"], fit)).toBe(
      "Strong on geo/stage/sector; check size is the main gap.",
    );
  });

  it("drops missing_materials from the lens-flag fallback", () => {
    expect(
      buildTriageRationale(["missing_materials", "lens.team.reject"], null),
    ).toBe("Team lens reject");
  });

  it("returns the all-aligned message when only missing_materials remains", () => {
    expect(buildTriageRationale(["missing_materials"], null)).toBe(
      "All lens signals are aligned.",
    );
  });

  it("falls back to a humanised lens summary when fit is absent", () => {
    expect(
      buildTriageRationale(["lens.market.reject", "lens.team.review"], null),
    ).toBe("Market lens reject · Team lens review");
  });

  it("ignores empty-string rationale on fit object", () => {
    const fitNoRationale = { ...fit, rationale: "   " };
    expect(buildTriageRationale(["lens.team.review"], fitNoRationale)).toBe(
      "Team lens review",
    );
  });
});

describe("dealbreakerNoteFromReasonCodes", () => {
  it("picks the first dealbreaker code", () => {
    expect(
      dealbreakerNoteFromReasonCodes(["dealbreaker_crypto", "lens.team.review"]),
    ).toBe("dealbreaker crypto");
  });

  it("returns null when nothing looks like a blocker", () => {
    expect(
      dealbreakerNoteFromReasonCodes(["lens.team.review", "missing_materials"]),
    ).toBeNull();
  });
});

describe("shouldHideByInvestorThresholds", () => {
  it("keeps rows visible when thesis-fit is missing", () => {
    expect(
      shouldHideByInvestorThresholds(
        { overallScore: 90, fit: null },
        { minThesisFitScore: 80, minStartupScore: null },
      ),
    ).toBe(false);
  });

  it("hides rows below the thesis-fit threshold", () => {
    expect(
      shouldHideByInvestorThresholds(
        { overallScore: 90, fit: { ...fit, overall: 79 } },
        { minThesisFitScore: 80, minStartupScore: null },
      ),
    ).toBe(true);
  });

  it("hides rows below the startup-score threshold", () => {
    expect(
      shouldHideByInvestorThresholds(
        { overallScore: 69, fit },
        { minThesisFitScore: null, minStartupScore: 70 },
      ),
    ).toBe(true);
  });

  it("keeps rows visible when both thresholds pass", () => {
    expect(
      shouldHideByInvestorThresholds(
        { overallScore: 80, fit },
        { minThesisFitScore: 70, minStartupScore: 75 },
      ),
    ).toBe(false);
  });
});

describe("isVerdict", () => {
  it("accepts the three known verdicts", () => {
    expect(isVerdict("review")).toBe(true);
    expect(isVerdict("advance")).toBe(true);
    expect(isVerdict("reject")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isVerdict("pass")).toBe(false);
    expect(isVerdict("")).toBe(false);
    expect(isVerdict("REVIEW")).toBe(false);
  });
});
