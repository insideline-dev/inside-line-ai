import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface BraveSearchOptions {
  count?: number;
  offset?: number;
  country?: string;
  searchLang?: string;
  freshness?: "pd" | "pw" | "pm" | "py";
  safesearch?: "off" | "moderate" | "strict";
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  language?: string;
}

export interface BraveSearchResponse {
  query: string;
  results: BraveSearchResult[];
}

interface BraveApiWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  language?: string;
}

interface BraveApiResponse {
  query?: { original?: string };
  web?: { results?: BraveApiWebResult[] };
}

@Injectable()
export class BraveSearchService {
  private readonly logger = new Logger(BraveSearchService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl = "https://api.search.brave.com/res/v1/web/search";

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>("BRAVE_SEARCH_API_KEY");
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Brave Search API key is not configured");
    }
  }

  async search(
    query: string,
    options: BraveSearchOptions = {},
  ): Promise<BraveSearchResponse> {
    this.assertConfigured();

    const params = new URLSearchParams({ q: query });
    if (options.count) params.set("count", String(options.count));
    if (options.offset) params.set("offset", String(options.offset));
    if (options.country) params.set("country", options.country);
    if (options.searchLang) params.set("search_lang", options.searchLang);
    if (options.freshness) params.set("freshness", options.freshness);
    if (options.safesearch) params.set("safesearch", options.safesearch);

    const url = `${this.baseUrl}?${params.toString()}`;

    this.logger.debug(`[BraveSearch] Searching: "${query}" | count=${options.count ?? 10}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.apiKey!,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.error(`[BraveSearch] Search failed: ${response.status} ${text}`);
      throw new Error(`Brave search failed: ${response.status}`);
    }

    const data = (await response.json()) as BraveApiResponse;
    const results: BraveSearchResult[] = (data.web?.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      description: r.description ?? "",
      age: r.age,
      language: r.language,
    }));

    this.logger.debug(`[BraveSearch] Returned ${results.length} results for "${query}"`);

    return {
      query: data.query?.original ?? query,
      results,
    };
  }

  async searchMultiple(
    queries: Array<{ query: string; options?: BraveSearchOptions }>,
  ): Promise<BraveSearchResponse[]> {
    return Promise.all(
      queries.map(({ query, options }) => this.search(query, options)),
    );
  }
}
