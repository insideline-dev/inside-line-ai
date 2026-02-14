import { beforeEach, describe, expect, it, jest } from "bun:test";
import { DrizzleService } from "../../../../database";
import { ScrapingService } from "../../services/scraping.service";
import { WebsiteScraperService } from "../../services/website-scraper.service";
import { LinkedinEnrichmentService } from "../../services/linkedin-enrichment.service";
import { ScrapingCacheService } from "../../services/scraping-cache.service";

describe("ScrapingService", () => {
  let service: ScrapingService;
  let drizzle: jest.Mocked<DrizzleService>;
  let websiteScraper: jest.Mocked<WebsiteScraperService>;
  let linkedin: jest.Mocked<LinkedinEnrichmentService>;
  let cache: jest.Mocked<ScrapingCacheService>;

  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  };

  beforeEach(() => {
    mockDb.limit.mockResolvedValue([
      {
        id: "startup-1",
        userId: "user-123",
        website: "https://inside-line.test",
        name: "Inside Line",
        industry: "SaaS",
        stage: "seed",
        description: "AI startup screening",
        teamMembers: [{ name: "Alex Founder", role: "CEO", linkedinUrl: "https://linkedin.com/in/alex-founder" }],
      },
    ]);

    drizzle = { db: mockDb as any } as jest.Mocked<DrizzleService>;

    websiteScraper = {
      deepScrape: jest.fn().mockResolvedValue({
        url: "https://inside-line.test/",
        title: "Inside Line",
        description: "AI startup screening",
        fullText: "scraped content",
        headings: ["AI Venture Screening"],
        subpages: [],
        links: [],
        teamBios: [],
        customerLogos: [],
        testimonials: [],
        metadata: {
          scrapedAt: new Date().toISOString(),
          pageCount: 1,
          hasAboutPage: false,
          hasTeamPage: false,
          hasPricingPage: false,
        },
      }),
    } as unknown as jest.Mocked<WebsiteScraperService>;

    linkedin = {
      enrichTeamMembers: jest.fn().mockResolvedValue([
        {
          name: "Alex Founder",
          role: "CEO",
          linkedinUrl: "https://linkedin.com/in/alex-founder",
          enrichmentStatus: "success",
        },
      ]),
    } as unknown as jest.Mocked<LinkedinEnrichmentService>;

    cache = {
      getWebsiteCache: jest.fn().mockResolvedValue(null),
      setWebsiteCache: jest.fn().mockResolvedValue(undefined),
      getLinkedinCache: jest.fn().mockResolvedValue(null),
      setLinkedinCache: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ScrapingCacheService>;

    service = new ScrapingService(drizzle, websiteScraper, linkedin, cache);
  });

  it("orchestrates website scrape and linkedin enrichment", async () => {
    const result = await service.run("startup-1");

    expect(websiteScraper.deepScrape).toHaveBeenCalledWith("https://inside-line.test");
    expect(linkedin.enrichTeamMembers).toHaveBeenCalledTimes(1);
    expect(linkedin.enrichTeamMembers).toHaveBeenCalledWith(
      "user-123",
      expect.any(Array),
      expect.any(Object),
    );
    expect(result.websiteUrl).toBe("https://inside-line.test/");
    expect(result.teamMembers[0]?.enrichmentStatus).toBe("success");
    expect(result.scrapeErrors).toHaveLength(0);
  });

  it("uses cached website data when available", async () => {
    cache.getWebsiteCache.mockResolvedValueOnce({
      url: "https://inside-line.test/",
      title: "Cached",
      description: "Cached",
      fullText: "Cached",
      headings: [],
      subpages: [],
      links: [],
      teamBios: [],
      customerLogos: [],
      testimonials: [],
      metadata: {
        scrapedAt: new Date().toISOString(),
        pageCount: 1,
        hasAboutPage: false,
        hasTeamPage: false,
        hasPricingPage: false,
      },
    } as any);

    const result = await service.run("startup-1");

    expect(websiteScraper.deepScrape).not.toHaveBeenCalled();
    expect(result.websiteSummary).toBe("Cached");
  });

  it("continues with linkedin enrichment when website scraping fails", async () => {
    websiteScraper.deepScrape.mockRejectedValueOnce(new Error("site unreachable"));

    const result = await service.run("startup-1");

    expect(result.websiteSummary).toBeUndefined();
    expect(result.teamMembers).toHaveLength(1);
    expect(result.scrapeErrors[0]?.type).toBe("website");
  });

  it("throws when startup does not exist", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    await expect(service.run("missing")).rejects.toThrow("Startup missing not found");
  });
});
