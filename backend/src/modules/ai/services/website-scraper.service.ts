import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { WebsiteScrapedData } from "../interfaces/phase-results.interface";

interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  content: string;
  headings: string[];
  links: Array<{ url: string; text: string }>;
  teamBios: WebsiteScrapedData["teamBios"];
  pricing?: WebsiteScrapedData["pricing"];
  customerLogos: string[];
  testimonials: WebsiteScrapedData["testimonials"];
  metadata: Pick<WebsiteScrapedData["metadata"], "ogImage" | "logoUrl" | "keywords" | "author">;
}

interface ResolvedSafeUrl {
  fetchUrl: string;
  hostHeader: string;
}

export interface ScrapedRouteResult {
  requestedPath: string;
  resolvedUrl: string;
  status: "ok" | "not_found" | "error";
  title?: string;
  contentLength?: number;
  error?: string;
}

interface SubpageScrapeResult {
  pages: ScrapedPage[];
  routeResults: ScrapedRouteResult[];
}

export interface WebsiteDeepScrapeOptions {
  manualPaths?: string[];
  discoveryEnabled?: boolean;
}

@Injectable()
export class WebsiteScraperService {
  private readonly logger = new Logger(WebsiteScraperService.name);
  private readonly maxSubpages: number;
  private readonly batchSize: number;
  private readonly maxLinksPerPage: number;
  private readonly maxPathDepth: number;
  private readonly timeoutMs: number;
  private readonly batchDelayMs: number;
  private readonly userAgent: string;

  private static readonly DNS_TIMEOUT_MS = 5000;
  private static readonly BLOCKED_HOSTNAMES = new Set([
    "metadata.google.internal",
  ]);

  constructor(
    @Optional() private config?: ConfigService,
  ) {
    this.maxSubpages = this.validatePositiveInt(
      this.config?.get<number>("SCRAPING_MAX_SUBPAGES", 40) ?? 40, 1, 200,
    );
    this.batchSize = this.validatePositiveInt(
      this.config?.get<number>("SCRAPING_BATCH_SIZE", 8) ?? 8, 1, 50,
    );
    this.maxLinksPerPage = this.validatePositiveInt(
      this.config?.get<number>("SCRAPING_MAX_LINKS_PER_PAGE", 100) ?? 100, 1, 1000,
    );
    this.maxPathDepth = this.validatePositiveInt(
      this.config?.get<number>("SCRAPING_MAX_PATH_DEPTH", 4) ?? 4, 1, 20,
    );
    this.timeoutMs = this.validatePositiveInt(
      this.config?.get<number>("WEBSITE_SCRAPE_TIMEOUT_MS", 30000) ?? 30000, 1000, 120000,
    );
    this.batchDelayMs = this.validatePositiveInt(
      this.config?.get<number>("SCRAPING_BATCH_DELAY_MS", 500) ?? 500, 0, 10000,
    );
    this.userAgent = this.config?.get<string>(
      "SCRAPER_USER_AGENT",
      "Mozilla/5.0 (compatible; InsideLine/1.0; +https://insideline.ai)",
    ) ?? "Mozilla/5.0 (compatible; InsideLine/1.0; +https://insideline.ai)";
  }

  private validatePositiveInt(value: number, min: number, max: number): number {
    const clamped = Math.round(value);
    if (!Number.isFinite(clamped) || clamped < min) return min;
    if (clamped > max) return max;
    return clamped;
  }

  async deepScrape(
    url: string,
    options: WebsiteDeepScrapeOptions = {},
  ): Promise<WebsiteScrapedData> {
    const homepageUrl = this.normalizeUrl(url, true);
    const discoveryEnabled = options.discoveryEnabled === true;
    const manualUrls = this.resolveManualSubpages(
      homepageUrl,
      options.manualPaths ?? [],
    );
    const hasManualPaths = manualUrls.length > 0;
    this.logger.log(
      `[Scrape] Starting deep scrape for ${homepageUrl} | discovery=${discoveryEnabled} | manualPaths=${manualUrls.length}`,
    );

    const homepage = await this.fetchAndParsePage(homepageUrl);
    this.logger.log("[Scrape] Homepage scraped via fetch+Cheerio");

    // Always fetch sitemap when manual paths exist (for fuzzy matching)
    const sitemapUrls = hasManualPaths || discoveryEnabled
      ? await this.fetchSitemapUrls(homepageUrl)
      : [];
    if (sitemapUrls.length > 0) {
      this.logger.debug(`[Scrape] Found ${sitemapUrls.length} URLs from sitemap.xml`);
    }

    let allCandidates: string[];
    let routeResults: ScrapedRouteResult[] = [];

    if (hasManualPaths) {
      // Manual paths are the source of truth — sitemap only enhances them via fuzzy matching
      const sitemapMatches = this.matchManualPathsToSitemap(manualUrls, sitemapUrls, homepageUrl);
      const resolvedManualUrls = manualUrls.map((manualUrl) => {
        const matched = sitemapMatches.get(manualUrl);
        if (matched && matched !== manualUrl) {
          const requestedPath = new URL(manualUrl).pathname;
          this.logger.log(`[Scrape] Sitemap match: ${requestedPath} → ${matched}`);
        }
        return matched ?? manualUrl;
      });
      allCandidates = [...new Set(resolvedManualUrls)]
        .filter((u) => u !== homepageUrl && u !== homepageUrl + "/")
        .slice(0, this.maxSubpages);

      const { pages: subpages, routeResults: subpageRouteResults } =
        await this.scrapeSubpagesWithRouteTracking(allCandidates, manualUrls, sitemapMatches);
      routeResults = subpageRouteResults;

      // Log per-path results
      for (const route of routeResults) {
        const statusLabel = route.status === "ok" ? "OK" : route.status.toUpperCase();
        const titleLabel = route.title ? `"${route.title}"` : "no title";
        const sizeLabel = route.contentLength != null ? `${route.contentLength} chars` : "n/a";
        this.logger.log(
          `[Scrape] ${route.requestedPath} → ${route.resolvedUrl} | ${statusLabel} | ${sizeLabel} | ${titleLabel}${route.error ? ` | ${route.error}` : ""}`,
        );
      }

      const successfulPages = subpages;
      if (successfulPages.length > 0) {
        this.logger.debug(
          `[Scrape] Successfully scraped ${successfulPages.length} manual subpages`,
        );
      }

      const pages: ScrapedPage[] = [homepage, ...successfulPages];
      return this.buildScrapedData(homepage, successfulPages, pages, routeResults);
    }

    // No manual paths — use discovery if enabled (backward compat)
    const subpageCandidates = discoveryEnabled
      ? this.discoverSubpages(homepage.links, homepageUrl)
      : [];
    if (discoveryEnabled) {
      this.logger.debug(
        `[Scrape] Discovered ${subpageCandidates.length} subpage candidates`,
      );
    } else {
      this.logger.debug("[Scrape] Discovery disabled; skipping link-based subpage discovery");
    }

    allCandidates = [...new Set([
      ...subpageCandidates,
      ...sitemapUrls.map((u) => this.normalizeUrl(u, false)),
    ])].filter((u) => u !== homepageUrl && u !== homepageUrl + "/")
      .slice(0, this.maxSubpages);
    const subpages = await this.scrapeSubpages(allCandidates);
    if (subpages.length > 0) {
      this.logger.debug(
        `[Scrape] Successfully scraped ${subpages.length} subpages: ${subpages.map((page) => page.url).join(", ")}`,
      );
    }
    const pages: ScrapedPage[] = [homepage, ...subpages];
    return this.buildScrapedData(homepage, subpages, pages);
  }

  private buildScrapedData(
    homepage: ScrapedPage,
    subpages: ScrapedPage[],
    pages: ScrapedPage[],
    scrapedRoutes?: ScrapedRouteResult[],
  ): WebsiteScrapedData {
    const teamBios = this.dedupeTeamBios(
      pages.flatMap((page) => page.teamBios),
    );
    const pricing = pages.find((page) => page.pricing)?.pricing;
    const customerLogos = this.dedupeStrings(
      pages.flatMap((page) => page.customerLogos),
    );
    const testimonials = this.dedupeTestimonials(
      pages.flatMap((page) => page.testimonials),
    );
    const headings = pages.flatMap((page) => page.headings);
    const links = this.dedupeLinks(pages.flatMap((page) => page.links)).slice(
      0,
      this.maxLinksPerPage,
    );
    const fullText = pages
      .map((page) => page.content.trim())
      .filter(Boolean)
      .join("\n\n");

    const hasAboutPage = subpages.some((page) =>
      /\/about|\/company/i.test(new URL(page.url).pathname),
    );
    const hasTeamPage = subpages.some((page) =>
      /\/team|\/leadership|\/founders|\/people/i.test(
        new URL(page.url).pathname,
      ),
    );
    const hasPricingPage = subpages.some((page) =>
      /\/pricing|\/plans/i.test(new URL(page.url).pathname),
    );

    const result: WebsiteScrapedData = {
      url: homepage.url,
      title: homepage.title,
      description: homepage.description,
      fullText,
      headings,
      subpages: subpages.map((page) => ({
        url: page.url,
        title: page.title,
        content: page.content,
      })),
      links,
      teamBios,
      pricing,
      customerLogos,
      testimonials,
      metadata: {
        scrapedAt: new Date().toISOString(),
        pageCount: pages.length,
        hasAboutPage,
        hasTeamPage,
        hasPricingPage,
        ogImage: homepage.metadata.ogImage,
        logoUrl: homepage.metadata.logoUrl,
        keywords: homepage.metadata.keywords,
        author: homepage.metadata.author,
      },
      scrapedRoutes,
    };

    this.logger.log(
      `[Scrape] Completed deep scrape for ${homepage.url} | Pages: ${result.metadata.pageCount} | Team bios: ${result.teamBios.length} | Links: ${result.links.length} | Testimonials: ${result.testimonials.length}${scrapedRoutes ? ` | Routes: ${scrapedRoutes.filter((r) => r.status === "ok").length}/${scrapedRoutes.length} OK` : ""}`,
    );
    return result;
  }

  private discoverSubpages(
    links: Array<{ url: string; text: string }>,
    homepageUrl: string,
  ): string[] {
    const homepageHost = new URL(homepageUrl).hostname;
    const scored = links
      .map((link) => {
        try {
          const url = new URL(link.url);
          const pathname = url.pathname.toLowerCase();
          const depth = pathname.split("/").filter(Boolean).length;
          const score = this.getPriorityScore(pathname);
          return { url: this.normalizeUrl(url.toString(), false), depth, score };
        } catch {
          return null;
        }
      })
      .filter((entry): entry is { url: string; depth: number; score: number } => {
        if (!entry) {
          return false;
        }

        const parsed = new URL(entry.url);
        if (parsed.hostname !== homepageHost) {
          return false;
        }

        if (parsed.hash || parsed.pathname === "/" || parsed.pathname === "") {
          return false;
        }

        if (this.isExcludedPath(parsed.pathname.toLowerCase())) return false;

        return entry.score > 0 || entry.depth <= this.maxPathDepth;
      })
      .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

    const unique = new Set<string>();
    for (const entry of scored) {
      if (unique.size >= this.maxSubpages) {
        break;
      }
      unique.add(entry.url);
    }

    return Array.from(unique);
  }

  private resolveManualSubpages(
    homepageUrl: string,
    manualPaths: string[],
  ): string[] {
    const homepageHost = new URL(homepageUrl).hostname;
    const urls = new Set<string>();

    for (const rawPath of manualPaths) {
      const normalizedPath = this.normalizeManualPath(rawPath);
      if (!normalizedPath || normalizedPath === "/") {
        continue;
      }

      try {
        const resolved = new URL(normalizedPath, homepageUrl);
        if (resolved.hostname !== homepageHost) {
          continue;
        }
        if (this.isExcludedPath(resolved.pathname.toLowerCase())) {
          continue;
        }
        urls.add(this.normalizeUrl(resolved.toString(), false));
      } catch {
        continue;
      }
    }

    return Array.from(urls);
  }

  private matchManualPathsToSitemap(
    manualUrls: string[],
    sitemapUrls: string[],
    homepageUrl: string,
  ): Map<string, string> {
    const matches = new Map<string, string>();
    if (sitemapUrls.length === 0) return matches;

    const homepageHost = new URL(homepageUrl).hostname;
    const normalizedSitemapUrls = sitemapUrls
      .map((u) => {
        try {
          const parsed = new URL(u);
          return parsed.hostname === homepageHost ? this.normalizeUrl(u, false) : null;
        } catch {
          return null;
        }
      })
      .filter((u): u is string => u !== null);

    for (const manualUrl of manualUrls) {
      const manualPathname = new URL(manualUrl).pathname.toLowerCase();
      const manualSegments = manualPathname.split("/").filter(Boolean);
      const finalSegment = manualSegments[manualSegments.length - 1];
      if (!finalSegment) continue;

      // 1. Exact pathname match in sitemap
      const exactMatch = normalizedSitemapUrls.find((sitemapUrl) => {
        const sitemapPathname = new URL(sitemapUrl).pathname.toLowerCase();
        return sitemapPathname === manualPathname || sitemapPathname === `${manualPathname}/`;
      });
      if (exactMatch) {
        matches.set(manualUrl, exactMatch);
        continue;
      }

      // 2. Fuzzy match: sitemap URL contains the same final segment as a path component
      const fuzzyMatch = normalizedSitemapUrls.find((sitemapUrl) => {
        const sitemapSegments = new URL(sitemapUrl).pathname.toLowerCase().split("/").filter(Boolean);
        return sitemapSegments.includes(finalSegment);
      });
      if (fuzzyMatch) {
        matches.set(manualUrl, fuzzyMatch);
      }
    }

    return matches;
  }

  private normalizeManualPath(rawPath: string): string | null {
    const trimmed = rawPath.trim();
    if (!trimmed) {
      return null;
    }
    if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
      return null;
    }

    const slashNormalized = trimmed.replace(/\\/g, "/");
    const [withoutHash] = slashNormalized.split("#", 1);
    const [pathname] = withoutHash.split("?", 1);
    const prefixed = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const collapsed = prefixed.replace(/\/{2,}/g, "/");
    const segments = collapsed.split("/").filter(Boolean);
    if (segments.some((segment) => segment === "." || segment === "..")) {
      return null;
    }

    if (collapsed === "/") {
      return "/";
    }
    return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
  }

  private async scrapeSubpages(urls: string[]): Promise<ScrapedPage[]> {
    const pages: ScrapedPage[] = [];

    for (let index = 0; index < urls.length; index += this.batchSize) {
      if (index > 0 && this.batchDelayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.batchDelayMs));
      }

      const batch = urls.slice(index, index + this.batchSize);
      this.logger.debug(
        `[Scrape] Fetching batch ${Math.floor(index / this.batchSize) + 1}/${Math.ceil(urls.length / this.batchSize)} (${batch.length} urls)`,
      );

      const settled = await Promise.allSettled(
        batch.map((url) => this.fetchAndParsePage(url, true)),
      );

      for (const result of settled) {
        if (result.status === "fulfilled" && result.value) {
          pages.push(result.value);
        } else if (result.status === "rejected") {
          this.logger.warn(
            `[Scrape] Failed subpage fetch: ${this.asMessage(result.reason)}`,
          );
        }
      }
    }

    this.logger.log(`[Scrape] Scraped ${pages.length}/${urls.length} subpages via fetch+Cheerio`);
    return pages;
  }

  private async scrapeSubpagesWithRouteTracking(
    resolvedUrls: string[],
    originalManualUrls: string[],
    sitemapMatches: Map<string, string>,
  ): Promise<SubpageScrapeResult> {
    const pages: ScrapedPage[] = [];
    const routeResults: ScrapedRouteResult[] = [];

    // Build reverse mapping: resolved URL → original manual URL(s)
    const resolvedToManual = new Map<string, string>();
    for (const manualUrl of originalManualUrls) {
      const resolved = sitemapMatches.get(manualUrl) ?? manualUrl;
      resolvedToManual.set(resolved, manualUrl);
    }

    for (let index = 0; index < resolvedUrls.length; index += this.batchSize) {
      if (index > 0 && this.batchDelayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.batchDelayMs));
      }

      const batch = resolvedUrls.slice(index, index + this.batchSize);
      this.logger.debug(
        `[Scrape] Fetching batch ${Math.floor(index / this.batchSize) + 1}/${Math.ceil(resolvedUrls.length / this.batchSize)} (${batch.length} urls)`,
      );

      const settled = await Promise.allSettled(
        batch.map((url) => this.fetchAndParsePage(url, true)),
      );

      for (let i = 0; i < batch.length; i++) {
        const batchUrl = batch[i]!;
        const result = settled[i]!;
        const originalManualUrl = resolvedToManual.get(batchUrl);
        const requestedPath = originalManualUrl
          ? new URL(originalManualUrl).pathname
          : new URL(batchUrl).pathname;

        if (result.status === "fulfilled" && result.value) {
          pages.push(result.value);
          routeResults.push({
            requestedPath,
            resolvedUrl: batchUrl,
            status: "ok",
            title: result.value.title || undefined,
            contentLength: result.value.content.length,
          });
        } else {
          const errorMsg = result.status === "rejected"
            ? this.asMessage(result.reason)
            : "Unknown error";
          const is404 = errorMsg.includes("404");
          routeResults.push({
            requestedPath,
            resolvedUrl: batchUrl,
            status: is404 ? "not_found" : "error",
            error: errorMsg,
          });
          if (result.status === "rejected") {
            this.logger.warn(
              `[Scrape] Failed subpage fetch: ${this.asMessage(result.reason)}`,
            );
          }
        }
      }
    }

    this.logger.log(
      `[Scrape] Scraped ${pages.length}/${resolvedUrls.length} manual subpages via fetch+Cheerio`,
    );
    return { pages, routeResults };
  }

  private parseHtml(pageUrl: string, html: string): ScrapedPage {
    const $ = cheerio.load(html);

    const title =
      $("title").text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      "";
    const description =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "";

    const headings = $("h1, h2, h3, h4, h5, h6")
      .toArray()
      .map((node) => $(node).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const links = $("a[href]")
      .toArray()
      .map((node) => {
        const href = $(node).attr("href")?.trim() ?? "";
        const text = $(node).text().replace(/\s+/g, " ").trim();
        const normalized = this.resolveLink(href, pageUrl);
        return normalized ? { url: normalized, text } : null;
      })
      .filter((entry): entry is { url: string; text: string } => Boolean(entry))
      .slice(0, this.maxLinksPerPage);

    const bodyTextRoot = $("body").clone();
    bodyTextRoot.find("script, style, noscript, template").remove();
    const content = bodyTextRoot.text().replace(/\s+/g, " ").trim();

    const page: ScrapedPage = {
      url: this.normalizeUrl(pageUrl, pageUrl.endsWith("/")),
      title,
      description,
      content,
      headings,
      links,
      teamBios: this.extractTeamBios($),
      pricing: this.extractPricing($),
      customerLogos: this.extractCustomerLogos($, pageUrl),
      testimonials: this.extractTestimonials($),
      metadata: {
        ogImage: $('meta[property="og:image"]').attr("content")?.trim(),
        logoUrl: this.extractLogoUrl($, pageUrl),
        keywords: $('meta[name="keywords"]').attr("content")?.trim(),
        author: $('meta[name="author"]').attr("content")?.trim(),
      },
    };
    this.logger.debug(
      `[Scrape] Parsed page ${page.url} | Title: ${page.title || "n/a"} | Headings: ${page.headings.length} | Links: ${page.links.length}`,
    );
    return page;
  }

  private async fetchAndParsePage(
    pageUrl: string,
    tolerateErrors = false,
  ): Promise<ScrapedPage> {
    const { fetchUrl, hostHeader } = await this.assertSafeUrl(pageUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(fetchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Host: hostHeader,
        },
        redirect: "follow",
        signal: controller.signal,
      });

      if (!response.ok) {
        if (tolerateErrors) {
          throw new Error(`HTTP ${response.status}`);
        }
        throw new Error(`Unable to scrape ${pageUrl}: HTTP ${response.status}`);
      }

      const html = await response.text();
      return this.parseHtml(pageUrl, html);
    } catch (error) {
      const message = this.asMessage(error);
      if (tolerateErrors) {
        this.logger.warn(`[Scrape] Tolerated page scrape error for ${pageUrl}: ${message}`);
      } else {
        this.logger.error(`[Scrape] Page scrape failed for ${pageUrl}: ${message}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private extractTeamBios($: cheerio.CheerioAPI): WebsiteScrapedData["teamBios"] {
    const bios: WebsiteScrapedData["teamBios"] = [];

    $(".team-member, .member, .profile-card").each((_, element) => {
      const container = $(element);
      const name = container
        .find("h1, h2, h3, h4, [data-name], .name")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const role = container
        .find(".role, [data-role], .title")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const bio = container
        .find(".bio, p")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const imageUrl = container.find("img").first().attr("src")?.trim();

      if (!name) {
        return;
      }

      bios.push({
        name,
        role: role || "Team Member",
        bio: bio || "",
        imageUrl,
      });
    });

    return bios;
  }

  private extractPricing(
    $: cheerio.CheerioAPI,
  ): WebsiteScrapedData["pricing"] | undefined {
    const plans: Array<{ name: string; price: string; features: string[] }> = [];

    $(".pricing-card, .plan, .tier").each((_, element) => {
      const container = $(element);
      const name = container
        .find("h1, h2, h3, h4, .name")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const price = container
        .find(".price, span, strong")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const features = container
        .find("li")
        .toArray()
        .map((node) => $(node).text().replace(/\s+/g, " ").trim())
        .filter(Boolean);

      if (!name) {
        return;
      }

      plans.push({ name, price, features });
    });

    if (plans.length === 0) {
      return undefined;
    }

    const currency = plans.find((plan) => /\$|€|£/.test(plan.price))?.price.match(/[$€£]/)?.[0];

    return { plans, currency };
  }

  private extractCustomerLogos($: cheerio.CheerioAPI, pageUrl: string): string[] {
    const logos: string[] = [];

    $("section, div").each((_, element) => {
      const section = $(element);
      const text = section.text().toLowerCase();
      if (!/(trusted by|customers|partners)/.test(text)) {
        return;
      }

      section.find("img[src]").each((__, image) => {
        const src = $(image).attr("src")?.trim();
        if (!src) {
          return;
        }

        const resolved = this.resolveLink(src, pageUrl);
        if (resolved) {
          logos.push(resolved);
        }
      });
    });

    return logos;
  }

  private extractLogoUrl($: cheerio.CheerioAPI, pageUrl: string): string | undefined {
    // 1. Apple touch icon (highest quality, always square)
    const appleTouchIcon = $('link[rel="apple-touch-icon"]').first().attr("href")?.trim();
    if (appleTouchIcon) {
      const resolved = this.resolveLink(appleTouchIcon, pageUrl);
      if (resolved) return resolved;
    }

    // 2. Favicon links — prefer largest sizes attribute
    const iconLinks = $('link[rel="icon"], link[rel="shortcut icon"]').toArray();
    if (iconLinks.length > 0) {
      let bestHref: string | undefined;
      let bestSize = 0;
      for (const link of iconLinks) {
        const href = $(link).attr("href")?.trim();
        if (!href) continue;
        const sizes = $(link).attr("sizes")?.trim();
        const size = sizes ? parseInt(sizes.split("x")[0], 10) || 0 : 0;
        if (size > bestSize || !bestHref) {
          bestSize = size;
          bestHref = href;
        }
      }
      if (bestHref) {
        const resolved = this.resolveLink(bestHref, pageUrl);
        if (resolved) return resolved;
      }
    }

    // 3. Logo image in header/nav
    const logoImg = $('header img, nav img, .logo img, #logo img, [class*="logo"] img').first();
    const logoSrc = logoImg.attr("src")?.trim();
    if (logoSrc && !logoSrc.startsWith("data:")) {
      const width = parseInt(logoImg.attr("width") ?? "", 10);
      const height = parseInt(logoImg.attr("height") ?? "", 10);
      const tooSmall = (width > 0 && width < 32) || (height > 0 && height < 32);
      if (!tooSmall) {
        const resolved = this.resolveLink(logoSrc, pageUrl);
        if (resolved) return resolved;
      }
    }

    return undefined;
  }

  private extractTestimonials(
    $: cheerio.CheerioAPI,
  ): WebsiteScrapedData["testimonials"] {
    const testimonials: WebsiteScrapedData["testimonials"] = [];

    $("blockquote, .testimonial, .review").each((_, element) => {
      const container = $(element);
      const quote = container.text().replace(/\s+/g, " ").trim();
      if (!quote) {
        return;
      }

      const author = container
        .find("cite, .author, .name")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const role = container
        .find(".role, .title, .company")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();

      testimonials.push({
        quote,
        author: author || "Unknown",
        role: role || undefined,
      });
    });

    return testimonials;
  }

  private resolveLink(rawHref: string, baseUrl: string): string | null {
    if (!rawHref) {
      return null;
    }

    const href = rawHref.trim();
    if (
      href.startsWith("#") ||
      href.toLowerCase().startsWith("javascript:") ||
      href.toLowerCase().startsWith("mailto:")
    ) {
      return null;
    }

    try {
      return this.normalizeUrl(new URL(href, baseUrl).toString(), false);
    } catch {
      return null;
    }
  }

  private normalizeUrl(url: string, forceTrailingSlash: boolean): string {
    const candidate = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const parsed = new URL(candidate);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.protocol = parsed.protocol.toLowerCase();
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    if (forceTrailingSlash && parsed.pathname === "") {
      parsed.pathname = "/";
    }
    return parsed.toString();
  }

  private async assertSafeUrl(url: string): Promise<ResolvedSafeUrl> {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      WebsiteScraperService.BLOCKED_HOSTNAMES.has(hostname)
    ) {
      throw new Error(`Unsafe hostname blocked: ${parsed.hostname}`);
    }

    const literalIpVersion = isIP(hostname);
    if (literalIpVersion > 0) {
      if (this.isPrivateIp(hostname)) {
        throw new Error(`Unsafe IP blocked: ${hostname}`);
      }
      return { fetchUrl: url, hostHeader: hostname };
    }

    const resolved = await this.dnsLookupWithTimeout(hostname);
    const safeAddress = resolved.find((entry) => !this.isPrivateIp(entry.address));

    if (!safeAddress) {
      throw new Error(`Unsafe DNS target blocked for host: ${parsed.hostname}`);
    }

    return {
      // Keep the original hostname to preserve TLS/SNI correctness for HTTPS.
      // We still validate DNS resolution above to block private-network targets.
      fetchUrl: url,
      hostHeader: hostname,
    };
  }

  private async dnsLookupWithTimeout(
    hostname: string,
  ): Promise<Array<{ address: string; family: number }>> {
    const result = await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`DNS lookup timed out for ${hostname}`)), WebsiteScraperService.DNS_TIMEOUT_MS),
      ),
    ]);
    return result;
  }

  private isPrivateIp(address: string): boolean {
    const ipVersion = isIP(address);
    if (ipVersion === 4) {
      return this.isPrivateIpv4(address);
    }
    if (ipVersion === 6) {
      return this.isPrivateIpv6(address);
    }
    return false;
  }

  private isPrivateIpv4(address: string): boolean {
    const octets = address.split(".").map((part) => Number(part));
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
      return false;
    }
    const [a, b] = octets;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 0) ||
      (a >= 224)
    );
  }

  private isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("::ffff:127.")
    );
  }

  private getPriorityScore(pathname: string): number {
    const priorities: Array<{ score: number; pattern: RegExp }> = [
      { score: 100, pattern: /\/(about|team|leadership|founders|people|our-team)\b/ },
      { score: 95, pattern: /\/(product|products|platform|solution|solutions|features|how-it-works)\b/ },
      { score: 90, pattern: /\/(pricing|plans)\b/ },
      { score: 85, pattern: /\/(customers|case-studies|testimonials|success-stories|use-cases)\b/ },
      { score: 80, pattern: /\/(company|mission|values|story|culture)\b/ },
      { score: 75, pattern: /\/(integrations|partners|marketplace|ecosystem)\b/ },
      { score: 70, pattern: /\/(security|compliance|privacy|trust|certifications)\b/ },
      { score: 65, pattern: /\/(technology|architecture|infrastructure)\b/ },
      { score: 60, pattern: /\/(research|insights|white-?papers?|reports?)\b/ },
      { score: 55, pattern: /\/(resources|guides|faq|help|knowledge)\b/ },
      { score: 50, pattern: /\/(careers|jobs|hiring)\b/ },
      { score: 45, pattern: /\/(blog|news|press|media|announcements)\b/ },
      { score: 40, pattern: /\/(investors|funding|ipo)\b/ },
      { score: 35, pattern: /\/(enterprise|industries|for-[a-z]+)\b/ },
      { score: 30, pattern: /\/(contact|demo|request|get-started|signup|trial)\b/ },
    ];

    const match = priorities.find((priority) => priority.pattern.test(pathname));
    return match?.score ?? 0;
  }

  private isExcludedPath(pathname: string): boolean {
    const excludePatterns = [
      /\/(admin|dev|test|staging|wp-admin|wp-content)\//,
      /\.(pdf|zip|mp4|json|xml|csv|png|jpg|jpeg|gif|svg|ico)$/,
      /\/(changelog|releases|download|cdn)\b/,
      /\/(tag|tags|category|categories|archive|page)\/\d/,
      /\/\d{4}\/\d{2}\/\d{2}\//,
    ];
    return excludePatterns.some((p) => p.test(pathname));
  }

  private async fetchSitemapUrls(baseUrl: string): Promise<string[]> {
    const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString();
    try {
      const response = await fetch(sitemapUrl, {
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/xml,text/xml,*/*;q=0.8",
        },
      });
      if (!response.ok) return [];
      const xml = await response.text();
      const urls: string[] = [];
      const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
      let match: RegExpExecArray | null;
      while ((match = locRegex.exec(xml)) !== null) {
        if (!match[1]) continue;
        const normalizedLoc = match[1]
          .trim()
          .replace(/^<!\[CDATA\[/i, "")
          .replace(/\]\]>$/i, "")
          .replace(/&amp;/gi, "&");
        if (normalizedLoc) {
          urls.push(normalizedLoc);
        }
      }
      const baseHost = new URL(baseUrl).hostname;
      return urls.filter((url) => {
        try {
          return new URL(url).hostname === baseHost;
        } catch {
          return false;
        }
      });
    } catch {
      this.logger.debug(`[Scrape] No sitemap.xml found at ${sitemapUrl}`);
      return [];
    }
  }

  private dedupeStrings(items: string[]): string[] {
    return Array.from(new Set(items.filter(Boolean)));
  }

  private dedupeLinks(
    links: Array<{ url: string; text: string }>,
  ): Array<{ url: string; text: string }> {
    const dedupe = new Map<string, { url: string; text: string }>();
    for (const link of links) {
      if (!dedupe.has(link.url)) {
        dedupe.set(link.url, link);
      }
    }
    return Array.from(dedupe.values());
  }

  private dedupeTeamBios(
    bios: WebsiteScrapedData["teamBios"],
  ): WebsiteScrapedData["teamBios"] {
    const dedupe = new Map<string, WebsiteScrapedData["teamBios"][number]>();
    for (const bio of bios) {
      const key = `${bio.name.toLowerCase()}::${bio.role.toLowerCase()}`;
      if (!dedupe.has(key)) {
        dedupe.set(key, bio);
      }
    }
    return Array.from(dedupe.values());
  }

  private dedupeTestimonials(
    testimonials: WebsiteScrapedData["testimonials"],
  ): WebsiteScrapedData["testimonials"] {
    const dedupe = new Map<string, WebsiteScrapedData["testimonials"][number]>();
    for (const testimonial of testimonials) {
      const key = `${testimonial.quote.toLowerCase()}::${testimonial.author.toLowerCase()}`;
      if (!dedupe.has(key)) {
        dedupe.set(key, testimonial);
      }
    }
    return Array.from(dedupe.values());
  }

  private asMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error);
    }

    const cause = (error as { cause?: unknown }).cause;
    if (!cause) {
      return error.message;
    }
    if (cause instanceof Error) {
      return `${error.message} (cause: ${cause.message})`;
    }
    try {
      return `${error.message} (cause: ${JSON.stringify(cause)})`;
    } catch {
      return `${error.message} (cause: ${String(cause)})`;
    }
  }
}
