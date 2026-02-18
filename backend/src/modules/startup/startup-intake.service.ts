import { Injectable, Logger } from '@nestjs/common';
import { ilike } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { PipelineService } from '../ai/services/pipeline.service';
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

    const location = 'Pending extraction';
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
        website: 'https://pending-extraction.com',
        location,
        normalizedRegion: geography.normalizedRegion,
        geoCountryCode: geography.countryCode,
        geoLevel1: geography.level1,
        geoLevel2: geography.level2,
        geoLevel3: geography.level3,
        geoPath: geography.path,
        industry: 'Pending extraction',
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

    this.logger.log(`Created startup ${created.id} (${companyName}) from ${source} by ${fromEmail}`);

    await this.pipeline.startPipeline(created.id, adminUserId);

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
        teamMembers: (params.teamMembers ?? []).map((m) => ({
          name: m.name,
          role: m.role,
          linkedinUrl: m.linkedinUrl ?? '',
        })),
        pitchDeckUrl: params.pitchDeckUrl ?? undefined,
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      })
      .returning();

    this.logger.log(`Quick-created startup ${created.id} (${params.name}) by admin ${params.adminUserId}`);

    await this.pipeline.startPipeline(created.id, params.adminUserId);

    await this.notifications.createAndBroadcast(
      params.adminUserId,
      'Startup quick-created',
      `${params.name} was quick-created and pipeline started`,
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
}
