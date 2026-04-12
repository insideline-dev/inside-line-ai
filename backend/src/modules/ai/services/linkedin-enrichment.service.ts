import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText, Output } from "ai";
import { z } from "zod";
import { UnipileService } from '../../integrations/unipile/unipile.service';
import type { LinkedInProfile } from '../../integrations/unipile/entities';
import type { EnrichedTeamMember } from '../interfaces/phase-results.interface';
import { ModelPurpose } from '../interfaces/pipeline.interface';
import { AiProviderService } from '../providers/ai-provider.service';
import { AiModelExecutionService } from './ai-model-execution.service';

interface TeamMemberInput {
  name: string;
  role?: string;
  linkedinUrl?: string;
}

interface StartupContextInput {
  companyName?: string;
  website?: string;
}

interface ProfileMatchAssessment {
  accepted: boolean;
  confidence: number;
  reason: string;
  associationType?: "current" | "historical" | "none";
  adjudicatedBy?: "deterministic" | "ai";
}

interface RejectedCandidateDecision {
  linkedinUrl: string;
  confidence: number;
  reason: string;
}

export interface LinkedinEnrichmentTraceEvent {
  operation: string;
  status: "running" | "completed" | "failed";
  inputJson?: unknown;
  outputJson?: unknown;
  inputText?: string;
  outputText?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

interface LinkedinEnrichmentOptions {
  onTrace?: (event: LinkedinEnrichmentTraceEvent) => void;
}

const LinkedInIdentityVerifierSchema = z.object({
  accepted: z.boolean(),
  confidence: z.number().int().min(0).max(100),
  reason: z.string().min(1),
});

@Injectable()
export class LinkedinEnrichmentService {
  private readonly logger = new Logger(LinkedinEnrichmentService.name);
  private readonly batchSize: number;
  private readonly maxCompanyLeadershipCandidates: number;
  private readonly companyLeadershipDiscoveryTarget: number;
  private readonly maxLeadershipDiscoveryQueries: number;
  private readonly maxProfileCandidates = 3;
  private readonly historicalFounderMinNameConfidence = 85;
  private readonly aiVerifierEnabled: boolean;
  private readonly aiVerifierMinConfidence: number;
  private readonly aiVerifierMaxConfidence: number;
  private readonly nameStopWords = new Set([
    'mr',
    'mrs',
    'ms',
    'dr',
    'jr',
    'sr',
    'ii',
    'iii',
    'iv',
  ]);
  private readonly companyTokenStopWords = new Set([
    "inc",
    "llc",
    "ltd",
    "limited",
    "corp",
    "corporation",
    "co",
    "company",
    "group",
    "holdings",
    "ventures",
    "capital",
    "technologies",
    "technology",
    "tech",
    "systems",
    "solutions",
    "labs",
    "lab",
    "global",
    "international",
  ]);
  private readonly companyLeadershipQueries = [
    'founder',
    'co-founder',
    'ceo',
    'cto',
    'cfo',
    'coo',
    'cpo',
    'president',
    'chairman',
  ] as const;
  private readonly executiveLeadershipPattern =
    /\b(founder|co[\s-]?founder|chairman|chief|ceo|cto|coo|cfo|cmo|cpo|president)\b/i;
  private readonly formerAssociationPattern =
    /\b(ex[\s-]?|former|previously|past|alumni|alumnus|alumna)\b/i;

  constructor(
    private unipileService: UnipileService,
    @Optional() private config?: ConfigService,
    @Optional() private aiProviders?: AiProviderService,
    @Optional() private modelExecution?: AiModelExecutionService,
  ) {
    this.batchSize = this.config?.get<number>('LINKEDIN_BATCH_SIZE', 10) ?? 10;
    this.maxCompanyLeadershipCandidates =
      this.config?.get<number>('LINKEDIN_COMPANY_DISCOVERY_MAX', 6) ?? 6;
    const configuredTarget =
      this.config?.get<number>('LINKEDIN_COMPANY_DISCOVERY_TARGET', 3) ?? 3;
    this.companyLeadershipDiscoveryTarget = Math.max(
      1,
      Math.min(configuredTarget, this.maxCompanyLeadershipCandidates),
    );
    this.maxLeadershipDiscoveryQueries =
      this.config?.get<number>('LINKEDIN_COMPANY_DISCOVERY_MAX_QUERIES', 3) ??
      3;
    this.aiVerifierEnabled =
      this.config?.get<boolean>('LINKEDIN_AI_VERIFIER_ENABLED', true) ?? true;
    this.aiVerifierMinConfidence =
      this.config?.get<number>('LINKEDIN_AI_VERIFIER_MIN_CONFIDENCE', 55) ?? 55;
    this.aiVerifierMaxConfidence =
      this.config?.get<number>('LINKEDIN_AI_VERIFIER_MAX_CONFIDENCE', 80) ?? 80;
  }

  async discoverCompanyLeadershipMembers(
    companyName: string,
    existingMembers: TeamMemberInput[],
    companyWebsite?: string,
    options?: LinkedinEnrichmentOptions,
  ): Promise<TeamMemberInput[]> {
    const normalizedCompany = companyName?.trim();
    if (!normalizedCompany || !this.unipileService.isConfigured()) {
      return [];
    }

    const existingNames = new Set(
      existingMembers.map((member) => member.name.trim().toLowerCase()),
    );
    const existingUrls = new Set(
      existingMembers
        .map((member) => member.linkedinUrl?.trim().toLowerCase())
        .filter((url): url is string => Boolean(url)),
    );

    const candidates = new Map<string, TeamMemberInput>();
    const discoveryQueries = this.companyLeadershipQueries.slice(
      0,
      Math.max(1, this.maxLeadershipDiscoveryQueries),
    );
    const traceOptions = options?.onTrace ? { onTrace: options.onTrace } : undefined;
    let allowGlobalFallbackDiscovery = true;
    for (const query of discoveryQueries) {
      let matches: LinkedInProfile[] = [];
      this.emitTrace(options, {
        operation: "unipile.search_profiles_in_company",
        status: "running",
        inputJson: {
          query,
          companyName: normalizedCompany,
          companyWebsite: companyWebsite ?? null,
        },
      });
      try {
        matches = traceOptions
          ? await this.unipileService.searchProfilesInCompany(
              query,
              normalizedCompany,
              companyWebsite,
              traceOptions,
            )
          : await this.unipileService.searchProfilesInCompany(
              query,
              normalizedCompany,
              companyWebsite,
            );
        this.emitTrace(options, {
          operation: "unipile.search_profiles_in_company",
          status: "completed",
          inputJson: {
            query,
            companyName: normalizedCompany,
          },
          outputJson: matches,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emitTrace(options, {
          operation: "unipile.search_profiles_in_company",
          status: "failed",
          inputJson: {
            query,
            companyName: normalizedCompany,
          },
          error: message,
        });
        this.logger.debug(
          `[LinkedInDiscovery] query=${query} company=${normalizedCompany} failed: ${message}`,
        );
        if (this.isRateLimitError(message)) {
          this.logger.warn(
            `[LinkedInDiscovery] rate limited by Unipile; stopping leadership discovery for ${normalizedCompany}`,
          );
          allowGlobalFallbackDiscovery = false;
          break;
        }
        if (this.isIntegrationUnavailableError(message)) {
          this.logger.warn(
            `[LinkedInDiscovery] LinkedIn integration unavailable; skipping company leadership discovery for ${normalizedCompany}`,
          );
          allowGlobalFallbackDiscovery = false;
          break;
        }
        continue;
      }

      for (const profile of matches) {
        const member = this.toCandidate(profile, normalizedCompany, {
          searchScope: "company",
        });
        if (!member) {
          continue;
        }

        const nameKey = member.name.toLowerCase();
        const urlKey = member.linkedinUrl?.toLowerCase();
        if (existingNames.has(nameKey)) continue;
        if (urlKey && existingUrls.has(urlKey)) continue;

        const dedupeKey = urlKey || nameKey;
        if (!candidates.has(dedupeKey)) {
          candidates.set(dedupeKey, member);
        }
      }

      if (candidates.size >= this.companyLeadershipDiscoveryTarget) {
        this.logger.debug(
          `[LinkedInDiscovery] company=${normalizedCompany} reached discovery target (${this.companyLeadershipDiscoveryTarget}), stopping additional queries`,
        );
        break;
      }
    }

    if (candidates.size === 0 && allowGlobalFallbackDiscovery) {
      this.logger.debug(
        `[LinkedInDiscovery] company=${normalizedCompany} yielded no in-company matches; trying global profile fallback`,
      );
      for (const query of discoveryQueries) {
        let matches: LinkedInProfile[] = [];
        this.emitTrace(options, {
          operation: "unipile.search_profiles_fallback",
          status: "running",
          inputJson: {
            query,
            companyName: normalizedCompany,
          },
        });
        try {
          const searchTerm = `${query} ${normalizedCompany}`.trim();
          matches = traceOptions
            ? await this.unipileService.searchProfiles(
                searchTerm,
                normalizedCompany,
                traceOptions,
              )
            : await this.unipileService.searchProfiles(
                searchTerm,
                normalizedCompany,
              );
          this.emitTrace(options, {
            operation: "unipile.search_profiles_fallback",
            status: "completed",
            inputJson: {
              query,
              companyName: normalizedCompany,
            },
            outputJson: matches,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.emitTrace(options, {
            operation: "unipile.search_profiles_fallback",
            status: "failed",
            inputJson: {
              query,
              companyName: normalizedCompany,
            },
            error: message,
          });
          if (this.isRateLimitError(message) || this.isIntegrationUnavailableError(message)) {
            break;
          }
          continue;
        }

        for (const profile of matches) {
          const member = this.toCandidate(profile, normalizedCompany, {
            searchScope: "global",
          });
          if (!member) {
            continue;
          }

          const nameKey = member.name.toLowerCase();
          const urlKey = member.linkedinUrl?.toLowerCase();
          if (existingNames.has(nameKey)) continue;
          if (urlKey && existingUrls.has(urlKey)) continue;

          const dedupeKey = urlKey || nameKey;
          if (!candidates.has(dedupeKey)) {
            candidates.set(dedupeKey, member);
          }
        }

        if (candidates.size >= this.companyLeadershipDiscoveryTarget) {
          break;
        }
      }
    }

    const output = Array.from(candidates.values()).slice(
      0,
      this.maxCompanyLeadershipCandidates,
    );
    if (output.length > 0) {
      this.logger.log(
        `[LinkedInDiscovery] company=${normalizedCompany} discoveredLeadershipMembers=${output.length}`,
      );
    }

    return output;
  }

  async enrichTeamMembers(
    userId: string,
    members: TeamMemberInput[],
    startupContext?: StartupContextInput,
    options?: LinkedinEnrichmentOptions,
  ): Promise<EnrichedTeamMember[]> {
    if (members.length === 0) {
      return [];
    }

    if (!this.unipileService.isConfigured()) {
      return members.map((member) => ({
        name: member.name,
        role: member.role,
        linkedinUrl: member.linkedinUrl,
        enrichmentStatus: 'not_configured',
        matchConfidence: 0,
        confidenceReason: 'LinkedIn integration is not configured',
      }));
    }

    const enriched: EnrichedTeamMember[] = [];
    let rateLimited = false;
    let rateLimitReason = "LinkedIn provider rate-limited this request (429)";

    for (let index = 0; index < members.length; index += this.batchSize) {
      const batch = members.slice(index, index + this.batchSize);
      for (const member of batch) {
        if (rateLimited) {
          enriched.push(
            this.buildRateLimitedMember(member, rateLimitReason),
          );
          this.emitTrace(options, {
            operation: "linkedin.enrich_member",
            status: "failed",
            inputJson: {
              member,
              startupContext,
            },
            error: rateLimitReason,
            meta: {
              rateLimited: true,
              skipped: true,
            },
          });
          continue;
        }

        try {
          const result = await this.enrichMember(
            userId,
            member,
            startupContext,
            options,
          );
          this.emitTrace(options, {
            operation: "linkedin.enrich_member",
            status: "completed",
            inputJson: {
              member,
              startupContext,
            },
            outputJson: result,
          });
          enriched.push(result);
          continue;
        } catch (error) {
          const rejectedMessage =
            error instanceof Error
              ? error.message
              : String(error);
          if (this.isRateLimitError(rejectedMessage)) {
            rateLimited = true;
            rateLimitReason = this.formatRateLimitReason(rejectedMessage);
            enriched.push(
              this.buildRateLimitedMember(member, rateLimitReason),
            );
            this.emitTrace(options, {
              operation: "linkedin.enrich_member",
              status: "failed",
              inputJson: {
                member,
                startupContext,
              },
              error: rejectedMessage,
              meta: {
                rateLimited: true,
                shortCircuit: true,
              },
            });
            this.logger.warn(
              `[LinkedInEnrichment] Rate limited by Unipile; short-circuiting remaining members in this run`,
            );
            continue;
          }

          if (this.isIntegrationUnavailableError(rejectedMessage)) {
            enriched.push({
              name: member.name,
              role: member.role,
              linkedinUrl: member.linkedinUrl,
              enrichmentStatus: 'not_configured',
              matchConfidence: 0,
              confidenceReason: 'LinkedIn integration authorization failed or is unavailable',
            });
            this.emitTrace(options, {
              operation: "linkedin.enrich_member",
              status: "failed",
              inputJson: {
                member,
                startupContext,
              },
              error: rejectedMessage,
              meta: {
                integrationUnavailable: true,
              },
            });
            continue;
          }

          enriched.push({
            name: member.name,
            role: member.role,
            linkedinUrl: member.linkedinUrl,
            enrichmentStatus: 'error',
            matchConfidence: 0,
            confidenceReason: 'LinkedIn profile resolution failed with an unexpected error',
          });
          this.emitTrace(options, {
            operation: "linkedin.enrich_member",
            status: "failed",
            inputJson: {
              member,
              startupContext,
            },
            error: rejectedMessage,
          });
        }
      }
    }

    return enriched;
  }

  private async enrichMember(
    userId: string,
    member: TeamMemberInput,
    startupContext?: StartupContextInput,
    options?: LinkedinEnrichmentOptions,
  ): Promise<EnrichedTeamMember> {
    const attemptedUrls: string[] = [];
    const rejectedCandidates: RejectedCandidateDecision[] = [];
    let candidateUrls: string[];
    try {
      candidateUrls = member.linkedinUrl
        ? [member.linkedinUrl]
        : await this.getSearchCandidateUrls(member, startupContext, [], options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.isRateLimitError(message)) {
        throw error;
      }
      if (this.isIntegrationUnavailableError(message)) {
        return {
          name: member.name,
          role: member.role,
          linkedinUrl: member.linkedinUrl,
          enrichmentStatus: 'not_configured',
          matchConfidence: 0,
          confidenceReason: 'LinkedIn integration authorization failed or is unavailable',
        };
      }
      throw error;
    }
    let usedSearchFallback = !member.linkedinUrl;
    let sawRecoverableFetchError = false;
    let lastAttemptedUrl: string | undefined;
    const traceOptions = options?.onTrace ? { onTrace: options.onTrace } : undefined;

    if (candidateUrls.length === 0) {
      return {
        name: member.name,
        role: member.role,
        enrichmentStatus: 'not_found',
        matchConfidence: 0,
        confidenceReason: 'No LinkedIn candidate URLs were found',
      };
    }

    for (let index = 0; index < candidateUrls.length; index += 1) {
      const linkedinUrl = candidateUrls[index];
      lastAttemptedUrl = linkedinUrl;
      attemptedUrls.push(linkedinUrl);

      try {
        const profile = traceOptions
          ? await this.unipileService.getProfile(
              userId,
              linkedinUrl,
              traceOptions,
            )
          : await this.unipileService.getProfile(userId, linkedinUrl);
        if (!profile) {
          rejectedCandidates.push({
            linkedinUrl,
            confidence: 0,
            reason: 'Profile lookup returned no profile data',
          });
        } else {
          let assessment = this.assessRequestedProfile(
            profile,
            member,
            startupContext,
          );
          if (
            !assessment.accepted &&
            this.shouldRunAiAdjudication(assessment)
          ) {
            const aiAssessment = await this.assessRequestedProfileWithAi(
              profile,
              member,
              startupContext,
            );
            if (aiAssessment) {
              assessment = aiAssessment;
            }
          }
          if (!assessment.accepted) {
            rejectedCandidates.push({
              linkedinUrl,
              confidence: assessment.confidence,
              reason: assessment.reason,
            });
            this.emitMatchDecision(options, {
              requestedMember: member,
              linkedinUrl,
              accepted: false,
              confidence: assessment.confidence,
              reason: assessment.reason,
              associationType: assessment.associationType ?? "none",
              adjudicatedBy: assessment.adjudicatedBy ?? "deterministic",
              attemptedUrls,
              rejectedCandidates,
            });
            this.logger.debug(
              `[LinkedInEnrichment] profile mismatch for ${member.name}; candidate ${linkedinUrl} rejected (${assessment.reason}, confidence=${assessment.confidence})`,
            );
          } else {
            this.emitMatchDecision(options, {
              requestedMember: member,
              linkedinUrl,
              accepted: true,
              confidence: assessment.confidence,
              reason: assessment.reason,
              associationType:
                assessment.associationType ??
                this.deriveAssociationType(profile, startupContext?.companyName),
              adjudicatedBy: assessment.adjudicatedBy ?? "deterministic",
              attemptedUrls,
              rejectedCandidates,
            });
            return {
              name: member.name,
              role: member.role,
              linkedinUrl,
              linkedinProfile: this.mapProfile(profile),
              enrichmentStatus: 'success',
              matchConfidence: assessment.confidence,
              confidenceReason: assessment.reason,
              enrichedAt: new Date().toISOString(),
            };
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (this.isRateLimitError(message)) {
          throw error;
        }
        if (this.isIntegrationUnavailableError(message)) {
          return {
            name: member.name,
            role: member.role,
            linkedinUrl,
            enrichmentStatus: 'not_configured',
            matchConfidence: 0,
            confidenceReason: 'LinkedIn integration authorization failed or is unavailable',
          };
        }

        if (!this.isRecoverableFetchError(message)) {
          return {
            name: member.name,
            role: member.role,
            linkedinUrl,
            enrichmentStatus: 'error',
            matchConfidence: 0,
            confidenceReason: `LinkedIn profile fetch failed: ${message}`,
          };
        }

        sawRecoverableFetchError = true;
        rejectedCandidates.push({
          linkedinUrl,
          confidence: 0,
          reason: `Recoverable LinkedIn fetch error: ${message}`,
        });
      }

      const consumedAllCandidates = index === candidateUrls.length - 1;
      if (consumedAllCandidates && !usedSearchFallback) {
        usedSearchFallback = true;
        const fallbackUrls = await this.getSearchCandidateUrls(
          member,
          startupContext,
          attemptedUrls,
          options,
        );
        if (fallbackUrls.length > 0) {
          this.logger.debug(
            `[LinkedInEnrichment] retrying ${member.name} with ${fallbackUrls.length} fallback profile candidates`,
          );
          candidateUrls = [...candidateUrls, ...fallbackUrls];
        }
      }
    }

    const bestRejectedCandidate = this.pickBestRejectedCandidate(rejectedCandidates);

    if (sawRecoverableFetchError) {
      this.emitMatchDecision(options, {
        requestedMember: member,
        linkedinUrl: lastAttemptedUrl ?? member.linkedinUrl,
        accepted: false,
        confidence: bestRejectedCandidate?.confidence ?? 0,
        reason:
          bestRejectedCandidate?.reason ??
          "All candidate profile lookups failed with recoverable errors",
        associationType: "none",
        adjudicatedBy: "deterministic",
        attemptedUrls,
        rejectedCandidates,
        technicalFailure: true,
      });
      return {
        name: member.name,
        role: member.role,
        linkedinUrl: lastAttemptedUrl ?? member.linkedinUrl,
        enrichmentStatus: 'error',
        matchConfidence: bestRejectedCandidate?.confidence ?? 0,
        confidenceReason:
          bestRejectedCandidate?.reason ??
          'All candidate profile lookups failed with recoverable errors',
      };
    }

    this.emitMatchDecision(options, {
      requestedMember: member,
      linkedinUrl: lastAttemptedUrl ?? member.linkedinUrl,
      accepted: false,
      confidence: bestRejectedCandidate?.confidence ?? 0,
      reason:
        bestRejectedCandidate?.reason ??
        "No candidate profile matched name/company constraints",
      associationType: "none",
      adjudicatedBy: "deterministic",
      attemptedUrls,
      rejectedCandidates,
    });
    return {
      name: member.name,
      role: member.role,
      linkedinUrl: lastAttemptedUrl ?? member.linkedinUrl,
      enrichmentStatus: 'not_found',
      matchConfidence: bestRejectedCandidate?.confidence ?? 0,
      confidenceReason:
        bestRejectedCandidate?.reason ??
        'No candidate profile matched name/company constraints',
    };
  }

  private async getSearchCandidateUrls(
    member: TeamMemberInput,
    startupContext?: StartupContextInput,
    excludeUrls: string[] = [],
    options?: LinkedinEnrichmentOptions,
  ): Promise<string[]> {
    const companyName = startupContext?.companyName;
    const traceOptions = options?.onTrace ? { onTrace: options.onTrace } : undefined;
    const searchQueries = this.buildSearchQueries(member.name);
    let matches: LinkedInProfile[] = [];

    for (const query of searchQueries) {
      this.emitTrace(options, {
        operation: "unipile.search_profiles",
        status: "running",
        inputJson: {
          name: query,
          company: companyName ?? null,
          excludeUrls,
        },
      });
      matches = traceOptions
        ? await this.unipileService.searchProfiles(
            query,
            companyName,
            traceOptions,
          )
        : await this.unipileService.searchProfiles(
            query,
            companyName,
          );
      this.emitTrace(options, {
        operation: "unipile.search_profiles",
        status: "completed",
        inputJson: {
          name: query,
          company: companyName ?? null,
          excludeUrls,
        },
        outputJson: matches,
      });
      if (matches.length > 0) {
        break;
      }
    }

    if (matches.length === 0 && companyName) {
      this.logger.debug(
        `[LinkedInEnrichment] No company-scoped profile hits for ${member.name} @ ${companyName}; retrying global search`,
      );
      for (const query of searchQueries) {
        this.emitTrace(options, {
          operation: "unipile.search_profiles_fallback",
          status: "running",
          inputJson: {
            name: query,
            company: null,
            fallbackFromCompany: companyName,
            excludeUrls,
          },
        });

        matches = traceOptions
          ? await this.unipileService.searchProfiles(query, undefined, traceOptions)
          : await this.unipileService.searchProfiles(query);

        this.emitTrace(options, {
          operation: "unipile.search_profiles_fallback",
          status: "completed",
          inputJson: {
            name: query,
            company: null,
            fallbackFromCompany: companyName,
            excludeUrls,
          },
          outputJson: matches,
        });
        if (matches.length > 0) {
          break;
        }
      }
    }
    const excluded = new Set(excludeUrls.map((url) => this.normalizeLinkedinUrl(url)));
    const deduped = new Set<string>();
    const candidates: string[] = [];

    for (const match of matches) {
      if (this.hasProfileName(match) && !this.namesLikelyMatch(member.name, match)) {
        continue;
      }

      const profileUrl = match.profileUrl?.trim();
      if (!profileUrl) {
        continue;
      }

      const normalized = this.normalizeLinkedinUrl(profileUrl);
      if (!normalized || excluded.has(normalized) || deduped.has(normalized)) {
        continue;
      }

      deduped.add(normalized);
      candidates.push(profileUrl);
      if (candidates.length >= this.maxProfileCandidates) {
        break;
      }
    }

    return candidates;
  }

  private buildSearchQueries(name: string): string[] {
    const normalized = name.trim();
    if (!normalized) {
      return [];
    }

    const rawTokens = normalized
      .split(/[\s-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    if (rawTokens.length < 2) {
      return [normalized];
    }

    const firstName = rawTokens[0];
    if (!firstName) {
      return [normalized];
    }

    return Array.from(
      new Set([
        normalized,
        firstName,
      ]),
    );
  }

  private emitTrace(
    options: LinkedinEnrichmentOptions | undefined,
    event: LinkedinEnrichmentTraceEvent,
  ): void {
    options?.onTrace?.(event);
  }

  private normalizeLinkedinUrl(url: string): string {
    const value = url.trim();
    if (!value) {
      return '';
    }

    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, '');
      return `${host}${pathname}`;
    } catch {
      return value
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/+$/, '');
    }
  }

  private isRecoverableFetchError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('invalid_recipient') ||
      normalized.includes('recipient cannot be reached') ||
      normalized.includes('"status":422')
    );
  }

  private isRateLimitError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      /\b429\b/.test(normalized) ||
      normalized.includes("too many requests") ||
      normalized.includes("too_many_requests") ||
      normalized.includes("rate limit")
    );
  }

  private buildRateLimitedMember(
    member: TeamMemberInput,
    reason: string,
  ): EnrichedTeamMember {
    return {
      name: member.name,
      role: member.role,
      linkedinUrl: member.linkedinUrl,
      enrichmentStatus: "error",
      matchConfidence: 0,
      confidenceReason: reason,
    };
  }

  private formatRateLimitReason(message: string): string {
    if (!message || message.trim().length === 0) {
      return "LinkedIn provider rate-limited this request (429)";
    }

    return `LinkedIn provider rate-limited this request (429): ${message}`;
  }

  private isIntegrationUnavailableError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('linkedin integration not configured') ||
      normalized.includes('linkedin integration authorization failed') ||
      normalized.includes('unipile api error 401') ||
      normalized.includes('unipile api error 403') ||
      normalized.includes('unauthorized') ||
      normalized.includes('forbidden')
    );
  }

  private mapProfile(
    profile: LinkedInProfile,
  ): NonNullable<EnrichedTeamMember['linkedinProfile']> {
    return {
      headline: profile.headline || '',
      summary: profile.summary || '',
      profilePictureUrl: profile.profileImageUrl || undefined,
      currentCompany: profile.currentCompany
        ? {
            name: profile.currentCompany.name || '',
            title: profile.currentCompany.title || '',
          }
        : null,
      experience: profile.experience.map((entry) => ({
        title: entry.title,
        company: entry.company,
        duration: this.formatDuration(entry.startDate, entry.endDate, entry.current),
        location: entry.location || '',
        description: entry.description || '',
        startDate: this.formatTimelineDate(entry.startDate) || undefined,
        endDate: entry.current ? null : this.formatTimelineDate(entry.endDate),
      })),
      education: profile.education.map((entry) => ({
        school: entry.school,
        degree: entry.degree,
        field: entry.fieldOfStudy,
        startDate: entry.startDate || (entry.startYear ? String(entry.startYear) : null),
        endDate: entry.endDate || (entry.endYear ? String(entry.endYear) : null),
        description: entry.description || '',
      })),
    };
  }

  private formatDuration(
    startDate: string,
    endDate: string | null,
    current: boolean,
  ): string {
    const start = this.formatTimelineDate(startDate) || 'Unknown';
    if (current) {
      return `${start} - Present`;
    }
    const end = this.formatTimelineDate(endDate);
    if (end) {
      return `${start} - ${end}`;
    }
    return start;
  }

  private formatTimelineDate(value: string | null | undefined): string | null {
    if (!value || value.trim().length === 0) {
      return null;
    }

    const yearMatch = value.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      return yearMatch[0];
    }

    return value.trim();
  }

  private extractYearFromDate(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }

    const match = value.match(/\b(19|20)\d{2}\b/);
    if (!match?.[0]) {
      return null;
    }

    const parsed = Number.parseInt(match[0], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toCandidate(
    profile: LinkedInProfile,
    companyName: string,
    options?: { searchScope?: "company" | "global" },
  ): TeamMemberInput | null {
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    if (!fullName) {
      return null;
    }
    if (/^linkedin member$/i.test(fullName)) {
      return null;
    }
    if (!profile.profileUrl) {
      return null;
    }

    const headline = profile.headline || '';
    if (
      !this.isRelevantLeadershipProfile(
        profile,
        companyName,
        headline,
        options?.searchScope,
      )
    ) {
      return null;
    }

    const role = this.extractRoleFromHeadline(headline);
    return {
      name: fullName,
      role,
      linkedinUrl: profile.profileUrl,
    };
  }

  private isRelevantLeadershipProfile(
    profile: LinkedInProfile,
    companyName: string,
    headline: string,
    searchScope: "company" | "global" = "global",
  ): boolean {
    const currentRoleTexts = this.getCurrentRoleTexts(profile, companyName);
    const hasLeadershipSignal =
      this.executiveLeadershipPattern.test(headline) ||
      currentRoleTexts.some((text) =>
        this.executiveLeadershipPattern.test(text),
      );
    if (!hasLeadershipSignal) {
      return false;
    }

    if (this.isCurrentAtTargetCompany(profile, companyName)) {
      return true;
    }

    if (searchScope === "company") {
      return this.hasScopedHeadlineLeadershipSignal(headline, companyName);
    }

    return this.hasGlobalHeadlineLeadershipSignal(headline, companyName);
  }

  private extractRoleFromHeadline(headline: string): string {
    if (!headline) {
      return 'Leadership';
    }

    const roleFragment = headline.split(/[|@,-]/)[0]?.trim();
    if (!roleFragment) {
      return 'Leadership';
    }

    if (roleFragment.length > 80) {
      return roleFragment.slice(0, 80).trim();
    }
    return roleFragment;
  }

  private isCurrentAtTargetCompany(
    profile: LinkedInProfile,
    companyName: string,
  ): boolean {
    if (this.matchesTargetCompany(profile.currentCompany?.name, companyName)) {
      return true;
    }

    return profile.experience.some(
      (entry) =>
        entry.current &&
        this.matchesTargetCompany(entry.company, companyName),
    );
  }

  private getCurrentRoleTexts(
    profile: LinkedInProfile,
    companyName: string,
  ): string[] {
    const roleTexts: string[] = [];

    if (
      this.matchesTargetCompany(profile.currentCompany?.name, companyName) &&
      profile.currentCompany?.title
    ) {
      roleTexts.push(profile.currentCompany.title);
    }

    for (const entry of profile.experience) {
      if (
        entry.current &&
        this.matchesTargetCompany(entry.company, companyName) &&
        entry.title
      ) {
        roleTexts.push(entry.title);
      }
    }

    return roleTexts;
  }

  private hasScopedHeadlineLeadershipSignal(
    headline: string,
    companyName: string,
  ): boolean {
    const fragments = this.splitHeadlineFragments(headline);
    if (fragments.length === 0) {
      return false;
    }

    if (
      fragments.some((fragment) =>
        this.fragmentSignalsLeadershipAtTargetCompany(fragment, companyName),
      )
    ) {
      return true;
    }

    if (fragments.length !== 1) {
      return false;
    }

    const [fragment] = fragments;
    if (!fragment) {
      return false;
    }

    return (
      this.executiveLeadershipPattern.test(fragment) &&
      !this.formerAssociationPattern.test(fragment) &&
      !this.containsCompanyReference(fragment)
    );
  }

  private hasGlobalHeadlineLeadershipSignal(
    headline: string,
    companyName: string,
  ): boolean {
    return this.splitHeadlineFragments(headline).some((fragment) =>
      this.fragmentSignalsLeadershipAtTargetCompany(fragment, companyName),
    );
  }

  private fragmentSignalsLeadershipAtTargetCompany(
    fragment: string,
    companyName: string,
  ): boolean {
    if (
      !this.executiveLeadershipPattern.test(fragment) ||
      this.formerAssociationPattern.test(fragment)
    ) {
      return false;
    }

    return this.hasExactHeadlineTargetCompanySignal(fragment, companyName);
  }

  private hasExactHeadlineTargetCompanySignal(
    fragment: string,
    companyName: string,
  ): boolean {
    const target = companyName.trim();
    if (!target) {
      return false;
    }

    const escapedTarget = this.escapeRegExp(target).replace(/\s+/g, "\\s+");
    const pattern = new RegExp(
      `(?:\\bat\\b|@)\\s*${escapedTarget}(?=$|\\s*[|,.;:)])`,
      "i",
    );

    return pattern.test(fragment);
  }

  private splitHeadlineFragments(headline: string): string[] {
    return headline
      .split(/[|]/)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0);
  }

  private containsCompanyReference(value: string): boolean {
    return /\b(?:at|@|formerly at|ex[\s-])\b/i.test(value);
  }

  private matchesTargetCompany(
    candidateCompany: string | null | undefined,
    targetCompany: string,
  ): boolean {
    const candidate = this.normalizeCompanyText(candidateCompany);
    if (!candidate) {
      return false;
    }

    const target = this.normalizeCompanyText(targetCompany);
    if (!target) {
      return false;
    }

    if (candidate.includes(target) || target.includes(candidate)) {
      return true;
    }

    const targetTokens = target
      .split(" ")
      .filter(
        (token) =>
          token.length >= 3 && !this.companyTokenStopWords.has(token),
      );
    if (targetTokens.length === 0) {
      return false;
    }

    const matchedTokens = targetTokens.filter((token) => candidate.includes(token));
    if (matchedTokens.length >= 2) {
      return true;
    }
    if (matchedTokens.length === 1 && targetTokens.length === 1) {
      return matchedTokens[0]!.length >= 6;
    }
    return false;
  }

  private normalizeCompanyText(value: string | null | undefined): string {
    if (!value) {
      return "";
    }

    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private hasProfileName(profile: LinkedInProfile): boolean {
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    return fullName.length > 0;
  }

  private assessRequestedProfile(
    profile: LinkedInProfile,
    requestedMember: TeamMemberInput,
    startupContext?: StartupContextInput,
  ): ProfileMatchAssessment {
    const nameConfidence = this.computeNameMatchConfidence(requestedMember.name, profile);
    if (nameConfidence === 0) {
      return {
        accepted: false,
        confidence: 0,
        reason: "Profile name does not match requested member name",
        associationType: "none",
        adjudicatedBy: "deterministic",
      };
    }

    const companyName = startupContext?.companyName?.trim();
    if (!companyName) {
      const accepted = nameConfidence >= this.historicalFounderMinNameConfidence;
      return {
        accepted,
        confidence: nameConfidence,
        reason: accepted
          ? "Name matched strongly, but company context was not provided"
          : "Name matched, but company context was not provided so profile association could not be verified",
        associationType: "none",
        adjudicatedBy: "deterministic",
      };
    }

    if (!this.isCurrentAtTargetCompany(profile, companyName)) {
      if (
        nameConfidence >= this.historicalFounderMinNameConfidence &&
        this.hasHistoricalLeadershipAtTargetCompany(profile, companyName)
      ) {
        return {
          accepted: true,
          confidence: Math.max(70, Math.round(nameConfidence * 0.9)),
          reason: `Name matched and has verified historical founder/executive association with "${companyName}" (not currently employed)`,
          associationType: "historical",
          adjudicatedBy: "deterministic",
        };
      }

      return {
        accepted: false,
        confidence: Math.max(10, Math.round(nameConfidence * 0.6)),
        reason: `Current company does not match target company "${companyName}"`,
        associationType: "none",
        adjudicatedBy: "deterministic",
      };
    }

    if (this.hasDisqualifyingOperationalRole(profile, companyName)) {
      return {
        accepted: false,
        confidence: Math.max(10, Math.round(nameConfidence * 0.5)),
        reason: `Current role indicates operational/non-executive work at "${companyName}"`,
        associationType: "none",
        adjudicatedBy: "deterministic",
      };
    }

    if (!this.hasReasonableCurrentTimeline(profile, companyName)) {
      return {
        accepted: false,
        confidence: Math.max(10, Math.round(nameConfidence * 0.6)),
        reason: "Current role timeline appears inconsistent or unverifiable",
        associationType: "none",
        adjudicatedBy: "deterministic",
      };
    }

    const leadershipExpected = this.roleRequiresLeadership(
      requestedMember.role,
    );
    if (
      leadershipExpected &&
      !this.hasLeadershipSignalAtTargetCompany(profile, companyName)
    ) {
      return {
        accepted: false,
        confidence: Math.max(15, Math.round(nameConfidence * 0.65)),
        reason: `Requested role "${requestedMember.role ?? "leadership"}" requires leadership evidence at "${companyName}"`,
        associationType: "none",
        adjudicatedBy: "deterministic",
      };
    }

    return {
      accepted: true,
      confidence: Math.min(100, nameConfidence + 8),
      reason: `Name matched and currently employed at "${companyName}"`,
      associationType: "current",
      adjudicatedBy: "deterministic",
    };
  }

  private shouldRunAiAdjudication(
    assessment: ProfileMatchAssessment,
  ): boolean {
    if (!this.aiVerifierEnabled) {
      return false;
    }
    if (assessment.accepted) {
      return false;
    }
    if (!this.aiProviders) {
      return false;
    }
    return (
      assessment.confidence >= this.aiVerifierMinConfidence &&
      assessment.confidence <= this.aiVerifierMaxConfidence
    );
  }

  private async assessRequestedProfileWithAi(
    profile: LinkedInProfile,
    requestedMember: TeamMemberInput,
    startupContext?: StartupContextInput,
  ): Promise<ProfileMatchAssessment | null> {
    if (!this.aiProviders) {
      return null;
    }

    try {
      const response = this.modelExecution
        ? await this.modelExecution.generateText<z.infer<typeof LinkedInIdentityVerifierSchema>>({
            model: this.aiProviders.resolveModelForPurpose(ModelPurpose.RESEARCH),
            schema: LinkedInIdentityVerifierSchema,
            temperature: 0,
            system: [
              "You are an identity verification agent for LinkedIn profile matching.",
              "Be strict: accept only when the profile is very likely the exact same person.",
              "Current association with target company is preferred.",
              "You may also accept if there is strong historical founder/executive association with the target company, and clearly state that it is historical (not current).",
              "Reject operational/non-executive profiles (for example driver/courier roles) when leadership is expected.",
            ].join("\n"),
            prompt: JSON.stringify(
              {
                requestedMember: {
                  name: requestedMember.name,
                  role: requestedMember.role ?? null,
                },
                startupContext: {
                  companyName: startupContext?.companyName ?? null,
                  website: startupContext?.website ?? null,
                },
                candidateProfile: {
                  firstName: profile.firstName ?? null,
                  lastName: profile.lastName ?? null,
                  headline: profile.headline ?? null,
                  currentCompany: profile.currentCompany ?? null,
                  experience: profile.experience.slice(0, 8).map((entry) => ({
                    company: entry.company,
                    title: entry.title,
                    startDate: entry.startDate,
                    endDate: entry.endDate,
                    current: entry.current,
                  })),
                  profileUrl: profile.profileUrl ?? null,
                },
              },
              null,
              2,
            ),
          })
        : await generateText({
            model: this.aiProviders.resolveModelForPurpose(ModelPurpose.RESEARCH),
            temperature: 0,
            system: [
              "You are an identity verification agent for LinkedIn profile matching.",
              "Return ONLY a JSON object with keys: accepted, confidence, reason.",
              "Be strict: accept only when the profile is very likely the exact same person.",
              "Current association with target company is preferred.",
              "You may also accept if there is strong historical founder/executive association with the target company, and clearly state that it is historical (not current).",
              "Reject operational/non-executive profiles (for example driver/courier roles) when leadership is expected.",
            ].join("\n"),
            prompt: JSON.stringify(
              {
                requestedMember: {
                  name: requestedMember.name,
                  role: requestedMember.role ?? null,
                },
                startupContext: {
                  companyName: startupContext?.companyName ?? null,
                  website: startupContext?.website ?? null,
                },
                candidateProfile: {
                  firstName: profile.firstName ?? null,
                  lastName: profile.lastName ?? null,
                  headline: profile.headline ?? null,
                  currentCompany: profile.currentCompany ?? null,
                  experience: profile.experience.slice(0, 8).map((entry) => ({
                    company: entry.company,
                    title: entry.title,
                    startDate: entry.startDate,
                    endDate: entry.endDate,
                    current: entry.current,
                  })),
                  profileUrl: profile.profileUrl ?? null,
                },
              },
              null,
              2,
            ),
            output: Output.object({ schema: LinkedInIdentityVerifierSchema }),
          });

      const parsed = response.output ?? response.experimental_output;
      if (!parsed) {
        return null;
      }

      return {
        ...parsed,
        associationType: this.deriveAssociationType(
          profile,
          startupContext?.companyName,
        ),
        adjudicatedBy: "ai",
      };
    } catch (error) {
      this.logger.debug(
        `[LinkedInEnrichment] AI verifier unavailable for ${requestedMember.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private roleRequiresLeadership(role: string | undefined): boolean {
    if (!role) {
      return false;
    }

    return /\b(founder|co[\s-]?founder|chief|ceo|cto|coo|cfo|cmo|cpo|president|vp|vice president|head|director|partner)\b/i.test(
      role,
    );
  }

  private hasLeadershipSignalAtTargetCompany(
    profile: LinkedInProfile,
    companyName: string,
  ): boolean {
    const leadershipPattern =
      /\b(founder|co[\s-]?founder|chief|ceo|cto|coo|cfo|cmo|cpo|president|vice president|vp|head|director|managing director|general manager|partner)\b/i;

    if (
      this.matchesTargetCompany(profile.currentCompany?.name, companyName) &&
      leadershipPattern.test(profile.currentCompany?.title ?? "")
    ) {
      return true;
    }

    return profile.experience.some(
      (entry) =>
        entry.current &&
        this.matchesTargetCompany(entry.company, companyName) &&
        leadershipPattern.test(entry.title ?? ""),
    );
  }

  private hasHistoricalLeadershipAtTargetCompany(
    profile: LinkedInProfile,
    companyName: string,
  ): boolean {
    const leadershipPattern =
      /\b(founder|co[\s-]?founder|chairman|chief|ceo|cto|coo|cfo|cmo|cpo|president|vice president|vp|head|director|managing director|general manager|partner)\b/i;

    return profile.experience.some(
      (entry) =>
        !entry.current &&
        this.matchesTargetCompany(entry.company, companyName) &&
        leadershipPattern.test(entry.title ?? ""),
    );
  }

  private deriveAssociationType(
    profile: LinkedInProfile,
    companyName: string | undefined,
  ): "current" | "historical" | "none" {
    const target = companyName?.trim();
    if (!target) {
      return "none";
    }
    if (this.isCurrentAtTargetCompany(profile, target)) {
      return "current";
    }
    if (this.hasHistoricalLeadershipAtTargetCompany(profile, target)) {
      return "historical";
    }
    return "none";
  }

  private emitMatchDecision(
    options: LinkedinEnrichmentOptions | undefined,
    params: {
      requestedMember: TeamMemberInput;
      linkedinUrl?: string;
      accepted: boolean;
      confidence: number;
      reason: string;
      associationType: "current" | "historical" | "none";
      adjudicatedBy: "deterministic" | "ai";
      attemptedUrls: string[];
      rejectedCandidates: RejectedCandidateDecision[];
      technicalFailure?: boolean;
    },
  ): void {
    this.emitTrace(options, {
      operation: "linkedin.match_decision",
      status: params.technicalFailure ? "failed" : "completed",
      inputJson: {
        requestedMember: params.requestedMember,
      },
      outputJson: {
        linkedinUrl: params.linkedinUrl,
        accepted: params.accepted,
        confidence: params.confidence,
        reason: params.reason,
      },
      meta: {
        associationType: params.associationType,
        adjudicatedBy: params.adjudicatedBy,
        attemptedUrls: params.attemptedUrls,
        rejectedCandidateCount: params.rejectedCandidates.length,
        rejectedCandidates: params.rejectedCandidates,
      },
    });
  }

  private hasDisqualifyingOperationalRole(
    profile: LinkedInProfile,
    companyName: string,
  ): boolean {
    const disqualifyingPattern =
      /\b(driver|courier|delivery|rideshare|independent contractor|contractor|partner driver)\b/i;

    if (
      this.matchesTargetCompany(profile.currentCompany?.name, companyName) &&
      disqualifyingPattern.test(
        `${profile.currentCompany?.title ?? ""} ${profile.headline ?? ""}`,
      )
    ) {
      return true;
    }

    return profile.experience.some(
      (entry) =>
        entry.current &&
        this.matchesTargetCompany(entry.company, companyName) &&
        disqualifyingPattern.test(`${entry.title ?? ""} ${profile.headline ?? ""}`),
    );
  }

  private hasReasonableCurrentTimeline(
    profile: LinkedInProfile,
    companyName: string,
  ): boolean {
    const currentYear = new Date().getFullYear();
    const candidateYears: number[] = [];

    for (const entry of profile.experience) {
      if (
        !entry.current ||
        !this.matchesTargetCompany(entry.company, companyName)
      ) {
        continue;
      }
      const startYear = this.extractYearFromDate(entry.startDate);
      if (startYear !== null) {
        candidateYears.push(startYear);
      }
    }

    if (candidateYears.length === 0) {
      // Missing dates are common on public profiles; don't reject solely for that.
      return true;
    }

    return candidateYears.every((year) => year <= currentYear + 1);
  }

  private pickBestRejectedCandidate(
    candidates: RejectedCandidateDecision[],
  ): RejectedCandidateDecision | null {
    if (candidates.length === 0) {
      return null;
    }

    const sorted = [...candidates].sort((left, right) => right.confidence - left.confidence);
    return sorted[0] ?? null;
  }

  private computeNameMatchConfidence(
    requestedName: string,
    profile: LinkedInProfile,
  ): number {
    if (!this.namesLikelyMatch(requestedName, profile)) {
      return 0;
    }

    const requestedTokens = this.tokenizeName(requestedName);
    const profileFirst = this.normalizeNameToken(profile.firstName);
    const profileLast = this.normalizeNameToken(profile.lastName);
    const profileTokens = this.tokenizeName(
      `${profile.firstName || ""} ${profile.lastName || ""}`,
    );

    if (requestedTokens.length === 0) {
      return 0;
    }

    if (requestedTokens.length === 1) {
      const requestedSingle = requestedTokens[0];
      if (
        this.tokensEquivalent(requestedSingle, profileFirst) ||
        this.tokensEquivalent(requestedSingle, profileLast)
      ) {
        return 80;
      }
      return profileTokens.includes(requestedSingle) ? 72 : 0;
    }

    const requestedFirst = requestedTokens[0];
    const requestedLast = requestedTokens[requestedTokens.length - 1];
    const firstMatches =
      this.tokensEquivalent(requestedFirst, profileFirst) ||
      profileTokens.includes(requestedFirst);
    const lastMatches =
      this.tokensEquivalent(requestedLast, profileLast) ||
      profileTokens.includes(requestedLast);

    if (firstMatches && lastMatches) {
      return 92;
    }

    const overlap = requestedTokens.filter((token) => profileTokens.includes(token));
    if (overlap.length >= 2) {
      return 82;
    }
    if (overlap.length === 1) {
      return 65;
    }
    return 0;
  }

  private namesLikelyMatch(requestedName: string, profile: LinkedInProfile): boolean {
    const requestedTokens = this.tokenizeName(requestedName);
    if (requestedTokens.length === 0) {
      return false;
    }

    const requestedFirst = requestedTokens[0];
    const requestedLast = requestedTokens[requestedTokens.length - 1];

    const profileFirst = this.normalizeNameToken(profile.firstName);
    const profileLast = this.normalizeNameToken(profile.lastName);
    const profileTokens = this.tokenizeName(
      `${profile.firstName || ''} ${profile.lastName || ''}`,
    );

    if (requestedTokens.length === 1) {
      return (
        profileTokens.includes(requestedFirst) ||
        this.tokensEquivalent(requestedFirst, profileFirst) ||
        this.tokensEquivalent(requestedFirst, profileLast)
      );
    }

    const firstMatches =
      this.tokensEquivalent(requestedFirst, profileFirst) ||
      profileTokens.includes(requestedFirst);
    const lastMatches =
      this.tokensEquivalent(requestedLast, profileLast) ||
      profileTokens.includes(requestedLast);

    if (firstMatches && lastMatches) {
      return true;
    }

    const overlap = requestedTokens.filter((token) => profileTokens.includes(token));
    return overlap.length >= 2;
  }

  private tokenizeName(value: string): string[] {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .map((token) => token.trim())
      .filter(
        (token) => token.length > 0 && !this.nameStopWords.has(token),
      );
  }

  private normalizeNameToken(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const [token] = this.tokenizeName(value);
    return token ?? '';
  }

  private tokensEquivalent(
    left: string | null | undefined,
    right: string | null | undefined,
  ): boolean {
    if (!left || !right) {
      return false;
    }

    if (left === right) {
      return true;
    }

    if (this.tokensMatchByInitial(left, right)) {
      return true;
    }

    // Allow mild variation like "nathaniel" vs "nathan" while preventing unrelated names.
    if (left.length >= 4 && right.length >= 4) {
      if (left.startsWith(right) || right.startsWith(left)) {
        return true;
      }
    }

    if (
      left.length >= 7 &&
      right.length >= 7 &&
      this.commonPrefixLength(left, right) >= 5
    ) {
      return this.isWithinEditDistance(left, right, 2);
    }

    return false;
  }

  private tokensMatchByInitial(
    left: string,
    right: string,
  ): boolean {
    return (
      (left.length === 1 && right.startsWith(left)) ||
      (right.length === 1 && left.startsWith(right))
    );
  }

  private commonPrefixLength(left: string, right: string): number {
    const limit = Math.min(left.length, right.length);
    let index = 0;
    while (index < limit && left[index] === right[index]) {
      index += 1;
    }
    return index;
  }

  private isWithinEditDistance(
    left: string,
    right: string,
    maxDistance: number,
  ): boolean {
    if (Math.abs(left.length - right.length) > maxDistance) {
      return false;
    }

    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let row = 1; row <= left.length; row += 1) {
      const current = [row];
      let rowMin = current[0] ?? row;

      for (let column = 1; column <= right.length; column += 1) {
        const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
        const value = Math.min(
          (previous[column] ?? column) + 1,
          (current[column - 1] ?? column) + 1,
          (previous[column - 1] ?? column - 1) + substitutionCost,
        );
        current[column] = value;
        rowMin = Math.min(rowMin, value);
      }

      if (rowMin > maxDistance) {
        return false;
      }

      previous = current;
    }

    return (previous[right.length] ?? maxDistance + 1) <= maxDistance;
  }
}
