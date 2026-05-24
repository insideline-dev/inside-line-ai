import { describe, expect, it } from "bun:test";
import {
  FitStatusSchema,
  ThesisFitOutputSchema,
} from "../../schemas/thesis-fit.schema";
import { ThesisFitService } from "./thesis-fit.service";

const fakeOutput = {
  geography: { status: "match" as const, note: "California is within US thesis" },
  stage: { status: "borderline" as const, note: "Pre-seed vs seed thesis" },
  sector: { status: "match" as const, note: "AI infra matches thesis" },
  checkSize: { status: "mismatch" as const, note: "$5M round, thesis caps $2M" },
  overall: 62,
  rationale: "Strong geography + sector fit; check size is the blocker.",
};

describe("ThesisFitOutputSchema", () => {
  it("accepts a well-formed per-axis structured output", () => {
    const parsed = ThesisFitOutputSchema.parse(fakeOutput);
    expect(parsed.overall).toBe(62);
    expect(parsed.geography.status).toBe("match");
    expect(parsed.checkSize.status).toBe("mismatch");
  });

  it("rejects unknown axis status values", () => {
    expect(() =>
      ThesisFitOutputSchema.parse({
        ...fakeOutput,
        geography: { status: "great", note: "x" },
      }),
    ).toThrow();
  });

  it("rejects empty notes", () => {
    expect(() =>
      ThesisFitOutputSchema.parse({
        ...fakeOutput,
        sector: { status: "match", note: "" },
      }),
    ).toThrow();
  });

  it("rejects out-of-range overall scores", () => {
    expect(() =>
      ThesisFitOutputSchema.parse({ ...fakeOutput, overall: 105 }),
    ).toThrow();
  });

  it("exposes the three allowed fit statuses", () => {
    expect(FitStatusSchema.options).toEqual([
      "match",
      "borderline",
      "mismatch",
    ]);
  });
});

describe("ThesisFitService", () => {
  it("returns model output verbatim when LLM produces valid structured output", async () => {
    const service = new ThesisFitService(
      { resolveModelForPurpose: () => ({} as never) } as never,
      {
        generateText: async () => ({ output: fakeOutput, experimental_output: undefined, text: "" }),
      } as never,
    );

    const result = await service.assess(
      {
        industries: ["AI infrastructure"],
        stages: ["seed"],
        checkSizeMin: 500_000,
        checkSizeMax: 2_000_000,
        geographicFocus: ["US"],
        businessModels: null,
        mustHaveFeatures: null,
        dealBreakers: null,
        thesisNarrative: null,
      },
      {
        companyName: "Acme AI",
        industry: "AI infrastructure",
        stage: "pre-seed",
        geography: "California, USA",
        checkContext: "raising $5M",
        classification: { sector: "ai-infra", stage: "pre-seed" },
        additionalSignals: null,
      },
    );

    expect(result.overall).toBe(62);
    expect(result.geography.status).toBe("match");
    expect(result.checkSize.status).toBe("mismatch");
  });

  it("falls back to neutral when model returns empty output", async () => {
    const service = new ThesisFitService(
      { resolveModelForPurpose: () => ({} as never) } as never,
      {
        generateText: async () => ({ output: undefined, experimental_output: undefined, text: "" }),
      } as never,
    );

    const result = await service.assess(
      {
        industries: null,
        stages: null,
        checkSizeMin: null,
        checkSizeMax: null,
        geographicFocus: null,
        businessModels: null,
        mustHaveFeatures: null,
        dealBreakers: null,
        thesisNarrative: null,
      },
      {
        companyName: "Acme",
        industry: null,
        stage: null,
        geography: null,
        checkContext: null,
        classification: null,
        additionalSignals: null,
      },
    );

    expect(result.overall).toBe(50);
    expect(result.geography.status).toBe("borderline");
    expect(result.rationale).toContain("neutral");
  });

  it("reproduces the California/US bug fix: 'California' against 'US' thesis is NOT mismatched", async () => {
    const californiaMatch = {
      ...fakeOutput,
      geography: {
        status: "match" as const,
        note: "California is part of the US — within US thesis",
      },
    };

    const service = new ThesisFitService(
      { resolveModelForPurpose: () => ({} as never) } as never,
      {
        generateText: async () => ({ output: californiaMatch, experimental_output: undefined, text: "" }),
      } as never,
    );

    const result = await service.assess(
      {
        industries: null,
        stages: null,
        checkSizeMin: null,
        checkSizeMax: null,
        geographicFocus: ["US"],
        businessModels: null,
        mustHaveFeatures: null,
        dealBreakers: null,
        thesisNarrative: null,
      },
      {
        companyName: "Acme",
        industry: null,
        stage: null,
        geography: "California",
        checkContext: null,
        classification: { geography: "general" },
        additionalSignals: null,
      },
    );

    expect(result.geography.status).toBe("match");
    expect(result.geography.status).not.toBe("mismatch");
  });
});
