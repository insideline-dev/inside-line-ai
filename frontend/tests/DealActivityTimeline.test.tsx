import { describe, expect, it } from "bun:test";
import { formatEvent } from "../src/components/startup-view/DealActivityTimeline";

describe("formatEvent", () => {
  it("highlights calibration mismatches in decision events", () => {
    const out = formatEvent({
      id: "event-1",
      startupId: "startup-1",
      type: "decision.recorded",
      occurredAt: "2026-04-30T12:00:00.000Z",
      payload: {
        verdict: "pass",
        reasonTags: ["pricing"],
        calibration: {
          comparisonAvailable: true,
          mismatchType: "false_positive",
          modelVerdict: "advance",
          investorVerdict: "pass",
          reasonTags: ["pricing"],
        },
      },
    });

    expect(out.label).toBe("Investor decision: pass");
    expect(out.tone).toBe("bad");
    expect(out.detail).toContain("false positive");
    expect(out.detail).toContain("advance → pass");
    expect(out.detail).toContain("pricing");
  });
});
