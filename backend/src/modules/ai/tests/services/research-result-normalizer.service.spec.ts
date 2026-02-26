import { describe, expect, it } from "bun:test";
import { normalizeResearchResult } from "../../services/research-result-normalizer";

describe("normalizeResearchResult", () => {
  it("coerces legacy non-string research branches into combined report text", () => {
    const normalized = normalizeResearchResult({
      team: { summary: "Legacy team payload" } as never,
      market: ["Legacy market payload"] as never,
      product: null,
      news: undefined,
      competitor: { name: "Legacy competitor payload" } as never,
      combinedReportText: "" as never,
      sources: [],
      errors: [],
    });

    expect(normalized.result.combinedReportText).toContain("Legacy team payload");
    expect(normalized.result.combinedReportText).toContain("Legacy market payload");
    expect(normalized.result.combinedReportText).toContain(
      "Legacy competitor payload",
    );
    expect(normalized.warnings).toContain("team:coerced_to_text");
    expect(normalized.warnings).toContain("market:coerced_to_text");
    expect(normalized.warnings).toContain("competitor:coerced_to_text");
  });
});
