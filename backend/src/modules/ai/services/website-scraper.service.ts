import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as cheerio from "cheerio";
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
  metadata: Pick<WebsiteScrapedData["metadata"], "ogImage" | "keywords" | "author">;
}

@Injectable()
export class WebsiteScraperService {
  private readonly maxSubpages: number;
  private readonly batchSize: number;
  private readonly maxLinksPerPage: number;
  private readonly maxPathDepth: number;
  private readonly timeoutMs: number;

  constructor(@Optional() private config?: ConfigService) {
    this.maxSubpages = this.config?.get<number>("SCRAPING_MAX_SUBPAGES", 20) ?? 20;
    this.batchSize = this.config?.get<number>("SCRAPING_BATCH_SIZE", 5) ?? 5;
    this.maxLinksPerPage =
      this.config?.get<number>("SCRAPING_MAX_LINKS_PER_PAGE", 100) ?? 100;
    this.maxPathDepth = this.config?.get<number>("SCRAPING_MAX_PATH_DEPTH", 4) ?? 4;
    this.timeoutMs = this.config?.get<number>("WEBSITE_SCRAPE_TIMEOUT_MS", 30000) ?? 30000;
  }

  async deepScrape(url: string): Promise<WebsiteScrapedData> {
    const homepageUrl = this.normalizeUrl(url, true);
    const homepage = await this.fetchAndParsePage(homepageUrl);

    const subpageCandidates = this.discoverSubpages(homepage.links, homepageUrl);
    const subpages = await this.scrapeSubpages(subpageCandidates);
    const pages: ScrapedPage[] = [homepage, ...subpages];

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
    const links = this.dedupeLinks(
      pages.flatMap((page) => page.links).slice(0, this.maxLinksPerPage),
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

    return {
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
        keywords: homepage.metadata.keywords,
        author: homepage.metadata.author,
      },
    };
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

  private async scrapeSubpages(urls: string[]): Promise<ScrapedPage[]> {
    const pages: ScrapedPage[] = [];

    for (let index = 0; index < urls.length; index += this.batchSize) {
      const batch = urls.slice(index, index + this.batchSize);
      const settled = await Promise.allSettled(
        batch.map((url) => this.fetchAndParsePage(url, true)),
      );

      for (const result of settled) {
        if (result.status === "fulfilled" && result.value) {
          pages.push(result.value);
        }
      }
    }

    return pages;
  }

  private async fetchAndParsePage(
    pageUrl: string,
    tolerateErrors = false,
  ): Promise<ScrapedPage> {
    const response = await fetch(pageUrl, {
      headers: { "User-Agent": "InsideLine-Bot/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      if (tolerateErrors) {
        throw new Error(`HTTP ${response.status}`);
      }
      throw new Error(`Unable to scrape ${pageUrl}: HTTP ${response.status}`);
    }

    const html = await response.text();
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

    const content = $("body").text().replace(/\s+/g, " ").trim();

    return {
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
        keywords: $('meta[name="keywords"]').attr("content")?.trim(),
        author: $('meta[name="author"]').attr("content")?.trim(),
      },
    };
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

  private getPriorityScore(pathname: string): number {
    const priorities: Array<{ score: number; pattern: RegExp }> = [
      { score: 100, pattern: /\/(about|team|leadership|founders|people)/ },
      { score: 90, pattern: /\/(product|products|platform|solution|solutions|features)/ },
      { score: 80, pattern: /\/(pricing|plans)/ },
      { score: 70, pattern: /\/(company|careers|jobs)/ },
      { score: 60, pattern: /\/(customers|case-studies|testimonials)/ },
      { score: 50, pattern: /\/(technology|how-it-works)/ },
      { score: 40, pattern: /\/(blog|news|press)/ },
      { score: 30, pattern: /\/(investors|funding)/ },
      { score: 20, pattern: /\/(contact|demo)/ },
    ];

    const match = priorities.find((priority) => priority.pattern.test(pathname));
    return match?.score ?? 0;
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
}
