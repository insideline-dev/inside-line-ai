import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UnipileService } from "../../integrations/unipile/unipile.service";
import type { LinkedInProfile } from "../../integrations/unipile/entities";
import type { EnrichedTeamMember } from "../interfaces/phase-results.interface";

interface TeamMemberInput {
  name: string;
  role?: string;
  linkedinUrl?: string;
}

interface StartupContextInput {
  companyName?: string;
  website?: string;
}

@Injectable()
export class LinkedinEnrichmentService {
  private readonly batchSize: number;

  constructor(
    private unipileService: UnipileService,
    @Optional() private config?: ConfigService,
  ) {
    this.batchSize = this.config?.get<number>("LINKEDIN_BATCH_SIZE", 10) ?? 10;
  }

  async enrichTeamMembers(
    userId: string,
    members: TeamMemberInput[],
    startupContext?: StartupContextInput,
  ): Promise<EnrichedTeamMember[]> {
    if (members.length === 0) {
      return [];
    }

    if (!this.unipileService.isConfigured()) {
      return members.map((member) => ({
        name: member.name,
        role: member.role,
        linkedinUrl: member.linkedinUrl,
        enrichmentStatus: "not_configured",
      }));
    }

    const enriched: EnrichedTeamMember[] = [];

    for (let index = 0; index < members.length; index += this.batchSize) {
      const batch = members.slice(index, index + this.batchSize);
      const settled = await Promise.allSettled(
        batch.map((member) => this.enrichMember(userId, member, startupContext)),
      );

      for (let batchIndex = 0; batchIndex < settled.length; batchIndex += 1) {
        const result = settled[batchIndex];
        if (result.status === "fulfilled") {
          enriched.push(result.value);
          continue;
        }

        const member = batch[batchIndex];
        enriched.push({
          name: member.name,
          role: member.role,
          linkedinUrl: member.linkedinUrl,
          enrichmentStatus: "error",
        });
      }
    }

    return enriched;
  }

  private async enrichMember(
    userId: string,
    member: TeamMemberInput,
    startupContext?: StartupContextInput,
  ): Promise<EnrichedTeamMember> {
    let linkedinUrl = member.linkedinUrl;

    if (!linkedinUrl) {
      const matches = await this.unipileService.searchProfiles(
        member.name,
        startupContext?.companyName,
      );
      linkedinUrl = matches[0]?.profileUrl;
    }

    if (!linkedinUrl) {
      return {
        name: member.name,
        role: member.role,
        enrichmentStatus: "not_found",
      };
    }

    try {
      const profile = await this.unipileService.getProfile(userId, linkedinUrl);

      if (!profile) {
        return {
          name: member.name,
          role: member.role,
          linkedinUrl,
          enrichmentStatus: "not_found",
        };
      }

      return {
        name: member.name,
        role: member.role,
        linkedinUrl,
        linkedinProfile: this.mapProfile(profile),
        enrichmentStatus: "success",
        enrichedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/\b429\b/.test(message)) {
        throw error;
      }

      return {
        name: member.name,
        role: member.role,
        linkedinUrl,
        enrichmentStatus: "error",
      };
    }
  }

  private mapProfile(
    profile: LinkedInProfile,
  ): NonNullable<EnrichedTeamMember["linkedinProfile"]> {
    return {
      headline: profile.headline || "",
      summary: profile.summary || "",
      currentCompany: profile.currentCompany
        ? {
            name: profile.currentCompany.name || "",
            title: profile.currentCompany.title || "",
          }
        : null,
      experience: profile.experience.map((entry) => ({
        title: entry.title,
        company: entry.company,
        duration: this.formatDuration(entry.startDate, entry.endDate, entry.current),
        location: entry.location || "",
        description: entry.description || "",
        startDate: this.formatTimelineDate(entry.startDate) || undefined,
        endDate: entry.current ? null : this.formatTimelineDate(entry.endDate),
      })),
      education: profile.education.map((entry) => ({
        school: entry.school,
        degree: entry.degree,
        field: entry.fieldOfStudy,
        startDate: entry.startDate || (entry.startYear ? String(entry.startYear) : null),
        endDate: entry.endDate || (entry.endYear ? String(entry.endYear) : null),
        description: entry.description || "",
      })),
    };
  }

  private formatDuration(
    startDate: string,
    endDate: string | null,
    current: boolean,
  ): string {
    const start = this.formatTimelineDate(startDate) || "Unknown";
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
}
