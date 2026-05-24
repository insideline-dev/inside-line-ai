import { describe, expect, it } from "bun:test";
import {
  buildTriageRationale,
  dealbreakerNoteFromReasonCodes,
  isVerdict,
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

  it("picks reject-suffixed codes as a fallback", () => {
    expect(dealbreakerNoteFromReasonCodes(["lens.market.reject"])).toBe(
      "lens.market.reject",
    );
  });

  it("returns null when nothing looks like a blocker", () => {
    expect(
      dealbreakerNoteFromReasonCodes(["lens.team.review", "missing_materials"]),
    ).toBeNull();
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
