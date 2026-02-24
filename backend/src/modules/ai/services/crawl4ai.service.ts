import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface Crawl4aiResult {
  url: string;
  html: string;
  cleanedHtml: string;
  markdown: string;
  success: boolean;
  statusCode: number;
  errorMessage: string;
}

interface Crawl4aiApiResponse {
  success: boolean;
  results: Array<{
    url: string;
    html: string;
    cleaned_html: string;
    markdown: string;
    success: boolean;
    status_code: number;
    error_message: string;
  }>;
}

const CRAWL4AI_TIMEOUT_MS = 60_000;
const CRAWL4AI_BATCH_SIZE = 10;

@Injectable()
export class Crawl4aiService {
  private readonly logger = new Logger(Crawl4aiService.name);
  private readonly apiUrl: string | undefined;
  private readonly authHeader: string | undefined;

  constructor(@Optional() private config?: ConfigService) {
    const url = this.config?.get<string>("CRAWL4AI_URL");
    const username = this.config?.get<string>("CRAWL4AI_USERNAME");
    const password = this.config?.get<string>("CRAWL4AI_PASSWORD");

    if (url && username && password) {
      this.apiUrl = url;
      this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.authHeader);
  }

  async crawl(urls: string[]): Promise<Crawl4aiResult[]> {
    if (!this.isConfigured()) {
      return urls.map((url) => this.failedResult(url, "Crawl4AI not configured"));
    }

    const results: Crawl4aiResult[] = [];

    for (let i = 0; i < urls.length; i += CRAWL4AI_BATCH_SIZE) {
      const batch = urls.slice(i, i + CRAWL4AI_BATCH_SIZE);
      const batchResults = await this.crawlBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async crawlBatch(urls: string[]): Promise<Crawl4aiResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CRAWL4AI_TIMEOUT_MS);

    try {
      const response = await fetch(this.apiUrl!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader!,
        },
        body: JSON.stringify({
          urls,
          browser_config: {},
          crawler_config: { stream: false },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`[Crawl4AI] API returned HTTP ${response.status}`);
        return urls.map((url) => this.failedResult(url, `HTTP ${response.status}`));
      }

      const data = (await response.json()) as Crawl4aiApiResponse;
      if (!data.success || !Array.isArray(data.results)) {
        this.logger.warn("[Crawl4AI] API returned unsuccessful response");
        return urls.map((url) => this.failedResult(url, "API returned unsuccessful response"));
      }

      return data.results.map((r) => ({
        url: r.url,
        html: r.html,
        cleanedHtml: r.cleaned_html,
        markdown: r.markdown,
        success: r.success,
        statusCode: r.status_code,
        errorMessage: r.error_message,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.isTimeoutLikeError(message) && urls.length > 1) {
        const midpoint = Math.ceil(urls.length / 2);
        const left = urls.slice(0, midpoint);
        const right = urls.slice(midpoint);
        this.logger.warn(
          `[Crawl4AI] Batch timed out for ${urls.length} URLs; retrying as ${left.length}+${right.length}`,
        );
        const [leftResults, rightResults] = await Promise.all([
          this.crawlBatch(left),
          this.crawlBatch(right),
        ]);
        return [...leftResults, ...rightResults];
      }
      this.logger.warn(`[Crawl4AI] Request failed: ${message}`);
      return urls.map((url) => this.failedResult(url, message));
    } finally {
      clearTimeout(timer);
    }
  }

  private isTimeoutLikeError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("aborted") ||
      normalized.includes("aborterror") ||
      normalized.includes("timeout") ||
      normalized.includes("timed out")
    );
  }

  private failedResult(url: string, errorMessage: string): Crawl4aiResult {
    return {
      url,
      html: "",
      cleanedHtml: "",
      markdown: "",
      success: false,
      statusCode: 0,
      errorMessage,
    };
  }
}
