import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { StorageService } from "../../storage";
import { AssetService } from "../../storage/asset.service";
import { ASSET_TYPES } from "../../storage/storage.config";
import { UserRole } from "../../auth/entities/auth.schema";
import { AgentMailClientService } from "../integrations/agentmail/agentmail-client.service";
import { startup, StartupStatus, StartupStage } from "../startup/entities/startup.schema";
import { DataRoomService } from "../startup/data-room.service";
import { PipelineService } from "../ai/services/pipeline.service";
import { PipelinePhase } from "../ai/interfaces/pipeline.interface";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/entities";
import { ClaraAiService } from "./clara-ai.service";
import { deriveStartupGeography } from "../geography";
import type { AttachmentMeta, MessageContext, SubmissionResult } from "./interfaces/clara.interface";

const PDF_MAGIC_BYTES = Buffer.from("%PDF-");
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
const FUZZY_THRESHOLD = 0.4;

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
    private storage: StorageService,
    private assetService: AssetService,
    private dataRoomService: DataRoomService,
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

    if (processedAttachments.length > 0 && !hasPitchDeckAttachment) {
      this.logger.warn(
        `[ClaraSubmission] No pitch deck identified among ${processedAttachments.length} attachment(s) from ${ctx.fromEmail} — blocking submission`,
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

    const shouldAttemptDuplicateMatch =
      this.isReliableCompanyNameForDuplicateMatching(companyName);
    const duplicate = shouldAttemptDuplicateMatch
      ? await this.findFuzzyDuplicate(companyName, ownerUserId)
      : null;
    if (!shouldAttemptDuplicateMatch) {
      this.logger.debug(
        `[ClaraSubmission] Skipping duplicate name match for startup candidate "${companyName}"`,
      );
    }
    if (duplicate) {
      const enrichmentResult = await this.enrichExistingStartup(
        duplicate.id,
        ownerUserId,
        processedAttachments,
        ctx.bodyText,
      );
      const duplicateSnapshot = await this.loadStartupIdentitySnapshot(duplicate.id);
      return {
        startupId: duplicate.id,
        startupName: duplicateSnapshot?.name ?? duplicate.name,
        isDuplicate: true,
        isEnriched: enrichmentResult.enriched,
        status: duplicateSnapshot?.status ?? duplicate.status,
        pipelineStarted: enrichmentResult.pipelineStarted,
        missingFields: enrichmentResult.missingFields,
      };
    }

    const websiteFromEmail = this.extractWebsiteFromText(ctx.bodyText, {
      expectedCompanyName: companyName,
      requireCompanySignal: true,
    });
    const stageFromEmail = this.extractStageFromText(ctx.bodyText);
    const location = "Unknown";
    const geography = deriveStartupGeography(location);

    const slug = this.generateSlug(companyName);
    const [created] = await this.drizzle.db
      .insert(startup)
      .values({
        userId: ownerUserId,
        submittedByRole: isInvestorSubmission ? UserRole.INVESTOR : UserRole.ADMIN,
        isPrivate: isInvestorSubmission,
        name: companyName,
        slug,
        tagline: `Submitted via email by ${ctx.fromEmail}`,
        description: ctx.bodyText?.slice(0, 5000) || "Submitted via Clara email assistant. Details will be extracted from the pitch deck.",
        website: websiteFromEmail ?? "",
        location,
        normalizedRegion: geography.normalizedRegion,
        geoCountryCode: geography.countryCode,
        geoLevel1: geography.level1,
        geoLevel2: geography.level2,
        geoLevel3: geography.level3,
        geoPath: geography.path,
        industry: "Unknown",
        stage: stageFromEmail ?? StartupStage.SEED,
        fundingTarget: 0,
        teamSize: 1,
        contactEmail: ctx.fromEmail,
        contactName: ctx.fromName ?? undefined,
        pitchDeckPath: deckAttachment?.storagePath ?? undefined,
        files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      })
      .returning();

    await this.normalizeLegacyPlaceholderDefaults(created.id);
    if (uploadedFiles.length > 0) {
      await this.mergeUploadedFilesIntoStartup(created.id, uploadedFiles);
    }
    await this.persistToDataRoom(created.id, processedAttachments);
    this.logger.log(
      `Created startup ${created.id} (${companyName}) from email by ${ctx.fromEmail}`,
    );

    await this.runPrePipelineExtraction(created.id);
    const refreshedCreated = await this.loadStartupIdentitySnapshot(created.id);
    const resolvedStartupName = refreshedCreated?.name ?? companyName;
    const resolvedStatus = refreshedCreated?.status ?? StartupStatus.SUBMITTED;
    const pipelineStart = await this.startPipelineIfReady(created.id, ownerUserId, {
      allowMissingCritical: true,
      skipExtraction: true,
    });

    await this.notifications.create(
      ownerUserId,
      "Clara: New startup submitted",
      `${resolvedStartupName} was submitted via email by ${ctx.fromEmail}`,
      NotificationType.INFO,
      isInvestorSubmission
        ? `/investor/startup/${created.id}`
        : `/admin/startup/${created.id}`,
    );

    return {
      startupId: created.id,
      startupName: resolvedStartupName,
      isDuplicate: false,
      status: resolvedStatus,
      pipelineStarted: pipelineStart.started,
      missingFields: pipelineStart.missingFields,
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

  private async persistToDataRoom(
    startupId: string,
    attachments: AttachmentMeta[],
  ): Promise<void> {
    const uploaded = attachments.filter(
      (a) => a.status === "uploaded" && a.assetId,
    );
    for (const att of uploaded) {
      const category = att.isPitchDeck ? "pitch_deck" : "supporting_document";
      try {
        await this.dataRoomService.uploadDocument(startupId, att.assetId!, category);
      } catch (error) {
        this.logger.warn(
          `[ClaraSubmission] Failed to add ${att.filename} to data room: ${error}`,
        );
      }
    }
    if (uploaded.length > 0) {
      this.logger.log(
        `[ClaraSubmission] Added ${uploaded.length} file(s) to data room for startup ${startupId}`,
      );
    }
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

  private async findFuzzyDuplicate(
    companyName: string,
    ownerUserId: string,
  ): Promise<{ id: string; name: string; status: string } | null> {
    try {
      const [match] = await this.drizzle.db
        .select({
          id: startup.id,
          name: startup.name,
          status: startup.status,
        })
        .from(startup)
        .where(
          and(
            eq(startup.userId, ownerUserId),
            sql`similarity(${startup.name}, CAST(${companyName} AS text)) > ${FUZZY_THRESHOLD}`,
          ),
        )
        .orderBy(desc(sql`similarity(${startup.name}, CAST(${companyName} AS text))`))
        .limit(1);
      return match ?? null;
    } catch (error) {
      if (!this.isSimilarityUnavailable(error)) {
        throw error;
      }

      this.logger.warn(
        "pg_trgm similarity() unavailable; falling back to ILIKE duplicate detection",
      );

      const normalized = companyName.trim();
      const escaped = `%${this.escapeForILike(normalized)}%`;
      const [fallbackMatch] = await this.drizzle.db
        .select({
          id: startup.id,
          name: startup.name,
          status: startup.status,
        })
        .from(startup)
        .where(
          and(
            eq(startup.userId, ownerUserId),
            ilike(startup.name, escaped),
          ),
        )
        .orderBy(desc(startup.createdAt))
        .limit(1);

      return fallbackMatch ?? null;
    }
  }

  private isSimilarityUnavailable(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const record = error as {
      message?: unknown;
      cause?: { code?: unknown };
      code?: unknown;
    };

    const message = typeof record.message === "string" ? record.message : "";
    const code =
      typeof record.code === "string"
        ? record.code
        : record.cause && typeof record.cause.code === "string"
          ? record.cause.code
          : "";

    return (
      (code === "42883" && /similarity\(/i.test(message)) ||
      (/function similarity\(/i.test(message) && /does not exist/i.test(message))
    );
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

    const updates: Partial<typeof startup.$inferInsert> = {};
    const updatedFields: Array<"website" | "stage"> = [];

    const normalizedReplyText = this.normalizeReplyForFieldExtraction(messageText);
    const websiteCandidate = this.extractWebsiteFromText(normalizedReplyText, {
      expectedCompanyName: current.name,
      requireCompanySignal: true,
    });
    if (websiteCandidate && websiteCandidate !== current.website) {
      updates.website = websiteCandidate;
      updatedFields.push("website");
    }

    const stageCandidate =
      this.extractStageFromText(normalizedReplyText) ??
      this.extractStageFromText(messageText);
    if (stageCandidate) {
      updates.stage = stageCandidate;
      updatedFields.push("stage");
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
    // Fields explicitly provided by the user in their reply are trusted regardless
    // of heuristic checks (e.g. SEED stage with placeholder industry/location signals)
    let remainingMissing = this.getMissingCriticalFields(refreshed).filter(
      (field) => !updatedFields.includes(field),
    );
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
    return this.getMissingCriticalFields(snapshot);
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

      const websiteCandidate = this.extractWebsiteFromText(bodyText, {
        expectedCompanyName: current.name,
        requireCompanySignal: true,
      });
      if (websiteCandidate && websiteCandidate !== current.website) {
        updates.website = websiteCandidate;
        updatedCriticalFields.push("website");
      }

      const stageCandidate = this.extractStageFromText(bodyText);
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

    if (!newDeck) {
      const snapshot = await this.loadCriticalStartupSnapshot(startupId);
      const missingFields = snapshot ? this.getMissingCriticalFields(snapshot) : [];

      if (missingFields.length > 0 && updatedCriticalFields.length === 0) {
        return {
          enriched: false,
          pipelineStarted: false,
          missingFields,
        };
      }

      const pipelineStart = await this.startPipelineIfReady(startupId, ownerUserId, {
        allowMissingCritical: true,
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

    await this.normalizeLegacyPlaceholderDefaults(startupId);
    await this.runPrePipelineExtraction(startupId);
    const pipelineStart = await this.startPipelineIfReady(startupId, ownerUserId, {
      allowMissingCritical: true,
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
      allowMissingCritical?: boolean;
      skipExtraction?: boolean;
    },
  ): Promise<PipelineStartResult> {
    if (!opts?.skipValidation && !opts?.allowMissingCritical) {
      const snapshot = await this.loadCriticalStartupSnapshot(startupId);
      if (snapshot) {
        const missing = this.getMissingCriticalFields(snapshot);
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

      const snapshot = await this.loadCriticalStartupSnapshot(startupId);
      if (snapshot?.status === StartupStatus.ANALYZING) {
        return { started: true, missingFields: [] };
      }

      this.logger.warn(
        `[ClaraSubmission] Detected stale pipeline running lock for ${startupId} while status=${snapshot?.status ?? "unknown"}; resetting before restart`,
      );
      await this.pipeline.cancelPipeline(startupId, {
        reason:
          "Reset stale running lock before restart from Clara missing-info reply.",
      });

      await this.pipeline.startPipeline(startupId, userId, {
        skipExtraction: opts?.skipExtraction,
      });
      return { started: true, missingFields: [] };
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

  private async loadStartupIdentitySnapshot(
    startupId: string,
  ): Promise<{ name: string; status: StartupStatus } | null> {
    const [record] = await this.drizzle.db
      .select({
        name: startup.name,
        status: startup.status,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    return record ?? null;
  }

  private getMissingCriticalFields(
    record: Pick<
      CriticalStartupSnapshot,
      "website" | "stage" | "industry" | "location" | "fundingTarget" | "teamSize"
    >,
  ): Array<"website" | "stage"> {
    const missing: Array<"website" | "stage"> = [];
    if (this.isMissingWebsiteValue(record.website)) {
      missing.push("website");
    }
    if (this.isLikelyPlaceholderStage(record)) {
      missing.push("stage");
    }
    return missing;
  }

  private isMissingWebsiteValue(value: string | null | undefined): boolean {
    if (!value) return true;
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
      return host === "pending-extraction.com";
    } catch {
      return true;
    }
  }

  private isLikelyPlaceholderStage(record: {
    website: string;
    stage: string;
    industry: string;
    location: string;
    fundingTarget: number;
    teamSize: number;
  }): boolean {
    const normalizedStage = this.mapStageToEnum(record.stage);
    if (!normalizedStage) {
      return true;
    }
    if (normalizedStage !== StartupStage.SEED) {
      return false;
    }

    const structuralSignals = [
      this.isMissingWebsiteValue(record.website),
      this.isLikelyPlaceholderText(record.industry),
      this.isLikelyPlaceholderText(record.location),
    ];
    const secondarySignals = [
      record.fundingTarget <= 0,
      record.teamSize <= 1,
    ];
    const totalSignals = [...structuralSignals, ...secondarySignals];
    return (
      structuralSignals.filter(Boolean).length >= 1 &&
      totalSignals.filter(Boolean).length >= 2
    );
  }

  private isLikelyPlaceholderText(value: string | null | undefined): boolean {
    if (!value) {
      return true;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    return (
      normalized.includes("pending extraction") ||
      normalized.includes("pending-extraction") ||
      normalized === "unknown" ||
      normalized === "n/a"
    );
  }

  private mapStageToEnum(value: string | null | undefined): StartupStage | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const mapping: Record<string, StartupStage> = {
      pre_seed: StartupStage.PRE_SEED,
      preseed: StartupStage.PRE_SEED,
      seed: StartupStage.SEED,
      series_a: StartupStage.SERIES_A,
      series_b: StartupStage.SERIES_B,
      series_c: StartupStage.SERIES_C,
      series_d: StartupStage.SERIES_D,
      series_e: StartupStage.SERIES_E,
      series_f: StartupStage.SERIES_F_PLUS,
      series_f_plus: StartupStage.SERIES_F_PLUS,
      "series_f+": StartupStage.SERIES_F_PLUS,
    };
    return mapping[normalized] ?? null;
  }

  private extractWebsiteFromText(
    text: string | null | undefined,
    options?: {
      expectedCompanyName?: string | null;
      requireCompanySignal?: boolean;
    },
  ): string | null {
    if (!text) {
      return null;
    }

    const expectedCompanyName = options?.expectedCompanyName?.trim();
    const requireCompanySignal = options?.requireCompanySignal === true;

    const matches: Array<{ value: string; labeled: boolean }> = [];
    const explicitMatches =
      text.match(/\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi) ?? [];
    matches.push(...explicitMatches.map((value) => ({ value, labeled: false })));

    const labeledBareDomain =
      text.match(
        /\bwebsite\b[^a-z0-9]+([a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>()]*)?)/i,
      )?.[1] ?? null;
    if (labeledBareDomain) {
      matches.unshift({ value: labeledBareDomain, labeled: true });
    }

    if (matches.length === 0) return null;

    let firstValid: string | null = null;
    let firstLabeled: string | null = null;
    for (const candidateMeta of matches) {
      const normalizedCandidate = candidateMeta.value
        .replace(/[),.;]+$/g, "")
        .trim();
      const candidate = normalizedCandidate.startsWith("http")
        ? normalizedCandidate
        : `https://${normalizedCandidate}`;
      try {
        const parsed = new URL(candidate);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
        if (!host || host === "pending-extraction.com") {
          continue;
        }

        const normalizedUrl = parsed.toString();
        if (!firstValid) {
          firstValid = normalizedUrl;
        }
        if (candidateMeta.labeled && !firstLabeled) {
          firstLabeled = normalizedUrl;
        }

        if (
          expectedCompanyName &&
          this.isWebsiteLikelyForCompany(normalizedUrl, expectedCompanyName)
        ) {
          return normalizedUrl;
        }
      } catch {
        continue;
      }
    }

    if (requireCompanySignal) {
      return null;
    }

    return firstLabeled ?? firstValid;
  }

  private isWebsiteLikelyForCompany(
    website: string,
    companyName: string,
  ): boolean {
    const websiteToken = this.extractWebsiteRootToken(website);
    if (!websiteToken) {
      return false;
    }

    const companyToken = this.normalizeCompanyToken(companyName);
    if (!companyToken || companyToken.length < 3) {
      return true;
    }
    if (websiteToken.includes(companyToken) || companyToken.includes(websiteToken)) {
      return true;
    }

    const significantTokens = companyName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4);

    return significantTokens.some((token) => websiteToken.includes(token));
  }

  private extractWebsiteRootToken(website: string): string | null {
    try {
      const host = new URL(website).hostname.toLowerCase().replace(/^www\./, "");
      const parts = host.split(".").filter(Boolean);
      if (parts.length === 0) {
        return null;
      }

      let root = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
      const broadSuffixes = new Set(["co", "com", "org", "net", "gov", "edu", "ac"]);
      if (broadSuffixes.has(root) && parts.length >= 3) {
        root = parts[parts.length - 3];
      }
      return root.replace(/[^a-z0-9]/g, "");
    } catch {
      return null;
    }
  }

  private normalizeCompanyToken(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const token = value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
    if (token.length < 3) {
      return null;
    }
    return token;
  }

  private extractStageFromText(text: string | null | undefined): StartupStage | null {
    if (!text) {
      return null;
    }

    const normalized = text.toLowerCase();
    if (/\bpre[\s-]?seed\b/.test(normalized)) return StartupStage.PRE_SEED;
    if (/\bseries[\s-]?a\b/.test(normalized)) return StartupStage.SERIES_A;
    if (/\bseries[\s-]?b\b/.test(normalized)) return StartupStage.SERIES_B;
    if (/\bseries[\s-]?c\b/.test(normalized)) return StartupStage.SERIES_C;
    if (/\bseries[\s-]?d\b/.test(normalized)) return StartupStage.SERIES_D;
    if (/\bseries[\s-]?e\b/.test(normalized)) return StartupStage.SERIES_E;
    if (/\bseries[\s-]?f(?:\+|[\s-]?plus)?\b/.test(normalized)) {
      return StartupStage.SERIES_F_PLUS;
    }
    if (/\bseed\b/.test(normalized)) return StartupStage.SEED;
    return null;
  }

  private normalizeReplyForFieldExtraction(
    text: string | null | undefined,
  ): string {
    if (!text) {
      return "";
    }

    const withoutQuotedLines = text
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith(">"))
      .join("\n");
    const withoutThreadQuote = withoutQuotedLines
      .split(/\nOn .+wrote:\n/i)[0]
      .split(/\nFrom:\s.+\n/i)[0];

    // Avoid extracting stage from Clara template labels in quoted/repeated content.
    return withoutThreadQuote.replace(
      /current funding stage\s*\(pre-seed,\s*seed,\s*series a,\s*etc\.\)\s*:?/gi,
      "",
    );
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
}
