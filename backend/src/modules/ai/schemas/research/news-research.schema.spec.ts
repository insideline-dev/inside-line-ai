import { describe, expect, it } from "bun:test";
import { NewsResearchSchema } from "./news-research.schema";

describe("NewsResearchSchema", () => {
  it("parses valid news research data", () => {
    const parsed = NewsResearchSchema.parse({
      articles: [
        {
          title: "Company raises Series A",
          source: "TechCrunch",
          date: "2026-01-15",
          summary: "Company announced funding",
          url: "https://techcrunch.com/article",
        },
      ],
      pressReleases: ["Official launch announcement"],
      sentiment: "positive",
      recentEvents: ["Product launch"],
      sources: ["https://techcrunch.com/article"],
    });

    expect(parsed.articles).toHaveLength(1);
    expect(parsed.sentiment).toBe("positive");
  });

  it("defaults sentiment to neutral when omitted", () => {
    const parsed = NewsResearchSchema.parse({
      articles: [],
      pressReleases: [],
      recentEvents: [],
      sources: [],
    });

    expect(parsed.sentiment).toBe("neutral");
  });

  it("defaults all arrays to empty when omitted", () => {
    const parsed = NewsResearchSchema.parse({
      sentiment: "negative",
    });

    expect(parsed.articles).toEqual([]);
    expect(parsed.pressReleases).toEqual([]);
    expect(parsed.recentEvents).toEqual([]);
    expect(parsed.sources).toEqual([]);
  });

  it("validates sentiment enum values", () => {
    expect(() =>
      NewsResearchSchema.parse({
        articles: [],
        pressReleases: [],
        sentiment: "invalid-sentiment",
        recentEvents: [],
        sources: [],
      }),
    ).toThrow();
  });

  it("accepts all valid sentiment values", () => {
    const positive = NewsResearchSchema.parse({
      articles: [],
      pressReleases: [],
      sentiment: "positive",
      recentEvents: [],
      sources: [],
    });

    const neutral = NewsResearchSchema.parse({
      articles: [],
      pressReleases: [],
      sentiment: "neutral",
      recentEvents: [],
      sources: [],
    });

    const negative = NewsResearchSchema.parse({
      articles: [],
      pressReleases: [],
      sentiment: "negative",
      recentEvents: [],
      sources: [],
    });

    expect(positive.sentiment).toBe("positive");
    expect(neutral.sentiment).toBe("neutral");
    expect(negative.sentiment).toBe("negative");
  });
});
