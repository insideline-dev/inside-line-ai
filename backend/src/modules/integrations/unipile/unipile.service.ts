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

@Injectable()
export class UnipileService {
  private readonly logger = new Logger(UnipileService.name);
  private readonly config: UnipileConfig | null;

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
  async getProfile(userId: string, linkedinUrl: string): Promise<LinkedInProfile | null> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('LinkedIn integration not configured');
    }

    // Check cache first
    const cached = await this.cacheService.getCached(linkedinUrl);
    if (cached) {
      if (cached.profileImageUrl) {
        return cached;
      }

      // Cached profile is missing an image; attempt a live refresh.
      this.logger.debug(
        `Cached LinkedIn profile missing image, refreshing from API: ${linkedinUrl}`,
      );
      try {
        const refreshed = await this.fetchProfileFromAPI(linkedinUrl);
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
      const profile = await this.fetchProfileFromAPI(linkedinUrl);

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
      this.logger.error(`Failed to fetch LinkedIn profile: ${message}`, stack);
      throw error;
    }
  }

  /**
   * Search for LinkedIn profiles by name (optionally with company)
   */
  async searchProfiles(name: string, company?: string): Promise<LinkedInProfile[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('LinkedIn integration not configured');
    }

    try {
      const profiles = await this.searchProfilesFromAPI(name, company);
      return profiles;
    } catch (error) {
      const message = this.asMessage(error);
      const stack = error instanceof Error ? error.stack : undefined;
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
  ): Promise<LinkedInProfile[]> {
    const companyId = await this.resolveBestCompanyId(companyName, companyWebsite);
    if (!companyId) {
      return [];
    }

    const body: Record<string, unknown> = {
      api: 'classic',
      category: 'people',
      keywords: name,
      company: [companyId],
    };
    const items = await this.executeLinkedinSearch(body);
    return items.map((profile) =>
      this.mapUnipileProfileToLinkedInProfile(profile as Record<string, unknown>),
    );
  }

  /**
   * Fetch profile from Unipile API
   */
  private async fetchProfileFromAPI(profileUrl: string): Promise<LinkedInProfile | null> {
    const { dsn, apiKey, accountId } = this.getConfigOrThrow();
    const identifier = this.extractIdentifierFromUrl(profileUrl);
    // linkedin_sections=* is required by Unipile to return extended profile data
    // such as experience/education instead of only basic identity fields.
    const url = `https://${dsn}/api/v1/users/${identifier}?account_id=${accountId}&linkedin_sections=*`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = await response.text();
      throw new BadRequestException(`Unipile API error: ${error}`);
    }

    const data = await response.json();
    return this.mapUnipileProfileToLinkedInProfile(data);
  }

  /**
   * Search profiles from Unipile API
   */
  private async searchProfilesFromAPI(name: string, company?: string): Promise<LinkedInProfile[]> {
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

    const items = await this.executeLinkedinSearch(body);
    return items.map((profile) =>
      this.mapUnipileProfileToLinkedInProfile(profile as Record<string, unknown>),
    );
  }

  /**
   * Map Unipile API response to our LinkedInProfile interface
   */
  private mapUnipileProfileToLinkedInProfile(data: Record<string, any>): LinkedInProfile {
    const fullName =
      typeof data.name === 'string'
        ? data.name.trim()
        : typeof data.full_name === 'string'
          ? data.full_name.trim()
          : '';
    const [derivedFirstName, ...rest] = fullName ? fullName.split(/\s+/) : [];
    const derivedLastName = rest.join(' ');
    const experienceEntries =
      data.work_experience || data.experience || data.experiences || data.positions || [];
    const educationEntries = data.education || data.educations || [];

    const extractedProfileImage = this.extractProfileImageUrl(data);

    return {
      id: data.id || data.profile_id || '',
      firstName: data.first_name || data.firstName || derivedFirstName || '',
      lastName: data.last_name || data.lastName || derivedLastName || '',
      headline: data.headline || data.title || '',
      location: data.location || '',
      profileUrl: data.profile_url || data.profileUrl || data.url || '',
      profileImageUrl: extractedProfileImage,
      summary: data.summary || null,
      currentCompany: data.current_company
        ? {
            name: data.current_company.name || '',
            title: data.current_company.title || '',
          }
        : data.company
          ? {
              name: data.company,
              title: data.title || '',
            }
        : null,
      experience: experienceEntries.map((exp: any) => ({
        company: exp.company || '',
        title: exp.title || exp.position || '',
        startDate: exp.start_date || exp.startDate || exp.start || '',
        endDate: exp.end_date || exp.endDate || exp.end || null,
        current:
          typeof exp.current === 'boolean'
            ? exp.current
            : !(exp.end_date || exp.endDate || exp.end),
        location: exp.location || '',
        description: exp.description || '',
        companyPictureUrl: exp.company_picture_url || exp.companyPictureUrl || null,
      })),
      education: educationEntries.map((edu: any) => ({
        school: edu.school || '',
        degree: edu.degree || '',
        fieldOfStudy: edu.field_of_study || edu.fieldOfStudy || '',
        startYear:
          edu.start_year ||
          edu.startYear ||
          this.extractYear(edu.start || edu.startDate) ||
          0,
        endYear:
          edu.end_year ||
          edu.endYear ||
          this.extractYear(edu.end || edu.endDate) ||
          null,
        startDate: edu.start || edu.startDate || null,
        endDate: edu.end || edu.endDate || null,
        description: edu.description || '',
        schoolPictureUrl: edu.school_picture_url || edu.schoolPictureUrl || null,
      })),
    };
  }

  private extractProfileImageUrl(data: Record<string, any>): string | null {
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
        typeof candidate.url === 'string' &&
        candidate.url.trim()
      ) {
        return this.normalizeImageUrl(candidate.url);
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
  ): Promise<string | null> {
    const body = {
      api: 'classic',
      category: 'companies',
      keywords: companyName,
    };
    const items = (await this.executeLinkedinSearch(body)) as CompanySearchItem[];
    if (items.length === 0) {
      return null;
    }

    const companyToken = this.normalizeCompanyToken(companyName);
    const websiteToken = this.extractWebsiteToken(companyWebsite);

    const ranked = items
      .filter((item) => typeof item.id === 'string' && /^\d+$/.test(item.id))
      .map((item) => {
        const name = (item.name || '').toLowerCase();
        const profileUrl = (item.profile_url || '').toLowerCase();
        let score = 0;
        if (companyToken && name.includes(companyToken)) score += 10;
        if (websiteToken && profileUrl.includes(websiteToken)) score += 8;
        score += Math.log10((item.followers_count || 0) + 1);
        return { id: item.id as string, score };
      })
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.id ?? null;
  }

  private normalizeCompanyToken(value: string): string {
    return value.trim().toLowerCase();
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

  private async executeLinkedinSearch(body: Record<string, unknown>): Promise<unknown[]> {
    const { dsn, apiKey, accountId } = this.getConfigOrThrow();
    const url = `https://${dsn}/api/v1/linkedin/search?account_id=${accountId}`;

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
      throw new BadRequestException(`Unipile API error: ${error}`);
    }

    const data = (await response.json()) as UnipileSearchResponse;
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
}
