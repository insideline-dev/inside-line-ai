import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LinkedInCacheService } from './linkedin-cache.service';
import type { LinkedInProfile } from './entities';

interface UnipileConfig {
  dsn: string;
  apiKey: string;
  accountId: string;
}

interface CompanySearchItem {
  id?: string;
  name?: string;
  profile_url?: string;
  followers_count?: number;
}

interface UnipileSearchResponse {
  items?: unknown[];
}

interface ParsedUnipileError {
  status?: number;
  type?: string;
  title?: string;
  detail?: string;
  raw: string;
}

export interface UnipileTraceEvent {
  operation: string;
  status: "running" | "completed" | "failed";
  inputJson?: unknown;
  outputJson?: unknown;
  inputText?: string;
  outputText?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

interface UnipileTraceOptions {
  onTrace?: (event: UnipileTraceEvent) => void;
}

@Injectable()
export class UnipileService {
  private readonly logger = new Logger(UnipileService.name);
  private readonly config: UnipileConfig | null;
  private readonly companyIdCache = new Map<string, string>();

  constructor(
    private configService: ConfigService,
    private cacheService: LinkedInCacheService,
  ) {
    const dsn = this.configService.get<string>('UNIPILE_DSN');
    const apiKey = this.configService.get<string>('UNIPILE_API_KEY');
    const accountId = this.configService.get<string>('UNIPILE_ACCOUNT_ID');

    if (dsn && apiKey && accountId) {
      this.config = { dsn, apiKey, accountId };
      this.logger.log('Unipile integration configured');
    } else {
      this.config = null;
      this.logger.warn('Unipile integration not configured (missing env vars)');
    }
  }

  /**
   * Check if Unipile is configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Fetch LinkedIn profile by URL (with caching)
   */
  async getProfile(
    userId: string,
    linkedinUrl: string,
    options?: UnipileTraceOptions,
  ): Promise<LinkedInProfile | null> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('LinkedIn integration not configured');
    }

    // Check cache first
    const cached = await this.cacheService.getCached(linkedinUrl);
    if (cached) {
      this.emitTrace(options, {
        operation: "unipile.get_profile",
        status: "completed",
        inputJson: { linkedinUrl },
        outputJson: cached,
        meta: { source: "cache" },
      });
      if (cached.profileImageUrl) {
        return cached;
      }

      // Cached profile is missing an image; attempt a live refresh.
      this.logger.debug(
        `Cached LinkedIn profile missing image, refreshing from API: ${linkedinUrl}`,
      );
      try {
        const refreshed = await this.fetchProfileFromAPI(linkedinUrl, options);
        if (refreshed) {
          const identifier = this.extractIdentifierFromUrl(linkedinUrl);
          await this.cacheService
            .setCache(userId, linkedinUrl, identifier, refreshed)
            .catch(() => undefined);
        }
        return refreshed ?? cached;
      } catch {
        return cached;
      }
    }

    // Fetch from Unipile API
    try {
      const profile = await this.fetchProfileFromAPI(linkedinUrl, options);

      if (profile) {
        // Extract identifier from URL (e.g., "john-doe-123" from linkedin.com/in/john-doe-123/)
        const identifier = this.extractIdentifierFromUrl(linkedinUrl);
        try {
          await this.cacheService.setCache(userId, linkedinUrl, identifier, profile);
        } catch (cacheError) {
          const cacheMessage =
            cacheError instanceof Error ? cacheError.message : String(cacheError);
          this.logger.warn(
            `Fetched LinkedIn profile but failed to cache ${linkedinUrl}: ${cacheMessage}`,
          );
        }
      }

      return profile;
    } catch (error) {
      const message = this.asMessage(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.emitTrace(options, {
        operation: "unipile.get_profile",
        status: "failed",
        inputJson: { linkedinUrl },
        error: message,
      });
      this.logger.error(`Failed to fetch LinkedIn profile: ${message}`, stack);
      throw error;
    }
  }

  /**
   * Search for LinkedIn profiles by name (optionally with company)
   */
  async searchProfiles(
    name: string,
    company?: string,
    options?: UnipileTraceOptions,
  ): Promise<LinkedInProfile[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('LinkedIn integration not configured');
    }

    try {
      const profiles = await this.searchProfilesFromAPI(name, company, options);
      return profiles;
    } catch (error) {
      const message = this.asMessage(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.emitTrace(options, {
        operation: "unipile.search_profiles",
        status: "failed",
        inputJson: { name, company: company ?? null },
        error: message,
      });
      this.logger.error(`Failed to search LinkedIn profiles: ${message}`, stack);
      throw error;
    }
  }

  /**
   * Search people in a specific company by resolving the best matching company ID first.
   * This avoids broad text matches that pull unrelated similarly-named companies.
   */
  async searchProfilesInCompany(
    name: string,
    companyName: string,
    companyWebsite?: string,
    options?: UnipileTraceOptions,
  ): Promise<LinkedInProfile[]> {
    const companyId = await this.resolveBestCompanyIdWithCache(
      companyName,
      companyWebsite,
      options,
    );
    if (!companyId) {
      this.emitTrace(options, {
        operation: "unipile.search_profiles_in_company",
        status: "completed",
        inputJson: {
          name,
          companyName,
          companyWebsite: companyWebsite ?? null,
        },
        outputJson: [],
        meta: {
          reason: "company_not_found",
        },
      });
      return [];
    }

    const body: Record<string, unknown> = {
      api: 'classic',
      category: 'people',
      keywords: name,
      company: [companyId],
    };
    const items = await this.executeLinkedinSearch(
      body,
      "unipile.search_profiles_in_company",
      options,
    );
    return items.map((profile) =>
      this.mapUnipileProfileToLinkedInProfile(profile as Record<string, unknown>),
    );
  }

  /**
   * Fetch profile from Unipile API
   */
  private async fetchProfileFromAPI(
    profileUrl: string,
    options?: UnipileTraceOptions,
  ): Promise<LinkedInProfile | null> {
    const { dsn, apiKey, accountId } = this.getConfigOrThrow();
    const identifier = this.extractIdentifierFromUrl(profileUrl);
    // linkedin_sections=* is required by Unipile to return extended profile data
    // such as experience/education instead of only basic identity fields.
    const url = `https://${dsn}/api/v1/users/${identifier}?account_id=${accountId}&linkedin_sections=*`;

    this.emitTrace(options, {
      operation: "unipile.fetch_profile",
      status: "running",
      inputJson: {
        profileUrl,
        identifier,
        accountId,
      },
      meta: {
        method: "GET",
        url,
      },
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        this.emitTrace(options, {
          operation: "unipile.fetch_profile",
          status: "completed",
          inputJson: {
            profileUrl,
            identifier,
          },
          outputJson: null,
          meta: {
            status: response.status,
          },
        });
        return null;
      }
      const rawError = await response.text();
      const parsedError = this.parseUnipileError(rawError);
      if (this.isAuthError(response.status, parsedError)) {
        this.emitTrace(options, {
          operation: "unipile.fetch_profile",
          status: "failed",
          inputJson: {
            profileUrl,
            identifier,
          },
          outputText: rawError,
          outputJson: parsedError,
          error: `LinkedIn integration authorization failed (Unipile ${response.status})`,
          meta: {
            status: response.status,
            authError: true,
          },
        });
        throw new ServiceUnavailableException(
          `LinkedIn integration authorization failed (Unipile ${response.status})`,
        );
      }
      if (this.isRecipientUnreachableError(response.status, parsedError)) {
        this.emitTrace(options, {
          operation: "unipile.fetch_profile",
          status: "completed",
          inputJson: {
            profileUrl,
            identifier,
          },
          outputText: rawError,
          outputJson: parsedError,
          meta: {
            status: response.status,
            recipientUnreachable: true,
          },
        });
        this.logger.debug(
          `LinkedIn profile unavailable for ${profileUrl}: ${
            parsedError.detail || parsedError.title || parsedError.raw
          }`,
        );
        return null;
      }
      this.emitTrace(options, {
        operation: "unipile.fetch_profile",
        status: "failed",
        inputJson: {
          profileUrl,
          identifier,
        },
        outputText: rawError,
        outputJson: parsedError,
        error: `Unipile API error ${response.status}`,
        meta: {
          status: response.status,
        },
      });
      throw new BadRequestException(`Unipile API error: ${rawError}`);
    }

    const data = await response.json();
    this.emitTrace(options, {
      operation: "unipile.fetch_profile",
      status: "completed",
      inputJson: {
        profileUrl,
        identifier,
      },
      outputJson: data,
      meta: {
        status: response.status,
      },
    });
    return this.mapUnipileProfileToLinkedInProfile(data);
  }

  /**
   * Search profiles from Unipile API
   */
  private async searchProfilesFromAPI(
    name: string,
    company?: string,
    options?: UnipileTraceOptions,
  ): Promise<LinkedInProfile[]> {
    const body: Record<string, unknown> = {
      api: 'classic',
      category: 'people',
      keywords: name,
    };
    if (company) {
      body.advanced_keywords = {
        company,
      };
    }

    const items = await this.executeLinkedinSearch(
      body,
      "unipile.search_profiles",
      options,
    );
    return items.map((profile) =>
      this.mapUnipileProfileToLinkedInProfile(profile as Record<string, unknown>),
    );
  }

  /**
   * Map Unipile API response to our LinkedInProfile interface
   */
  private mapUnipileProfileToLinkedInProfile(data: Record<string, unknown>): LinkedInProfile {
    // Use string helper for loose API field access on unknown 3rd party response shape
    const d = data as Record<string, string>;
    const fullName =
      typeof data.name === 'string'
        ? data.name.trim()
        : typeof data.full_name === 'string'
          ? data.full_name.trim()
          : '';
    const [derivedFirstName, ...rest] = fullName ? fullName.split(/\s+/) : [];
    const derivedLastName = rest.join(' ');
    const experienceEntries = (
      data.work_experience || data.experience || data.experiences || data.positions || []
    ) as Record<string, unknown>[];
    const educationEntries = (data.education || data.educations || []) as Record<string, unknown>[];

    const extractedProfileImage = this.extractProfileImageUrl(data);

    return {
      id: (d.id || d.profile_id || '') as string,
      firstName: (d.first_name || d.firstName || derivedFirstName || '') as string,
      lastName: (d.last_name || d.lastName || derivedLastName || '') as string,
      headline: (d.headline || d.title || '') as string,
      location: (d.location || '') as string,
      profileUrl: (d.profile_url || d.profileUrl || d.url || '') as string,
      profileImageUrl: extractedProfileImage,
      summary: (d.summary || null) as string | null,
      currentCompany: data.current_company
        ? {
            name: ((data.current_company as Record<string, unknown>).name || '') as string,
            title: ((data.current_company as Record<string, unknown>).title || '') as string,
          }
        : data.company
          ? {
              name: d.company as string,
              title: (d.title || '') as string,
            }
        : null,
      experience: experienceEntries.map((exp) => ({
        company: (exp.company || '') as string,
        title: (exp.title || exp.position || '') as string,
        startDate: (exp.start_date || exp.startDate || exp.start || '') as string,
        endDate: (exp.end_date || exp.endDate || exp.end || null) as string | null,
        current:
          typeof exp.current === 'boolean'
            ? exp.current
            : !(exp.end_date || exp.endDate || exp.end),
        location: (exp.location || '') as string,
        description: (exp.description || '') as string,
        companyPictureUrl: (exp.company_picture_url || exp.companyPictureUrl || null) as string | null | undefined,
      })),
      education: educationEntries.map((edu) => ({
        school: (edu.school || '') as string,
        degree: (edu.degree || '') as string,
        fieldOfStudy: (edu.field_of_study || edu.fieldOfStudy || '') as string,
        startYear: (
          edu.start_year ||
          edu.startYear ||
          this.extractYear(edu.start || edu.startDate) ||
          0
        ) as number,
        endYear: (
          edu.end_year ||
          edu.endYear ||
          this.extractYear(edu.end || edu.endDate) ||
          null
        ) as number | null,
        startDate: (edu.start || edu.startDate || undefined) as string | undefined,
        endDate: (edu.end || edu.endDate || null) as string | null,
        description: (edu.description || '') as string,
        schoolPictureUrl: (edu.school_picture_url || edu.schoolPictureUrl || null) as string | null | undefined,
      })),
    };
  }

  private extractProfileImageUrl(data: Record<string, unknown>): string | null {
    const directCandidates = [
      data.profile_image_url,
      data.profileImageUrl,
      data.profile_picture_url,
      data.profilePictureUrl,
      data.profile_picture,
      data.profilePicture,
      data.picture_url,
      data.pictureUrl,
      data.picture,
      data.photo_url,
      data.photoUrl,
      data.photo,
      data.image_url,
      data.imageUrl,
      data.image,
      data.avatar_url,
      data.avatarUrl,
      data.avatar,
    ];

    for (const candidate of directCandidates) {
      const normalizedDirect = this.normalizeImageUrl(candidate);
      if (normalizedDirect) return normalizedDirect;

      const vectorDirect = this.extractLinkedinVectorImageUrl(candidate);
      if (vectorDirect) return vectorDirect;

      if (
        candidate &&
        typeof candidate === 'object' &&
        'url' in candidate &&
        typeof (candidate as Record<string, unknown>).url === 'string' &&
        ((candidate as Record<string, unknown>).url as string).trim()
      ) {
        return this.normalizeImageUrl((candidate as Record<string, unknown>).url as string);
      }
    }

    const arrayCandidates = [data.photos, data.profile_photos, data.images, data.pictures];
    for (const candidate of arrayCandidates) {
      if (!Array.isArray(candidate)) continue;
      for (const item of candidate) {
        const normalizedItem = this.normalizeImageUrl(item);
        if (normalizedItem) return normalizedItem;

        const vectorItem = this.extractLinkedinVectorImageUrl(item);
        if (vectorItem) return vectorItem;

        if (
          item &&
          typeof item === 'object' &&
          typeof item.url === 'string' &&
          item.url.trim()
        ) {
          return this.normalizeImageUrl(item.url);
        }
      }
    }

    // Last-resort deep scan for nested image fields often returned by providers.
    const visited = new Set<unknown>();
    const stack: unknown[] = [data];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object' || visited.has(current)) continue;
      visited.add(current);

      const vectorCurrent = this.extractLinkedinVectorImageUrl(current);
      if (vectorCurrent) return vectorCurrent;

      if (Array.isArray(current)) {
        for (const entry of current) stack.push(entry);
        continue;
      }

      const currentRecord = current as Record<string, unknown>;
      if ('url' in currentRecord) {
        const maybeUrl = this.normalizeImageUrl(currentRecord.url);
        if (maybeUrl && this.looksLikeImageUrl(maybeUrl)) {
          return maybeUrl;
        }
      }

      for (const [key, value] of Object.entries(currentRecord)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('image') ||
          lowerKey.includes('photo') ||
          lowerKey.includes('avatar') ||
          lowerKey.includes('picture')
        ) {
          const normalized = this.normalizeImageUrl(value);
          if (normalized) return normalized;

          const vector = this.extractLinkedinVectorImageUrl(value);
          if (vector) return vector;
        }

        stack.push(value);
      }
    }

    return null;
  }

  private normalizeImageUrl(candidate: unknown): string | null {
    if (typeof candidate !== 'string') return null;
    const value = candidate.trim();
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    if (value.startsWith('//')) return `https:${value}`;
    return null;
  }

  private looksLikeImageUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      lower.includes('media.licdn.com/') ||
      lower.includes('/dms/image/') ||
      /\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(lower)
    );
  }

  private extractLinkedinVectorImageUrl(candidate: unknown): string | null {
    if (!candidate || typeof candidate !== 'object') return null;

    const value = candidate as Record<string, unknown>;
    const rootRaw = value.rootUrl ?? value.root_url;
    const root = this.normalizeImageUrl(rootRaw);
    const artifactsRaw = value.artifacts;
    if (!root || !Array.isArray(artifactsRaw) || artifactsRaw.length === 0) {
      return null;
    }

    let bestSegment: string | null = null;
    let bestArea = -1;
    for (const artifact of artifactsRaw) {
      if (!artifact || typeof artifact !== 'object') continue;
      const art = artifact as Record<string, unknown>;
      const segmentRaw =
        art.fileIdentifyingUrlPathSegment ??
        art.file_identifying_url_path_segment ??
        art.pathSegment ??
        art.path_segment;
      if (typeof segmentRaw !== 'string' || !segmentRaw.trim()) continue;

      const width = typeof art.width === 'number' ? art.width : 0;
      const height = typeof art.height === 'number' ? art.height : 0;
      const area = width * height;
      if (area >= bestArea) {
        bestArea = area;
        bestSegment = segmentRaw.trim();
      }
    }

    if (!bestSegment) return null;
    return `${root}${bestSegment}`;
  }
  private async resolveBestCompanyId(
    companyName: string,
    companyWebsite?: string,
    options?: UnipileTraceOptions,
  ): Promise<string | null> {
    const body = {
      api: 'classic',
      category: 'companies',
      keywords: companyName,
    };
    const items = (await this.executeLinkedinSearch(
      body,
      "unipile.search_companies",
      options,
    )) as CompanySearchItem[];
    if (items.length === 0) {
      return null;
    }

    const companyToken = this.normalizeCompanyToken(companyName);
    const websiteToken = this.extractWebsiteToken(companyWebsite);

    const ranked = items
      .filter((item) => typeof item.id === 'string' && /^\d+$/.test(item.id))
      .map((item) => {
        const rawName = item.name || '';
        const name = rawName.toLowerCase();
        const normalizedName = this.normalizeCompanyToken(rawName);
        const profileUrl = (item.profile_url || '').toLowerCase();
        let score = 0;
        if (companyToken && normalizedName === companyToken) {
          score += 60;
        } else if (companyToken && normalizedName.startsWith(companyToken)) {
          score += 35;
        } else if (companyToken && companyToken.startsWith(normalizedName)) {
          score += 20;
        } else if (companyToken && normalizedName.includes(companyToken)) {
          score += 15;
        }

        if (websiteToken) {
          if (profileUrl.includes(`/${websiteToken}`)) {
            score += 28;
          } else if (profileUrl.includes(websiteToken) || name.includes(websiteToken)) {
            score += 16;
          }
        }

        if (/\b(acquired|formerly|parent company|subsidiary)\b/i.test(rawName)) {
          score -= 20;
        }
        if (/\b\d+\b/.test(rawName)) {
          score -= 4;
        }

        score += Math.min(8, Math.log10((item.followers_count || 0) + 1));
        return { id: item.id as string, score };
      })
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.id ?? null;
  }

  private async resolveBestCompanyIdWithCache(
    companyName: string,
    companyWebsite?: string,
    options?: UnipileTraceOptions,
  ): Promise<string | null> {
    const cacheKey = `${companyName.trim().toLowerCase()}|${this.extractWebsiteToken(companyWebsite) ?? ""}`;
    const cached = this.companyIdCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const resolved = await this.resolveBestCompanyId(
      companyName,
      companyWebsite,
      options,
    );
    if (resolved) {
      this.companyIdCache.set(cacheKey, resolved);
    }
    return resolved;
  }

  private normalizeCompanyToken(value: string): string {
    const normalized = value
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(
        /\b(inc|llc|ltd|limited|corp|corporation|co|company|group|holdings|holding|technologies|technology|systems|solutions)\b/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();

    return normalized;
  }

  private extractWebsiteToken(website?: string): string | null {
    if (!website) {
      return null;
    }

    const candidate = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    try {
      const host = new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
      return host.split('.')[0] || null;
    } catch {
      return null;
    }
  }

  private extractYear(value: unknown): number | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    const match = value.match(/\b(19|20)\d{2}\b/);
    if (!match) {
      return null;
    }

    const year = Number(match[0]);
    return Number.isFinite(year) ? year : null;
  }

  /**
   * Extract LinkedIn identifier from URL
   * e.g., "https://linkedin.com/in/john-doe-123/" -> "john-doe-123"
   */
  private extractIdentifierFromUrl(url: string): string {
    const match = url.match(/linkedin\.com\/in\/([^/?]+)/i);
    return match?.[1] || 'unknown';
  }

  private async executeLinkedinSearch(
    body: Record<string, unknown>,
    operation: string,
    options?: UnipileTraceOptions,
  ): Promise<unknown[]> {
    const { dsn, apiKey, accountId } = this.getConfigOrThrow();
    const url = `https://${dsn}/api/v1/linkedin/search?account_id=${accountId}`;

    this.emitTrace(options, {
      operation,
      status: "running",
      inputJson: body,
      meta: {
        method: "POST",
        url,
      },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      const parsedError = this.parseUnipileError(error);
      if (this.isAuthError(response.status, parsedError)) {
        this.emitTrace(options, {
          operation,
          status: "failed",
          inputJson: body,
          outputText: error,
          outputJson: parsedError,
          error: `LinkedIn integration authorization failed (Unipile ${response.status})`,
          meta: {
            status: response.status,
            authError: true,
          },
        });
        throw new ServiceUnavailableException(
          `LinkedIn integration authorization failed (Unipile ${response.status})`,
        );
      }
      this.emitTrace(options, {
        operation,
        status: "failed",
        inputJson: body,
        outputText: error,
        error: `Unipile API error ${response.status}`,
        meta: {
          status: response.status,
        },
      });
      throw new BadRequestException(`Unipile API error: ${error}`);
    }

    const data = (await response.json()) as UnipileSearchResponse;
    this.emitTrace(options, {
      operation,
      status: "completed",
      inputJson: body,
      outputJson: data,
      meta: {
        status: response.status,
      },
    });
    return Array.isArray(data.items) ? data.items : [];
  }

  private getConfigOrThrow(): UnipileConfig {
    if (!this.config) {
      throw new ServiceUnavailableException('LinkedIn integration not configured');
    }

    return this.config;
  }

  private asMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private parseUnipileError(raw: string): ParsedUnipileError {
    const base: ParsedUnipileError = { raw };
    if (!raw || raw.trim().length === 0) {
      return base;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        raw,
        status:
          typeof parsed.status === 'number' && Number.isFinite(parsed.status)
            ? parsed.status
            : undefined,
        type: typeof parsed.type === 'string' ? parsed.type : undefined,
        title: typeof parsed.title === 'string' ? parsed.title : undefined,
        detail: typeof parsed.detail === 'string' ? parsed.detail : undefined,
      };
    } catch {
      return base;
    }
  }

  private isRecipientUnreachableError(
    statusCode: number,
    error: ParsedUnipileError,
  ): boolean {
    const status = typeof error.status === 'number' ? error.status : statusCode;
    if (status !== 422) {
      return false;
    }

    const normalized = `${error.type ?? ''} ${error.title ?? ''} ${error.detail ?? ''} ${error.raw}`.toLowerCase();
    return (
      normalized.includes('invalid_recipient') ||
      normalized.includes('recipient cannot be reached') ||
      normalized.includes('profile is not locked') ||
      normalized.includes('locked')
    );
  }

  private isAuthError(statusCode: number, error: ParsedUnipileError): boolean {
    const status = typeof error.status === 'number' ? error.status : statusCode;
    if (status === 401 || status === 403) {
      return true;
    }

    const normalized = `${error.type ?? ''} ${error.title ?? ''} ${error.detail ?? ''} ${error.raw}`.toLowerCase();
    return (
      normalized.includes('unauthorized') ||
      normalized.includes('forbidden') ||
      normalized.includes('expired_credentials') ||
      normalized.includes('expired credentials') ||
      normalized.includes('invalid api key')
    );
  }

  private emitTrace(
    options: UnipileTraceOptions | undefined,
    event: UnipileTraceEvent,
  ): void {
    options?.onTrace?.(event);
  }
}
