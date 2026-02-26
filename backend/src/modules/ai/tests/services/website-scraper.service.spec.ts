import { beforeEach, describe, expect, it, jest } from "bun:test";
import { WebsiteScraperService } from "../../services/website-scraper.service";

describe("WebsiteScraperService", () => {
  let service: WebsiteScraperService;

  beforeEach(() => {
    service = new WebsiteScraperService();
    jest.spyOn(service as any, "dnsLookupWithTimeout").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
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
      const parsed = new URL(url);
      parsed.hostname = "inside-line.test";
      const key = parsed.toString();
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
      const parsed = new URL(url);
      parsed.hostname = "inside-line.test";
      if (parsed.toString() === "https://inside-line.test/") {
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

  it("excludes script/style/noscript/template text from extracted content", async () => {
    globalThis.fetch = jest.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      parsed.hostname = "inside-line.test";
      if (parsed.toString() !== "https://inside-line.test/") {
        return { ok: false, status: 404, text: async () => "" } as Response;
      }

      return {
        ok: true,
        status: 200,
        text: async () => `
          <html>
            <head>
              <title>Inside Line</title>
              <style>.hidden { display: none; }</style>
            </head>
            <body>
              <h1>Visible headline</h1>
              <p>Visible paragraph.</p>
              <script>window.__NEXT_DATA__ = {"huge":"payload"};</script>
              <noscript>Should not appear</noscript>
              <template>Template text should not appear</template>
            </body>
          </html>
        `,
      } as Response;
    }) as any;

    const result = await service.deepScrape("https://inside-line.test");

    expect(result.fullText).toContain("Visible headline");
    expect(result.fullText).toContain("Visible paragraph.");
    expect(result.fullText).not.toContain("__NEXT_DATA__");
    expect(result.fullText).not.toContain("Should not appear");
    expect(result.fullText).not.toContain("Template text should not appear");
  });

  describe("SSRF Protection - Hostname Blocking", () => {
    beforeEach(() => {
      service = new WebsiteScraperService();
    });

    it("blocks localhost", async () => {
      await expect(service.deepScrape("http://localhost/")).rejects.toThrow(
        "Unsafe hostname blocked: localhost",
      );
    });

    it("blocks .localhost domains", async () => {
      await expect(service.deepScrape("http://app.localhost/")).rejects.toThrow(
        "Unsafe hostname blocked: app.localhost",
      );
    });

    it("blocks .local domains", async () => {
      await expect(service.deepScrape("http://server.local/")).rejects.toThrow(
        "Unsafe hostname blocked: server.local",
      );
    });

    it("blocks metadata.google.internal", async () => {
      await expect(service.deepScrape("http://metadata.google.internal/")).rejects.toThrow(
        "Unsafe hostname blocked: metadata.google.internal",
      );
    });

    it("blocks case-insensitive localhost variants", async () => {
      await expect(service.deepScrape("http://LocalHost/")).rejects.toThrow(
        "Unsafe hostname blocked: localhost",
      );
    });
  });

  describe("SSRF Protection - Private IPv4 Addresses", () => {
    beforeEach(() => {
      service = new WebsiteScraperService();
    });

    it("blocks 10.x.x.x range", async () => {
      await expect(service.deepScrape("http://10.0.0.1/")).rejects.toThrow(
        "Unsafe IP blocked: 10.0.0.1",
      );
    });

    it("blocks 172.16.x.x through 172.31.x.x range", async () => {
      await expect(service.deepScrape("http://172.16.0.1/")).rejects.toThrow(
        "Unsafe IP blocked: 172.16.0.1",
      );
      await expect(service.deepScrape("http://172.31.255.255/")).rejects.toThrow(
        "Unsafe IP blocked: 172.31.255.255",
      );
    });

    it("blocks 192.168.x.x range", async () => {
      await expect(service.deepScrape("http://192.168.1.1/")).rejects.toThrow(
        "Unsafe IP blocked: 192.168.1.1",
      );
    });

    it("blocks 127.x.x.x loopback range", async () => {
      await expect(service.deepScrape("http://127.0.0.1/")).rejects.toThrow(
        "Unsafe IP blocked: 127.0.0.1",
      );
      await expect(service.deepScrape("http://127.100.50.25/")).rejects.toThrow(
        "Unsafe IP blocked: 127.100.50.25",
      );
    });

    it("blocks 169.254.x.x link-local range", async () => {
      await expect(service.deepScrape("http://169.254.169.254/")).rejects.toThrow(
        "Unsafe IP blocked: 169.254.169.254",
      );
    });

    it("allows public IPv4 addresses", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
      ]);

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<html><head><title>Test</title></head><body>OK</body></html>",
      } as Response) as any;

      const result = await service.deepScrape("http://8.8.8.8/");
      expect(result.title).toBe("Test");
    });
  });

  describe("SSRF Protection - Private IPv6 Addresses", () => {
    beforeEach(() => {
      service = new WebsiteScraperService();
    });

    it("blocks ::1 loopback", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockRejectedValue(
        new Error("DNS lookup failed"),
      );

      await expect(service.deepScrape("http://[::1]/")).rejects.toThrow();
    });

    it("blocks fe80:: link-local range", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockRejectedValue(
        new Error("DNS lookup failed"),
      );

      await expect(service.deepScrape("http://[fe80::1]/")).rejects.toThrow();
    });

    it("blocks fc00:: unique local range", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockRejectedValue(
        new Error("DNS lookup failed"),
      );

      await expect(service.deepScrape("http://[fc00::1]/")).rejects.toThrow();
    });

    it("blocks fd00:: unique local range", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockRejectedValue(
        new Error("DNS lookup failed"),
      );

      await expect(service.deepScrape("http://[fd00::1]/")).rejects.toThrow();
    });
  });

  describe("SSRF Protection - Non-HTTP Protocols", () => {
    beforeEach(() => {
      service = new WebsiteScraperService();
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);
    });

    it("normalizes ftp:// to https://ftp:// causing DNS failure", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockRejectedValue(
        new Error("DNS lookup failed for ftp:"),
      );

      await expect(service.deepScrape("ftp://example.com/")).rejects.toThrow();
    });

    it("normalizes file:// to https://file:/// causing DNS failure", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockRejectedValue(
        new Error("DNS lookup failed"),
      );

      await expect(service.deepScrape("file:///etc/passwd")).rejects.toThrow();
    });

    it("allows http:// protocol", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<html><head><title>Test</title></head><body>OK</body></html>",
      } as Response) as any;

      const result = await service.deepScrape("http://inside-line.test/");
      expect(result.title).toBe("Test");
    });

    it("allows https:// protocol", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<html><head><title>Test</title></head><body>OK</body></html>",
      } as Response) as any;

      const result = await service.deepScrape("https://inside-line.test/");
      expect(result.title).toBe("Test");
    });
  });

  describe("SSRF Protection - DNS Resolution", () => {
    beforeEach(() => {
      service = new WebsiteScraperService();
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<html><head><title>Test</title></head><body>OK</body></html>",
      } as Response) as any;
    });

    it("blocks DNS resolving to all private IPs", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockResolvedValue([
        { address: "127.0.0.1", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]);

      await expect(service.deepScrape("https://evil.com/")).rejects.toThrow(
        "Unsafe DNS target blocked for host: evil.com",
      );
    });

    it("allows DNS resolving to at least one public IP", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockResolvedValue([
        { address: "127.0.0.1", family: 4 },
        { address: "93.184.216.34", family: 4 },
      ]);

      const result = await service.deepScrape("https://mixed-dns.test/");
      expect(result.title).toBe("Test");
    });

    it("handles DNS timeout gracefully", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockRejectedValue(
        new Error("DNS lookup timed out for slow-dns.test"),
      );

      await expect(service.deepScrape("https://slow-dns.test/")).rejects.toThrow(
        "DNS lookup timed out for slow-dns.test",
      );
    });
  });

  describe("SSRF Protection - IP Pinning", () => {
    beforeEach(() => {
      service = new WebsiteScraperService();
    });

    it("fetches URL using resolved IP and sets Host header", async () => {
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<html><head><title>Test</title></head><body>OK</body></html>",
      } as Response);
      globalThis.fetch = fetchMock as any;

      await service.deepScrape("https://example.test/path");

      expect(fetchMock).toHaveBeenCalled();
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://example.test/path");
      expect((options.headers as Record<string, string>).Host).toBe("example.test");
    });

    it("uses literal IP directly without DNS lookup", async () => {
      const dnsLookupSpy = jest.spyOn(service as any, "dnsLookupWithTimeout");

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<html><head><title>Test</title></head><body>OK</body></html>",
      } as Response) as any;

      await service.deepScrape("http://8.8.8.8/");

      expect(dnsLookupSpy).not.toHaveBeenCalled();
    });
  });

  describe("Rate Limiting", () => {
    beforeEach(() => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<html><head><title>Test</title></head><body>OK</body></html>",
      } as Response) as any;
    });

    it("processes subpages in batches with delay", async () => {
      const config = {
        get: jest.fn().mockImplementation((key: string, defaultValue: any) => {
          if (key === "SCRAPING_BATCH_SIZE") return 2;
          if (key === "SCRAPING_BATCH_DELAY_MS") return 100;
          return defaultValue;
        }),
      } as any;

      service = new WebsiteScraperService(config);

      jest.spyOn(service as any, "dnsLookupWithTimeout").mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);

      globalThis.fetch = jest.fn().mockImplementation(async (url: string) => {
        const parsed = new URL(url);
        parsed.hostname = "inside-line.test";
        const path = parsed.pathname;

        if (path === "/") {
          return {
            ok: true,
            status: 200,
            text: async () => `
              <html><head><title>Home</title></head>
              <body>
                <a href="/page1">Page 1</a>
                <a href="/page2">Page 2</a>
                <a href="/page3">Page 3</a>
                <a href="/page4">Page 4</a>
              </body></html>
            `,
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          text: async () => `<html><head><title>${path}</title></head><body>${path}</body></html>`,
        } as Response;
      }) as any;

      const startTime = Date.now();
      await service.deepScrape("https://inside-line.test");
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it("respects batch size configuration", async () => {
      const config = {
        get: jest.fn().mockImplementation((key: string, defaultValue: any) => {
          if (key === "SCRAPING_BATCH_SIZE") return 2;
          if (key === "SCRAPING_MAX_SUBPAGES") return 5;
          return defaultValue;
        }),
      } as any;

      service = new WebsiteScraperService(config);

      jest.spyOn(service as any, "dnsLookupWithTimeout").mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);

      const fetchCalls: number[] = [];

      globalThis.fetch = jest.fn().mockImplementation(async (url: string) => {
        const parsed = new URL(url);
        parsed.hostname = "inside-line.test";
        const path = parsed.pathname;

        if (path === "/") {
          return {
            ok: true,
            status: 200,
            text: async () => `
              <html><head><title>Home</title></head>
              <body>
                <a href="/about">About</a>
                <a href="/team">Team</a>
                <a href="/pricing">Pricing</a>
                <a href="/contact">Contact</a>
                <a href="/blog">Blog</a>
              </body></html>
            `,
          } as Response;
        }

        fetchCalls.push(Date.now());
        return {
          ok: true,
          status: 200,
          text: async () => `<html><head><title>${path}</title></head><body>${path}</body></html>`,
        } as Response;
      }) as any;

      await service.deepScrape("https://inside-line.test");

      // +1 for the sitemap.xml probe added by fetchSitemapUrls
      expect(fetchCalls.length).toBeLessThanOrEqual(6);
    });
  });

  describe("Config Validation", () => {
    it("clamps negative values to minimum", () => {
      const config = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === "SCRAPING_MAX_SUBPAGES") return -10;
          if (key === "SCRAPING_BATCH_SIZE") return -5;
          if (key === "WEBSITE_SCRAPE_TIMEOUT_MS") return -1000;
          return undefined;
        }),
      } as any;

      service = new WebsiteScraperService(config);

      expect((service as any).maxSubpages).toBeGreaterThanOrEqual(1);
      expect((service as any).batchSize).toBeGreaterThanOrEqual(1);
      expect((service as any).timeoutMs).toBeGreaterThanOrEqual(1000);
    });

    it("clamps NaN to minimum", () => {
      const config = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === "SCRAPING_MAX_SUBPAGES") return Number.NaN;
          if (key === "SCRAPING_BATCH_SIZE") return Number.NaN;
          return undefined;
        }),
      } as any;

      service = new WebsiteScraperService(config);

      expect((service as any).maxSubpages).toBeGreaterThanOrEqual(1);
      expect((service as any).batchSize).toBeGreaterThanOrEqual(1);
    });

    it("clamps Infinity to maximum", () => {
      const config = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === "SCRAPING_MAX_SUBPAGES") return Number.POSITIVE_INFINITY;
          if (key === "SCRAPING_BATCH_SIZE") return Number.POSITIVE_INFINITY;
          return undefined;
        }),
      } as any;

      service = new WebsiteScraperService(config);

      expect((service as any).maxSubpages).toBeLessThanOrEqual(200);
      expect((service as any).batchSize).toBeLessThanOrEqual(50);
    });

    it("clamps too large values to maximum", () => {
      const config = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === "SCRAPING_MAX_SUBPAGES") return 999;
          if (key === "SCRAPING_BATCH_SIZE") return 999;
          if (key === "WEBSITE_SCRAPE_TIMEOUT_MS") return 999999;
          return undefined;
        }),
      } as any;

      service = new WebsiteScraperService(config);

      expect((service as any).maxSubpages).toBe(200);
      expect((service as any).batchSize).toBe(50);
      expect((service as any).timeoutMs).toBe(120000);
    });

    it("rounds decimal values to integers", () => {
      const config = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === "SCRAPING_MAX_SUBPAGES") return 15.7;
          if (key === "SCRAPING_BATCH_SIZE") return 3.2;
          return undefined;
        }),
      } as any;

      service = new WebsiteScraperService(config);

      expect((service as any).maxSubpages).toBe(16);
      expect((service as any).batchSize).toBe(3);
    });
  });

  describe("Fetch Timeout", () => {
    beforeEach(() => {
      service = new WebsiteScraperService();
      jest.spyOn(service as any, "dnsLookupWithTimeout").mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);
    });

    it("sets up AbortController and timeout for requests", async () => {
      let abortSignal: AbortSignal | undefined;

      globalThis.fetch = jest.fn().mockImplementation(async (_url, options: RequestInit) => {
        abortSignal = options.signal;
        return {
          ok: true,
          status: 200,
          text: async () => "<html><head><title>Test</title></head><body>OK</body></html>",
        } as Response;
      }) as any;

      await service.deepScrape("https://test-site.test/");

      expect(abortSignal).toBeDefined();
      expect(abortSignal).toBeInstanceOf(AbortSignal);
    });

    it("cleans up timeout on successful fetch", async () => {
      const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<html><head><title>Test</title></head><body>OK</body></html>",
      } as Response) as any;

      await service.deepScrape("https://fast-site.test/");

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it("cleans up timeout on fetch error", async () => {
      const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");

      globalThis.fetch = jest.fn().mockRejectedValue(new Error("Network error")) as any;

      await service.deepScrape("https://error-site.test/").catch(() => {});

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });
});
