import { describe, expect, it } from "bun:test";
import { detectMissingMaterials } from "./missing-materials";

function resourcedBaseline() {
  return {
    pitchDeckUrl: "https://example.com/deck.pdf",
    pitchDeckPath: "/decks/x.pdf",
    productDescription:
      "A long-enough product description to clear the screening threshold for evaluation.",
    description: "Same — keeps the helper above min char floor.",
    teamMembers: [
      { name: "Ana Founder", role: "CEO" },
      { name: "Jay Co", role: "CTO" },
    ],
    fundingTarget: 1_000_000,
    valuation: 5_000_000,
    raiseType: "safe",
    website: "https://startup.example",
  };
}

describe("detectMissingMaterials traction_data (DS-E7-F4)", () => {
  it("does not flag deal_terms from missing funding fields", () => {
    const missing = detectMissingMaterials({
      ...resourcedBaseline(),
      fundingTarget: null,
      valuation: null,
      raiseType: null,
    });
    expect(missing).not.toContain("deal_terms");
  });

  it("does NOT flag traction_data when no snapshot was captured (silent miss)", () => {
    const missing = detectMissingMaterials(resourcedBaseline());
    expect(missing).not.toContain("traction_data");
  });

  it("flags traction_data when the deck was inspected and every traction field is empty", () => {
    const missing = detectMissingMaterials({
      ...resourcedBaseline(),
      tractionSnapshot: {
        customers: null,
        users: null,
        churnRate: null,
        notableClaims: [],
      },
    });
    expect(missing).toContain("traction_data");
  });

  it("does NOT flag traction_data when at least one traction signal exists", () => {
    const missing = detectMissingMaterials({
      ...resourcedBaseline(),
      tractionSnapshot: {
        customers: "12 paying customers",
        users: null,
        churnRate: null,
        notableClaims: [],
      },
    });
    expect(missing).not.toContain("traction_data");
  });

  it("treats notableClaims as a valid traction signal", () => {
    const missing = detectMissingMaterials({
      ...resourcedBaseline(),
      tractionSnapshot: {
        customers: null,
        users: null,
        churnRate: null,
        notableClaims: ["$2M ARR", "200% YoY"],
      },
    });
    expect(missing).not.toContain("traction_data");
  });

  it("ignores empty-string traction fields", () => {
    const missing = detectMissingMaterials({
      ...resourcedBaseline(),
      tractionSnapshot: {
        customers: "   ",
        users: "",
        churnRate: null,
        notableClaims: ["   "],
      },
    });
    expect(missing).toContain("traction_data");
  });
});
