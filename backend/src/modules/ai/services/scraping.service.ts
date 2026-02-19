import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { appendFile, mkdir } from "fs/promises";
import { dirname, resolve } from "path";
import { rotateIfNeeded } from "../../../common/logging/rotate-log";
import { DrizzleService } from "../../../database";
import { startup } from "../../startup/entities";
import type {
  EnrichedTeamMember,
  EnrichmentResult,
  ExtractionResult,
  ScrapeError,
  ScrapingResult,
  WebsiteScrapedData,
} from "../interfaces/phase-results.interface";
import type { PhaseProgressCallback } from "../interfaces/progress-callback.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import {
  LinkedinEnrichmentService,
  type LinkedinEnrichmentTraceEvent,
} from "./linkedin-enrichment.service";
import { PipelineStateService } from "./pipeline-state.service";
import { ScrapingCacheService } from "./scraping-cache.service";
import { WebsiteScraperService } from "./website-scraper.service";

interface TeamMemberInput {
  name: string;
  role?: string;
  linkedinUrl?: string;
}

interface TeamBioInput {
  name: string;
  role: string;
  bio: string;
  imageUrl?: string;
}

export const SCRAPING_AGENT_WEBSITE_KEY = "scrape_website";
export const SCRAPING_AGENT_LINKEDIN_KEY = "linkedin_enrichment";
const SCRAPING_STEP_TEAM_DISCOVERY = "team_discovery";
const SCRAPING_STEP_LINKEDIN_ENRICHMENT = "linkedin_enrichment_step";

export interface ScrapingAgentCompletionPayload {
  agentKey: string;
  status: "completed" | "failed";
  inputPrompt?: string;
  outputText?: string;
  outputJson?: unknown;
  error?: string;
  attempt?: number;
  retryCount?: number;
}

export interface ScrapingRunOptions {
  onStepProgress?: PhaseProgressCallback;
  onAgentStart?: (agentKey: string) => void;
  onAgentComplete?: (payload: ScrapingAgentCompletionPayload) => void;
}

interface LinkedinEnrichmentRunResult {
  teamMembers: EnrichedTeamMember[];
  cacheHits: number;
  liveRequested: number;
  liveEnriched: number;
}

@Injectable()
export class ScrapingService {
  private readonly logger = new Logger(ScrapingService.name);
  private readonly debugLogEnabled: boolean;
  private readonly debugLogPath: string;

  constructor(
    private drizzle: DrizzleService,
    private websiteScraper: WebsiteScraperService,
    private linkedinEnrichment: LinkedinEnrichmentService,
    private scrapingCache: ScrapingCacheService,
    @Optional() private config?: ConfigService,
    @Optional() private pipelineState?: PipelineStateService,
  ) {
    this.debugLogEnabled =
      this.config?.get<boolean>("AI_SCRAPING_DEBUG_LOG_ENABLED", true) ?? true;
    this.debugLogPath =
      this.config?.get<string>(
        "AI_SCRAPING_DEBUG_LOG_PATH",
        "logs/ai-scraping-debug.jsonl",
      ) ?? "logs/ai-scraping-debug.jsonl";
  }

  async run(
    startupId: string,
    options?: ScrapingRunOptions | PhaseProgressCallback,
  ): Promise<ScrapingResult> {
    const { onStepProgress, onAgentStart, onAgentComplete } = this.resolveRunOptions(
      options,
    );

    this.logger.log(`[Scraping] Starting scraping phase for startup ${startupId}`);

    const [record] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record) {
      throw new Error(`Startup ${startupId} not found`);
    }

    // Load enrichment result to use corrected/discovered data
    const enrichment = await this.loadEnrichmentResult(startupId);
    const extraction = await this.loadExtractionResult(startupId);
    const effectiveWebsite = enrichment?.website?.value ?? record.website;

    const scrapeErrors: ScrapeError[] = [];
    const submittedTeamMembers = this.mapTeamMembers(record.teamMembers ?? []);
    const extractionFounderMembers = this.mapFounderNames(
      extraction?.founderNames ?? [],
    );
    this.logger.debug(
      `[Scraping] Loaded startup context | website=${effectiveWebsite ?? "none"} | submittedTeamMembers=${submittedTeamMembers.length} | extractionFounders=${extractionFounderMembers.length}`,
    );

    const progress = onStepProgress;
    onAgentStart?.(SCRAPING_AGENT_WEBSITE_KEY);
    const websiteErrorCountBefore = scrapeErrors.length;
    const website = await this.scrapeWebsite(effectiveWebsite, scrapeErrors, progress);
    const websiteErrors = scrapeErrors
      .slice(websiteErrorCountBefore)
      .filter((error) => error.type === "website");
    const websiteFailed = Boolean(effectiveWebsite) && !website && websiteErrors.length > 0;
    const websiteOutput = {
      requestedUrl: effectiveWebsite ?? null,
      resolvedUrl: website?.url ?? null,
      scraped: Boolean(website),
      skipped: !effectiveWebsite,
      pageCount: website?.metadata.pageCount ?? 0,
      linkCount: website?.links.length ?? 0,
      teamBioCount: website?.teamBios.length ?? 0,
      error: websiteFailed
        ? (websiteErrors[websiteErrors.length - 1]?.error ?? "Website scraping failed")
        : undefined,
    };
    onAgentComplete?.({
      agentKey: SCRAPING_AGENT_WEBSITE_KEY,
      status: websiteFailed ? "failed" : "completed",
      error: websiteFailed ? websiteOutput.error : undefined,
      outputText: websiteFailed
        ? `Website scraping failed for ${effectiveWebsite}`
        : !effectiveWebsite
          ? "Website scraping skipped: startup website URL is missing."
          : `Website scraping completed for ${website?.url ?? effectiveWebsite}`,
      outputJson: websiteOutput,
      attempt: 1,
      retryCount: 0,
    });

    onAgentStart?.(SCRAPING_AGENT_LINKEDIN_KEY);
    let discoveredLinkedinLeaders: TeamMemberInput[] = [];
    let discoveredWebsiteLeaders: TeamMemberInput[] = [];
    let discoveredWebsiteLinkedinMembers: TeamMemberInput[] = [];
    const enrichmentFounderMembers: TeamMemberInput[] =
      (enrichment?.discoveredFounders ?? [])
        .filter((founder) => founder.confidence >= 0.5)
        .map((founder) => ({
          name: founder.name,
          role: founder.role,
          linkedinUrl: founder.linkedinUrl,
        }));

    progress?.onStepStart(SCRAPING_STEP_TEAM_DISCOVERY, {
      inputJson: {
        submittedTeamMembers,
        extractionFounderMembers,
        enrichmentFounderMembers,
        websiteTeamBios: website?.teamBios ?? [],
        websiteLinks: website?.links ?? [],
      },
    });
    try {
      discoveredWebsiteLeaders = this.extractLeadershipCandidates(
        website?.teamBios ?? [],
      );
      discoveredWebsiteLinkedinMembers = this.extractLinkedinCandidatesFromWebsiteLinks(
        website?.links ?? [],
      );
      discoveredLinkedinLeaders = await this.discoverCompanyLinkedinLeadership(
        record.name,
        [
          ...submittedTeamMembers,
          ...discoveredWebsiteLeaders,
          ...discoveredWebsiteLinkedinMembers,
        ],
        effectiveWebsite ?? undefined,
        progress,
      );
    } catch (error) {
      const message = this.asMessage(error);
      progress?.onStepFailed(SCRAPING_STEP_TEAM_DISCOVERY, message, {
        outputJson: {
          error: message,
        },
      });
      onAgentComplete?.({
        agentKey: SCRAPING_AGENT_LINKEDIN_KEY,
        status: "failed",
        error: message,
        outputText: `LinkedIn team discovery failed for ${record.name}: ${message}`,
        outputJson: {
          companyName: record.name,
          submittedTeamMembers: submittedTeamMembers.length,
          extractionFounderMembers: extractionFounderMembers.length,
          enrichmentFounderMembers: enrichmentFounderMembers.length,
          discoveredWebsiteLeaders: discoveredWebsiteLeaders.length,
          discoveredWebsiteLinkedinMembers: discoveredWebsiteLinkedinMembers.length,
          discoveredLinkedinLeaders: discoveredLinkedinLeaders.length,
        },
        attempt: 1,
        retryCount: 0,
      });
      throw error;
    }

    const teamMembers = this.mergeTeamMembers(
      submittedTeamMembers,
      extractionFounderMembers,
      discoveredWebsiteLeaders,
      discoveredWebsiteLinkedinMembers,
      discoveredLinkedinLeaders,
      enrichmentFounderMembers,
    );
    progress?.onStepComplete(SCRAPING_STEP_TEAM_DISCOVERY, {
      summary: {
        submitted: submittedTeamMembers.length,
        extractionFounders: extractionFounderMembers.length,
        enrichmentFounders: enrichmentFounderMembers.length,
        websiteLeaders: discoveredWebsiteLeaders.length,
        linkedinDiscovered:
          discoveredWebsiteLinkedinMembers.length + discoveredLinkedinLeaders.length,
        total: teamMembers.length,
      },
      outputJson: {
        submittedTeamMembers,
        extractionFounderMembers,
        discoveredWebsiteLeaders,
        discoveredWebsiteLinkedinMembers,
        discoveredLinkedinLeaders,
        enrichmentFounderMembers,
        mergedTeamMembers: teamMembers,
      },
    });
    this.logger.log(
      `[Scraping] Team member seed built | submitted=${submittedTeamMembers.length} | extractionFounders=${extractionFounderMembers.length} | enrichmentFounders=${enrichmentFounderMembers.length} | discoveredWebsiteLeaders=${discoveredWebsiteLeaders.length} | discoveredWebsiteLinkedin=${discoveredWebsiteLinkedinMembers.length} | discoveredLinkedinLeaders=${discoveredLinkedinLeaders.length} | final=${teamMembers.length}`,
    );

    progress?.onStepStart(SCRAPING_STEP_LINKEDIN_ENRICHMENT, {
      inputJson: {
        requestedTeamMembers: teamMembers,
        companyName: record.name,
        websiteUrl: record.website,
      },
    });
    let linkedinEnrichmentResult: LinkedinEnrichmentRunResult;
    try {
      linkedinEnrichmentResult = await this.enrichTeamMembers(
        record.userId,
        teamMembers,
        record.name,
        record.website,
        scrapeErrors,
        progress,
      );
    } catch (error) {
      const message = this.asMessage(error);
      progress?.onStepFailed(SCRAPING_STEP_LINKEDIN_ENRICHMENT, message, {
        outputJson: {
          error: message,
        },
      });
      onAgentComplete?.({
        agentKey: SCRAPING_AGENT_LINKEDIN_KEY,
        status: "failed",
        error: message,
        outputText: `LinkedIn enrichment failed for ${record.name}: ${message}`,
        outputJson: {
          companyName: record.name,
          requestedTeamMembers: teamMembers.length,
          submittedTeamMembers: submittedTeamMembers.length,
          extractionFounderMembers: extractionFounderMembers.length,
          enrichmentFounderMembers: enrichmentFounderMembers.length,
          discoveredWebsiteLeaders: discoveredWebsiteLeaders.length,
          discoveredWebsiteLinkedinMembers: discoveredWebsiteLinkedinMembers.length,
          discoveredLinkedinLeaders: discoveredLinkedinLeaders.length,
        },
        attempt: 1,
        retryCount: 0,
      });
      throw error;
    }
    const enrichedTeam = linkedinEnrichmentResult.teamMembers;

    const submittedNames = new Set(
      submittedTeamMembers.map((member) => member.name.trim().toLowerCase()),
    );
    const droppedUnverifiedTeamMembers = enrichedTeam.filter((member) => {
      const isSubmittedMember = submittedNames.has(member.name.trim().toLowerCase());
      if (isSubmittedMember) {
        return false;
      }
      return member.enrichmentStatus !== "success";
    });
    const verifiedTeamMembers = enrichedTeam.filter((member) => {
      const isSubmittedMember = submittedNames.has(member.name.trim().toLowerCase());
      if (isSubmittedMember) {
        return true;
      }
      return member.enrichmentStatus === "success";
    });
    const linkedinStatuses = enrichedTeam.reduce<Record<string, number>>((acc, member) => {
      const key = member.enrichmentStatus ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const linkedinErrors = scrapeErrors
      .filter((error) => error.type === "linkedin")
      .map((error) => `${error.target}: ${error.error}`);
    progress?.onStepComplete(SCRAPING_STEP_LINKEDIN_ENRICHMENT, {
      summary: {
        requested: teamMembers.length,
        cacheHits: linkedinEnrichmentResult.cacheHits,
        liveRequested: linkedinEnrichmentResult.liveRequested,
        liveEnriched: linkedinEnrichmentResult.liveEnriched,
        verified: verifiedTeamMembers.length,
        dropped: droppedUnverifiedTeamMembers.length,
        errors: linkedinErrors.length,
      },
      outputJson: {
        teamMembersRequested: teamMembers,
        enrichedTeamMembers: enrichedTeam,
        verifiedTeamMembers,
        droppedUnverifiedTeamMembers,
        enrichmentStatuses: linkedinStatuses,
        scrapeErrors,
        errors: linkedinErrors,
      },
    });

    onAgentComplete?.({
      agentKey: SCRAPING_AGENT_LINKEDIN_KEY,
      status: "completed",
      outputText: `LinkedIn enrichment completed | requested=${teamMembers.length} | verified=${verifiedTeamMembers.length} | dropped=${droppedUnverifiedTeamMembers.length}`,
      outputJson: {
        companyName: record.name,
        submittedTeamMembers: submittedTeamMembers.length,
        extractionFounderMembers: extractionFounderMembers.length,
        enrichmentFounderMembers: enrichmentFounderMembers.length,
        discoveredWebsiteLeaders: discoveredWebsiteLeaders.length,
        discoveredWebsiteLinkedinMembers: discoveredWebsiteLinkedinMembers.length,
        discoveredLinkedinLeaders: discoveredLinkedinLeaders.length,
        requestedTeamMembers: teamMembers.length,
        enrichedTeamMembers: enrichedTeam.length,
        cacheHits: linkedinEnrichmentResult.cacheHits,
        liveRequested: linkedinEnrichmentResult.liveRequested,
        liveEnriched: linkedinEnrichmentResult.liveEnriched,
        verifiedTeamMembers: verifiedTeamMembers.length,
        droppedUnverifiedTeamMembers: droppedUnverifiedTeamMembers.length,
        enrichmentStatuses: linkedinStatuses,
        errors: linkedinErrors,
      },
      attempt: 1,
      retryCount: 0,
    });

    const result: ScrapingResult = {
      website,
      websiteUrl: website?.url ?? record.website ?? null,
      websiteSummary: website?.description || undefined,
      teamMembers: verifiedTeamMembers,
      notableClaims: this.buildNotableClaims(record.industry, record.stage, record.fundingTarget),
      scrapeErrors,
    };

    const statusCounts = result.teamMembers.reduce<Record<string, number>>((acc, member) => {
      const key = member.enrichmentStatus ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const errorSummary = scrapeErrors.map((error) => `${error.type}:${error.target}`);

    this.logger.log(
      `[Scraping] Completed scraping phase for startup ${startupId} | websiteScraped=${Boolean(website)} | teamMembers=${result.teamMembers.length} | droppedUnverified=${droppedUnverifiedTeamMembers.length} | errors=${scrapeErrors.length}`,
    );
    this.logger.debug(
      `[Scraping] Status summary ${JSON.stringify(statusCounts)} | Error targets ${JSON.stringify(errorSummary)}`,
    );

    // Log website scraping details
    if (website) {
      this.logger.log(
        `[Scraping] Website data captured | URL: ${website.url} | Pages: ${website.metadata.pageCount} | Links: ${website.links.length} | TeamBios: ${website.teamBios.length}`,
      );
      this.logger.debug(
        `[Scraping] Website content | Title: ${website.title || "none"} | Description: ${website.description?.substring(0, 100) || "none"}...`,
      );
    } else {
      this.logger.warn(`[Scraping] No website data scraped for ${record.website || "unknown URL"}`);
    }

    await this.writeDebugLog({
      startupId,
      startupName: record.name,
      startupWebsite: record.website ?? null,
      submittedTeamMembers,
      extractionFounderTeamMembers: extractionFounderMembers,
      enrichmentFounderTeamMembers: enrichmentFounderMembers,
      discoveredWebsiteLeadershipTeamMembers: discoveredWebsiteLeaders,
      discoveredWebsiteLinkedinTeamMembers: discoveredWebsiteLinkedinMembers,
      discoveredLinkedinLeadershipTeamMembers: discoveredLinkedinLeaders,
      requestedTeamMembers: teamMembers,
      memberConfidenceLog: result.teamMembers.map((member) => ({
        name: member.name,
        linkedinUrl: member.linkedinUrl ?? null,
        enrichmentStatus: member.enrichmentStatus,
        matchConfidence: member.matchConfidence ?? null,
        confidenceReason: member.confidenceReason ?? null,
      })),
      droppedUnverifiedTeamMembers: droppedUnverifiedTeamMembers.map((member) => ({
        name: member.name,
        linkedinUrl: member.linkedinUrl ?? null,
        enrichmentStatus: member.enrichmentStatus,
        matchConfidence: member.matchConfidence ?? null,
        confidenceReason: member.confidenceReason ?? null,
      })),
      scrapingResult: {
        websiteUrl: result.websiteUrl ?? null,
        websiteSummary: result.websiteSummary ?? null,
        websiteCaptured: Boolean(result.website),
        enrichedTeamMembers: result.teamMembers,
        scrapeErrors: result.scrapeErrors,
      },
      counts: {
        requestedTeamMembers: teamMembers.length,
        enrichedTeamMembers: result.teamMembers.length,
        droppedUnverifiedTeamMembers: droppedUnverifiedTeamMembers.length,
        scrapeErrors: result.scrapeErrors.length,
      },
    });

    return result;
  }

  private resolveRunOptions(
    options?: ScrapingRunOptions | PhaseProgressCallback,
  ): {
    onStepProgress?: PhaseProgressCallback;
    onAgentStart?: (agentKey: string) => void;
    onAgentComplete?: (payload: ScrapingAgentCompletionPayload) => void;
  } {
    if (!options) {
      return {};
    }

    if (this.isPhaseProgressCallback(options)) {
      return {
        onStepProgress: options,
      };
    }

    return {
      onStepProgress: options.onStepProgress,
      onAgentStart: options.onAgentStart,
      onAgentComplete: options.onAgentComplete,
    };
  }

  private isPhaseProgressCallback(
    options: ScrapingRunOptions | PhaseProgressCallback,
  ): options is PhaseProgressCallback {
    const progress = options as PhaseProgressCallback;
    return (
      typeof progress.onStepStart === "function" ||
      typeof progress.onStepComplete === "function" ||
      typeof progress.onStepFailed === "function"
    );
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

  private mapFounderNames(founderNames: string[]): TeamMemberInput[] {
    return founderNames
      .map((founder) => founder.trim())
      .filter((founder) => founder.length > 0)
      .map((founder) => ({
        name: founder,
        role: "Founder",
      }));
  }

  private extractLeadershipCandidates(teamBios: TeamBioInput[]): TeamMemberInput[] {
    const leadershipRolePattern =
      /\b(founder|co[\s-]?founder|chief|ceo|cto|coo|cfo|cmo|cpo|president|vice president|vp|head|director|managing director|general manager|partner)\b/i;

    const results: TeamMemberInput[] = [];
    for (const bio of teamBios) {
      const name = bio.name?.trim();
      const role = bio.role?.trim();
      if (!name || name.length < 3) {
        continue;
      }
      if (!role || !leadershipRolePattern.test(role)) {
        continue;
      }

      results.push({
        name,
        role,
      });
    }

    return results.slice(0, 8);
  }

  private mergeTeamMembers(
    submitted: TeamMemberInput[],
    discoveredFromExtraction: TeamMemberInput[],
    discoveredFromWebsite: TeamMemberInput[],
    discoveredFromWebsiteLinkedin: TeamMemberInput[],
    discoveredFromLinkedin: TeamMemberInput[],
    discoveredFromEnrichment: TeamMemberInput[],
  ): TeamMemberInput[] {
    const byName = new Map<string, TeamMemberInput>();

    const upsert = (member: TeamMemberInput) => {
      const key = member.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, member);
        return;
      }

      byName.set(key, {
        ...existing,
        ...member,
        role: existing.role || member.role,
        linkedinUrl: existing.linkedinUrl || member.linkedinUrl,
      });
    };

    submitted.forEach(upsert);
    discoveredFromExtraction.forEach(upsert);
    discoveredFromWebsite.forEach(upsert);
    discoveredFromWebsiteLinkedin.forEach(upsert);
    discoveredFromLinkedin.forEach(upsert);
    discoveredFromEnrichment.forEach(upsert);

    return Array.from(byName.values());
  }

  private extractLinkedinCandidatesFromWebsiteLinks(
    links: Array<{ url: string; text: string }>,
  ): TeamMemberInput[] {
    const discovered: TeamMemberInput[] = [];
    const seen = new Set<string>();

    for (const link of links) {
      const linkedinUrl = this.normalizeLinkedinProfileUrl(link.url);
      if (!linkedinUrl) {
        continue;
      }

      const name = this.extractTeamMemberNameFromLink(link.text, linkedinUrl);
      if (!name) {
        continue;
      }

      const key = name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      discovered.push({
        name,
        role: this.extractRoleHintFromLink(link.text),
        linkedinUrl,
      });
    }

    return discovered.slice(0, 12);
  }

  private normalizeLinkedinProfileUrl(url: string): string | undefined {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (host !== "linkedin.com") {
        return undefined;
      }

      const segments = parsed.pathname
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (segments[0] !== "in" || !segments[1]) {
        return undefined;
      }

      return `https://www.linkedin.com/in/${segments[1]}`;
    } catch {
      return undefined;
    }
  }

  private extractTeamMemberNameFromLink(
    linkText: string,
    linkedinUrl: string,
  ): string | null {
    const normalizedText = linkText.replace(/\s+/g, " ").trim();
    if (normalizedText.length > 0) {
      const sanitized = normalizedText
        .replace(
          /\b(founder|co[\s-]?founder|chief|ceo|cto|coo|cfo|cmo|cpo|president|vice president|vp|head|director|managing director|general manager|partner)\b.*$/i,
          "",
        )
        .replace(/[|@•,:;]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const tokens = sanitized
        .split(" ")
        .map((token) => this.normalizeNameToken(token))
        .filter((token) => token.length > 1);

      if (
        tokens.length >= 2 &&
        !tokens.some((token) => ["linkedin", "profile", "view"].includes(token))
      ) {
        return tokens.map((token) => `${token[0]?.toUpperCase() ?? ""}${token.slice(1)}`).join(" ");
      }
    }

    try {
      const parsed = new URL(linkedinUrl);
      const slug = parsed.pathname.split("/").filter(Boolean)[1];
      if (!slug) {
        return null;
      }

      const tokens = slug
        .split("-")
        .map((token) => this.normalizeNameToken(token))
        .filter((token) => token.length > 1 && !/^\d+$/.test(token));

      if (tokens.length < 2) {
        return null;
      }

      return tokens.map((token) => `${token[0]?.toUpperCase() ?? ""}${token.slice(1)}`).join(" ");
    } catch {
      return null;
    }
  }

  private extractRoleHintFromLink(linkText: string): string | undefined {
    const match = linkText
      .replace(/\s+/g, " ")
      .match(
        /\b(founder|co[\s-]?founder|chief [a-z ]+ officer|ceo|cto|coo|cfo|cmo|cpo|president|vice president|vp|head|director|managing director|general manager|partner)\b/i,
      );
    if (!match?.[0]) {
      return undefined;
    }

    const role = match[0].trim();
    if (role.length === 0) {
      return undefined;
    }

    if (role.toUpperCase() === role) {
      return role;
    }

    return role
      .split(" ")
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`)
      .join(" ");
  }

  private normalizeNameToken(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  private async discoverCompanyLinkedinLeadership(
    companyName: string,
    existingMembers: TeamMemberInput[],
    companyWebsite?: string,
    progress?: PhaseProgressCallback,
  ): Promise<TeamMemberInput[]> {
    try {
      if (progress?.onStepTrace) {
        return await this.linkedinEnrichment.discoverCompanyLeadershipMembers(
          companyName,
          existingMembers,
          companyWebsite,
          {
            onTrace: (event) => this.emitLinkedinTrace(progress, event),
          },
        );
      }
      return await this.linkedinEnrichment.discoverCompanyLeadershipMembers(
        companyName,
        existingMembers,
        companyWebsite,
      );
    } catch (error) {
      const message = this.asMessage(error);
      this.logger.warn(
        `[Scraping] Company LinkedIn leadership discovery failed for ${companyName}: ${message}`,
      );
      return [];
    }
  }

  private async scrapeWebsite(
    websiteUrl: string | null,
    errors: ScrapeError[],
    progress?: PhaseProgressCallback,
  ): Promise<WebsiteScrapedData | null> {
    progress?.onStepStart("cache_check", {
      inputJson: {
        url: websiteUrl,
      },
    });
    if (!websiteUrl) {
      this.logger.debug("[Scraping] Website URL missing; skipping website scrape");
      progress?.onStepComplete("cache_check", {
        summary: {
          hit: false,
          skipped: true,
          reason: "Website URL missing",
        },
        outputJson: {
          hit: false,
          skipped: true,
          url: websiteUrl,
          reason: "Website URL missing",
        },
      });
      return null;
    }

    let cached: WebsiteScrapedData | null = null;
    try {
      cached = await this.scrapingCache.getWebsiteCache(websiteUrl);
    } catch (error) {
      const message = this.asMessage(error);
      progress?.onStepFailed("cache_check", message, {
        outputJson: {
          error: message,
          url: websiteUrl,
        },
      });
      errors.push({
        type: "website",
        target: websiteUrl,
        error: message,
      });
      this.logger.warn(`[Scraping] Website cache lookup failed for ${websiteUrl}: ${message}`);
      return null;
    }

    if (cached) {
      this.logger.log(`[Scraping] Website cache hit for ${websiteUrl}`);
      progress?.onStepComplete("cache_check", {
        summary: {
          hit: true,
          url: websiteUrl,
        },
        outputJson: cached,
      });
      return cached;
    }

    progress?.onStepComplete("cache_check", {
      summary: {
        hit: false,
        url: websiteUrl,
      },
    });
    progress?.onStepStart("website_scrape", {
      inputJson: {
        url: websiteUrl,
      },
    });

    try {
      this.logger.log(`[Scraping] Website cache miss for ${websiteUrl}; running deep scrape`);
      const scraped = await this.websiteScraper.deepScrape(websiteUrl);
      await this.scrapingCache.setWebsiteCache(websiteUrl, scraped);
      this.logger.debug(
        `[Scraping] Website scrape complete | pages=${scraped.metadata.pageCount} | links=${scraped.links.length} | teamBios=${scraped.teamBios.length}`,
      );
      progress?.onStepComplete("website_scrape", {
        summary: {
          pages: scraped.metadata.pageCount,
          links: scraped.links.length,
          teamBios: scraped.teamBios.length,
        },
        outputJson: scraped,
      });
      return scraped;
    } catch (error) {
      const message = this.asMessage(error);
      progress?.onStepFailed("website_scrape", message, {
        outputJson: {
          error: message,
          url: websiteUrl,
        },
      });
      errors.push({
        type: "website",
        target: websiteUrl,
        error: message,
      });
      this.logger.warn(`[Scraping] Website scrape failed for ${websiteUrl}: ${message}`);
      return null;
    }
  }

  private async enrichTeamMembers(
    userId: string,
    members: TeamMemberInput[],
    companyName: string,
    websiteUrl: string | null,
    errors: ScrapeError[],
    progress?: PhaseProgressCallback,
  ): Promise<LinkedinEnrichmentRunResult> {
    if (members.length === 0) {
      this.logger.debug("[Scraping] No team members provided for LinkedIn profile resolution");
      return {
        teamMembers: [],
        cacheHits: 0,
        liveRequested: 0,
        liveEnriched: 0,
      };
    }

    this.logger.log(
      `[Scraping] Starting LinkedIn profile resolution | members=${members.length} | withLinkedIn=${members.filter((member) => Boolean(member.linkedinUrl)).length}`,
    );

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
          const hasImage = Boolean(
            cached.linkedinProfile &&
              "profilePictureUrl" in cached.linkedinProfile &&
              cached.linkedinProfile.profilePictureUrl,
          );
          if (cached.enrichmentStatus === "success" && !hasImage) {
            this.logger.debug(
              `[Scraping] LinkedIn cache stale (missing profile image) for ${member.linkedinUrl}; refreshing live`,
            );
            membersToEnrich.push(member);
            continue;
          }

          cacheHitsByUrl.set(member.linkedinUrl, {
            ...member,
            ...cached,
            name: cached.name || member.name,
            role: cached.role ?? member.role,
            linkedinUrl: cached.linkedinUrl ?? member.linkedinUrl,
          });
          this.logger.debug(`[Scraping] LinkedIn cache hit for ${member.linkedinUrl}`);
          continue;
        }
      } catch {
        this.logger.debug(
          `[Scraping] LinkedIn cache read failed for ${member.linkedinUrl}; continuing with live enrichment`,
        );
      }

      membersToEnrich.push(member);
    }

    let liveEnriched: EnrichedTeamMember[] = [];
    if (membersToEnrich.length > 0) {
      this.logger.log(
        `[Scraping] Executing live LinkedIn profile resolution for ${membersToEnrich.length} members`,
      );
      try {
        if (progress?.onStepTrace) {
          liveEnriched = await this.linkedinEnrichment.enrichTeamMembers(
            userId,
            membersToEnrich,
            { companyName, website: websiteUrl ?? undefined },
            {
              onTrace: (event) => this.emitLinkedinTrace(progress, event),
            },
          );
        } else {
          liveEnriched = await this.linkedinEnrichment.enrichTeamMembers(
            userId,
            membersToEnrich,
            { companyName, website: websiteUrl ?? undefined },
          );
        }
        const liveStatuses = liveEnriched.reduce<Record<string, number>>((acc, member) => {
          const key = member.enrichmentStatus ?? "unknown";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {});
        this.logger.debug(
          `[Scraping] Live LinkedIn profile resolution finished ${JSON.stringify(liveStatuses)}`,
        );
      } catch (error) {
        const message = this.asMessage(error);
        errors.push({
          type: "linkedin",
          target: companyName || "team",
          error: message,
        });
        this.logger.error(
          `[Scraping] LinkedIn profile resolution request failed for ${companyName || "team"}: ${message}`,
        );
        liveEnriched = membersToEnrich.map((member) => ({
          name: member.name,
          role: member.role,
          linkedinUrl: member.linkedinUrl,
          enrichmentStatus: "error",
          matchConfidence: 0,
          confidenceReason: `LinkedIn profile resolution request failed: ${message}`,
        }));
      }
    }

    let cachedWriteSuccesses = 0;
    let cachedWriteFailures = 0;
    for (const member of liveEnriched) {
      if (
        member.linkedinUrl &&
        (member.enrichmentStatus === "success" || member.enrichmentStatus === "not_found")
      ) {
        await this.scrapingCache
          .setLinkedinCache(member.linkedinUrl, member)
          .then(() => {
            cachedWriteSuccesses += 1;
          })
          .catch(() => {
            cachedWriteFailures += 1;
          });
      }
    }
    if (cachedWriteSuccesses > 0 || cachedWriteFailures > 0) {
      this.logger.debug(
        `[Scraping] LinkedIn cache write summary | success=${cachedWriteSuccesses} | failed=${cachedWriteFailures}`,
      );
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
        matchConfidence: enriched?.matchConfidence,
        confidenceReason: enriched?.confidenceReason,
        linkedinProfile: enriched?.linkedinProfile,
        enrichedAt: enriched?.enrichedAt,
      });
    }

    for (const member of finalTeam) {
      if (member.enrichmentStatus === "error") {
        errors.push({
          type: "linkedin",
          target: member.name,
          error: "LinkedIn profile resolution failed",
        });
      }
    }

    const finalStatuses = finalTeam.reduce<Record<string, number>>((acc, member) => {
      const key = member.enrichmentStatus ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    this.logger.log(
      `[Scraping] LinkedIn profile resolution completed | cacheHits=${cacheHitsByUrl.size} | liveRequested=${membersToEnrich.length} | finalCount=${finalTeam.length}`,
    );
    this.logger.debug(
      `[Scraping] LinkedIn final status summary ${JSON.stringify(finalStatuses)}`,
    );

    return {
      teamMembers: finalTeam,
      cacheHits: cacheHitsByUrl.size,
      liveRequested: membersToEnrich.length,
      liveEnriched: liveEnriched.length,
    };
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

  private emitLinkedinTrace(
    progress: PhaseProgressCallback | undefined,
    event: LinkedinEnrichmentTraceEvent,
  ): void {
    progress?.onStepTrace?.("linkedin_enrichment", event.status, {
      inputJson: event.inputJson,
      outputJson: event.outputJson,
      inputText: event.inputText,
      outputText: event.outputText,
      error: event.error,
      meta: {
        operation: event.operation,
        ...(event.meta ?? {}),
      },
    });
  }

  private asMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async writeDebugLog(payload: Record<string, unknown>): Promise<void> {
    if (!this.debugLogEnabled) {
      return;
    }

    try {
      const resolvedPath = this.resolveLogPath(this.debugLogPath);
      await mkdir(dirname(resolvedPath), { recursive: true });

      await rotateIfNeeded(resolvedPath);
      await appendFile(
        resolvedPath,
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          ...payload,
        })}\n`,
        "utf8",
      );
    } catch (error) {
      const message = this.asMessage(error);
      this.logger.warn(`[Scraping] Failed to write debug log: ${message}`);
    }
  }

  private resolveLogPath(filePath: string): string {
    if (filePath.startsWith("/")) {
      return filePath;
    }

    return resolve(process.cwd(), filePath);
  }

  private async loadEnrichmentResult(startupId: string): Promise<EnrichmentResult | null> {
    if (!this.pipelineState) return null;
    try {
      return await this.pipelineState.getPhaseResult(startupId, PipelinePhase.ENRICHMENT);
    } catch {
      return null;
    }
  }

  private async loadExtractionResult(startupId: string): Promise<ExtractionResult | null> {
    if (!this.pipelineState) return null;
    try {
      return await this.pipelineState.getPhaseResult(startupId, PipelinePhase.EXTRACTION);
    } catch {
      return null;
    }
  }
}
