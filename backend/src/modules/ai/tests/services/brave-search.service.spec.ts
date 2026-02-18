import { describe, it, expect, beforeEach, afterEach, jest } from "bun:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { BraveSearchService } from "../../services/brave-search.service";

const makeMockConfig = (apiKey: string | undefined) => ({
  get: jest.fn().mockReturnValue(apiKey),
});

describe("BraveSearchService", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("isConfigured()", () => {
    it("returns false when no API key", () => {
      const service = new BraveSearchService(
        makeMockConfig(undefined) as never,
      );
      expect(service.isConfigured()).toBe(false);
    });

    it("returns false when API key is empty string", () => {
      const service = new BraveSearchService(
        makeMockConfig("") as never,
      );
      expect(service.isConfigured()).toBe(false);
    });

    it("returns true when API key is set", () => {
      const service = new BraveSearchService(
        makeMockConfig("test-api-key") as never,
      );
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe("search()", () => {
    it("throws ServiceUnavailableException when not configured", async () => {
      const service = new BraveSearchService(
        makeMockConfig(undefined) as never,
      );
      await expect(service.search("some query")).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it("makes GET request to Brave API with correct headers and parses results", async () => {
      const mockApiResponse = {
        query: { original: "acme startup" },
        web: {
          results: [
            {
              title: "Acme Corp",
              url: "https://acme.com",
              description: "The best startup",
              age: "2024-01-01",
              language: "en",
            },
          ],
        },
      };

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as never);

      const service = new BraveSearchService(
        makeMockConfig("test-key") as never,
      );
      const result = await service.search("acme startup", { count: 5 });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (globalThis.fetch as jest.Mock).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toContain("q=acme+startup");
      expect(url).toContain("count=5");
      expect((options.headers as Record<string, string>)["X-Subscription-Token"]).toBe("test-key");

      expect(result.query).toBe("acme startup");
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.title).toBe("Acme Corp");
      expect(result.results[0]?.url).toBe("https://acme.com");
      expect(result.results[0]?.description).toBe("The best startup");
    });

    it("maps missing result fields to empty strings", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          web: { results: [{ title: undefined, url: undefined, description: undefined }] },
        }),
      } as never);

      const service = new BraveSearchService(
        makeMockConfig("test-key") as never,
      );
      const result = await service.search("foo");

      expect(result.results[0]?.title).toBe("");
      expect(result.results[0]?.url).toBe("");
      expect(result.results[0]?.description).toBe("");
    });

    it("falls back to original query when response has no query field", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ web: { results: [] } }),
      } as never);

      const service = new BraveSearchService(
        makeMockConfig("test-key") as never,
      );
      const result = await service.search("my query");

      expect(result.query).toBe("my query");
    });

    it("throws Error when API returns non-ok status", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue("rate limited"),
      } as never);

      const service = new BraveSearchService(
        makeMockConfig("test-key") as never,
      );
      await expect(service.search("foo")).rejects.toThrow("Brave search failed: 429");
    });

    it("returns empty results array when web.results is missing", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      } as never);

      const service = new BraveSearchService(
        makeMockConfig("test-key") as never,
      );
      const result = await service.search("foo");

      expect(result.results).toHaveLength(0);
    });
  });

  describe("searchMultiple()", () => {
    it("runs multiple searches in parallel and returns all results", async () => {
      let callCount = 0;
      globalThis.fetch = jest.fn().mockImplementation(() => {
        callCount += 1;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              query: { original: `query-${callCount}` },
              web: { results: [] },
            }),
        });
      });

      const service = new BraveSearchService(
        makeMockConfig("test-key") as never,
      );

      const results = await service.searchMultiple([
        { query: "first query" },
        { query: "second query" },
        { query: "third query" },
      ]);

      expect(results).toHaveLength(3);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("rejects if any individual search throws", async () => {
      globalThis.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ web: { results: [] } }),
        } as never)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue("server error"),
        } as never);

      const service = new BraveSearchService(
        makeMockConfig("test-key") as never,
      );

      await expect(
        service.searchMultiple([{ query: "ok" }, { query: "fail" }]),
      ).rejects.toThrow("Brave search failed: 500");
    });
  });
});
