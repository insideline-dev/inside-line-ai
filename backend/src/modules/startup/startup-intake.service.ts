import { Injectable, Logger } from '@nestjs/common';
import { eq, ilike } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { PipelineService } from '../ai/services/pipeline.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/entities';
import { startup, StartupStatus, StartupStage } from './entities/startup.schema';
import { deriveStartupGeography } from '../geography';

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
        status: StartupStatus.DRAFT,
      })
      .returning();

    this.logger.log(`Created startup ${created.id} (${companyName}) from ${source} by ${fromEmail}`);

    await this.drizzle.db
      .update(startup)
      .set({
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      })
      .where(eq(startup.id, created.id));

    await this.pipeline.startPipeline(created.id, adminUserId);

    await this.notifications.create(
      adminUserId,
      `New startup submitted via ${source}`,
      `${companyName} was submitted by ${fromEmail}`,
      NotificationType.INFO,
      `/admin/startups/${created.id}`,
    );

    return {
      startupId: created.id,
      startupName: companyName,
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
