import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { StorageService } from "../../storage";
import { ASSET_TYPES } from "../../storage/storage.config";
import { UserRole } from "../../auth/entities/auth.schema";
import { AgentMailClientService } from "../integrations/agentmail/agentmail-client.service";
import { startup, StartupStatus, StartupStage } from "../startup/entities/startup.schema";
import {
  PipelineService,
  PIPELINE_MISSING_FIELDS_ERROR_PREFIX,
} from "../ai/services/pipeline.service";
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

    const companyName =
      extractedCompanyName ??
      this.extractCompanyFromBody(ctx.bodyText) ??
      this.claraAi.extractCompanyFromFilename(
        processedAttachments.find((a) => a.isPitchDeck)?.filename,
      ) ??
      "Untitled Startup";

    const duplicate = await this.findFuzzyDuplicate(companyName, ownerUserId);
    if (duplicate) {
      const enrichmentResult = await this.enrichExistingStartup(
        duplicate.id,
        ownerUserId,
        processedAttachments,
        ctx.bodyText,
      );
      return {
        startupId: duplicate.id,
        startupName: duplicate.name,
        isDuplicate: true,
        isEnriched: enrichmentResult.enriched,
        status: duplicate.status,
        pipelineStarted: enrichmentResult.pipelineStarted,
        missingFields: enrichmentResult.missingFields,
      };
    }

    const deckAttachment = processedAttachments.find(
      (a) => a.isPitchDeck && a.status === "uploaded",
    );
    const websiteFromEmail = this.extractWebsiteFromText(ctx.bodyText);
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
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      })
      .returning();

    await this.normalizeLegacyPlaceholderDefaults(created.id);
    this.logger.log(
      `Created startup ${created.id} (${companyName}) from email by ${ctx.fromEmail}`,
    );

    await this.runPrePipelineExtraction(created.id);
    const pipelineStart = await this.startPipelineIfReady(created.id, ownerUserId);

    await this.notifications.create(
      ownerUserId,
      "Clara: New startup submitted",
      `${companyName} was submitted via email by ${ctx.fromEmail}`,
      NotificationType.INFO,
      isInvestorSubmission
        ? `/investor/startup/${created.id}`
        : `/admin/startup/${created.id}`,
    );

    return {
      startupId: created.id,
      startupName: companyName,
      isDuplicate: false,
      status: StartupStatus.SUBMITTED,
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

    const missingBefore = this.getMissingCriticalFields(current);
    const updates: Partial<typeof startup.$inferInsert> = {};
    const updatedFields: Array<"website" | "stage"> = [];

    if (missingBefore.includes("website")) {
      const websiteCandidate = this.extractWebsiteFromText(messageText);
      if (websiteCandidate) {
        updates.website = websiteCandidate;
        updatedFields.push("website");
      }
    }

    if (missingBefore.includes("stage")) {
      const stageCandidate = this.extractStageFromText(messageText);
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
    const remainingMissing = this.getMissingCriticalFields(refreshed);

    let pipelineStarted = false;
    if (remainingMissing.length === 0) {
      const startResult = await this.startPipelineIfReady(
        startupId,
        fallbackUserId ?? refreshed.userId,
      );
      pipelineStarted = startResult.started;
    }

    return {
      startupId,
      startupName: refreshed.name,
      updatedFields,
      remainingMissing,
      pipelineStarted,
    };
  }

  private async enrichExistingStartup(
    startupId: string,
    ownerUserId: string,
    attachments: AttachmentMeta[],
    _bodyText: string | null,
  ): Promise<{
    enriched: boolean;
    pipelineStarted: boolean;
    missingFields: Array<"website" | "stage">;
  }> {
    const newDeck = attachments.find(
      (a) => a.isPitchDeck && a.status === "uploaded" && a.storagePath,
    );

    if (!newDeck) {
      return { enriched: false, pipelineStarted: false, missingFields: [] };
    }

    await this.drizzle.db
      .update(startup)
      .set({ pitchDeckPath: newDeck.storagePath })
      .where(eq(startup.id, startupId));

    await this.normalizeLegacyPlaceholderDefaults(startupId);
    await this.runPrePipelineExtraction(startupId);
    const pipelineStart = await this.startPipelineIfReady(startupId, ownerUserId);

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
  ): Promise<PipelineStartResult> {
    try {
      await this.pipeline.startPipeline(startupId, userId);
      return { started: true, missingFields: [] };
    } catch (error) {
      const message = this.asMessage(error);
      if (message.includes("Pipeline already running")) {
        return { started: true, missingFields: [] };
      }
      if (!message.includes(PIPELINE_MISSING_FIELDS_ERROR_PREFIX)) {
        throw error;
      }
      const parsedMissing = this.extractMissingFieldsFromStartError(message);
      const fallbackSnapshot = await this.loadCriticalStartupSnapshot(startupId);
      const fallbackMissing = fallbackSnapshot
        ? this.getMissingCriticalFields(fallbackSnapshot)
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
    if (!matches?.[1]) {
      return [];
    }
    const parsed = matches[1]
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(
        (value): value is "website" | "stage" =>
          value === "website" || value === "stage",
      );
    return Array.from(new Set(parsed));
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

  private extractWebsiteFromText(text: string | null | undefined): string | null {
    if (!text) {
      return null;
    }

    const matches: string[] = [];
    const explicitMatches =
      text.match(/\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi) ?? [];
    matches.push(...explicitMatches);

    const labeledBareDomain =
      text.match(
        /\bwebsite\b[^a-z0-9]+([a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>()]*)?)/i,
      )?.[1] ?? null;
    if (labeledBareDomain) {
      matches.push(labeledBareDomain);
    }

    if (matches.length === 0) return null;

    for (const rawCandidate of matches) {
      const normalizedCandidate = rawCandidate
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
        return parsed.toString();
      } catch {
        continue;
      }
    }

    return null;
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
