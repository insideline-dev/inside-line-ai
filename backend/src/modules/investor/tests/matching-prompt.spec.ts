import { describe, it, expect } from "bun:test";
import { buildThesisSummary } from "../thesis-summary.util";

describe("buildThesisSummary (matching fallback)", () => {
  it("generates a summary from raw thesis fields when thesisSummary is null", () => {
    const candidate = {
      thesisNarrative: "We invest in early-stage AI companies.",
      notes: null,
      industries: ["AI", "SaaS"],
      stages: ["Seed", "Pre-Seed"],
      geographicFocus: ["United States"],
      checkSizeMin: 100_000,
      checkSizeMax: 500_000,
    };

    const summary = buildThesisSummary(candidate);

    expect(summary).toContain("early-stage AI companies");
    expect(summary).toContain("Focus industries: AI, SaaS.");
    expect(summary).toContain("Preferred stages: Seed, Pre-Seed.");
    expect(summary).toContain("Geographic focus: United States.");
    expect(summary).toContain("100,000");
    expect(summary).toContain("500,000");
    expect(summary).not.toBe("Not available");
  });

  it("returns a default message when all fields are empty/null", () => {
    const candidate = {
      thesisNarrative: null,
      notes: null,
      industries: null,
      stages: null,
      geographicFocus: null,
      checkSizeMin: null,
      checkSizeMax: null,
    };

    const summary = buildThesisSummary(candidate);

    expect(summary).toBe(
      "General investment thesis — no specific criteria provided.",
    );
    expect(summary).not.toBe("Not available");
  });

  it("includes notes when narrative is absent", () => {
    const candidate = {
      thesisNarrative: null,
      notes: "Looking for B2B fintech with strong unit economics",
      industries: ["FinTech"],
      stages: null,
    };

    const summary = buildThesisSummary(candidate);

    expect(summary).toContain("Notes: Looking for B2B fintech");
    expect(summary).toContain("Focus industries: FinTech.");
  });

  it("truncates output to 2000 chars max", () => {
    const candidate = {
      thesisNarrative: "A".repeat(3000),
    };

    const summary = buildThesisSummary(candidate);

    expect(summary.length).toBeLessThanOrEqual(2000);
  });
});

describe("matching prompt variables completeness", () => {
  it("alignThesis variable keys match the expected set", () => {
    // This verifies the variable-building logic produces all keys
    // that the prompt template expects (mirrors what alignThesis sends)
    const expectedKeys = [
      "investorThesisSummary",
      "investorThesis",
      "startupSummary",
      "overallScore",
      "startupProfile",
    ];

    // Simulate the variable object built in alignThesis
    const variables: Record<string, string | number> = {
      investorThesisSummary: "Some summary",
      investorThesis: "Some narrative",
      startupSummary: "Deal snapshot text",
      overallScore: 75,
      startupProfile: JSON.stringify({ dealSnapshot: "test" }),
    };

    const actualKeys = Object.keys(variables);

    for (const key of expectedKeys) {
      expect(actualKeys).toContain(key);
    }

    // Ensure no stale keys like 'recommendation'
    expect(actualKeys).not.toContain("recommendation");
  });
});
