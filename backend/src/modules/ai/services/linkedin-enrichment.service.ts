import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnipileService } from '../../integrations/unipile/unipile.service';
import type { LinkedInProfile } from '../../integrations/unipile/entities';
import type { EnrichedTeamMember } from '../interfaces/phase-results.interface';

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

@Injectable()
export class LinkedinEnrichmentService {
  private readonly logger = new Logger(LinkedinEnrichmentService.name);
  private readonly batchSize: number;
  private readonly maxCompanyLeadershipCandidates: number;
  private readonly maxProfileCandidates = 3;
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
  private readonly companyLeadershipQueries = [
    'founder',
    'co-founder',
    'ceo',
    'cto',
    'coo',
    'cfo',
    'cpo',
    'vp',
    'head',
    'director',
  ] as const;

  constructor(
    private unipileService: UnipileService,
    @Optional() private config?: ConfigService,
  ) {
    this.batchSize = this.config?.get<number>('LINKEDIN_BATCH_SIZE', 10) ?? 10;
    this.maxCompanyLeadershipCandidates =
      this.config?.get<number>('LINKEDIN_COMPANY_DISCOVERY_MAX', 6) ?? 6;
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
    const traceOptions = options?.onTrace ? { onTrace: options.onTrace } : undefined;
    for (const query of this.companyLeadershipQueries) {
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
        if (this.isIntegrationUnavailableError(message)) {
          this.logger.warn(
            `[LinkedInDiscovery] LinkedIn integration unavailable; skipping company leadership discovery for ${normalizedCompany}`,
          );
          break;
        }
        continue;
      }

      for (const profile of matches) {
        const member = this.toCandidate(profile, normalizedCompany);
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

    for (let index = 0; index < members.length; index += this.batchSize) {
      const batch = members.slice(index, index + this.batchSize);
      const settled = await Promise.allSettled(
        batch.map((member) =>
          this.enrichMember(userId, member, startupContext, options),
        ),
      );

      for (let batchIndex = 0; batchIndex < settled.length; batchIndex += 1) {
        const result = settled[batchIndex];
        const member = batch[batchIndex];
        if (result.status === 'fulfilled') {
          this.emitTrace(options, {
            operation: "linkedin.enrich_member",
            status: "completed",
            inputJson: {
              member,
              startupContext,
            },
            outputJson: result.value,
          });
          enriched.push(result.value);
          continue;
        }

        const rejectedMessage =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
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
          const assessment = this.assessRequestedProfile(profile, member, startupContext);
          if (!assessment.accepted) {
            rejectedCandidates.push({
              linkedinUrl,
              confidence: assessment.confidence,
              reason: assessment.reason,
            });
            this.logger.debug(
              `[LinkedInEnrichment] profile mismatch for ${member.name}; candidate ${linkedinUrl} rejected (${assessment.reason}, confidence=${assessment.confidence})`,
            );
          } else {
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
    this.emitTrace(options, {
      operation: "unipile.search_profiles",
      status: "running",
      inputJson: {
        name: member.name,
        company: startupContext?.companyName ?? null,
        excludeUrls,
      },
    });
    const traceOptions = options?.onTrace ? { onTrace: options.onTrace } : undefined;
    const matches = traceOptions
      ? await this.unipileService.searchProfiles(
          member.name,
          startupContext?.companyName,
          traceOptions,
        )
      : await this.unipileService.searchProfiles(
          member.name,
          startupContext?.companyName,
        );
    this.emitTrace(options, {
      operation: "unipile.search_profiles",
      status: "completed",
      inputJson: {
        name: member.name,
        company: startupContext?.companyName ?? null,
        excludeUrls,
      },
      outputJson: matches,
    });
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
    return /\b429\b/.test(message);
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

  private toCandidate(
    profile: LinkedInProfile,
    companyName: string,
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
    if (!this.isRelevantLeadershipProfile(profile, companyName, headline)) {
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
  ): boolean {
    const leadershipPattern =
      /\b(founder|co[\s-]?founder|chief|ceo|cto|coo|cfo|cmo|cpo|president|vice president|vp|head|director|managing director|general manager|partner)\b/i;
    const currentRoleTexts = this.getCurrentRoleTexts(profile, companyName);
    const hasLeadershipSignal =
      leadershipPattern.test(headline) ||
      currentRoleTexts.some((text) => leadershipPattern.test(text));
    if (!hasLeadershipSignal) {
      return false;
    }

    return this.isCurrentAtTargetCompany(profile, companyName);
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

    const targetTokens = target.split(" ").filter((token) => token.length >= 3);
    if (targetTokens.length === 0) {
      return false;
    }

    return targetTokens.some((token) => candidate.includes(token));
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
      };
    }

    const companyName = startupContext?.companyName?.trim();
    if (!companyName) {
      return {
        accepted: true,
        confidence: Math.max(70, nameConfidence),
        reason: "Name matched; company context was not provided",
      };
    }

    // Strict accuracy gate: only accept profiles that are currently at target company.
    // This avoids ex-employees and self-employed matches that happen to share name tokens.
    if (!this.isCurrentAtTargetCompany(profile, companyName)) {
      return {
        accepted: false,
        confidence: Math.max(10, Math.round(nameConfidence * 0.6)),
        reason: `Current company does not match target company "${companyName}"`,
      };
    }

    return {
      accepted: true,
      confidence: Math.min(100, nameConfidence + 8),
      reason: `Name matched and currently employed at "${companyName}"`,
    };
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

    // Allow mild variation like "nathaniel" vs "nathan" while preventing unrelated names.
    if (left.length >= 4 && right.length >= 4) {
      return left.startsWith(right) || right.startsWith(left);
    }

    return false;
  }
}
