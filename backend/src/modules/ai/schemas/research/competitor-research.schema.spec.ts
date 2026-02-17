import { describe, expect, it } from "bun:test";
import {
  CompetitorResearchSchema,
  CompetitorDetailSchema,
  IndirectCompetitorDetailSchema,
} from "./competitor-research.schema";

describe("CompetitorResearchSchema", () => {
  it("parses valid competitor research data", () => {
    const parsed = CompetitorResearchSchema.parse({
      competitors: [
        {
          name: "RivalCo",
          description: "Main competitor in vertical",
          website: "https://rivalco.example.com",
          fundingRaised: 30_000_000,
          fundingStage: "Series B",
          employeeCount: 150,
          productOverview: "Enterprise workflow automation platform",
          keyFeatures: ["Drag-and-drop builder", "API integrations"],
          pricing: "Enterprise annual contracts",
          targetMarket: "Mid-market and enterprise",
          differentiators: ["Larger ecosystem"],
          weaknesses: ["Not AI-native"],
          threatLevel: "high",
        },
      ],
      indirectCompetitors: [
        {
          name: "ERP Extensions",
          description: "Custom ERP workflow modules",
          whyIndirect: "Competes for same budget",
          threatLevel: "medium",
        },
      ],
      marketPositioning: "Vertical AI-native specialist",
      competitiveLandscapeSummary: "Fragmented with horizontal incumbents",
      sources: ["https://crunchbase.com/rivalco"],
    });

    expect(parsed.competitors).toHaveLength(1);
    expect(parsed.competitors[0].threatLevel).toBe("high");
    expect(parsed.indirectCompetitors).toHaveLength(1);
    expect(parsed.marketPositioning).toBe("Vertical AI-native specialist");
  });

  it("defaults array fields to empty arrays when omitted", () => {
    const parsed = CompetitorResearchSchema.parse({});

    expect(parsed.competitors).toEqual([]);
    expect(parsed.indirectCompetitors).toEqual([]);
    expect(parsed.sources).toEqual([]);
    expect(parsed.marketPositioning).toBe("");
    expect(parsed.competitiveLandscapeSummary).toBe("");
  });

  it("defaults competitor sub-arrays when omitted", () => {
    const parsed = CompetitorDetailSchema.parse({
      name: "Rival",
      description: "A rival",
      productOverview: "Their product",
    });

    expect(parsed.keyFeatures).toEqual([]);
    expect(parsed.differentiators).toEqual([]);
    expect(parsed.weaknesses).toEqual([]);
  });

  it("rejects invalid website URL", () => {
    expect(() =>
      CompetitorDetailSchema.parse({
        name: "Bad",
        description: "Bad URL",
        productOverview: "Overview",
        website: "not-a-url",
      }),
    ).toThrow();
  });

  it("allows optional fields on competitor", () => {
    const parsed = CompetitorDetailSchema.parse({
      name: "Minimal",
      description: "Minimal competitor",
      productOverview: "Basic product",
    });

    expect(parsed.website).toBeUndefined();
    expect(parsed.fundingRaised).toBeUndefined();
    expect(parsed.fundingStage).toBeUndefined();
    expect(parsed.employeeCount).toBeUndefined();
    expect(parsed.pricing).toBeUndefined();
    expect(parsed.targetMarket).toBeUndefined();
    expect(parsed.threatLevel).toBeUndefined();
  });

  it("treats null optional values as undefined", () => {
    const parsed = CompetitorDetailSchema.parse({
      name: "NullCo",
      description: "Null-friendly payload",
      website: null,
      fundingRaised: null,
      fundingStage: null,
      employeeCount: null,
      pricing: null,
      targetMarket: null,
      threatLevel: null,
      productOverview: "Core product",
    });

    expect(parsed.website).toBeUndefined();
    expect(parsed.fundingRaised).toBeUndefined();
    expect(parsed.fundingStage).toBeUndefined();
    expect(parsed.employeeCount).toBeUndefined();
    expect(parsed.pricing).toBeUndefined();
    expect(parsed.targetMarket).toBeUndefined();
    expect(parsed.threatLevel).toBeUndefined();
  });
});

describe("IndirectCompetitorDetailSchema", () => {
  it("parses valid indirect competitor", () => {
    const parsed = IndirectCompetitorDetailSchema.parse({
      name: "Substitute",
      description: "Alternative approach",
      whyIndirect: "Adjacent market overlap",
      threatLevel: "low",
      website: "https://substitute.example.com",
    });

    expect(parsed.name).toBe("Substitute");
    expect(parsed.whyIndirect).toBe("Adjacent market overlap");
  });

  it("requires whyIndirect field", () => {
    expect(() =>
      IndirectCompetitorDetailSchema.parse({
        name: "NoWhy",
        description: "Missing whyIndirect",
      }),
    ).toThrow();
  });
});
