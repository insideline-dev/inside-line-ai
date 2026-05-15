import { describe, expect, it } from "bun:test";
import { computeProposals } from "../screening-calibration.service";

function decision(
  classification: "advance" | "review" | "reject",
  reasonCodes: string[] = [],
) {
  return {
    classification,
    reason_codes: reasonCodes,
    created_at: new Date(),
  };
}

describe("screening-calibration computeProposals", () => {
  it("returns no proposals when the verdict mix is balanced", () => {
    const out = computeProposals([
      decision("advance"),
      decision("review"),
      decision("review"),
      decision("reject"),
      decision("reject"),
      decision("advance"),
    ]);
    expect(out).toHaveLength(0);
  });

  it("emits 'thesis_too_narrow' when reject rate >= 70%", () => {
    const out = computeProposals([
      decision("reject"),
      decision("reject"),
      decision("reject"),
      decision("reject"),
      decision("reject"),
      decision("reject"),
      decision("reject"),
      decision("advance"),
      decision("advance"),
      decision("review"),
    ]);
    expect(out.some((p) => p.kind === "thesis_too_narrow")).toBe(true);
    const proposal = out.find((p) => p.kind === "thesis_too_narrow")!;
    expect(proposal.summary).toMatch(/70%/);
    expect(proposal.evidenceCount).toBe(7);
  });

  it("emits 'high_review_rate' when review rate >= 60%", () => {
    const out = computeProposals([
      decision("review"),
      decision("review"),
      decision("review"),
      decision("review"),
      decision("review"),
      decision("review"),
      decision("advance"),
      decision("reject"),
      decision("advance"),
      decision("advance"),
    ]);
    expect(out.some((p) => p.kind === "high_review_rate")).toBe(true);
  });

  it("emits 'lens_rejects_dominant' when one lens drives >= 50% of reject reasons", () => {
    const out = computeProposals([
      decision("reject", ["lens.team.reject"]),
      decision("reject", ["lens.team.reject"]),
      decision("reject", ["lens.team.reject"]),
      decision("reject", ["lens.team.reject"]),
      decision("reject", ["lens.market.reject"]),
      decision("advance"),
      decision("advance"),
      decision("advance"),
    ]);
    const dom = out.find((p) => p.kind === "lens_rejects_dominant");
    expect(dom).toBeDefined();
    expect(dom?.lensKey).toBe("team");
  });

  it("returns no proposals below the minimum decision count", () => {
    const out = computeProposals([
      decision("reject"),
      decision("reject"),
    ]);
    expect(out).toHaveLength(0);
  });

  it("ignores non-lens reason codes when computing dominance", () => {
    const out = computeProposals([
      decision("reject", ["dealbreaker_crypto", "missing_materials"]),
      decision("reject", ["dealbreaker_crypto"]),
      decision("reject", ["missing_materials"]),
      decision("advance"),
      decision("advance"),
      decision("review"),
      decision("review"),
    ]);
    expect(out.some((p) => p.kind === "lens_rejects_dominant")).toBe(false);
  });

  it("includes lensKey on dominance proposals so the UI can place them", () => {
    const out = computeProposals([
      decision("reject", ["lens.market.reject"]),
      decision("reject", ["lens.market.reject"]),
      decision("reject", ["lens.market.reject"]),
      decision("reject", ["lens.market.reject"]),
      decision("reject", ["lens.market.reject"]),
      decision("reject", ["lens.team.reject"]),
      decision("advance"),
    ]);
    const dom = out.find((p) => p.kind === "lens_rejects_dominant");
    expect(dom?.lensKey).toBe("market");
  });
});
