import { Injectable, Logger } from "@nestjs/common";
import { eq, ilike } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { StorageService } from "../../storage";
import { ASSET_TYPES } from "../../storage/storage.config";
import { AgentMailClientService } from "../integrations/agentmail/agentmail-client.service";
import { startup, StartupStatus, StartupStage } from "../startup/entities/startup.schema";
import { PipelineService } from "../ai/services/pipeline.service";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/entities";
import { ClaraAiService } from "./clara-ai.service";
import { deriveStartupGeography } from "../geography";
import type { AttachmentMeta, MessageContext } from "./interfaces/clara.interface";

const PDF_MAGIC_BYTES = Buffer.from("%PDF-");
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

interface SubmissionResult {
  startupId: string;
  startupName: string;
  isDuplicate: boolean;
  status: string;
}

@Injectable()
export class ClaraSubmissionService {
  private readonly logger = new Logger(ClaraSubmissionService.name);

  constructor(
    private drizzle: DrizzleService,
    private storage: StorageService,
    private agentMailClient: AgentMailClientService,
    private pipeline: PipelineService,
    private notifications: NotificationService,
    private claraAi: ClaraAiService,
  ) {}

  async handleSubmission(
    ctx: MessageContext,
    adminUserId: string,
    extractedCompanyName?: string,
  ): Promise<SubmissionResult> {
    const processedAttachments = await this.processAttachments(
      ctx.inboxId,
      ctx.messageId,
      ctx.attachments,
      adminUserId,
    );

    const companyName =
      extractedCompanyName ??
      this.extractCompanyFromBody(ctx.bodyText) ??
      this.claraAi.extractCompanyFromFilename(
        processedAttachments.find((a) => a.isPitchDeck)?.filename,
      ) ??
      "Untitled Startup";

    const duplicate = await this.findDuplicate(companyName);
    if (duplicate) {
      return {
        startupId: duplicate.id,
        startupName: duplicate.name,
        isDuplicate: true,
        status: duplicate.status,
      };
    }

    const deckAttachment = processedAttachments.find(
      (a) => a.isPitchDeck && a.status === "uploaded",
    );
    const location = "Pending extraction";
    const geography = deriveStartupGeography(location);

    const slug = this.generateSlug(companyName);
    const [created] = await this.drizzle.db
      .insert(startup)
      .values({
        userId: adminUserId,
        name: companyName,
        slug,
        tagline: `Submitted via email by ${ctx.fromEmail}`,
        description: ctx.bodyText?.slice(0, 5000) || "Submitted via Clara email assistant. Details will be extracted from the pitch deck.",
        website: "https://pending-extraction.com",
        location,
        normalizedRegion: geography.normalizedRegion,
        geoCountryCode: geography.countryCode,
        geoLevel1: geography.level1,
        geoLevel2: geography.level2,
        geoLevel3: geography.level3,
        geoPath: geography.path,
        industry: "Pending extraction",
        stage: StartupStage.SEED,
        fundingTarget: 0,
        teamSize: 1,
        contactEmail: ctx.fromEmail,
        contactName: ctx.fromName ?? undefined,
        pitchDeckPath: deckAttachment?.storagePath ?? undefined,
        status: StartupStatus.DRAFT,
      })
      .returning();

    this.logger.log(
      `Created startup ${created.id} (${companyName}) from email by ${ctx.fromEmail}`,
    );

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
      "Clara: New startup submitted",
      `${companyName} was submitted via email by ${ctx.fromEmail}`,
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

  private async processAttachments(
    inboxId: string,
    messageId: string,
    attachments: AttachmentMeta[],
    adminUserId: string,
  ): Promise<AttachmentMeta[]> {
    const results: AttachmentMeta[] = [];

    for (const att of attachments) {
      const isCritical =
        att.contentType === "application/pdf" ||
        /deck|pitch/i.test(att.filename);

      if (isCritical) {
        const processed = await this.downloadWithRetry(
          inboxId,
          messageId,
          att,
          adminUserId,
        );
        results.push(processed);
      } else {
        const processed = await this.downloadOnce(
          inboxId,
          messageId,
          att,
          adminUserId,
        );
        results.push(processed);
      }
    }

    return results;
  }

  private async downloadWithRetry(
    inboxId: string,
    messageId: string,
    att: AttachmentMeta,
    adminUserId: string,
  ): Promise<AttachmentMeta> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.fetchAndUpload(
          inboxId,
          messageId,
          att,
          adminUserId,
        );
        return result;
      } catch (error) {
        this.logger.warn(
          `Attachment download attempt ${attempt + 1}/${MAX_RETRIES} failed for ${att.filename}: ${error}`,
        );
        if (attempt < MAX_RETRIES - 1) {
          await this.sleep(RETRY_DELAYS[attempt]);
        }
      }
    }

    return { ...att, status: "failed" as const };
  }

  private async downloadOnce(
    inboxId: string,
    messageId: string,
    att: AttachmentMeta,
    adminUserId: string,
  ): Promise<AttachmentMeta> {
    try {
      return await this.fetchAndUpload(inboxId, messageId, att, adminUserId);
    } catch (error) {
      this.logger.warn(
        `Non-critical attachment download failed for ${att.filename}: ${error}`,
      );
      return { ...att, status: "failed" as const };
    }
  }

  private async fetchAndUpload(
    inboxId: string,
    messageId: string,
    att: AttachmentMeta,
    adminUserId: string,
  ): Promise<AttachmentMeta> {
    const response = await this.agentMailClient.getMessageAttachment(
      inboxId,
      messageId,
      att.attachmentId,
    );

    const downloadUrl = response.downloadUrl;
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error("Empty attachment");
    }

    if (att.contentType === "application/pdf") {
      if (!buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
        throw new Error("Invalid PDF: magic bytes mismatch");
      }
      if (buffer.subarray(0, 1).toString() === "{") {
        throw new Error("Invalid PDF: JSON content detected");
      }
    }

    const { key } = await this.storage.uploadGeneratedContent(
      adminUserId,
      ASSET_TYPES.DOCUMENT,
      buffer,
      att.contentType,
    );

    return {
      ...att,
      storagePath: key,
      isPitchDeck:
        att.contentType === "application/pdf" ||
        /deck|pitch/i.test(att.filename),
      status: "uploaded" as const,
    };
  }

  private async findDuplicate(
    companyName: string,
  ): Promise<{ id: string; name: string; status: string } | null> {
    const escaped = companyName.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    const [match] = await this.drizzle.db
      .select({ id: startup.id, name: startup.name, status: startup.status })
      .from(startup)
      .where(ilike(startup.name, escaped))
      .limit(1);
    return match ?? null;
  }

  private extractCompanyFromBody(body: string | null): string | null {
    if (!body) return null;
    const match = body.match(
      /(?:company|startup|venture|project)\s*(?:name|called|named)?:?\s*["']?([A-Z][A-Za-z0-9\s&.]+?)["']?(?:\s*[-,.\n]|$)/,
    );
    return match?.[1]?.trim() || null;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base}-${suffix}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
