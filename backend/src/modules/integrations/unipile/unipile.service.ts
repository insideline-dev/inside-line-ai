import { Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LinkedInCacheService } from './linkedin-cache.service';
import type { LinkedInProfile } from './entities';

interface UnipileConfig {
  dsn: string;
  apiKey: string;
  accountId: string;
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
      return cached;
    }

    // Fetch from Unipile API
    try {
      const profile = await this.fetchProfileFromAPI(linkedinUrl);

      if (profile) {
        // Extract identifier from URL (e.g., "john-doe-123" from linkedin.com/in/john-doe-123/)
        const identifier = this.extractIdentifierFromUrl(linkedinUrl);
        await this.cacheService.setCache(userId, linkedinUrl, identifier, profile);
      }

      return profile;
    } catch (error) {
      this.logger.error(`Failed to fetch LinkedIn profile: ${error.message}`, error.stack);
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
      this.logger.error(`Failed to search LinkedIn profiles: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Fetch profile from Unipile API
   */
  private async fetchProfileFromAPI(profileUrl: string): Promise<LinkedInProfile | null> {
    const { dsn, apiKey, accountId } = this.config!;
    const identifier = this.extractIdentifierFromUrl(profileUrl);
    const url = `https://${dsn}/api/v1/users/${identifier}?account_id=${accountId}`;

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
    const { dsn, apiKey, accountId } = this.config!;
    const url = `https://${dsn}/api/v1/linkedin/search?account_id=${accountId}`;

    const body: Record<string, unknown> = {
      api: 'classic',
      category: 'people',
      keywords: name,
    };
    if (company) {
      body.company = company;
    }

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

    const data = await response.json();
    const results = data.items || [];
    return results.map((profile: any) => this.mapUnipileProfileToLinkedInProfile(profile));
  }

  /**
   * Map Unipile API response to our LinkedInProfile interface
   */
  private mapUnipileProfileToLinkedInProfile(data: any): LinkedInProfile {
    return {
      id: data.id || data.profile_id || '',
      firstName: data.first_name || data.firstName || '',
      lastName: data.last_name || data.lastName || '',
      headline: data.headline || '',
      location: data.location || '',
      profileUrl: data.profile_url || data.profileUrl || '',
      profileImageUrl: data.profile_image_url || data.profileImageUrl || null,
      summary: data.summary || null,
      currentCompany: data.current_company
        ? {
            name: data.current_company.name || '',
            title: data.current_company.title || '',
          }
        : null,
      experience: (data.experience || []).map((exp: any) => ({
        company: exp.company || '',
        title: exp.title || '',
        startDate: exp.start_date || exp.startDate || '',
        endDate: exp.end_date || exp.endDate || null,
        current: exp.current || false,
      })),
      education: (data.education || []).map((edu: any) => ({
        school: edu.school || '',
        degree: edu.degree || '',
        fieldOfStudy: edu.field_of_study || edu.fieldOfStudy || '',
        startYear: edu.start_year || edu.startYear || 0,
        endYear: edu.end_year || edu.endYear || null,
      })),
    };
  }

  /**
   * Extract LinkedIn identifier from URL
   * e.g., "https://linkedin.com/in/john-doe-123/" -> "john-doe-123"
   */
  private extractIdentifierFromUrl(url: string): string {
    const match = url.match(/linkedin\.com\/in\/([^/?]+)/i);
    return match?.[1] || 'unknown';
  }
}
