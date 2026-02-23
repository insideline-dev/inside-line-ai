import { describe, expect, it } from "bun:test";
import { getSummaryFromData } from "./pdf.types";

const SCORE_CONFIDENCE_PATTERN = /\b\d{1,3}\s*\/\s*100\b[\s\S]*\bconfidence\b/i;

describe("getSummaryFromData", () => {
  it("sanitizes score/confidence phrasing from narrative summaries", () => {
    const summary = getSummaryFromData({
      narrativeSummary:
        "This section is currently scored at 88/100 with 85% confidence. The team has demonstrated strong execution discipline with clear milestone delivery and transparent operating cadence.",
    });

    expect(summary).toBeTruthy();
    expect(summary ?? "").not.toMatch(SCORE_CONFIDENCE_PATTERN);
    expect(summary ?? "").toContain("The team has demonstrated strong execution discipline");
  });

  it("returns null when summary content only contains score/confidence boilerplate", () => {
    const summary = getSummaryFromData({
      summary: "This section is currently scored at 88/100 with 85% confidence.",
    });

    expect(summary).toBeNull();
  });
});

