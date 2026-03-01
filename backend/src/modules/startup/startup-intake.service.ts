import { Injectable, Logger } from '@nestjs/common';
import { eq, ilike } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import {
  PipelineService,
  PIPELINE_MISSING_FIELDS_ERROR_PREFIX,
} from '../ai/services/pipeline.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/entities';
import { startup, StartupStatus, StartupStage } from './entities/startup.schema';
import { deriveStartupGeography } from '../geography';

export interface QuickCreateParams {
  adminUserId: string;
  name: string;
  tagline: string;
  description: string;
  website: string;
  location: string;
  industry: string;
  stage: StartupStage;
  fundingTarget: number;
  teamSize: number;
  teamMembers?: { name: string; role: string; linkedinUrl?: string }[];
  pitchDeckUrl?: string;
}

export interface StartupIntakeParams {
  adminUserId: string;
  companyName: string;
  fromEmail: string;
  fromName?: string;
  bodyText?: string;
  pitchDeckPath?: string;
  source: string; // 'clara' | 'investor-inbox' | etc
}

export interface StartupIntakeResult {
  startupId: string;
  startupName: string;
  isDuplicate: boolean;
  status: string;
}

@Injectable()
export class StartupIntakeService {
  private readonly logger = new Logger(StartupIntakeService.name);

  constructor(
    private drizzle: DrizzleService,
    private pipeline: PipelineService,
    private notifications: NotificationService,
  ) {}

  async createStartup(params: StartupIntakeParams): Promise<StartupIntakeResult> {
    const { adminUserId, companyName, fromEmail, fromName, bodyText, pitchDeckPath, source } = params;

    const duplicate = await this.findDuplicate(companyName);
    if (duplicate) {
      return {
        startupId: duplicate.id,
        startupName: duplicate.name,
        isDuplicate: true,
        status: duplicate.status,
      };
    }

    const location = 'Unknown';
    const geography = deriveStartupGeography(location);
    const slug = this.generateSlug(companyName);

    const [created] = await this.drizzle.db
      .insert(startup)
      .values({
        userId: adminUserId,
        name: companyName,
        slug,
        tagline: `Submitted via ${source} by ${fromEmail}`,
        description: bodyText?.slice(0, 5000) || `Submitted via ${source}. Details will be extracted from the pitch deck.`,
        website: '',
        location,
        normalizedRegion: geography.normalizedRegion,
        geoCountryCode: geography.countryCode,
        geoLevel1: geography.level1,
        geoLevel2: geography.level2,
        geoLevel3: geography.level3,
        geoPath: geography.path,
        industry: 'Unknown',
        stage: StartupStage.SEED,
        fundingTarget: 0,
        teamSize: 1,
        contactEmail: fromEmail,
        contactName: fromName ?? undefined,
        pitchDeckPath: pitchDeckPath ?? undefined,
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      })
      .returning();

    await this.normalizeLegacyPlaceholderDefaults(created.id);
    this.logger.log(`Created startup ${created.id} (${companyName}) from ${source} by ${fromEmail}`);

    if (created.pitchDeckPath || created.pitchDeckUrl) {
      try {
        const prefill = await this.pipeline.prefillCriticalFieldsFromDeckExtraction(
          created.id,
        );
        this.logger.log(
          `[Intake] Pre-pipeline extraction for ${created.id} | source=${prefill.extractionSource} | updated=${prefill.updatedFields.join(",") || "none"} | missingCritical=${prefill.missingCriticalFields.join(",") || "none"}`,
        );
      } catch (error) {
        const message = this.getErrorMessage(error);
        this.logger.warn(
          `[Intake] Pre-pipeline extraction failed for ${created.id}: ${message}`,
        );
      }
    }

    try {
      await this.pipeline.startPipeline(created.id, adminUserId);
    } catch (error) {
      const message = this.getErrorMessage(error);
      if (!message.includes(PIPELINE_MISSING_FIELDS_ERROR_PREFIX)) {
        throw error;
      }
      this.logger.warn(
        `[Intake] Pipeline start deferred for ${created.id}: ${message}`,
      );
    }

    await this.notifications.createAndBroadcast(
      adminUserId,
      `New startup submitted via ${source}`,
      `${companyName} was submitted by ${fromEmail}`,
      NotificationType.INFO,
      `/admin/startup/${created.id}`,
    );

    return {
      startupId: created.id,
      startupName: companyName,
      isDuplicate: false,
      status: StartupStatus.SUBMITTED,
    };
  }

  async quickCreateStartup(params: QuickCreateParams): Promise<StartupIntakeResult> {
    const duplicate = await this.findDuplicate(params.name);
    if (duplicate) {
      return {
        startupId: duplicate.id,
        startupName: duplicate.name,
        isDuplicate: true,
        status: duplicate.status,
      };
    }

    const geography = deriveStartupGeography(params.location);
    const slug = this.generateSlug(params.name);
    const normalizedTeamMembers = (params.teamMembers ?? []).map((m) => ({
      name: m.name,
      role: m.role,
      linkedinUrl: m.linkedinUrl ?? '',
    }));
    const teamMembersWithLinkedin = normalizedTeamMembers.filter((m) =>
      Boolean(m.linkedinUrl?.trim()),
    ).length;

    this.logger.debug(
      `[QuickCreate] Input summary | name=${params.name} | website=${Boolean(params.website)} | pitchDeckUrl=${Boolean(params.pitchDeckUrl)} | stage=${params.stage} | fundingTarget=${params.fundingTarget} | teamSize=${params.teamSize} | teamMembers=${normalizedTeamMembers.length} | teamMembersWithLinkedin=${teamMembersWithLinkedin}`,
    );

    if (!params.pitchDeckUrl) {
      this.logger.warn(
        `[QuickCreate] No pitchDeckUrl provided for ${params.name}; extraction will use startup-context fallback unless a deck path/url is added before the extraction phase runs`,
      );
    }

    this.logger.debug(
      "[QuickCreate] Quick create only persists a subset of startup context fields; additional diligence fields remain null/default until edited (sectorIndustryGroup, sectorIndustry, valuationType, raiseType, leadSecured, leadInvestorName, contactName/contactEmail/phone, previousFunding*, technologyReadinessLevel, productDescription, demoVideoUrl, productScreenshots)",
    );

    const [created] = await this.drizzle.db
      .insert(startup)
      .values({
        userId: params.adminUserId,
        name: params.name,
        slug,
        tagline: params.tagline,
        description: params.description,
        website: params.website,
        location: params.location,
        normalizedRegion: geography.normalizedRegion,
        geoCountryCode: geography.countryCode,
        geoLevel1: geography.level1,
        geoLevel2: geography.level2,
        geoLevel3: geography.level3,
        geoPath: geography.path,
        industry: params.industry,
        stage: params.stage,
        fundingTarget: params.fundingTarget,
        teamSize: params.teamSize,
        teamMembers: normalizedTeamMembers,
        pitchDeckUrl: params.pitchDeckUrl ?? undefined,
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      })
      .returning();

    this.logger.log(`Quick-created startup ${created.id} (${params.name}) by admin ${params.adminUserId}`);
    this.logger.debug(
      `[QuickCreate] Persisted startup ${created.id} | pitchDeckPath=${Boolean(created.pitchDeckPath)} | pitchDeckUrl=${Boolean(created.pitchDeckUrl)} | roundCurrency=${created.roundCurrency ?? "null"} | valuationKnown=${created.valuationKnown === null ? "null" : String(created.valuationKnown)} | valuationType=${created.valuationType ?? "null"} | raiseType=${created.raiseType ?? "null"} | contactEmail=${Boolean(created.contactEmail)} | productDescription=${Boolean(created.productDescription)}`,
    );

    let pipelineStarted = true;
    try {
      await this.pipeline.startPipeline(created.id, params.adminUserId);
    } catch (error) {
      const message = this.getErrorMessage(error);
      if (!message.includes(PIPELINE_MISSING_FIELDS_ERROR_PREFIX)) {
        throw error;
      }
      pipelineStarted = false;
      this.logger.warn(
        `[QuickCreate] Pipeline start deferred for ${created.id}: ${message}`,
      );
    }

    await this.notifications.createAndBroadcast(
      params.adminUserId,
      'Startup quick-created',
      pipelineStarted
        ? `${params.name} was quick-created and pipeline started`
        : `${params.name} was quick-created; pipeline is waiting for missing critical fields`,
      NotificationType.INFO,
      `/admin/startup/${created.id}`,
    );

    return {
      startupId: created.id,
      startupName: params.name,
      isDuplicate: false,
      status: StartupStatus.SUBMITTED,
    };
  }

  async findDuplicate(companyName: string): Promise<{ id: string; name: string; status: string } | null> {
    const escaped = companyName.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    const [match] = await this.drizzle.db
      .select({ id: startup.id, name: startup.name, status: startup.status })
      .from(startup)
      .where(ilike(startup.name, escaped))
      .limit(1);
    return match ?? null;
  }

  extractCompanyFromBody(body: string | null): string | null {
    if (!body) return null;
    const match = body.match(
      /(?:company|startup|venture|project)\s*(?:name|called|named)?:?\s*["']?([A-Z][A-Za-z0-9\s&.]+?)["']?(?:\s*[-,.\n]|$)/,
    );
    return match?.[1]?.trim() || null;
  }

  extractCompanyFromFilename(filename: string | undefined): string | undefined {
    if (!filename) return undefined;
    const name = filename
      .replace(/\.(pdf|pptx?|docx?)$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b(pitch\s*deck|deck|presentation|slides?)\b/gi, '')
      .trim();
    return name || undefined;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base}-${suffix}`;
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object') {
      const maybeResponse = (error as { response?: unknown }).response;
      if (maybeResponse && typeof maybeResponse === 'object') {
        const message = (maybeResponse as { message?: unknown }).message;
        if (typeof message === 'string') {
          return message;
        }
        if (Array.isArray(message)) {
          return message
            .filter((value): value is string => typeof value === 'string')
            .join(' | ');
        }
      }
    }
    return error instanceof Error ? error.message : String(error);
  }

  private async normalizeLegacyPlaceholderDefaults(startupId: string): Promise<void> {
    const [record] = await this.drizzle.db
      .select({
        website: startup.website,
        industry: startup.industry,
        location: startup.location,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record) {
      return;
    }

    const updates: Partial<typeof startup.$inferInsert> = {};
    if (this.isExplicitPendingPlaceholderWebsite(record.website)) {
      updates.website = '';
    }
    if (this.isExplicitPendingPlaceholderText(record.industry)) {
      updates.industry = 'Unknown';
    }
    if (this.isExplicitPendingPlaceholderText(record.location)) {
      updates.location = 'Unknown';
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    await this.drizzle.db
      .update(startup)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(startup.id, startupId));

    this.logger.warn(
      `[Intake] Normalized legacy placeholder defaults for ${startupId}: ${Object.keys(updates).join(', ')}`,
    );
  }

  private isExplicitPendingPlaceholderWebsite(value: string | null | undefined): boolean {
    if (!value) {
      return false;
    }
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
      return host === 'pending-extraction.com';
    } catch {
      return false;
    }
  }

  private isExplicitPendingPlaceholderText(value: string | null | undefined): boolean {
    if (!value) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return (
      normalized.includes('pending extraction') ||
      normalized.includes('pending-extraction')
    );
  }
}
