import { Injectable, Logger } from "@nestjs/common";
import { StorageService } from "../../storage";
import { ASSET_TYPES } from "../../storage/storage.config";
import { AgentMailClientService } from "../integrations/agentmail/agentmail-client.service";
import { ClaraAiService } from "./clara-ai.service";
import { StartupIntakeService } from "../startup/startup-intake.service";
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
    private storage: StorageService,
    private agentMailClient: AgentMailClientService,
    private claraAi: ClaraAiService,
    private startupIntake: StartupIntakeService,
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
      this.startupIntake.extractCompanyFromBody(ctx.bodyText) ??
      this.startupIntake.extractCompanyFromFilename(
        processedAttachments.find((a) => a.isPitchDeck)?.filename,
      ) ??
      "Untitled Startup";

    const deckAttachment = processedAttachments.find(
      (a) => a.isPitchDeck && a.status === "uploaded",
    );

    return this.startupIntake.createStartup({
      adminUserId,
      companyName,
      fromEmail: ctx.fromEmail,
      fromName: ctx.fromName ?? undefined,
      bodyText: ctx.bodyText ?? undefined,
      pitchDeckPath: deckAttachment?.storagePath,
      source: "email",
    });
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
