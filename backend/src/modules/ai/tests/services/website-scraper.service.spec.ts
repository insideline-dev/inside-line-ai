import { beforeEach, describe, expect, it, jest } from "bun:test";
import { WebsiteScraperService } from "../../services/website-scraper.service";

describe("WebsiteScraperService", () => {
  let service: WebsiteScraperService;

  beforeEach(() => {
    service = new WebsiteScraperService();
  });

  it("deep scrapes homepage and selected subpages with structured extraction", async () => {
    const pages: Record<string, string> = {
      "https://inside-line.test/": `
        <html><head><title>Inside Line</title><meta name="description" content="AI diligence" /></head>
        <body>
          <h1>AI Venture Screening</h1>
          <a href="/about">About</a>
          <a href="/pricing">Pricing</a>
          <a href="/blog/post-1">Blog</a>
          <section><h2>Trusted by</h2><img src="/logos/acme.png" /></section>
        </body></html>
      `,
      "https://inside-line.test/about": `
        <html><head><title>About</title></head>
        <body>
          <h1>Our Team</h1>
          <div class="team-member"><h3>Alex Founder</h3><p class="role">CEO</p><p class="bio">Former operator</p></div>
        </body></html>
      `,
      "https://inside-line.test/pricing": `
        <html><head><title>Pricing</title></head>
        <body>
          <h1>Pricing</h1>
          <div class="pricing-card"><h3>Pro</h3><span>$199</span><ul><li>Unlimited scans</li></ul></div>
        </body></html>
      `,
      "https://inside-line.test/blog/post-1": `
        <html><head><title>Launch</title></head><body><h1>Launch</h1><p>We launched.</p></body></html>
      `,
    };

    globalThis.fetch = jest.fn().mockImplementation(async (url: string) => {
      const key = url.endsWith("/") ? url : url;
      if (!pages[key]) {
        return { ok: false, status: 404, text: async () => "" } as Response;
      }

      return {
        ok: true,
        status: 200,
        text: async () => pages[key],
      } as Response;
    }) as any;

    const result = await service.deepScrape("https://inside-line.test");

    expect(result.url).toBe("https://inside-line.test/");
    expect(result.title).toBe("Inside Line");
    expect(result.metadata.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.subpages.length).toBeGreaterThanOrEqual(2);
    expect(result.teamBios.some((b) => b.name === "Alex Founder")).toBe(true);
    expect(result.pricing?.plans[0]?.name).toBe("Pro");
  });

  it("returns homepage-only partial data when subpages fail", async () => {
    globalThis.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url === "https://inside-line.test/") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            `<html><head><title>Inside Line</title></head><body><a href="/about">About</a></body></html>`,
        } as Response;
      }

      return { ok: false, status: 500, text: async () => "error" } as Response;
    }) as any;

    const result = await service.deepScrape("https://inside-line.test");

    expect(result.title).toBe("Inside Line");
    expect(result.subpages.length).toBe(0);
    expect(result.metadata.pageCount).toBe(1);
  });
});
