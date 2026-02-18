import { beforeEach, describe, expect, it, jest } from "bun:test";
import { DrizzleService } from "../../../../database";
import {
  SCRAPING_AGENT_LINKEDIN_KEY,
  SCRAPING_AGENT_WEBSITE_KEY,
  ScrapingService,
} from "../../services/scraping.service";
import { WebsiteScraperService } from "../../services/website-scraper.service";
import { LinkedinEnrichmentService } from "../../services/linkedin-enrichment.service";
import { ScrapingCacheService } from "../../services/scraping-cache.service";
import { PipelineStateService } from "../../services/pipeline-state.service";
import { PipelinePhase } from "../../interfaces/pipeline.interface";

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
      discoverCompanyLeadershipMembers: jest.fn().mockResolvedValue([]),
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

  it("emits website and linkedin enrichment sub-agent callbacks", async () => {
    const started: string[] = [];
    const completed: Array<{
      agentKey: string;
      status: string;
      outputJson: unknown;
    }> = [];

    await service.run("startup-1", {
      onAgentStart: (agentKey) => {
        started.push(agentKey);
      },
      onAgentComplete: (payload) => {
        completed.push({
          agentKey: payload.agentKey,
          status: payload.status,
          outputJson: payload.outputJson,
        });
      },
    });

    expect(started).toEqual([
      SCRAPING_AGENT_WEBSITE_KEY,
      SCRAPING_AGENT_LINKEDIN_KEY,
    ]);
    expect(completed.map((entry) => entry.agentKey)).toEqual([
      SCRAPING_AGENT_WEBSITE_KEY,
      SCRAPING_AGENT_LINKEDIN_KEY,
    ]);
    expect(completed.map((entry) => entry.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(completed[1]?.outputJson).toEqual(
      expect.objectContaining({
        verifiedTeamMembers: 1,
      }),
    );
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

  it("discovers team members from website linkedin profile links when startup has no submitted members", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "startup-2",
        userId: "user-123",
        website: "https://chari.com",
        name: "Chari",
        industry: "b2b_ecommerce",
        stage: "series_a",
        description: "B2B commerce",
        teamMembers: [],
      },
    ]);

    websiteScraper.deepScrape.mockResolvedValueOnce({
      url: "https://chari.com/",
      title: "Chari",
      description: "",
      fullText: "L'equipe Chari",
      headings: [],
      subpages: [],
      links: [
        {
          url: "https://www.linkedin.com/in/belkhayat",
          text: "Ismael BELKHAYAT CEO",
        },
        {
          url: "https://www.linkedin.com/in/sophia-alj-40333960",
          text: "Sophia ALJ",
        },
        {
          url: "https://www.linkedin.com/company/chari",
          text: "Chari Company",
        },
      ],
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

    linkedin.enrichTeamMembers.mockImplementationOnce(async (_, members) =>
      members.map((member) => ({
        name: member.name,
        role: member.role,
        linkedinUrl: member.linkedinUrl,
        enrichmentStatus: "success" as const,
      })),
    );

    await service.run("startup-2");

    const enrichmentCall = linkedin.enrichTeamMembers.mock.calls.at(-1);
    expect(enrichmentCall).toBeDefined();
    const enrichedSeed = enrichmentCall?.[1] ?? [];
    expect(enrichedSeed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Ismael Belkhayat",
          linkedinUrl: "https://www.linkedin.com/in/belkhayat",
        }),
        expect.objectContaining({
          name: "Sophia Alj",
          linkedinUrl: "https://www.linkedin.com/in/sophia-alj-40333960",
        }),
      ]),
    );
  });

  it("drops non-success auto-discovered members from final team output", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "startup-3",
        userId: "user-123",
        website: "https://chari.com",
        name: "Chari",
        industry: "b2b_ecommerce",
        stage: "series_a",
        description: "B2B commerce",
        teamMembers: [],
      },
    ]);

    websiteScraper.deepScrape.mockResolvedValueOnce({
      url: "https://chari.com/",
      title: "Chari",
      description: "",
      fullText: "L'equipe Chari",
      headings: [],
      subpages: [],
      links: [
        {
          url: "https://www.linkedin.com/in/belkhayat",
          text: "Ismael BELKHAYAT CEO",
        },
        {
          url: "https://www.linkedin.com/in/cyrille-jacques-a7035457",
          text: "Cyrille JACQUES",
        },
      ],
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

    linkedin.enrichTeamMembers.mockResolvedValueOnce([
      {
        name: "Ismael Belkhayat",
        role: "CEO",
        linkedinUrl: "https://www.linkedin.com/in/belkhayat",
        enrichmentStatus: "success",
      },
      {
        name: "Cyrille Jacques",
        linkedinUrl: "https://www.linkedin.com/in/cyrille-jacques-a7035457",
        enrichmentStatus: "not_found",
      },
    ] as any);

    const result = await service.run("startup-3");

    expect(result.teamMembers).toHaveLength(1);
    expect(result.teamMembers[0]?.name).toBe("Ismael Belkhayat");
  });

  it("uses extraction founder names as linkedin enrichment seeds when startup team is empty", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "startup-4",
        userId: "user-123",
        website: "https://inside-line.test",
        name: "Inside Line",
        industry: "SaaS",
        stage: "seed",
        description: "AI startup screening",
        teamMembers: [],
      },
    ]);

    websiteScraper.deepScrape.mockResolvedValueOnce({
      url: "https://inside-line.test/",
      title: "Inside Line",
      description: "AI startup screening",
      fullText: "scraped content",
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

    const pipelineState = {
      getPhaseResult: jest.fn().mockImplementation(
        async (_startupId: string, phase: PipelinePhase) => {
          if (phase === PipelinePhase.EXTRACTION) {
            return {
              founderNames: ["Jane Founder"],
            };
          }
          return null;
        },
      ),
    } as unknown as jest.Mocked<PipelineStateService>;

    linkedin.enrichTeamMembers.mockImplementationOnce(async (_, members) =>
      members.map((member) => ({
        name: member.name,
        role: member.role,
        linkedinUrl:
          member.linkedinUrl ?? "https://www.linkedin.com/in/jane-founder",
        enrichmentStatus: "success" as const,
      })),
    );

    const serviceWithPipelineState = new ScrapingService(
      drizzle,
      websiteScraper,
      linkedin,
      cache,
      undefined,
      pipelineState as unknown as PipelineStateService,
    );

    const result = await serviceWithPipelineState.run("startup-4");

    expect(linkedin.enrichTeamMembers).toHaveBeenCalled();
    expect(linkedin.enrichTeamMembers).toHaveBeenCalledWith(
      "user-123",
      expect.arrayContaining([
        expect.objectContaining({
          name: "Jane Founder",
          role: "Founder",
        }),
      ]),
      expect.any(Object),
    );
    expect(result.teamMembers.some((member) => member.name === "Jane Founder")).toBe(
      true,
    );
  });

  it("uses enrichment discovered founders as linkedin enrichment seeds when extraction founders are absent", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "startup-5",
        userId: "user-123",
        website: "https://inside-line.test",
        name: "Inside Line",
        industry: "SaaS",
        stage: "seed",
        description: "AI startup screening",
        teamMembers: [],
      },
    ]);

    websiteScraper.deepScrape.mockResolvedValueOnce({
      url: "https://inside-line.test/",
      title: "Inside Line",
      description: "AI startup screening",
      fullText: "scraped content",
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

    const pipelineState = {
      getPhaseResult: jest.fn().mockImplementation(
        async (_startupId: string, phase: PipelinePhase) => {
          if (phase === PipelinePhase.EXTRACTION) {
            return null;
          }
          if (phase === PipelinePhase.ENRICHMENT) {
            return {
              discoveredFounders: [
                {
                  name: "Lina Builder",
                  role: "Co-Founder",
                  linkedinUrl: "https://www.linkedin.com/in/lina-builder",
                  confidence: 0.9,
                },
              ],
            };
          }
          return null;
        },
      ),
    } as unknown as jest.Mocked<PipelineStateService>;

    linkedin.enrichTeamMembers.mockImplementationOnce(async (_, members) =>
      members.map((member) => ({
        name: member.name,
        role: member.role,
        linkedinUrl: member.linkedinUrl,
        enrichmentStatus: "success" as const,
      })),
    );

    const serviceWithPipelineState = new ScrapingService(
      drizzle,
      websiteScraper,
      linkedin,
      cache,
      undefined,
      pipelineState as unknown as PipelineStateService,
    );

    const result = await serviceWithPipelineState.run("startup-5");

    expect(linkedin.enrichTeamMembers).toHaveBeenCalledWith(
      "user-123",
      expect.arrayContaining([
        expect.objectContaining({
          name: "Lina Builder",
          role: "Co-Founder",
          linkedinUrl: "https://www.linkedin.com/in/lina-builder",
        }),
      ]),
      expect.any(Object),
    );
    expect(result.teamMembers.some((member) => member.name === "Lina Builder")).toBe(
      true,
    );
  });
});
