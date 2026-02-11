import { describe, expect, it } from "bun:test";
import { MarketResearchSchema, MarketCompetitorSchema } from "./market-research.schema";

describe("MarketResearchSchema", () => {
  it("parses valid market research data", () => {
    const parsed = MarketResearchSchema.parse({
      marketReports: ["Gartner 2026"],
      competitors: [
        {
          name: "CompanyA",
          description: "Main competitor",
          fundingRaised: 5_000_000,
          url: "https://company-a.example.com",
        },
      ],
      marketTrends: ["AI adoption accelerating"],
      marketSize: {
        tam: 10_000_000_000,
        sam: 1_000_000_000,
        som: 100_000_000,
      },
      sources: ["https://gartner.com/report"],
    });

    expect(parsed.competitors).toHaveLength(1);
    expect(parsed.marketSize.tam).toBe(10_000_000_000);
  });

  it("defaults marketSize to empty object when omitted", () => {
    const parsed = MarketResearchSchema.parse({
      marketReports: ["Report A"],
      competitors: [],
      marketTrends: ["Trend 1"],
      sources: [],
    });

    expect(parsed.marketSize).toEqual({});
  });

  it("defaults array fields to empty arrays when omitted", () => {
    const parsed = MarketResearchSchema.parse({
      marketSize: {},
    });

    expect(parsed.marketReports).toEqual([]);
    expect(parsed.competitors).toEqual([]);
    expect(parsed.marketTrends).toEqual([]);
    expect(parsed.sources).toEqual([]);
  });

  it("parses marketSize with partial data", () => {
    const parsed = MarketResearchSchema.parse({
      marketReports: [],
      competitors: [],
      marketTrends: [],
      marketSize: {
        tam: 5_000_000,
      },
      sources: [],
    });

    expect(parsed.marketSize.tam).toBe(5_000_000);
    expect(parsed.marketSize.sam).toBeUndefined();
    expect(parsed.marketSize.som).toBeUndefined();
  });

  it("rejects negative market size values", () => {
    expect(() =>
      MarketResearchSchema.parse({
        marketReports: [],
        competitors: [],
        marketTrends: [],
        marketSize: {
          tam: -1000,
        },
        sources: [],
      }),
    ).toThrow();
  });
});

describe("MarketCompetitorSchema", () => {
  it("parses competitor with url as optional", () => {
    const parsed = MarketCompetitorSchema.parse({
      name: "Competitor X",
      description: "Main rival in space",
      fundingRaised: 2_000_000,
    });

    expect(parsed.name).toBe("Competitor X");
    expect(parsed.url).toBeUndefined();
  });

  it("parses competitor with url present", () => {
    const parsed = MarketCompetitorSchema.parse({
      name: "Competitor Y",
      description: "Secondary rival",
      url: "https://competitor-y.example.com",
    });

    expect(parsed.url).toBe("https://competitor-y.example.com");
  });

  it("rejects invalid url format", () => {
    expect(() =>
      MarketCompetitorSchema.parse({
        name: "Competitor Z",
        description: "Description",
        url: "not-a-valid-url",
      }),
    ).toThrow();
  });
});
