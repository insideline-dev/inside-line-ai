import { describe, expect, it } from "bun:test";
import { LensEvidenceSchema } from "../schemas/lens";

describe("LensEvidenceSchema", () => {
  it("accepts deck page citations and derives a valid link shape", () => {
    expect(() =>
      LensEvidenceSchema.parse({
        claim: "Roadmap is on slide 12",
        source: "deck:p12",
        confidence: "high",
      }),
    ).not.toThrow();
  });

  it("accepts public URL citations", () => {
    expect(() =>
      LensEvidenceSchema.parse({
        claim: "LinkedIn confirms the founding team",
        source: "https://linkedin.com/company/example",
        confidence: "medium",
      }),
    ).not.toThrow();
  });

  it("rejects blank sources", () => {
    expect(() =>
      LensEvidenceSchema.parse({
        claim: "This claim is unsupported",
        source: "   ",
        confidence: "low",
      }),
    ).toThrow(/source/i);
  });
});
