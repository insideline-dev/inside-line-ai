import { Injectable, Logger } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { QueueService } from "../../queue";
import { StorageService } from "../../storage";
import { AssetService } from "../../storage/asset.service";
import { ASSET_TYPES } from "../../storage/storage.config";
import { DataRoomService } from "../startup/data-room.service";
import { StartupIntakeService } from "../startup/startup-intake.service";
import { UserRole } from "../../auth/entities/auth.schema";
import { AgentMailClientService } from "../integrations/agentmail/agentmail-client.service";
import {
  RaiseType,
  startup,
  StartupSourcePath,
  StartupStatus,
  StartupStage,
} from "../startup/entities/startup.schema";
import { PipelineService } from "../ai/services/pipeline.service";
import { PipelinePhase } from "../ai/interfaces/pipeline.interface";
import {
  detectMissingMaterials,
  type MissingMaterialCode,
} from "../ai/contracts/screening-output/missing-materials";
import {
  extractWebsiteFromText,
  extractStageFromText,
  getMissingCriticalFields,
} from "../ai/utils/startup-field-utils";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/entities";
import { ClaraAiService } from "./clara-ai.service";
import type {
  AttachmentMeta,
  ClassifiedDocumentSummary,
  MessageContext,
  SubmissionResult,
} from "./interfaces/clara.interface";

const PDF_MAGIC_BYTES = Buffer.from("%PDF-");
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
interface PipelineStartResult {
  started: boolean;
  missingFields: Array<"website" | "stage">;
}

interface MissingInfoReplyResolution {
  startupId: string;
  startupName: string;
  updatedFields: Array<"website" | "stage">;
  remainingMissing: Array<"website" | "stage">;
  pipelineStarted: boolean;
}

interface ScreeningFollowUpResolution {
  startupId: string;
  startupName: string;
  updatedMaterials: MissingMaterialCode[];
  remainingMissing: MissingMaterialCode[];
  pipelineStarted: boolean;
  rerunPhase: PipelinePhase.SCREENING | PipelinePhase.EXTRACTION;
}

type CriticalStartupSnapshot = {
  id: string;
  userId: string;
  name: string;
  website: string;
  stage: string;
  industry: string;
  location: string;
  fundingTarget: number;
  teamSize: number;
  status: StartupStatus;
};

@Injectable()
export class ClaraSubmissionService {
  private readonly logger = new Logger(ClaraSubmissionService.name);

  constructor(
    private drizzle: DrizzleService,
    private queue: QueueService,
    private storage: StorageService,
    private assetService: AssetService,
    private agentMailClient: AgentMailClientService,
    private pipeline: PipelineService,
    private notifications: NotificationService,
    private claraAi: ClaraAiService,
    private dataRoomService: DataRoomService,
    private startupIntake: StartupIntakeService,
  ) {}

  /**
   * Register any attachments Clara uploaded into the startup's data room so
   * the pipeline classification phase sees them. Idempotent — re-uses existing
   * asset rows by storage key.
   */
  private async registerAttachmentsToDataRoom(
    startupId: string,
    ownerUserId: string,
    attachments: AttachmentMeta[],
  ): Promise<void> {
    const eligible = attachments.filter(
      (a): a is AttachmentMeta & { storagePath: string } =>
        a.status === "uploaded" && Boolean(a.storagePath),
    );
    if (eligible.length === 0) return;
    try {
      await this.dataRoomService.registerFiles(
        startupId,
        ownerUserId,
        eligible.map((a) => ({
          path: a.storagePath,
          name: a.filename,
          type: a.contentType,
          size: 0,
        })),
      );
    } catch (error) {
      this.logger.warn(
        `[ClaraSubmission] Failed to register attachments into data room for startup ${startupId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async handleSubmission(
    ctx: MessageContext,
    adminUserId: string,
    extractedCompanyName?: string,
  ): Promise<SubmissionResult> {
    const ownerUserId = ctx.investorUserId ?? adminUserId;
    const isInvestorSubmission = Boolean(ctx.investorUserId);

    const processedAttachments = await this.processAttachments(
      ctx.inboxId,
      ctx.messageId,
      ctx.attachments,
      ownerUserId,
    );
    const deckAttachment = this.selectPrimaryDeckAttachment(processedAttachments);
    const uploadedFiles = this.toStartupFiles(processedAttachments);

    const hasPitchDeckAttachment = Boolean(deckAttachment);

    if (!hasPitchDeckAttachment) {
      this.logger.warn(
        `[ClaraSubmission] No pitch deck identified for email from ${ctx.fromEmail} — blocking submission`,
      );
      return { noPitchDeck: true, startupId: "", startupName: "", isDuplicate: false, status: "" };
    }

    const companyFromBody = this.toTrustedCompanyNameCandidate(
      this.extractCompanyFromBody(ctx.bodyText),
    );
    const companyFromClassifier = this.toTrustedCompanyNameCandidate(
      extractedCompanyName,
    );

    const companyName = hasPitchDeckAttachment
      ? companyFromClassifier ?? companyFromBody ?? "Untitled Startup"
      : companyFromBody ?? companyFromClassifier ?? "Untitled Startup";

    this.logger.debug(
      `[ClaraSubmission] Company name resolution | body=${companyFromBody ?? "none"} classifier=${companyFromClassifier ?? "none"} chosen=${companyName} hasDeck=${hasPitchDeckAttachment}`,
    );

    const websiteFromMessage = extractWebsiteFromText(ctx.bodyText);
    const stageFromMessage = extractStageFromText(ctx.bodyText);
    const source = StartupSourcePath.CLARA;
    const intakeResult = await this.startupIntake.findOrCreateStartupRecord({
      adminUserId,
      ownerUserId,
      companyName,
      fromEmail: ctx.fromEmail,
      fromName: ctx.fromName ?? undefined,
      bodyText: ctx.bodyText ?? undefined,
      pitchDeckPath: deckAttachment?.storagePath ?? undefined,
      source,
      submittedByRole: isInvestorSubmission ? UserRole.INVESTOR : UserRole.ADMIN,
      isPrivate: isInvestorSubmission,
      website: websiteFromMessage ?? undefined,
      stage: stageFromMessage ?? StartupStage.SEED,
      location: "Unknown",
    });

    if (intakeResult.isDuplicate) {
      const duplicateSnapshot = await this.loadCriticalStartupSnapshot(intakeResult.startupId);
      const duplicateName = duplicateSnapshot?.name ?? intakeResult.startupName;
      const duplicateStatus = duplicateSnapshot?.status ?? intakeResult.status;
      this.logger.warn(
        `[ClaraSubmission] Duplicate startup detected for "${companyName}" -> ${intakeResult.startupId} (${duplicateName}, status=${duplicateStatus})`,
      );
      return {
        startupId: intakeResult.startupId,
        startupName: duplicateName,
        isDuplicate: true,
        duplicateBlocked: true,
        status: duplicateStatus,
      };
    }

    if (uploadedFiles.length > 0) {
      await this.mergeUploadedFilesIntoStartup(intakeResult.startupId, uploadedFiles);
    }
    await this.registerAttachmentsToDataRoom(
      intakeResult.startupId,
      ownerUserId,
      processedAttachments,
    );
    this.logger.log(
      `Created startup ${intakeResult.startupId} (${companyName}) from ${source} by ${ctx.fromEmail}`,
    );

    const classifiedDocuments = await this.classifyDataRoomInline(
      intakeResult.startupId,
      processedAttachments,
    );

    await this.runPrePipelineExtraction(intakeResult.startupId);
    const refreshedCreated = await this.loadCriticalStartupSnapshot(intakeResult.startupId);
    const resolvedStartupName = refreshedCreated?.name ?? companyName;
    const resolvedStatus = refreshedCreated?.status ?? StartupStatus.SUBMITTED;
    const pipelineStart = await this.startPipelineIfReady(intakeResult.startupId, ownerUserId, {
      skipExtraction: true,
    });

    await this.notifications.create(
      ownerUserId,
      "Clara: New startup submitted",
      `${resolvedStartupName} was submitted via ${ctx.channel === "whatsapp" ? "WhatsApp" : "email"} by ${ctx.fromEmail}`,
      NotificationType.INFO,
      isInvestorSubmission
        ? `/investor/startup/${intakeResult.startupId}`
        : `/admin/startup/${intakeResult.startupId}`,
    );

    return {
      startupId: intakeResult.startupId,
      startupName: resolvedStartupName,
      isDuplicate: false,
      status: resolvedStatus,
      pipelineStarted: pipelineStart.started,
      missingFields: pipelineStart.missingFields,
      classifiedDocuments,
    };
  }

  /**
   * Run document classification synchronously against the startup's data room
   * right after intake so Clara can tell the founder *which* documents she
   * recognized in her first reply. Writes categories/confidence/routing onto
   * the dataRoom rows, so the pipeline's CLASSIFICATION phase still runs later
   * but has fresh, correct metadata to work from. Non-fatal on failure — we
   * fall back to the generic acknowledgement path.
   */
  private async classifyDataRoomInline(
    startupId: string,
    processedAttachments: AttachmentMeta[],
  ): Promise<ClassifiedDocumentSummary[] | undefined> {
    try {
      const nameByAssetId = new Map<string, string>(
        processedAttachments
          .filter(
            (a): a is AttachmentMeta & { assetId: string } => Boolean(a.assetId),
          )
          .map((a) => [a.assetId, a.filename]),
      );

      const classified = await this.dataRoomService.reclassifyAll(startupId);
      return classified
        .filter((row) => row.classificationStatus === "completed")
        .map<ClassifiedDocumentSummary>((row) => {
          const rawConfidence = Number(row.classificationConfidence);
          return {
            fileName: nameByAssetId.get(row.assetId) ?? "document",
            category: row.category ?? "miscellaneous",
            confidence: Number.isFinite(rawConfidence) ? rawConfidence : 0,
            routedAgents: row.routedAgents ?? [],
          };
        });
    } catch (error) {
      this.logger.warn(
        `[ClaraSubmission] Inline classification failed for startup ${startupId}: ${this.asMessage(error)}`,
      );
      return undefined;
    }
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

    const assetRecord = await this.assetService.uploadAndTrack(
      adminUserId,
      ASSET_TYPES.DOCUMENT,
      buffer,
      att.contentType,
      undefined,
      { originalName: att.filename },
    );

    return {
      ...att,
      storagePath: assetRecord.key,
      assetId: assetRecord.id,
      isPitchDeck: this.isLikelyPitchDeckAttachment(att),
      status: "uploaded" as const,
    };
  }

  private toStartupFiles(
    attachments: AttachmentMeta[],
  ): Array<{ path: string; name: string; type: string }> {
    return attachments
      .filter(
        (attachment): attachment is AttachmentMeta & { storagePath: string } =>
          attachment.status === "uploaded" &&
          Boolean(attachment.storagePath),
      )
      .map((attachment) => ({
        path: attachment.storagePath,
        name: attachment.filename,
        type: attachment.contentType,
      }));
  }

  private selectPrimaryDeckAttachment(
    attachments: AttachmentMeta[],
  ): (AttachmentMeta & { storagePath: string }) | undefined {
    const uploaded = attachments.filter(
      (attachment): attachment is AttachmentMeta & { storagePath: string } =>
        attachment.status === "uploaded" &&
        Boolean(attachment.storagePath),
    );
    if (uploaded.length === 0) {
      return undefined;
    }

    const ranked = uploaded
      .map((attachment) => ({
        attachment,
        score: this.getPitchDeckAttachmentScore(attachment),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);

    return ranked[0]?.attachment;
  }

  private isLikelyPitchDeckAttachment(
    attachment: Pick<AttachmentMeta, "filename" | "contentType">,
  ): boolean {
    return this.getPitchDeckAttachmentScore(attachment) > 0;
  }

  private getPitchDeckAttachmentScore(
    attachment: Pick<AttachmentMeta, "filename" | "contentType">,
  ): number {
    const filename = attachment.filename.toLowerCase();
    const contentType = attachment.contentType.toLowerCase();

    if (/\b(pitch|deck|teaser|presentation|slides?)\b/.test(filename)) {
      return 4;
    }
    if (/\.(pptx?|pps)$/i.test(filename)) {
      return 3;
    }
    if (
      contentType.includes("presentation") ||
      contentType.includes("powerpoint")
    ) {
      return 3;
    }
    if (contentType === "application/pdf") {
      return this.isLikelySupportingDocumentAttachment(filename) ? 0 : 2;
    }

    return 0;
  }

  private isLikelySupportingDocumentAttachment(filename: string): boolean {
    return /\b(financials?|cap[\s_-]?table|statement|balance[\s_-]?sheet|cash[\s_-]?flow|p&l|profit[\s_-]?and[\s_-]?loss|budget|forecast|model|invoice|contract|nda|tax|compliance|report|annual|quarterly|earnings?|supplemental|shareholder|10[\s_-]?[kq]|sec[\s_-]?filing|filing)\b/i.test(
      filename,
    );
  }

  private async mergeUploadedFilesIntoStartup(
    startupId: string,
    uploadedFiles: Array<{ path: string; name: string; type: string }>,
  ): Promise<void> {
    const [existing] = await this.drizzle.db
      .select({
        files: startup.files,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);
    if (!existing) {
      return;
    }

    const mergedByPath = new Map<string, { path: string; name: string; type: string }>();
    for (const file of existing.files ?? []) {
      if (file.path) {
        mergedByPath.set(file.path, file);
      }
    }
    for (const file of uploadedFiles) {
      mergedByPath.set(file.path, file);
    }

    await this.drizzle.db
      .update(startup)
      .set({
        files: Array.from(mergedByPath.values()),
        updatedAt: new Date(),
      })
      .where(eq(startup.id, startupId));
  }

  private async findExactDuplicate(
    companyName: string,
    ownerUserId: string,
  ): Promise<{ id: string; name: string; status: string } | null> {
    const normalizedCompanyName =
      this.normalizeCompanyNameForDuplicateMatching(companyName);
    if (!normalizedCompanyName) {
      return null;
    }

    // Mirror the JS normalization in SQL for a single exact-match query,
    // avoiding the previous approach of fetching 250 rows and filtering in memory.
    const normalizedExpr = sql`trim(regexp_replace(
      regexp_replace(
        replace(lower(${startup.name}), '&', ' and '),
        '\m(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|sarl|sa|sas)\M',
        ' ', 'gi'
      ),
      '[^a-z0-9]+', ' ', 'g'
    ))`;

    const [row] = await this.drizzle.db
      .select({ id: startup.id, name: startup.name, status: startup.status })
      .from(startup)
      .where(
        and(
          eq(startup.userId, ownerUserId),
          sql`${normalizedExpr} = ${normalizedCompanyName}`,
        ),
      )
      .limit(1);

    return row ?? null;
  }

  private escapeForILike(value: string): string {
    return value
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
  }

  async resolveMissingInfoFromReply(
    startupId: string,
    messageText: string | null,
    fallbackUserId?: string | null,
  ): Promise<MissingInfoReplyResolution | null> {
    const current = await this.loadCriticalStartupSnapshot(startupId);
    if (!current) {
      return null;
    }

    const missingBefore = getMissingCriticalFields(current);
    const updates: Partial<typeof startup.$inferInsert> = {};
    const updatedFields: Array<"website" | "stage"> = [];

    if (missingBefore.includes("website")) {
      const websiteCandidate = extractWebsiteFromText(messageText);
      if (websiteCandidate) {
        updates.website = websiteCandidate;
        updatedFields.push("website");
      }
    }

    if (missingBefore.includes("stage")) {
      const stageCandidate = extractStageFromText(messageText);
      if (stageCandidate) {
        updates.stage = stageCandidate;
        updatedFields.push("stage");
      }
    }

    if (updatedFields.length > 0) {
      await this.drizzle.db
        .update(startup)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(startup.id, startupId));
    }

    const refreshed = await this.loadCriticalStartupSnapshot(startupId);
    if (!refreshed) {
      return null;
    }
    let remainingMissing = getMissingCriticalFields(refreshed);

    let pipelineStarted = false;
    if (remainingMissing.length === 0) {
      pipelineStarted = await this.restartPipelineAfterMissingInfoUpdate(
        startupId,
        fallbackUserId ?? refreshed.userId,
      );
      if (!pipelineStarted) {
        remainingMissing = await this.getMissingCriticalFieldsForStartup(startupId);
      }
    }

    return {
      startupId,
      startupName: refreshed.name,
      updatedFields,
      remainingMissing,
      pipelineStarted,
    };
  }

  async getMissingCriticalFieldsForStartup(
    startupId: string,
  ): Promise<Array<"website" | "stage">> {
    const snapshot = await this.loadCriticalStartupSnapshot(startupId);
    if (!snapshot) {
      return [];
    }
    return getMissingCriticalFields(snapshot);
  }

  async hasMissingCriticalFields(startupId: string): Promise<boolean> {
    const missing = await this.getMissingCriticalFieldsForStartup(startupId);
    return missing.length > 0;
  }

  private async restartPipelineAfterMissingInfoUpdate(
    startupId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      await this.pipeline.rerunFromPhase(startupId, PipelinePhase.ENRICHMENT);
      this.logger.log(
        `[ClaraSubmission] Restarted existing startup ${startupId} from enrichment after missing-info reply`,
      );
      return true;
    } catch (error) {
      const message = this.asMessage(error);
      this.logger.warn(
        `[ClaraSubmission] Unable to rerun startup ${startupId} from enrichment (${message}); falling back to full pipeline start`,
      );
      const fallback = await this.startPipelineIfReady(startupId, userId, {
        skipValidation: true,
        skipExtraction: true,
      });
      return fallback.started;
    }
  }

  private async enrichExistingStartup(
    startupId: string,
    ownerUserId: string,
    attachments: AttachmentMeta[],
    bodyText: string | null,
  ): Promise<{
    enriched: boolean;
    pipelineStarted: boolean;
    missingFields: Array<"website" | "stage">;
  }> {
    const updatedCriticalFields: Array<"website" | "stage"> = [];
    const current = await this.loadCriticalStartupSnapshot(startupId);
    if (current) {
      const updates: Partial<typeof startup.$inferInsert> = {};

      const websiteCandidate = extractWebsiteFromText(bodyText);
      if (websiteCandidate && websiteCandidate !== current.website) {
        updates.website = websiteCandidate;
        updatedCriticalFields.push("website");
      }

      const stageCandidate = extractStageFromText(bodyText);
      if (stageCandidate && stageCandidate !== current.stage) {
        updates.stage = stageCandidate;
        updatedCriticalFields.push("stage");
      }

      if (updatedCriticalFields.length > 0) {
        await this.drizzle.db
          .update(startup)
          .set({
            ...updates,
            updatedAt: new Date(),
          })
          .where(eq(startup.id, startupId));

        this.logger.log(
          `[ClaraSubmission] Updated critical fields from duplicate reply for ${startupId}: ${updatedCriticalFields.join(", ")}`,
        );
      }
    }

    const newDeck = this.selectPrimaryDeckAttachment(attachments);
    const uploadedFiles = this.toStartupFiles(attachments);
    if (uploadedFiles.length > 0) {
      await this.mergeUploadedFilesIntoStartup(startupId, uploadedFiles);
    }
    await this.registerAttachmentsToDataRoom(startupId, ownerUserId, attachments);

    if (!newDeck) {
      const snapshot = await this.loadCriticalStartupSnapshot(startupId);
      const missingFields = snapshot ? getMissingCriticalFields(snapshot) : [];

      if (missingFields.length > 0 && updatedCriticalFields.length === 0) {
        return {
          enriched: false,
          pipelineStarted: false,
          missingFields,
        };
      }

      const pipelineStart = await this.startPipelineIfReady(startupId, ownerUserId, {
        skipExtraction: true,
      });
      return {
        enriched: updatedCriticalFields.length > 0,
        pipelineStarted: pipelineStart.started,
        missingFields: pipelineStart.missingFields,
      };
    }

    await this.drizzle.db
      .update(startup)
      .set({
        pitchDeckPath: newDeck.storagePath,
        updatedAt: new Date(),
      })
      .where(eq(startup.id, startupId));

    await this.pipeline.prepareFreshAnalysis(startupId);
    await this.normalizeLegacyPlaceholderDefaults(startupId);
    await this.runPrePipelineExtraction(startupId);
    const pipelineStart = await this.startPipelineIfReady(startupId, ownerUserId, {
      skipExtraction: true,
    });

    this.logger.log(
      `Enriched startup ${startupId} with new pitch deck, re-triggered pipeline`,
    );

    return {
      enriched: true,
      pipelineStarted: pipelineStart.started,
      missingFields: pipelineStart.missingFields,
    };
  }

  private async startPipelineIfReady(
    startupId: string,
    userId: string,
    opts?: {
      skipValidation?: boolean;
      skipExtraction?: boolean;
    },
  ): Promise<PipelineStartResult> {
    if (!opts?.skipValidation) {
      const snapshot = await this.loadCriticalStartupSnapshot(startupId);
      if (snapshot) {
        const missing = getMissingCriticalFields(snapshot);
        if (missing.length > 0) {
          return { started: false, missingFields: missing };
        }
      }
    }

    try {
      await this.pipeline.startPipeline(startupId, userId, {
        skipExtraction: opts?.skipExtraction,
      });
      return { started: true, missingFields: [] };
    } catch (error) {
      const message = this.asMessage(error);
      if (!message.includes("Pipeline already running")) {
        throw error;
      }
      const parsedMissing = this.extractMissingFieldsFromStartError(message);
      const fallbackSnapshot = await this.loadCriticalStartupSnapshot(startupId);
      const fallbackMissing = fallbackSnapshot
        ? getMissingCriticalFields(fallbackSnapshot)
        : [];
      return {
        started: false,
        missingFields: parsedMissing.length > 0 ? parsedMissing : fallbackMissing,
      };
    }
  }

  private async runPrePipelineExtraction(startupId: string): Promise<void> {
    try {
      const prefill = await this.pipeline.prefillCriticalFieldsFromDeckExtraction(
        startupId,
      );
      this.logger.log(
        `[ClaraSubmission] Pre-pipeline extraction for ${startupId} | source=${prefill.extractionSource} | updated=${prefill.updatedFields.join(",") || "none"} | missingCritical=${prefill.missingCriticalFields.join(",") || "none"}`,
      );
    } catch (error) {
      const message = this.asMessage(error);
      this.logger.warn(
        `[ClaraSubmission] Pre-pipeline extraction failed for ${startupId}: ${message}`,
      );
    }
  }

  private extractMissingFieldsFromStartError(
    message: string,
  ): Array<"website" | "stage"> {
    const matches = message.match(/\[([^\]]+)\]/);
    if (!matches?.[1]) return [];
    return matches[1]
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter((v): v is "website" | "stage" => v === "website" || v === "stage");
  }

  private async loadCriticalStartupSnapshot(
    startupId: string,
  ): Promise<CriticalStartupSnapshot | null> {
    const [record] = await this.drizzle.db
      .select({
        id: startup.id,
        userId: startup.userId,
        name: startup.name,
        website: startup.website,
        stage: startup.stage,
        industry: startup.industry,
        location: startup.location,
        fundingTarget: startup.fundingTarget,
        teamSize: startup.teamSize,
        status: startup.status,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    return record ?? null;
  }

  private asMessage(error: unknown): string {
    if (error && typeof error === "object") {
      const maybeResponse = (error as { response?: unknown }).response;
      if (maybeResponse && typeof maybeResponse === "object") {
        const message = (maybeResponse as { message?: unknown }).message;
        if (typeof message === "string") {
          return message;
        }
        if (Array.isArray(message)) {
          return message
            .filter((value): value is string => typeof value === "string")
            .join(" | ");
        }
      }
    }
    return error instanceof Error ? error.message : String(error);
  }

  private extractCompanyFromBody(body: string | null): string | null {
    if (!body) return null;
    const match = body.match(
      /(?:company|startup|venture|project)\s*(?:name|called|named)?:?\s*["']?([A-Z][A-Za-z0-9\s&.]+?)["']?(?=\s*(?:[-,.\n]|$|\bis\b|\bare\b|\bwas\b|\bwere\b|\bseeking\b|\braising\b|\blooking\b))/,
    );
    return match?.[1]?.trim() || null;
  }

  private normalizeCompanyNameCandidate(
    value: string | null | undefined,
  ): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .replace(/\.(pdf|pptx?|docx?)$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      return null;
    }

    const strippedContext = normalized
      .replace(
        /\s+(?:is|are|was|were)\s+(?:seeking|raising|looking|building|developing)\b.*$/i,
        "",
      )
      .replace(/\s+(?:seeking|raising)\s+(?:funding|investment|capital)\b.*$/i, "")
      .trim();
    if (!strippedContext) {
      return null;
    }

    const lower = strippedContext.toLowerCase();
    if (
      lower === "unknown" ||
      lower === "n/a" ||
      lower === "untitled startup" ||
      lower.includes("pending extraction")
    ) {
      return null;
    }
    if (this.isLikelyReportStyleCompanyName(strippedContext)) {
      return null;
    }

    return strippedContext;
  }

  private normalizeCompanyNameForDuplicateMatching(
    value: string | null | undefined,
  ): string | null {
    const candidate =
      this.toTrustedCompanyNameCandidate(value) ??
      this.normalizeCompanyNameCandidate(value);
    if (!candidate) {
      return null;
    }

    const normalized = candidate
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(
        /\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|sarl|sa|sas)\b/g,
        " ",
      )
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return normalized || null;
  }

  private toTrustedCompanyNameCandidate(
    value: string | null | undefined,
  ): string | null {
    const normalized = this.normalizeCompanyNameCandidate(value);
    if (!normalized) {
      return null;
    }

    if (this.isLikelyFilenameStyleName(normalized)) {
      return null;
    }
    return normalized;
  }

  private isReliableCompanyNameForDuplicateMatching(
    value: string | null | undefined,
  ): boolean {
    const normalized = this.normalizeCompanyNameCandidate(value);
    if (!normalized) {
      return false;
    }

    const lower = normalized.toLowerCase();
    if (
      lower === "untitled startup" ||
      lower === "startup example" ||
      lower.startsWith("startup ")
    ) {
      return false;
    }

    return !this.isLikelyFilenameStyleName(normalized);
  }

  private isLikelyFilenameStyleName(value: string): boolean {
    const lower = value.trim().toLowerCase();
    if (!lower) {
      return true;
    }

    if (
      /\b(pitch\s*deck|deck|presentation|slides?|final|draft|version|copy)\b/.test(
        lower,
      )
    ) {
      return true;
    }
    if (/\.(pdf|pptx?|docx?)$/i.test(lower)) {
      return true;
    }
    if ((lower.includes("_") || lower.includes("-")) && /\d/.test(lower)) {
      return true;
    }
    // Common artifact from renamed files like "uber2", "acme2024".
    if (/^[a-z]{3,}\d{1,4}$/i.test(lower)) {
      return true;
    }
    if (/^[a-z0-9&.'\s-]+\s(19|20)\d{2}$/i.test(lower)) {
      return true;
    }
    if (/\b(v|ver|version)\s*\d+\b/i.test(lower)) {
      return true;
    }
    if (this.isLikelyReportStyleCompanyName(lower)) {
      return true;
    }

    return false;
  }

  private isLikelyReportStyleCompanyName(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (/^\d{4}\s+annual\s+report$/.test(normalized)) {
      return true;
    }
    if (/\bannual\s+report\b/.test(normalized)) {
      return true;
    }
    if (
      /\b(quarterly|q[1-4]|earnings?|supplemental|financial|shareholder)\b/.test(
        normalized,
      ) &&
      /\b(report|results?|data|statement|update)\b/.test(normalized)
    ) {
      return true;
    }
    if (/\bform\s*10[-\s]?[kq]\b/.test(normalized)) {
      return true;
    }

    return false;
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
      updates.website = "";
    }
    if (this.isExplicitPendingPlaceholderText(record.industry)) {
      updates.industry = "Unknown";
    }
    if (this.isExplicitPendingPlaceholderText(record.location)) {
      updates.location = "Unknown";
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
      `[ClaraSubmission] Normalized legacy placeholder defaults for ${startupId}: ${Object.keys(
        updates,
      ).join(", ")}`,
    );
  }

  private isExplicitPendingPlaceholderWebsite(value: string | null | undefined): boolean {
    if (!value) {
      return false;
    }
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
      return host === "pending-extraction.com";
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
      normalized.includes("pending extraction") ||
      normalized.includes("pending-extraction")
    );
  }

  hasScreeningFollowUpSignals(
    ctx: Pick<MessageContext, "bodyText" | "attachments">,
  ): boolean {
    if ((ctx.attachments ?? []).some((attachment) => attachment.isPitchDeck)) {
      return true;
    }

    const textContent = [ctx.bodyText]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("\n\n");
    if (!textContent) {
      return false;
    }

    if (this.extractTeamMembersFromReply(textContent).length > 0) {
      return true;
    }

    if (this.extractProductDescriptionFromReply(textContent)) {
      return true;
    }

    const dealTerms = this.extractDealTermsFromReply(textContent);
    return Boolean(
      typeof dealTerms.fundingTarget === "number" ||
        typeof dealTerms.valuation === "number" ||
        dealTerms.raiseType,
    );
  }

  async resolveScreeningFollowUpFromReply(
    startupId: string,
    ctx: MessageContext,
    fallbackUserId?: string | null,
  ): Promise<ScreeningFollowUpResolution | null> {
    const current = await this.loadScreeningFollowUpSnapshot(startupId);
    if (!current) {
      return null;
    }

    const missingBefore = detectMissingMaterials(current);
    const ownerUserId = current.userId || fallbackUserId || current.userId;
    const textContent = [ctx.subject, ctx.bodyText]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("\n\n");

    const processedAttachments = await this.processAttachments(
      ctx.inboxId,
      ctx.messageId,
      ctx.attachments,
      ownerUserId,
    );
    const uploadedFiles = this.toStartupFiles(processedAttachments);
    const deckAttachment = this.selectPrimaryDeckAttachment(processedAttachments);
    const hasUploadedAttachments = uploadedFiles.length > 0;

    if (hasUploadedAttachments) {
      await this.mergeUploadedFilesIntoStartup(startupId, uploadedFiles);
    }
    await this.registerAttachmentsToDataRoom(
      startupId,
      ownerUserId,
      processedAttachments,
    );

    const updates: Partial<typeof startup.$inferInsert> = {};
    const updatedMaterials = new Set<MissingMaterialCode>();

    if (missingBefore.includes("deck") && deckAttachment?.storagePath) {
      updates.pitchDeckPath = deckAttachment.storagePath;
      updatedMaterials.add("deck");
    }

    if (missingBefore.includes("website")) {
      const websiteCandidate = extractWebsiteFromText(textContent);
      if (websiteCandidate) {
        updates.website = websiteCandidate;
        updatedMaterials.add("website");
      }
    }

    if (missingBefore.includes("product_description")) {
      const productDescription = this.extractProductDescriptionFromReply(textContent);
      if (productDescription) {
        updates.productDescription = productDescription;
        if (typeof updates.description !== "string" || updates.description.trim().length === 0) {
          updates.description = productDescription;
        }
        updatedMaterials.add("product_description");
      }
    }

    if (missingBefore.includes("team")) {
      const teamMembers = this.extractTeamMembersFromReply(textContent);
      if (teamMembers.length > 0) {
        updates.teamMembers = teamMembers;
        updates.teamSize = Math.max(current.teamSize ?? 0, teamMembers.length);
        updatedMaterials.add("team");
      }
    }

    if (missingBefore.includes("deal_terms")) {
      const dealTerms = this.extractDealTermsFromReply(textContent);
      if (typeof dealTerms.fundingTarget === "number") {
        updates.fundingTarget = dealTerms.fundingTarget;
        updatedMaterials.add("deal_terms");
      }
      if (typeof dealTerms.valuation === "number") {
        updates.valuation = dealTerms.valuation;
        updatedMaterials.add("deal_terms");
      }
      if (dealTerms.raiseType) {
        updates.raiseType = dealTerms.raiseType;
        updatedMaterials.add("deal_terms");
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.drizzle.db
        .update(startup)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(startup.id, startupId));
    }

    const refreshed = await this.loadScreeningFollowUpSnapshot(startupId);
    if (!refreshed) {
      return null;
    }

    const remainingMissing = detectMissingMaterials(refreshed);
    const rerunPhase = hasUploadedAttachments || Boolean(deckAttachment)
      ? PipelinePhase.EXTRACTION
      : PipelinePhase.SCREENING;

    let pipelineStarted = false;
    if (remainingMissing.length === 0) {
      try {
        if (rerunPhase === PipelinePhase.EXTRACTION) {
          await this.pipeline.prepareFreshAnalysis(startupId);
        }
        await this.pipeline.rerunFromPhase(startupId, rerunPhase);
        pipelineStarted = true;
        this.logger.log(
          `[ClaraSubmission] Restarted startup ${startupId} from ${rerunPhase} after screening follow-up reply`,
        );
      } catch (error) {
        const message = this.asMessage(error);
        this.logger.warn(
          `[ClaraSubmission] Unable to rerun startup ${startupId} from ${rerunPhase} after screening follow-up (${message})`,
        );
      }
    }

    return {
      startupId,
      startupName: refreshed.name,
      updatedMaterials: Array.from(updatedMaterials),
      remainingMissing,
      pipelineStarted,
      rerunPhase,
    };
  }

  private async loadScreeningFollowUpSnapshot(
    startupId: string,
  ): Promise<{
    id: string;
    userId: string;
    name: string;
    pitchDeckUrl: string | null;
    pitchDeckPath: string | null;
    productDescription: string | null;
    description: string | null;
    teamMembers: Array<{ name: string; role: string; linkedinUrl: string }> | null;
    teamSize: number | null;
    fundingTarget: number | null;
    valuation: number | null;
    raiseType: string | null;
    website: string | null;
  } | null> {
    const [record] = await this.drizzle.db
      .select({
        id: startup.id,
        userId: startup.userId,
        name: startup.name,
        pitchDeckUrl: startup.pitchDeckUrl,
        pitchDeckPath: startup.pitchDeckPath,
        productDescription: startup.productDescription,
        description: startup.description,
        teamMembers: startup.teamMembers,
        teamSize: startup.teamSize,
        fundingTarget: startup.fundingTarget,
        valuation: startup.valuation,
        raiseType: startup.raiseType,
        website: startup.website,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    return record ?? null;
  }

  private extractProductDescriptionFromReply(
    text: string | null,
  ): string | null {
    if (!text) {
      return null;
    }

    const stripped = text.trim();
    if (stripped.length < 60) {
      return null;
    }

    if (!/(?:\bproduct\b|\bplatform\b|\bsolution\b|\bwe build\b|\bwe're building\b|\bwhat we do\b|\babout\b)/i.test(stripped)) {
      return null;
    }

    return stripped;
  }

  private normalizeReplyLine(line: string): string {
    let cleaned = line.trim();
    let previous = "";

    do {
      previous = cleaned;
      cleaned = cleaned
        .replace(/^>+\s*/, "")
        .replace(/^\|\s*/, "")
        .replace(/^(?:[-*•–—]|\d+[.)])\s+/, "")
        .trim();
    } while (cleaned !== previous);

    return cleaned;
  }

  private extractTeamMembersFromReply(
    text: string | null,
  ): Array<{ name: string; role: string; linkedinUrl: string }> {
    if (!text) {
      return [];
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => this.normalizeReplyLine(line))
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      return [];
    }

    const teamStart = lines.findIndex((line) =>
      /^(?:team(?:\s+members?)?|founding team|leadership team|our team|core team)\b/i.test(
        line,
      ),
    );
    const candidateLines = teamStart >= 0 ? lines.slice(teamStart + 1) : lines;
    const members: Array<{ name: string; role: string; linkedinUrl: string }> = [];

    for (const line of candidateLines) {
      if (/^(?:thanks|best|regards|cheers|sent from|--\s*|\w+\s+sent from)/i.test(line)) {
        break;
      }

      const match = line.match(
        /^([A-Za-z][A-Za-z0-9.'’&-]*(?:\s+[A-Za-z][A-Za-z0-9.'’&-]*){0,4})\s*(?:[:|,–—-]\s*|\s+as\s+)([A-Za-z][A-Za-z0-9/'’&+.-]*(?:\s+[A-Za-z][A-Za-z0-9/'’&+.-]*){0,4})$/,
      );
      if (!match) {
        continue;
      }

      const name = match[1].trim();
      const role = match[2].trim();
      if (name.length < 2 || role.length < 2) {
        continue;
      }

      members.push({ name, role, linkedinUrl: "" });
      if (members.length >= 6) {
        break;
      }
    }

    return members;
  }

  private extractDealTermsFromReply(text: string | null): {
    fundingTarget?: number;
    valuation?: number;
    raiseType?: RaiseType;
  } {
    if (!text) {
      return {};
    }

    const normalized = text.replace(/,/g, "");
    const fundingMatch = normalized.match(
      /(?:funding|raise|seeking|raising|target|ask)[^\d$€£]{0,20}(?:[$€£]?\s*)(\d+(?:\.\d+)?)(\s*[kKmMbB])?/i,
    );
    const valuationMatch = normalized.match(
      /(?:valuation|post-money|post money|pre-money|pre money)[^\d$€£]{0,20}(?:[$€£]?\s*)(\d+(?:\.\d+)?)(\s*[kKmMbB])?/i,
    );
    const raiseTypeMatch = normalized.match(
      /\b(safe[-\s]?equity|safe|convertible note|equity|undecided)\b/i,
    );

    const parseAmount = (
      match?: RegExpMatchArray | null,
    ): number | undefined => {
      if (!match) {
        return undefined;
      }
      const base = Number(match[1]);
      if (!Number.isFinite(base)) {
        return undefined;
      }
      const suffix = match[2]?.trim().toLowerCase() ?? "";
      const multiplier = suffix.startsWith("b")
        ? 1_000_000_000
        : suffix.startsWith("m")
          ? 1_000_000
          : suffix.startsWith("k")
            ? 1_000
            : 1;
      return Math.round(base * multiplier);
    };

    return {
      fundingTarget: parseAmount(fundingMatch),
      valuation: parseAmount(valuationMatch),
      raiseType: (() => {
        const matched = raiseTypeMatch?.[1]?.trim().toLowerCase().replace(/\s+/g, " ");
        switch (matched) {
          case "safe equity":
          case "safe-equity":
            return RaiseType.SAFE_EQUITY;
          case "safe":
            return RaiseType.SAFE;
          case "convertible note":
            return RaiseType.CONVERTIBLE_NOTE;
          case "equity":
            return RaiseType.EQUITY;
          case "undecided":
            return RaiseType.UNDECIDED;
          default:
            return undefined;
        }
      })(),
    };
  }

}
