import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { startup } from "../../startup/entities";
import type {
  EnrichedTeamMember,
  ScrapeError,
  ScrapingResult,
  WebsiteScrapedData,
} from "../interfaces/phase-results.interface";
import { LinkedinEnrichmentService } from "./linkedin-enrichment.service";
import { ScrapingCacheService } from "./scraping-cache.service";
import { WebsiteScraperService } from "./website-scraper.service";

interface TeamMemberInput {
  name: string;
  role?: string;
  linkedinUrl?: string;
}

@Injectable()
export class ScrapingService {
  constructor(
    private drizzle: DrizzleService,
    private websiteScraper: WebsiteScraperService,
    private linkedinEnrichment: LinkedinEnrichmentService,
    private scrapingCache: ScrapingCacheService,
  ) {}

  async run(startupId: string): Promise<ScrapingResult> {
    const [record] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record) {
      throw new Error(`Startup ${startupId} not found`);
    }

    const scrapeErrors: ScrapeError[] = [];
    const teamMembers = this.mapTeamMembers(record.teamMembers ?? []);

    const website = await this.scrapeWebsite(record.website, scrapeErrors);
    const enrichedTeam = await this.enrichTeamMembers(
      startupId,
      teamMembers,
      record.name,
      record.website,
      scrapeErrors,
    );

    return {
      website,
      websiteUrl: website?.url ?? record.website ?? null,
      websiteSummary: website?.description || undefined,
      teamMembers: enrichedTeam,
      notableClaims: this.buildNotableClaims(record.industry, record.stage, record.fundingTarget),
      scrapeErrors,
    };
  }

  private mapTeamMembers(
    members: Array<{ name: string; role: string; linkedinUrl: string }>,
  ): TeamMemberInput[] {
    return members.map((member) => ({
      name: member.name,
      role: member.role,
      linkedinUrl: member.linkedinUrl || undefined,
    }));
  }

  private async scrapeWebsite(
    websiteUrl: string | null,
    errors: ScrapeError[],
  ): Promise<WebsiteScrapedData | null> {
    if (!websiteUrl) {
      return null;
    }

    try {
      const cached = await this.scrapingCache.getWebsiteCache(websiteUrl);
      if (cached) {
        return cached;
      }

      const scraped = await this.websiteScraper.deepScrape(websiteUrl);
      await this.scrapingCache.setWebsiteCache(websiteUrl, scraped);
      return scraped;
    } catch (error) {
      errors.push({
        type: "website",
        target: websiteUrl,
        error: this.asMessage(error),
      });
      return null;
    }
  }

  private async enrichTeamMembers(
    startupId: string,
    members: TeamMemberInput[],
    companyName: string,
    websiteUrl: string | null,
    errors: ScrapeError[],
  ): Promise<EnrichedTeamMember[]> {
    if (members.length === 0) {
      return [];
    }

    const cacheHitsByUrl = new Map<string, EnrichedTeamMember>();
    const membersToEnrich: TeamMemberInput[] = [];

    for (const member of members) {
      if (!member.linkedinUrl) {
        membersToEnrich.push(member);
        continue;
      }

      try {
        const cached = await this.scrapingCache.getLinkedinCache<EnrichedTeamMember>(
          member.linkedinUrl,
        );
        if (cached) {
          cacheHitsByUrl.set(member.linkedinUrl, {
            ...member,
            ...cached,
            name: cached.name || member.name,
            role: cached.role ?? member.role,
            linkedinUrl: cached.linkedinUrl ?? member.linkedinUrl,
          });
          continue;
        }
      } catch {
        // Ignore cache read errors and continue with live enrichment.
      }

      membersToEnrich.push(member);
    }

    let liveEnriched: EnrichedTeamMember[] = [];
    if (membersToEnrich.length > 0) {
      try {
        liveEnriched = await this.linkedinEnrichment.enrichTeamMembers(
          startupId,
          membersToEnrich,
          { companyName, website: websiteUrl ?? undefined },
        );
      } catch (error) {
        const message = this.asMessage(error);
        errors.push({
          type: "linkedin",
          target: companyName || startupId,
          error: message,
        });
        liveEnriched = membersToEnrich.map((member) => ({
          name: member.name,
          role: member.role,
          linkedinUrl: member.linkedinUrl,
          enrichmentStatus: "error",
        }));
      }
    }

    for (const member of liveEnriched) {
      if (
        member.linkedinUrl &&
        (member.enrichmentStatus === "success" || member.enrichmentStatus === "not_found")
      ) {
        await this.scrapingCache
          .setLinkedinCache(member.linkedinUrl, member)
          .catch(() => undefined);
      }
    }

    const finalTeam: EnrichedTeamMember[] = [];
    let liveIndex = 0;

    for (const original of members) {
      if (original.linkedinUrl) {
        const cached = cacheHitsByUrl.get(original.linkedinUrl);
        if (cached) {
          finalTeam.push(cached);
          continue;
        }
      }

      const enriched = liveEnriched[liveIndex];
      liveIndex += 1;

      finalTeam.push({
        name: original.name,
        role: original.role,
        linkedinUrl: enriched?.linkedinUrl ?? original.linkedinUrl,
        enrichmentStatus: enriched?.enrichmentStatus ?? "error",
        linkedinProfile: enriched?.linkedinProfile,
        enrichedAt: enriched?.enrichedAt,
      });
    }

    for (const member of finalTeam) {
      if (member.enrichmentStatus === "error") {
        errors.push({
          type: "linkedin",
          target: member.name,
          error: "LinkedIn enrichment failed",
        });
      }
    }

    return finalTeam;
  }

  private buildNotableClaims(
    industry: string,
    stage: string,
    fundingTarget: number,
  ): string[] {
    const claims: string[] = [];
    if (industry) {
      claims.push(`Industry: ${industry}`);
    }
    if (stage) {
      claims.push(`Stage: ${stage}`);
    }
    if (Number.isFinite(fundingTarget)) {
      claims.push(`Funding target: ${fundingTarget}`);
    }
    return claims;
  }

  private asMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
