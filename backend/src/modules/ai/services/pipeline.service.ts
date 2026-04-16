import { BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { StorageService } from "../../../storage";
import { NotificationType } from "../../../notification/entities";
import { NotificationService } from "../../../notification/notification.service";
import { QueueService } from "../../../queue";
import { startup, StartupStatus } from "../../startup/entities";
import { STARTUP_DESCRIPTION_PLACEHOLDER } from "../../startup/startup.constants";
import { UserRole } from "../../../auth/entities/auth.schema";
import { startupEvaluation } from "../../analysis/entities";
import { pipelineRun, pipelineAgentRun } from "../entities";
import type {
  EnrichmentResult,
  EvaluationResult,
  ExtractionResult,
  ScrapingResult,
} from "../interfaces/phase-results.interface";
import type {
  EvaluationAgentKey,
  PipelineFallbackReason,
  ResearchAgentKey,
} from "../interfaces/agent.interface";
import { EVALUATION_AGENT_KEYS, RESEARCH_AGENT_KEYS } from "../constants/agent-keys";
import {
  isMissingWebsiteValue,
  isLikelyPlaceholderText,
  isLikelyPlaceholderStage,
  mapStageToEnum,
  normalizeWebsiteCandidate,
  extractWebsiteFromText,
  extractStageFromText,
  getMissingCriticalFields as getFieldGaps,
  type StartupFieldRecord,
} from "../utils/startup-field-utils";
import { AiConfigService } from "./ai-config.service";
import { PipelineFeedbackService } from "./pipeline-feedback.service";
import { PipelineAgentTraceService } from "./pipeline-agent-trace.service";
import { PipelineTemplateService } from "./pipeline-template.service";
import { PipelineStateService } from "./pipeline-state.service";
import { PipelineStateSnapshotService } from "./pipeline-state-snapshot.service";
import { StartupMatchingPipelineService } from "./startup-matching-pipeline.service";
import { EnrichmentService } from "./enrichment.service";
import { ExtractionService } from "./extraction.service";
import {
  PhaseStatus,
  PipelinePhase,
  type PhaseResultMap,
  PipelineState,
  PipelineStatus,
} from "../interfaces/pipeline.interface";
import { ErrorRecoveryService } from "../orchestrator/error-recovery.service";
import { PhaseTransitionService } from "../orchestrator/phase-transition.service";
import { ProgressTrackerService } from "../orchestrator/progress-tracker.service";
import type { ClaraService } from "../../clara/clara.service";

function toJsonRecord(value: unknown, context: string): Record<string, unknown> {
  const serialized = JSON.stringify(value);
  if (!serialized) {
    throw new Error(`${context} cannot be serialized`);
  }

  const parsed = JSON.parse(serialized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${context} must serialize to an object`);
  }

  return parsed as Record<string, unknown>;
}

type AgentRetryMetadata = {
  mode: "agent_retry";
  agentKey: string;
  agentKeys?: string[];
};

type DiagnosticFailureSource =
  | "phase_timeout"
  | "worker_stalled";

export interface RetryAgentRequest {
  phase: PipelinePhase.RESEARCH | PipelinePhase.EVALUATION;
  agentKey: ResearchAgentKey | EvaluationAgentKey;
  agentKeys?: Array<ResearchAgentKey | EvaluationAgentKey>;
  skipDownstream?: boolean;
}

interface QueuePhaseParams {
  startupId: string;
  pipelineRunId: string;
  userId: string;
  phase: PipelinePhase;
  delayMs?: number;
  retryCount?: number;
  waitingError?: string;
  metadata?: Record<string, unknown>;
  /** Skip re-reading pipeline state; use this pre-fetched state instead. */
  knownState?: PipelineState;
}

const MIN_RESEARCH_PHASE_TIMEOUT_MS = 2_400_000; // 40 minutes minimum
const DEFAULT_RESEARCH_AGENT_STAGGER_MS = 180_000; // 3 minutes
const RESEARCH_AGENT_COUNT = 5;
const SYNTHESIS_PHASE_TIMEOUT_BUFFER_MS = 60_000; // avoid racing the worker's own timeout handling
export const PIPELINE_MISSING_FIELDS_ERROR_PREFIX =
  "Pipeline start blocked: missing critical fields";

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private claraService: ClaraService | null = null;
  private readonly typeByPhase: Record<
    PipelinePhase,
    | "document_classification"
    | "ai_extraction"
    | "ai_enrichment"
    | "ai_scraping"
    | "ai_research"
    | "ai_evaluation"
    | "ai_synthesis"
  > = {
    [PipelinePhase.CLASSIFICATION]: "document_classification",
    [PipelinePhase.EXTRACTION]: "ai_extraction",
    [PipelinePhase.ENRICHMENT]: "ai_enrichment",
    [PipelinePhase.SCRAPING]: "ai_scraping",
    [PipelinePhase.RESEARCH]: "ai_research",
    [PipelinePhase.EVALUATION]: "ai_evaluation",
    [PipelinePhase.SYNTHESIS]: "ai_synthesis",
  };

  constructor(
    private drizzle: DrizzleService,
    private queue: QueueService,
    private notifications: NotificationService,
    private pipelineState: PipelineStateService,
    private pipelineStateSnapshots: PipelineStateSnapshotService,
    private aiConfig: AiConfigService,
    private startupMatching: StartupMatchingPipelineService,
    private pipelineFeedback: PipelineFeedbackService,
    private progressTracker: ProgressTrackerService,
    private phaseTransition: PhaseTransitionService,
    private errorRecovery: ErrorRecoveryService,
    private pipelineTemplateService: PipelineTemplateService,
    private enrichmentService: EnrichmentService,
    private storage: StorageService,
    private extractionService: ExtractionService,
    private moduleRef: ModuleRef,
    @Optional() private pipelineAgentTrace?: PipelineAgentTraceService,
  ) {}

  private getClaraService(): ClaraService | null {
    if (this.claraService) return this.claraService;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ClaraService: Cls } = require("../../clara/clara.service");
      this.claraService = this.moduleRef.get(Cls, { strict: false });
      return this.claraService;
    } catch {
      return null;
    }
  }

  private async recordDiagnosticTrace(params: {
    startupId: string;
    pipelineRunId?: string;
    userId?: string;
    phase: PipelinePhase;
    stepKey: string;
    error: string;
    failureSource: DiagnosticFailureSource;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    const state =
      params.pipelineRunId && params.userId
        ? null
        : await this.pipelineState.get(params.startupId);
    const pipelineRunId = params.pipelineRunId ?? state?.pipelineRunId;
    const userId = params.userId ?? state?.userId;

    if (pipelineRunId && userId) {
      await this.onAgentProgress({
        startupId: params.startupId,
        userId,
        pipelineRunId,
        phase: params.phase,
        key: params.stepKey,
        status: "failed",
        progress: 0,
        error: params.error,
        lifecycleEvent: "failed",
      }).catch((progressError) => {
        const message =
          progressError instanceof Error
            ? progressError.message
            : String(progressError);
        this.logger.warn(
          `[Pipeline] Failed to persist diagnostic progress for ${params.phase}/${params.stepKey} on ${params.startupId}: ${message}`,
        );
      });
    }

    if (!this.pipelineAgentTrace || !pipelineRunId) {
      return;
    }

    await this.pipelineAgentTrace
      .recordRun({
        startupId: params.startupId,
        pipelineRunId,
        phase: params.phase,
        agentKey: params.stepKey,
        traceKind: "phase_step",
        stepKey: params.stepKey,
        status: "failed",
        error: params.error,
        meta: {
          failureSource: params.failureSource,
          ...(params.meta ?? {}),
        },
      })
      .catch((traceError) => {
        const message =
          traceError instanceof Error ? traceError.message : String(traceError);
        this.logger.warn(
          `[Pipeline] Failed to persist diagnostic trace for ${params.phase}/${params.stepKey} on ${params.startupId}: ${message}`,
        );
      });
  }

  async recordInfrastructureIssue(params: {
    startupId: string;
    pipelineRunId: string;
    userId: string;
    phase: PipelinePhase;
    stepKey: string;
    error: string;
    failureSource: DiagnosticFailureSource;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.recordDiagnosticTrace(params);
  }

  private async getMissingCriticalFields(
    startupId: string,
  ): Promise<Array<"website" | "stage">> {
    const [record] = await this.drizzle.db
      .select({
        website: startup.website,
        stage: startup.stage,
        industry: startup.industry,
        location: startup.location,
        fundingTarget: startup.fundingTarget,
        teamSize: startup.teamSize,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record) {
      throw new BadRequestException(`Startup ${startupId} not found`);
    }

    return getFieldGaps(record as StartupFieldRecord);
  }

  private async notifyClaraMissingInfoForPipelineStart(
    startupId: string,
    missingFields: Array<"website" | "stage">,
    options?: {
      pipelineRunId?: string | null;
    },
  ): Promise<void> {
    const clara = this.getClaraService();
    if (!clara?.isEnabled()) {
      this.logger.warn(
        `[Pipeline] Clara missing-info notification skipped for startup ${startupId}: Clara is unavailable or disabled`,
      );
      return;
    }

    try {
      await clara.notifyMissingStartupInfo(startupId, missingFields, {
        pipelineRunId: options?.pipelineRunId ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to send Clara missing-info request for startup ${startupId}: ${message}`,
      );
    }
  }

  private buildAwaitingFounderInfoReason(
    missingFields: Array<"website" | "stage">,
    context:
      | "after enrichment"
      | "after skipped enrichment"
      | "before scraping"
      | "before research",
  ): string {
    const labels = Array.from(
      new Set(
        missingFields.map((field) =>
          field === "stage" ? "funding stage" : "website",
        ),
      ),
    );
    const missingLabel =
      labels.length <= 1
        ? (labels[0] ?? "required fields")
        : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    return `Awaiting founder info: missing ${missingLabel}. Clara emailed the submitter to provide this information. Pipeline paused ${context}.`;
  }

  private async assertCriticalStartupFieldsPresent(
    startupId: string,
  ): Promise<void> {
    const missingFields = await this.getMissingCriticalFields(startupId);
    if (missingFields.length === 0) {
      return;
    }

    await this.notifyClaraMissingInfoForPipelineStart(startupId, missingFields);
    throw new BadRequestException(
      `${PIPELINE_MISSING_FIELDS_ERROR_PREFIX} [${missingFields.join(", ")}].`,
    );
  }

  private extractCompanyNameFromRawText(text: string | null | undefined): string | null {
    if (!text || typeof text !== "string") {
      return null;
    }

    const inlineTitleMatch =
      text.match(
        /(?:^|\n)\s*([A-Z][A-Za-z0-9&.,'’\- ]{1,80}?)\s*(?:[—\-:|]\s*)?\bpitch\s*deck\b/i,
      )?.[1] ?? null;
    if (inlineTitleMatch) {
      return this.normalizePotentialCompanyName(inlineTitleMatch);
    }

    const headingMatch =
      text.match(
        /(?:^|\n)\s*#?\s*pitch\s*deck\s*[—\-:]\s*([^\n(]{2,120}?)(?:\s*\(|\s*$)/i,
      )?.[1] ?? null;
    if (headingMatch) {
      return this.normalizePotentialCompanyName(headingMatch);
    }

    const companyLineMatch =
      text.match(
        /(?:^|\n)\s*(?:company|startup)\s*(?:name)?\s*[:-]\s*([^\n]{2,120})/i,
      )?.[1] ?? null;
    if (companyLineMatch) {
      return this.normalizePotentialCompanyName(companyLineMatch);
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\u2022/g, " ").trim())
      .filter((line) => line.length > 0)
      .slice(0, 40);

    for (let index = 1; index < Math.min(lines.length, 15); index += 1) {
      if (!/\bpitch\s*deck\b/i.test(lines[index])) {
        continue;
      }
      const candidate = this.normalizePotentialCompanyName(lines[index - 1]);
      if (candidate) {
        return candidate;
      }
    }

    if (lines.length >= 2 && /\bpitch\s*deck\b/i.test(lines[1])) {
      const candidate = this.normalizePotentialCompanyName(lines[0]);
      if (candidate) {
        return candidate;
      }
    }

    if (lines.length > 0 && /^[A-Z0-9&.,'’\- ]{2,80}$/.test(lines[0])) {
      const candidate = this.normalizePotentialCompanyName(lines[0]);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  private normalizePotentialCompanyName(
    value: string | null | undefined,
  ): string | null {
    if (!value) {
      return null;
    }

    let candidate = value
      .replace(/^[#>*\-\u2022]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!candidate) {
      return null;
    }

    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(candidate)) {
      return null;
    }

    candidate = candidate
      .replace(/\b(pitch\s*deck|presentation|slides?|confidential)\b/gi, "")
      .replace(/[:|/\-–—]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (candidate.length < 2 || candidate.length > 80) {
      return null;
    }

    const normalized = this.sanitizeStartupName(candidate);
    if (!normalized) {
      return null;
    }

    if (this.isLikelyDeckSectionHeading(normalized)) {
      return null;
    }

    if (/\b(page|slide)\s*\d+\b/i.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private isLikelyDeckSectionHeading(value: string): boolean {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const headings = new Set([
      "problem",
      "solution",
      "product",
      "market opportunity",
      "business model",
      "go to market",
      "go-to-market",
      "traction",
      "competitive advantage",
      "vision",
      "team",
      "financials",
      "ask",
      "overview",
      "introduction",
      "summary",
    ]);
    return headings.has(normalized);
  }

  private deriveCriticalMissingFromExtraction(
    extraction: ExtractionResult | null,
  ): Array<"website" | "stage"> {
    if (!extraction) {
      return [];
    }

    const missing: Array<"website" | "stage"> = [];
    const websiteCandidate =
      normalizeWebsiteCandidate(extraction.website) ??
      extractWebsiteFromText(extraction.rawText);
    if (isMissingWebsiteValue(websiteCandidate)) {
      missing.push("website");
    }

    const stageCandidate =
      mapStageToEnum(extraction.stage) ??
      extractStageFromText(extraction.rawText);
    if (!stageCandidate) {
      missing.push("stage");
    }

    return Array.from(new Set(missing));
  }

  private isLikelyPlaceholderStartupName(value: string | null | undefined): boolean {
    if (!value) {
      return true;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    return (
      normalized === "untitled startup" ||
      normalized === "startup example" ||
      normalized.startsWith("startup ")
    );
  }

  private sanitizeStartupName(value: string | null | undefined): string | null {
    if (!value || typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.toLowerCase();
    if (
      normalized === "unknown" ||
      normalized === "n/a" ||
      normalized.includes("pending extraction") ||
      normalized === "untitled startup" ||
      normalized === "startup example" ||
      normalized.startsWith("startup ") ||
      this.isLikelyReportStyleStartupName(trimmed)
    ) {
      return null;
    }
    return trimmed;
  }

  private normalizeStartupNameForComparison(
    value: string | null | undefined,
  ): string | null {
    const sanitized = this.sanitizeStartupName(value);
    if (!sanitized) {
      return null;
    }
    return sanitized
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  private isLikelyFilenameDerivedStartupName(
    value: string | null | undefined,
  ): boolean {
    if (!value) {
      return false;
    }
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return false;
    }

    if (/\.(pdf|pptx?|docx?)$/i.test(trimmed)) {
      return true;
    }

    if (/\b(pitch\s*deck|deck|presentation|slides?|draft|final|version|v\d+)\b/i.test(trimmed)) {
      return true;
    }

    if ((trimmed.includes("_") || trimmed.includes("-")) && /\d/.test(trimmed)) {
      return true;
    }

    if (/^[a-z0-9_-]{3,40}$/.test(trimmed) && /\d/.test(trimmed)) {
      return true;
    }
    if (/^[a-z0-9&.'\s-]+\s(19|20)\d{2}$/i.test(trimmed)) {
      return true;
    }

    if (this.isLikelyReportStyleStartupName(trimmed)) {
      return true;
    }

    return false;
  }

  private isLikelyReportStyleStartupName(value: string): boolean {
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

  private shouldUseExtractedStartupNameForPrefill(
    currentName: string | null | undefined,
    extractedName: string,
  ): boolean {
    const normalizedExtracted = this.normalizeStartupNameForComparison(extractedName);
    if (!normalizedExtracted) {
      return false;
    }

    // Reject candidate names that look like filenames or report titles
    if (this.isLikelyFilenameDerivedStartupName(extractedName)) {
      return false;
    }

    const normalizedCurrent = this.normalizeStartupNameForComparison(currentName);
    if (!normalizedCurrent) {
      return true;
    }

    if (normalizedCurrent === normalizedExtracted) {
      return false;
    }

    if (this.isLikelyPlaceholderStartupName(currentName)) {
      return true;
    }

    return this.isLikelyFilenameDerivedStartupName(currentName);
  }

  private async syncStartupFieldsFromExtractionResult(
    startupId: string,
    extraction: ExtractionResult,
    source: "pre-pipeline" | "phase-extraction",
  ): Promise<
    Array<"website" | "stage" | "name" | "industry" | "location" | "description">
  > {
    const [record] = await this.drizzle.db
      .select({
        name: startup.name,
        website: startup.website,
        stage: startup.stage,
        industry: startup.industry,
        location: startup.location,
        description: startup.description,
        fundingTarget: startup.fundingTarget,
        teamSize: startup.teamSize,
        submittedByRole: startup.submittedByRole,
        contactEmail: startup.contactEmail,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!record) {
      throw new BadRequestException(`Startup ${startupId} not found`);
    }

    const updates: Partial<typeof startup.$inferInsert> = {};
    const updatedFields: Array<
      "website" | "stage" | "name" | "industry" | "location" | "description"
    > = [];

    const normalizedWebsite =
      normalizeWebsiteCandidate(extraction.website) ??
      extractWebsiteFromText(extraction.rawText);
    if (
      isMissingWebsiteValue(record.website) &&
      normalizedWebsite &&
      !isMissingWebsiteValue(normalizedWebsite)
    ) {
      updates.website = normalizedWebsite;
      updatedFields.push("website");
    }

    const mappedStage =
      mapStageToEnum(extraction.stage) ??
      extractStageFromText(extraction.rawText);
    if (isLikelyPlaceholderStage(record) && mappedStage) {
      updates.stage = mappedStage;
      updatedFields.push("stage");
    }

    const nameCandidate =
      this.sanitizeStartupName(extraction.companyName) ??
      this.extractCompanyNameFromRawText(extraction.rawText);
    if (nameCandidate && this.shouldUseExtractedStartupNameForPrefill(record.name, nameCandidate)) {
      updates.name = nameCandidate;
      updatedFields.push("name");
    }

    const industryCandidate = extraction.industry?.trim();
    if (
      industryCandidate &&
      !isLikelyPlaceholderText(industryCandidate) &&
      isLikelyPlaceholderText(record.industry)
    ) {
      updates.industry = industryCandidate;
      updatedFields.push("industry");
    }

    const locationCandidate = extraction.location?.trim();
    if (
      locationCandidate &&
      !isLikelyPlaceholderText(locationCandidate) &&
      isLikelyPlaceholderText(record.location)
    ) {
      updates.location = locationCandidate;
      updatedFields.push("location");
    }

    const descriptionCandidate = extraction.description?.trim();
    if (
      descriptionCandidate &&
      descriptionCandidate.length >= 20 &&
      record.description === STARTUP_DESCRIPTION_PLACEHOLDER
    ) {
      updates.description = descriptionCandidate;
      updatedFields.push("description");
    }

    if (updatedFields.length > 0) {
      await this.drizzle.db
        .update(startup)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(startup.id, startupId));
      this.logger.log(
        `[Pipeline] ${source === "pre-pipeline" ? "Pre-pipeline" : "Extraction-phase"} startup sync updated ${startupId}: ${updatedFields.join(", ")}`,
      );
    } else {
      this.logger.debug(
        `[Pipeline] ${source === "pre-pipeline" ? "Pre-pipeline" : "Extraction-phase"} startup sync produced no updates for ${startupId}`,
      );
    }

    return updatedFields;
  }

  async prefillCriticalFieldsFromDeckExtraction(startupId: string): Promise<{
    extractionSource: ExtractionResult["source"];
    updatedFields: Array<"website" | "stage" | "name" | "industry" | "location" | "description">;
    missingCriticalFields: Array<"website" | "stage">;
  }> {
    const extraction = await this.extractionService.run(startupId);
    this.extractionService.cacheResult(startupId, extraction);
    const updatedFields = await this.syncStartupFieldsFromExtractionResult(
      startupId,
      extraction,
      "pre-pipeline",
    );

    return {
      extractionSource: extraction.source,
      updatedFields,
      missingCriticalFields: await this.getMissingCriticalFields(startupId),
    };
  }

  async prepareFreshAnalysis(startupId: string): Promise<void> {
    this.extractionService.clearExtractionCache(startupId);

    await this.drizzle.db.transaction(async (tx) => {
      await tx
        .delete(startupEvaluation)
        .where(eq(startupEvaluation.startupId, startupId));

      await tx
        .update(startup)
        .set({
          overallScore: null,
          percentileRank: null,
          updatedAt: new Date(),
        })
        .where(eq(startup.id, startupId));
    });
  }

  async startPipeline(
    startupId: string,
    userId: string,
    options?: {
      skipExtraction?: boolean;
    },
  ): Promise<string> {
    if (!this.aiConfig.isPipelineEnabled()) {
      throw new BadRequestException("AI pipeline is disabled");
    }

    const existing = await this.pipelineState.get(startupId);
    if (existing && existing.status === PipelineStatus.RUNNING) {
      throw new BadRequestException(
        `Pipeline already running for startup ${startupId}`,
      );
    }

    await this.assertPitchDeckStorageReady(startupId);

    await this.queue.removePipelineJobs(startupId);

    const state = await this.pipelineState.init(startupId, userId);
    await this.pipelineAgentTrace?.cleanupExpired().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to clean up expired agent traces: ${message}`);
    });
    await this.createPipelineRunRecord(state);
    await this.updateStartupStatus(startupId, StartupStatus.ANALYZING);
    await this.progressTracker.initProgress({
      startupId,
      userId,
      pipelineRunId: state.pipelineRunId,
      phases: this.phaseTransition.getConfig().phases.map((phase) => phase.phase),
    });

    if (options?.skipExtraction) {
      const priorExtraction =
        this.extractionService.getCachedResult(startupId) ??
        ((existing?.results?.[PipelinePhase.EXTRACTION] as ExtractionResult | undefined) ??
          null);

      if (priorExtraction) {
        await this.pipelineState.setPhaseResult(
          startupId,
          PipelinePhase.EXTRACTION,
          priorExtraction,
        );
        await this.pipelineState.updatePhase(
          startupId,
          PipelinePhase.EXTRACTION,
          PhaseStatus.COMPLETED,
        );
        await this.progressTracker.updatePhaseProgress({
          startupId,
          userId,
          pipelineRunId: state.pipelineRunId,
          phase: PipelinePhase.EXTRACTION,
          status: PhaseStatus.COMPLETED,
        });

        try {
          await this.syncStartupFieldsFromExtractionResult(
            startupId,
            priorExtraction,
            "pre-pipeline",
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[Pipeline] Failed to sync startup fields from reused extraction result for ${startupId}: ${message}`,
          );
        }

        const stateWithCompletedExtraction: PipelineState = {
          ...state,
          phases: {
            ...state.phases,
            [PipelinePhase.EXTRACTION]: {
              ...state.phases[PipelinePhase.EXTRACTION],
              status: PhaseStatus.COMPLETED,
            },
          },
          results: {
            ...state.results,
            [PipelinePhase.EXTRACTION]: priorExtraction,
          },
        };
        const decision =
          this.phaseTransition.decideNextPhases(stateWithCompletedExtraction);

        for (const phase of decision.queue) {
          await this.queuePhase({
            startupId,
            pipelineRunId: state.pipelineRunId,
            userId,
            phase,
            knownState: stateWithCompletedExtraction,
          });
        }

        await this.notifyPipelineLifecycle({
          userId,
          startupId,
          type: NotificationType.INFO,
          title: "Analysis started",
          message: "AI pipeline analysis has started.",
        });

        this.logger.log(
          `Started AI pipeline ${state.pipelineRunId} for startup ${startupId} using existing extraction output`,
        );
        return state.pipelineRunId;
      }
    }

    for (const phase of this.phaseTransition.getInitialPhases()) {
      await this.queuePhase({
        startupId,
        pipelineRunId: state.pipelineRunId,
        userId,
        phase,
        knownState: state,
      });
    }

    await this.notifyPipelineLifecycle({
      userId,
      startupId,
      type: NotificationType.INFO,
      title: "Analysis started",
      message: "AI pipeline analysis has started.",
    });

    this.logger.log(
      `Started AI pipeline ${state.pipelineRunId} for startup ${startupId}`,
    );
    return state.pipelineRunId;
  }

  private async assertPitchDeckStorageReady(startupId: string): Promise<void> {
    const [startupRecord] = await this.drizzle.db
      .select({
        pitchDeckPath: startup.pitchDeckPath,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!startupRecord?.pitchDeckPath) {
      return;
    }

    try {
      const exists = await this.storage.exists(startupRecord.pitchDeckPath);
      if (exists) {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Unable to verify pitch deck in storage for startup ${startupId}: ${message}`,
      );
    }

    throw new BadRequestException(
      `Pitch deck file is missing in storage for startup ${startupId}. Expected object key: ${startupRecord.pitchDeckPath}. Re-upload the file and retry the analysis.`,
    );
  }

  async getPipelineStatus(startupId: string): Promise<PipelineState | null> {
    return this.getPipelineStateWithSnapshotFallback(startupId);
  }

  async getTrackedProgress(startupId: string) {
    return this.progressTracker.getProgress(startupId);
  }

  async retryPhase(startupId: string, phase: PipelinePhase): Promise<void> {
    if (phase === PipelinePhase.EXTRACTION) {
      this.extractionService.clearExtractionCache(startupId);
    }
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }

    if (state.phases[phase].status !== PhaseStatus.FAILED) {
      throw new BadRequestException(`Phase "${phase}" is not in failed state`);
    }

    const newRunId = await this.beginManualRun(state, phase);
    await this.queue.removePipelineJobs(startupId);
    await this.updateStartupStatus(startupId, StartupStatus.ANALYZING);
    await this.pipelineState.clearPhaseResult(startupId, phase);
    await this.pipelineState.resetRetryCount(startupId, phase);
    await this.pipelineState.resetPhase(startupId, phase);
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId: state.userId,
      pipelineRunId: newRunId,
      phase,
      status: PhaseStatus.PENDING,
    });

    await this.queuePhase({ startupId, pipelineRunId: newRunId, userId: state.userId, phase });
  }

  async rerunFromPhase(
    startupId: string,
    phase: PipelinePhase,
    options?: { skipDownstream?: boolean },
  ): Promise<void> {
    const rerunStartedAt = Date.now();
    const state = await this.getPipelineStateWithSnapshotFallback(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }

    let phasesToReset = this.getPhasesFrom(phase);
    if (options?.skipDownstream) {
      phasesToReset = phasesToReset.filter((p) => p === phase);
    }
    if (!phasesToReset.length) {
      throw new BadRequestException(`Unknown phase "${phase}"`);
    }

    let stepStartedAt = Date.now();
    const newRunId = await this.beginManualRun(state, phase);
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: beginManualRun | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    const removedJobs = await this.queue.removePipelineJobs(startupId);
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: removePipelineJobs | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Removed: ${removedJobs} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    await this.updateStartupStatus(startupId, StartupStatus.ANALYZING);
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: updateStartupStatus | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    for (const phaseToReset of phasesToReset) {
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: phaseToReset,
        clearResult: true,
        skipProgressUpdate: true,
      });
    }
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: resetPhaseStateForRerun | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Phases: ${phasesToReset.join(", ")} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    await this.progressTracker.resetPhasesForRerun({
      startupId,
      userId: state.userId,
      pipelineRunId: newRunId,
      phases: phasesToReset,
    });
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: resetProgressForRerun(batch) | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Phases: ${phasesToReset.join(", ")} | Duration: ${Date.now() - stepStartedAt}ms`,
    );

    stepStartedAt = Date.now();
    await this.queuePhase({ startupId, pipelineRunId: newRunId, userId: state.userId, phase });
    this.logger.debug(
      `[Pipeline] Manual rerun setup | Step: queuePhase | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    this.logger.log(
      `[Pipeline] Manual rerun prepared | Startup: ${startupId} | Phase: ${phase} | Run: ${newRunId} | Total setup duration: ${Date.now() - rerunStartedAt}ms`,
    );
  }

  async retryAgent(startupId: string, request: RetryAgentRequest): Promise<void> {
    const state = await this.getPipelineStateWithSnapshotFallback(startupId);
    if (!state) {
      throw new Error(`Pipeline state for startup ${startupId} not found`);
    }
    if (!this.isValidAgentForPhase(request.phase, request.agentKey)) {
      throw new BadRequestException(
        `Agent "${request.agentKey}" is not valid for phase "${request.phase}"`,
      );
    }
    // No phase status guard — retryAgent creates a fresh manual run and
    // clears queued jobs, so it's safe even if the phase is stale/running
    // after a cancelled pipeline.

    const allKeys = request.agentKeys ?? [request.agentKey];
    const metadata: AgentRetryMetadata = {
      mode: "agent_retry",
      agentKey: allKeys[0],
      agentKeys: allKeys.length > 1 ? allKeys : undefined,
    };

    this.logger.log(
      `[retryAgent] Targeted rerun: phase=${request.phase}, agents=[${allKeys.join(", ")}], skipDownstream=${Boolean(request.skipDownstream)} | Startup: ${startupId}`,
    );

    const newRunId = await this.beginManualRun(state, request.phase);
    await this.queue.removePipelineJobs(startupId);
    await this.updateStartupStatus(startupId, StartupStatus.ANALYZING);

    if (request.phase === PipelinePhase.RESEARCH) {
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: PipelinePhase.RESEARCH,
        clearResult: false,
        preserveTelemetry: true,
      });
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: PipelinePhase.EVALUATION,
        clearResult: true,
      });
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: PipelinePhase.SYNTHESIS,
        clearResult: true,
      });

      await this.queuePhase({
        startupId,
        pipelineRunId: newRunId,
        userId: state.userId,
        phase: PipelinePhase.RESEARCH,
        metadata,
      });
      return;
    }

    await this.resetPhaseForRerun({
      startupId,
      userId: state.userId,
      pipelineRunId: newRunId,
      phase: PipelinePhase.EVALUATION,
      clearResult: false,
      preserveTelemetry: true,
    });

    if (!request.skipDownstream) {
      await this.resetPhaseForRerun({
        startupId,
        userId: state.userId,
        pipelineRunId: newRunId,
        phase: PipelinePhase.SYNTHESIS,
        clearResult: true,
      });
    } else {
      // Ensure synthesis stays in a terminal state so applyTransitions won't queue it.
      // beginManualRun → initProgress seeds from the old state, but if synthesis was
      // PENDING from a prior non-skip retry, it would get re-queued after evaluation completes.
      const synthStatus = (await this.pipelineState.get(startupId))?.phases[PipelinePhase.SYNTHESIS]?.status;
      if (synthStatus && !this.isPhaseStatusTerminal(synthStatus)) {
        await this.pipelineState.updatePhase(startupId, PipelinePhase.SYNTHESIS, PhaseStatus.COMPLETED);
        await this.progressTracker.updatePhaseProgress({
          startupId,
          userId: state.userId,
          pipelineRunId: newRunId,
          phase: PipelinePhase.SYNTHESIS,
          status: PhaseStatus.COMPLETED,
        });
      }
    }

    await this.queuePhase({
      startupId,
      pipelineRunId: newRunId,
      userId: state.userId,
      phase: PipelinePhase.EVALUATION,
      metadata,
    });
  }

  async cancelPipeline(
    startupId: string,
    options?: { reason?: string },
  ): Promise<{ removedJobs: number }> {
    const cancellationReason = options?.reason?.trim() || undefined;
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      const removedJobs = await this.queue.removePipelineJobs(startupId);
      this.errorRecovery.clearAllTimeoutsForStartup(startupId);

      // Mark any running agents as failed
      await this.drizzle.db
        .update(pipelineAgentRun)
        .set({ status: "failed", completedAt: new Date() })
        .where(
          and(
            eq(pipelineAgentRun.startupId, startupId),
            eq(pipelineAgentRun.status, "running"),
          ),
        );

      const trackedProgress = await this.progressTracker.getProgress(startupId);
      const [startupRecord] = await this.drizzle.db
        .select({ userId: startup.userId })
        .from(startup)
        .where(eq(startup.id, startupId))
        .limit(1);
      if (trackedProgress && startupRecord?.userId) {
        await this.progressTracker.setPipelineStatus({
          startupId,
          userId: startupRecord.userId,
          pipelineRunId: trackedProgress.pipelineRunId,
          status: PipelineStatus.CANCELLED,
          currentPhase: trackedProgress.currentPhase,
          error:
            cancellationReason ??
            "Cancelled without active pipeline runtime state",
        });
      }

      const startupStatus = await this.getStartupStatus(startupId);
      if (startupStatus === StartupStatus.ANALYZING) {
        await this.updateStartupStatus(startupId, StartupStatus.SUBMITTED);
      }

      this.logger.warn(
        `[Pipeline] Cancel requested for ${startupId} with no live state; removed ${removedJobs} queued job(s) and marked progress as cancelled when present${cancellationReason ? ` | reason: ${cancellationReason}` : ""}`,
      );
      return { removedJobs };
    }
    const alreadyCancelled = state.status === PipelineStatus.CANCELLED;

    const removedJobs = await this.queue.removePipelineJobs(startupId);
    this.errorRecovery.clearAllTimeoutsForStartup(startupId);

    // Mark any running agents as failed
    await this.drizzle.db
      .update(pipelineAgentRun)
      .set({ status: "failed", completedAt: new Date() })
      .where(
        and(
          eq(pipelineAgentRun.startupId, startupId),
          eq(pipelineAgentRun.status, "running"),
        ),
      );

    await this.pipelineState.setStatus(startupId, PipelineStatus.CANCELLED);
    await this.updatePipelineRunStatus(
      state.pipelineRunId,
      PipelineStatus.CANCELLED,
      cancellationReason,
    );
    await this.progressTracker.setPipelineStatus({
      startupId,
      userId: state.userId,
      pipelineRunId: state.pipelineRunId,
      status: PipelineStatus.CANCELLED,
      currentPhase: state.currentPhase,
      error: cancellationReason,
    });
    await this.updateStartupStatus(startupId, StartupStatus.SUBMITTED);
    if (!alreadyCancelled) {
      await this.notifyPipelineLifecycle({
        userId: state.userId,
        startupId,
        type: NotificationType.WARNING,
        title: "Analysis cancelled",
        message: cancellationReason
          ? `AI pipeline analysis was cancelled. ${cancellationReason}`
          : "AI pipeline analysis was cancelled.",
      });
    }

    return { removedJobs };
  }

  async onPhaseCompleted(
    startupId: string,
    phase: PipelinePhase,
  ): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return;
    }

    this.errorRecovery.clearPhaseTimeout(startupId, phase);
    await this.pipelineState.resetRetryCount(startupId, phase);
    try {
      await this.progressTracker.updatePhaseProgress({
        startupId,
        userId: state.userId,
        pipelineRunId: state.pipelineRunId,
        phase,
        status: PhaseStatus.COMPLETED,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Pipeline] Failed to persist completed progress for ${phase}; continuing transitions | Startup: ${startupId} | Run: ${state.pipelineRunId} | Error: ${message}`,
      );
    }
    await this.consumePhaseFeedbackSafely(startupId, phase);

    if (phase === PipelinePhase.EXTRACTION) {
      const extraction = (await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.EXTRACTION,
      )) as ExtractionResult | null;
      if (extraction) {
        try {
          await this.syncStartupFieldsFromExtractionResult(
            startupId,
            extraction,
            "phase-extraction",
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[Pipeline] Failed to sync startup fields from extraction phase output for ${startupId}: ${message}`,
          );
        }
      }
    }

    if (phase === PipelinePhase.SCRAPING) {
      const scraping = (await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.SCRAPING,
      )) as ScrapingResult | null;
      if (scraping?.logoUrl) {
        try {
          const [record] = await this.drizzle.db
            .select({ logoUrl: startup.logoUrl })
            .from(startup)
            .where(eq(startup.id, startupId))
            .limit(1);
          if (record && !record.logoUrl) {
            await this.drizzle.db
              .update(startup)
              .set({ logoUrl: scraping.logoUrl })
              .where(eq(startup.id, startupId));
            this.logger.log(
              `[Pipeline] Scraping-phase sync updated logoUrl for ${startupId}`,
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[Pipeline] Failed to sync logoUrl from scraping phase for ${startupId}: ${message}`,
          );
        }
      }
    }

    if (phase === PipelinePhase.EVALUATION) {
      await this.updatePipelineQualityFromEvaluation(state.startupId);
      await this.persistEvaluationSectionData(state.startupId);
    }
    await this.applyTransitions(startupId);
  }

  async onPhaseStarted(
    startupId: string,
    phase: PipelinePhase,
  ): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return;
    }

    const phaseConfig = this.phaseTransition.getPhaseConfig(phase);
    this.errorRecovery.clearPhaseTimeout(startupId, phase);
    this.errorRecovery.schedulePhaseTimeout({
      startupId,
      phase,
      timeoutMs: this.resolvePhaseTimeoutMs(phase, phaseConfig.timeoutMs),
      onTimeout: () => {
        void this.handlePhaseTimeout(startupId, phase);
      },
    });

    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId: state.userId,
      pipelineRunId: state.pipelineRunId,
      phase,
      status: PhaseStatus.RUNNING,
    });
  }

  async onPhaseFailed(
    startupId: string,
    phase: PipelinePhase,
    error: string,
  ): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return;
    }

    this.errorRecovery.clearPhaseTimeout(startupId, phase);
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId: state.userId,
      pipelineRunId: state.pipelineRunId,
      phase,
      status: PhaseStatus.FAILED,
      error,
    });

    const phaseConfig = this.phaseTransition.getPhaseConfig(phase);
    const retryCount = await this.pipelineState.incrementRetryCount(
      startupId,
      phase,
    );

    await this.errorRecovery.recordFailure({
      pipelineRunId: state.pipelineRunId,
      startupId,
      phase,
      retryCount,
      error: {
        message: error,
      },
    });

    if (retryCount <= phaseConfig.maxRetries) {
      const delayMs = this.errorRecovery.getRetryDelayMs(
        this.phaseTransition.getConfig().defaultRetryPolicy,
        retryCount,
      );
      await this.pipelineState.resetPhase(startupId, phase);
      await this.queuePhase({
        startupId,
        pipelineRunId: state.pipelineRunId,
        userId: state.userId,
        phase,
        delayMs,
        retryCount,
        waitingError: error,
      });
      return;
    }

    await this.applyTransitions(startupId, error);
  }

  async onAgentProgress(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    key: string;
    status: "pending" | "running" | "completed" | "failed";
    progress?: number;
    error?: string;
    attempt?: number;
    retryCount?: number;
    agentAttemptId?: string;
    phaseRetryCount?: number;
    usedFallback?: boolean;
    fallbackReason?: PipelineFallbackReason;
    rawProviderError?: string;
    lifecycleEvent?: "started" | "retrying" | "completed" | "failed" | "fallback";
    dataSummary?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.progressTracker.updateAgentProgress(params);
    if (!params.usedFallback) {
      return;
    }

    try {
      await this.pipelineState.setQuality(params.startupId, "degraded");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Pipeline] Failed to mark pipeline quality degraded after fallback agent output | Startup: ${params.startupId} | Phase: ${params.phase} | Agent: ${params.key} | Error: ${message}`,
      );
    }
  }

  async onPhaseSkipped<P extends PipelinePhase>(params: {
    startupId: string;
    pipelineRunId: string;
    userId: string;
    phase: P;
    reason: string;
    result?: PhaseResultMap[P];
    retryCount?: number;
  }): Promise<boolean> {
    const {
      startupId,
      pipelineRunId,
      userId,
      phase,
      reason,
      result,
      retryCount = 0,
    } = params;
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return false;
    }
    if (
      state.pipelineRunId !== pipelineRunId ||
      state.status !== PipelineStatus.RUNNING
    ) {
      return false;
    }

    const phaseStatus = state.phases[phase]?.status;
    if (
      phaseStatus === PhaseStatus.COMPLETED ||
      phaseStatus === PhaseStatus.FAILED
    ) {
      return false;
    }

    this.errorRecovery.clearPhaseTimeout(startupId, phase);
    if (result !== undefined) {
      await this.pipelineState.setPhaseResult(startupId, phase, result);
    }
    await this.pipelineState.updatePhase(startupId, phase, PhaseStatus.SKIPPED);
    await this.pipelineState.resetRetryCount(startupId, phase);
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId,
      pipelineRunId,
      phase,
      status: PhaseStatus.SKIPPED,
      retryCount,
    });
    await this.consumePhaseFeedbackSafely(startupId, phase);
    this.logger.log(
      `[Pipeline] Skipping ${phase} phase for ${startupId}: ${reason}`,
    );

    await this.applyTransitions(startupId);
    return true;
  }

  private async queuePhase(params: QueuePhaseParams): Promise<void> {
    const { startupId, pipelineRunId, userId, phase, delayMs = 0, retryCount = 0, waitingError, metadata, knownState } = params;
    const latestState = knownState ?? await this.pipelineState.get(startupId);
    if (!latestState) {
      this.logger.debug(
        `[Pipeline] Skipping queue for ${phase}; pipeline state missing for startup ${startupId}`,
      );
      return;
    }
    if (latestState.pipelineRunId !== pipelineRunId) {
      this.logger.debug(
        `[Pipeline] Skipping queue for ${phase}; stale run ${pipelineRunId} (current: ${latestState.pipelineRunId}) for startup ${startupId}`,
      );
      return;
    }
    if (latestState.status !== PipelineStatus.RUNNING) {
      this.logger.debug(
        `[Pipeline] Skipping queue for ${phase}; pipeline status is ${latestState.status} for startup ${startupId}`,
      );
      return;
    }
    if (latestState.phases[phase]?.status !== PhaseStatus.PENDING) {
      this.logger.debug(
        `[Pipeline] Skipping queue for ${phase}; phase status is ${latestState.phases[phase]?.status ?? "missing"} for startup ${startupId}`,
      );
      return;
    }

    if (phase === PipelinePhase.SCRAPING) {
      const enrichmentStatus = latestState.phases[PipelinePhase.ENRICHMENT]?.status;
      if (!this.isPhaseStatusTerminal(enrichmentStatus)) {
        this.logger.log(
          `[Pipeline] Deferring scraping queue for ${startupId}: waiting for enrichment to finish`,
        );
        return;
      }

    }

    if (phase === PipelinePhase.ENRICHMENT) {
      const criticalMissingFromStartup = await this.getMissingCriticalFields(startupId);
      const enrichmentNeed = await this.enrichmentService.assessNeed(startupId);
      const criticalMissingFromAssessment = this.normalizeCriticalMissingFields(
        enrichmentNeed.missingFields,
      );
      const extraction = await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.EXTRACTION,
      ) as ExtractionResult | null;
      const criticalMissingFromExtraction =
        this.deriveCriticalMissingFromExtraction(extraction);
      const criticalMissing = Array.from(
        new Set([
          ...criticalMissingFromStartup,
          ...criticalMissingFromAssessment,
          ...criticalMissingFromExtraction,
        ]),
      );
      const shouldRun = enrichmentNeed.shouldRun || criticalMissing.length > 0;

      if (!shouldRun) {
        this.logger.log(
          `[Pipeline] Enrichment assessNeed() returned shouldRun=false for ${startupId}; running lightweight enrichment pass to keep phase execution explicit`,
        );
      }

      if (!enrichmentNeed.shouldRun && criticalMissing.length > 0) {
        this.logger.warn(
          `[Pipeline] Enrichment assessNeed() returned shouldRun=false, but critical fields are missing for ${startupId}. Forcing enrichment run [${criticalMissing.join(", ")}]`,
        );
      }

      if (!this.aiConfig.isEnrichmentEnabled()) {
        this.logger.warn(
          `[Pipeline] AI_ENRICHMENT_ENABLED=false is ignored for ${startupId}; enrichment/gap-fill remains mandatory to prevent placeholder data from propagating`,
        );
      }
    }

    if (phase === PipelinePhase.RESEARCH) {
      const criticalMissing = await this.getCriticalMissingAfterEnrichment(startupId);
      if (criticalMissing.length > 0) {
        await this.notifyClaraMissingInfoForPipelineStart(startupId, criticalMissing, {
          pipelineRunId,
        });
        const reason = this.buildAwaitingFounderInfoReason(
          criticalMissing,
          "before research",
        );
        this.logger.warn(
          `[Pipeline] Cancelling run for ${startupId}: unresolved critical fields before research [${criticalMissing.join(", ")}]`,
        );
        await this.cancelPipeline(startupId, { reason });
        return;
      }
    }

    const phaseConfig = this.phaseTransition.getPhaseConfig(phase);
    await this.pipelineState.updatePhase(
      startupId,
      phase,
      PhaseStatus.WAITING,
      waitingError,
    );
    await this.progressTracker.updatePhaseProgress({
      startupId,
      userId,
      pipelineRunId,
      phase,
      status: PhaseStatus.WAITING,
      error: waitingError,
      retryCount,
    });

    await this.queue.addJob(
      phaseConfig.queue,
      {
        type: this.typeByPhase[phase],
        startupId,
        pipelineRunId,
        userId,
        priority: 1,
        metadata: {
          retryCount,
          ...(metadata ?? {}),
        },
      },
      {
        delay: delayMs,
        attempts: 1,
      },
    );
  }

  private resolvePhaseTimeoutMs(
    phase: PipelinePhase,
    configuredTimeoutMs: number,
  ): number {
    const normalizedConfiguredTimeout = Number.isFinite(configuredTimeoutMs)
      ? Math.max(1, Math.floor(configuredTimeoutMs))
      : 1;
    const config = this.aiConfig as Partial<AiConfigService>;
    if (phase === PipelinePhase.RESEARCH) {
      const researchHardTimeoutMs =
        typeof config.getResearchAgentHardTimeoutMs === "function"
          ? config.getResearchAgentHardTimeoutMs()
          : MIN_RESEARCH_PHASE_TIMEOUT_MS;
      const researchStaggerMs =
        typeof config.getResearchAgentStaggerMs === "function"
          ? config.getResearchAgentStaggerMs()
          : DEFAULT_RESEARCH_AGENT_STAGGER_MS;

      // All agents run in a single staggered wave. Budget = max stagger delay + single agent hard timeout.
      const maxStaggerDelayMs = Math.max(0, researchStaggerMs) * (RESEARCH_AGENT_COUNT - 1);
      const singleWaveBudgetMs = researchHardTimeoutMs + maxStaggerDelayMs;

      return Math.max(
        normalizedConfiguredTimeout,
        MIN_RESEARCH_PHASE_TIMEOUT_MS,
        singleWaveBudgetMs,
      );
    }

    if (phase === PipelinePhase.SYNTHESIS) {
      const synthesisHardTimeoutMs =
        typeof config.getSynthesisAgentHardTimeoutMs === "function"
          ? config.getSynthesisAgentHardTimeoutMs()
          : normalizedConfiguredTimeout;

      const synthesisBudgetMs = Math.max(
        normalizedConfiguredTimeout,
        Math.max(1, Math.floor(synthesisHardTimeoutMs)),
      );

      return synthesisBudgetMs + SYNTHESIS_PHASE_TIMEOUT_BUFFER_MS;
    }

    return normalizedConfiguredTimeout;
  }

  private async updateStartupStatus(
    startupId: string,
    status: StartupStatus,
  ): Promise<void> {
    await this.drizzle.db
      .update(startup)
      .set({ status })
      .where(eq(startup.id, startupId));
  }

  private async getStartupStatus(startupId: string): Promise<StartupStatus | null> {
    const [record] = await this.drizzle.db
      .select({ status: startup.status })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    return (record?.status as StartupStatus | undefined) ?? null;
  }

  private async finalizeStartupAfterPipelineCompletion(
    startupId: string,
    requestedBy: string,
  ): Promise<void> {
    const currentStatus = await this.getStartupStatus(startupId);

    if (currentStatus === StartupStatus.APPROVED) {
      try {
        await this.startupMatching.queueStartupMatching({
          startupId,
          requestedBy,
          triggerSource: "pipeline_completion",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Pipeline completed but deferred matching queue failed for startup ${startupId}: ${message}`,
        );
      }
      return;
    }

    if (currentStatus === StartupStatus.REJECTED) {
      return;
    }

    // Auto-approve investor private submissions after pipeline completion
    // so they appear in the investor dashboard. Matching is siloed to that investor only
    // (see StartupMatchingPipelineService + InvestorMatchingService restrictToInvestorId).
    const shouldAutoApprove = await this.isInvestorPrivateSubmission(startupId);
    if (shouldAutoApprove) {
      await this.drizzle.db
        .update(startup)
        .set({
          status: StartupStatus.APPROVED,
          approvedAt: new Date(),
        })
        .where(eq(startup.id, startupId));

      this.logger.log(
        `Auto-approved investor private submission ${startupId} after pipeline completion`,
      );

      try {
        await this.startupMatching.queueStartupMatching({
          startupId,
          requestedBy,
          triggerSource: "pipeline_completion",
          requireApproved: false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Auto-approved startup ${startupId} but matching queue failed: ${message}`,
        );
      }
      return;
    }

    await this.updateStartupStatus(startupId, StartupStatus.PENDING_REVIEW);
  }

  private async isInvestorPrivateSubmission(
    startupId: string,
  ): Promise<boolean> {
    const [record] = await this.drizzle.db
      .select({
        isPrivate: startup.isPrivate,
        submittedByRole: startup.submittedByRole,
      })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    return (
      record?.isPrivate === true &&
      record?.submittedByRole === UserRole.INVESTOR
    );
  }

  private async createPipelineRunRecord(state: PipelineState): Promise<void> {
    let runtimeSnapshot: Record<string, unknown>;
    try {
      runtimeSnapshot = await this.pipelineTemplateService.getRuntimeSnapshot(
        "pipeline",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Pipeline] Failed to capture runtime snapshot for startup ${state.startupId}; continuing with fallback metadata only: ${message}`,
      );
      runtimeSnapshot = {
        source: "unavailable",
        capturedAt: new Date().toISOString(),
        error: message,
      };
    }

    await this.drizzle.db.insert(pipelineRun).values({
      pipelineRunId: state.pipelineRunId,
      startupId: state.startupId,
      userId: state.userId,
      status: PipelineStatus.RUNNING,
      config: toJsonRecord(
        {
          phaseConfig: this.phaseTransition.getConfig(),
          runtimeSnapshot,
        },
        "pipeline config",
      ),
      startedAt: new Date(),
    });
  }

  private async updatePipelineRunStatus(
    pipelineRunId: string,
    status: PipelineStatus,
    error?: string,
  ): Promise<void> {
    await this.drizzle.db
      .update(pipelineRun)
      .set({
        status,
        completedAt:
          status === PipelineStatus.RUNNING ? null : new Date(),
        updatedAt: new Date(),
        error: error
          ? { message: error }
          : null,
      })
      .where(eq(pipelineRun.pipelineRunId, pipelineRunId));
  }

  private async updatePipelineQualityFromEvaluation(
    startupId: string,
  ): Promise<void> {
    const evaluation = await this.pipelineState.getPhaseResult(startupId, PipelinePhase.EVALUATION);

    const completed = evaluation?.summary?.completedAgents ?? 0;
    const minimum =
      evaluation?.summary?.minimumRequired ??
      this.phaseTransition.getConfig().minimumEvaluationAgents;
    const degraded = evaluation?.summary?.degraded ?? completed < minimum;

    if (degraded) {
      await this.pipelineState.setQuality(startupId, "degraded");
    }
  }

  /**
   * Persist per-agent evaluation data directly to the database.
   * This ensures results are visible immediately after evaluation completes,
   * even when synthesis is skipped (e.g. "Re-run only" agent retry).
   */
  private async persistEvaluationSectionData(startupId: string): Promise<void> {
    try {
      const evaluation = (await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.EVALUATION,
      )) as EvaluationResult | null;
      if (!evaluation) return;

      const sectionValues: Record<string, unknown> = {
        teamData: evaluation.team,
        teamScore: evaluation.team?.score ?? null,
        marketData: evaluation.market,
        marketScore: evaluation.market?.score ?? null,
        productData: evaluation.product,
        productScore: evaluation.product?.score ?? null,
        tractionData: evaluation.traction,
        tractionScore: evaluation.traction?.score ?? null,
        businessModelData: evaluation.businessModel,
        businessModelScore: evaluation.businessModel?.score ?? null,
        gtmData: evaluation.gtm,
        gtmScore: evaluation.gtm?.score ?? null,
        financialsData: evaluation.financials,
        financialsScore: evaluation.financials?.score ?? null,
        competitiveAdvantageData: evaluation.competitiveAdvantage,
        competitiveAdvantageScore: evaluation.competitiveAdvantage?.score ?? null,
        legalData: evaluation.legal,
        legalScore: evaluation.legal?.score ?? null,
        dealTermsData: evaluation.dealTerms,
        dealTermsScore: evaluation.dealTerms?.score ?? null,
        exitPotentialData: evaluation.exitPotential,
        exitPotentialScore: evaluation.exitPotential?.score ?? null,
      };

      await this.drizzle.db
        .insert(startupEvaluation)
        .values({ startupId, ...sectionValues })
        .onConflictDoUpdate({
          target: startupEvaluation.startupId,
          set: sectionValues,
        });

      this.logger.log(
        `[Pipeline] Persisted evaluation section data for ${startupId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Pipeline] Failed to persist evaluation section data for ${startupId}: ${message}`,
      );
    }
  }

  private async getPipelineStateWithSnapshotFallback(
    startupId: string,
  ): Promise<PipelineState | null> {
    const liveState = await this.pipelineState.get(startupId);
    if (liveState) {
      return liveState;
    }

    const startupStatus = await this.getStartupStatus(startupId);
    if (
      startupStatus === StartupStatus.DRAFT ||
      startupStatus === StartupStatus.SUBMITTED ||
      startupStatus === StartupStatus.ANALYZING
    ) {
      return null;
    }

    const snapshot = await this.pipelineStateSnapshots.getLatestReusableSnapshot(
      startupId,
    );
    if (!snapshot) {
      return null;
    }

    try {
      const restored = await this.pipelineState.restoreFromSnapshot(
        snapshot,
        startupId,
      );
      this.logger.log(
        `[Pipeline] Restored reusable pipeline state from DB snapshot for startup ${startupId} (run ${restored.pipelineRunId})`,
      );
      return restored;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Pipeline] Failed to restore pipeline state snapshot for startup ${startupId}: ${message}`,
      );
      return null;
    }
  }

  private async persistCompletedPipelineStateSnapshotSafely(
    startupId: string,
    expectedPipelineRunId: string,
  ): Promise<void> {
    try {
      const state = await this.pipelineState.get(startupId);
      if (!state) {
        this.logger.warn(
          `[Pipeline] Skipping DB snapshot persistence; pipeline state missing for startup ${startupId} after completion`,
        );
        return;
      }
      if (state.pipelineRunId !== expectedPipelineRunId) {
        this.logger.warn(
          `[Pipeline] Skipping DB snapshot persistence; current run ${state.pipelineRunId} does not match completed run ${expectedPipelineRunId} for startup ${startupId}`,
        );
        return;
      }
      if (state.status !== PipelineStatus.COMPLETED) {
        this.logger.warn(
          `[Pipeline] Skipping DB snapshot persistence; state status is ${state.status} (expected completed) for startup ${startupId}, run ${expectedPipelineRunId}`,
        );
        return;
      }

      await this.pipelineStateSnapshots.saveCompletedSnapshot(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Pipeline] Failed to persist reusable pipeline state snapshot for startup ${startupId}, run ${expectedPipelineRunId}: ${message}`,
      );
    }
  }

  private async applyTransitions(
    startupId: string,
    lastError?: string,
  ): Promise<void> {
    const refreshed = await this.pipelineState.get(startupId);
    if (!refreshed) {
      return;
    }
    const shouldNotifyTerminal =
      refreshed.status !== PipelineStatus.COMPLETED &&
      refreshed.status !== PipelineStatus.CANCELLED &&
      refreshed.status !== PipelineStatus.FAILED;

    const decision = this.phaseTransition.decideNextPhases(refreshed);

    this.logger.debug(
      `[Pipeline] Phase transition decision | Startup: ${startupId} | NextPhases: ${decision.queue.join(", ") || "none"} | Degraded: ${decision.degraded} | Complete: ${decision.pipelineComplete}`,
    );
    this.logger.debug(
      `[Pipeline] Phase statuses: ${JSON.stringify(Object.fromEntries(Object.entries(refreshed.phases).map(([k, v]) => [k, v.status])))}`,
    );

    if (decision.degraded) {
      await this.pipelineState.setQuality(startupId, "degraded");
    }

    if (decision.queue.length > 0) {
      this.logger.log(
        `[Pipeline] Queueing ${decision.queue.length} next phase(s): ${decision.queue.join(", ")}`,
      );
    }

    for (const phase of decision.queue) {
      await this.queuePhase({
        startupId,
        pipelineRunId: refreshed.pipelineRunId,
        userId: refreshed.userId,
        phase,
      });
    }

    if (!decision.pipelineComplete) {
      return;
    }

    const degradedCompletionReason =
      decision.degraded && !decision.blockedByRequiredFailure
        ? await this.resolveDegradedCompletionReason(startupId, lastError)
        : null;

    if (decision.blockedByRequiredFailure) {
      await this.pipelineState.setQuality(startupId, "degraded");
      const degradedReason = lastError ?? "Critical phase failed, completed with degraded output";
      await this.updatePipelineRunStatus(
        refreshed.pipelineRunId,
        PipelineStatus.COMPLETED,
        degradedReason,
      );
      await this.pipelineState.setStatus(startupId, PipelineStatus.COMPLETED);
      await this.progressTracker.setPipelineStatus({
        startupId,
        userId: refreshed.userId,
        pipelineRunId: refreshed.pipelineRunId,
        status: PipelineStatus.COMPLETED,
        currentPhase: refreshed.currentPhase,
        error: degradedReason,
      });
      await this.persistCompletedPipelineStateSnapshotSafely(
        startupId,
        refreshed.pipelineRunId,
      );
      await this.finalizeStartupAfterPipelineCompletion(startupId, refreshed.userId);
      if (shouldNotifyTerminal) {
        await this.notifyPipelineLifecycle({
          userId: refreshed.userId,
          startupId,
          type: NotificationType.WARNING,
          title: "Analysis completed with warnings",
          message: degradedReason,
        });
      }
      this.notifyClaraSafely(startupId, {
        pipelineRunId: refreshed.pipelineRunId,
        warningMessage: degradedReason,
      });
      return;
    }

    if (degradedCompletionReason) {
      await this.pipelineState.setStatus(startupId, PipelineStatus.COMPLETED);
      await this.updatePipelineRunStatus(
        refreshed.pipelineRunId,
        PipelineStatus.COMPLETED,
        degradedCompletionReason,
      );
      const synthesisResult = await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.SYNTHESIS,
      );
      await this.progressTracker.setPipelineStatus({
        startupId,
        userId: refreshed.userId,
        pipelineRunId: refreshed.pipelineRunId,
        status: PipelineStatus.COMPLETED,
        currentPhase: PipelinePhase.SYNTHESIS,
        overallScore: synthesisResult?.overallScore,
        error: degradedCompletionReason,
      });
      await this.persistCompletedPipelineStateSnapshotSafely(
        startupId,
        refreshed.pipelineRunId,
      );
      await this.finalizeStartupAfterPipelineCompletion(startupId, refreshed.userId);
      if (shouldNotifyTerminal) {
        await this.notifyPipelineLifecycle({
          userId: refreshed.userId,
          startupId,
          type: NotificationType.WARNING,
          title: "Analysis completed with warnings",
          message: degradedCompletionReason,
        });
      }
      this.notifyClaraSafely(startupId, {
        overallScore: synthesisResult?.overallScore,
        pipelineRunId: refreshed.pipelineRunId,
        warningMessage: degradedCompletionReason,
      });
      return;
    }

    await this.pipelineState.setStatus(startupId, PipelineStatus.COMPLETED);
    await this.updatePipelineRunStatus(
      refreshed.pipelineRunId,
      PipelineStatus.COMPLETED,
    );
    const synthesisResult = await this.pipelineState.getPhaseResult(startupId, PipelinePhase.SYNTHESIS);
    await this.progressTracker.setPipelineStatus({
      startupId,
      userId: refreshed.userId,
      pipelineRunId: refreshed.pipelineRunId,
      status: PipelineStatus.COMPLETED,
      currentPhase: PipelinePhase.SYNTHESIS,
      overallScore: synthesisResult?.overallScore,
    });
    await this.persistCompletedPipelineStateSnapshotSafely(
      startupId,
      refreshed.pipelineRunId,
    );
    await this.finalizeStartupAfterPipelineCompletion(startupId, refreshed.userId);
    if (shouldNotifyTerminal) {
      await this.notifyPipelineLifecycle({
        userId: refreshed.userId,
        startupId,
        type: NotificationType.SUCCESS,
        title: "Analysis completed",
        message: "AI pipeline analysis completed successfully.",
      });
    }

    // Notify Clara conversation if exists
    this.notifyClaraSafely(startupId, {
      overallScore: synthesisResult?.overallScore,
      pipelineRunId: refreshed.pipelineRunId,
    });
  }

  private async resolveDegradedCompletionReason(
    startupId: string,
    lastError?: string,
  ): Promise<string> {
    if (lastError && lastError.trim().length > 0) {
      return lastError.trim();
    }

    const synthesis = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.SYNTHESIS,
    );
    const confidenceNotes = synthesis?.dataConfidenceNotes?.trim();
    if (confidenceNotes) {
      return confidenceNotes;
    }

    return "Analysis completed with warnings; one or more agents used fallback output.";
  }

  private async notifyPipelineLifecycle(params: {
    userId: string;
    startupId: string;
    type: NotificationType;
    title: string;
    message: string;
  }): Promise<void> {
    const startupLabel = await this.getStartupLabel(params.startupId);
    try {
      await this.notifications.createAndBroadcast(
        params.userId,
        `${params.title}: ${startupLabel}`,
        params.message,
        params.type,
        `/admin/startup/${params.startupId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to send lifecycle notification for startup ${params.startupId}: ${message}`,
      );
    }
  }

  private async getStartupLabel(startupId: string): Promise<string> {
    try {
      const [record] = await this.drizzle.db
        .select({ name: startup.name })
        .from(startup)
        .where(eq(startup.id, startupId))
        .limit(1);
      if (record?.name) {
        return record.name;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Unable to fetch startup name for notification on ${startupId}: ${message}`,
      );
    }

    return `Startup ${startupId}`;
  }

  private notifyClaraSafely(
    startupId: string,
    options?: {
      overallScore?: number;
      pipelineRunId?: string;
      warningMessage?: string | null;
    },
  ): void {
    const clara = this.getClaraService();
    if (!clara?.isEnabled()) return;
    clara
      .notifyPipelineComplete(
        startupId,
        options?.overallScore,
        {
          ...(options?.pipelineRunId
            ? { pipelineRunId: options.pipelineRunId }
            : {}),
          ...(options?.warningMessage
            ? { warningMessage: options.warningMessage }
            : {}),
        },
      )
      .catch((err) => {
        this.logger.error(`Clara notification failed for ${startupId}: ${err}`);
      });
  }

  private async getCriticalMissingAfterEnrichment(
    startupId: string,
  ): Promise<Array<"website" | "stage">> {
    let enrichment: EnrichmentResult | null = null;
    try {
      enrichment = await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.ENRICHMENT,
      ) as EnrichmentResult | null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to load enrichment result for Clara missing-info notification on ${startupId}: ${message}`,
      );
    }

    const fromEnrichment = this.normalizeCriticalMissingFields(
      enrichment?.fieldsStillMissing,
    );
    let extraction: ExtractionResult | null = null;
    try {
      extraction = await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.EXTRACTION,
      ) as ExtractionResult | null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to load extraction result for critical-field fallback on ${startupId}: ${message}`,
      );
    }

    // Extraction raw-text heuristics are only a fallback signal.
    // After enrichment/replies, startup DB state is authoritative for stage/website.
    const fromExtraction = this.deriveCriticalMissingFromExtraction(extraction);
    const fallbackMissing = Array.from(
      new Set([...fromEnrichment, ...fromExtraction]),
    );

    try {
      const fromStartup = await this.getMissingCriticalFields(startupId);
      return Array.from(new Set([...fromEnrichment, ...fromStartup]));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to resolve critical missing fields from startup record for ${startupId}: ${message}`,
      );
      return fallbackMissing;
    }
  }

  private normalizeCriticalMissingFields(
    fields: unknown,
  ): Array<"website" | "stage"> {
    if (!Array.isArray(fields)) {
      return [];
    }
    return Array.from(
      new Set(
        fields
          .filter((field): field is string => typeof field === "string")
          .map((field) => field.trim().toLowerCase())
          .filter(
            (field): field is "website" | "stage" =>
              field === "website" || field === "stage",
          ),
      ),
    );
  }

  private async handlePhaseTimeout(
    startupId: string,
    phase: PipelinePhase,
  ): Promise<void> {
    const state = await this.pipelineState.get(startupId);
    if (!state) {
      return;
    }

    const status = state.phases[phase].status;
    if (status !== PhaseStatus.RUNNING) {
      return;
    }

    const phaseConfig = this.phaseTransition.getPhaseConfig(phase);
    const timeoutBudgetMs = this.resolvePhaseTimeoutMs(
      phase,
      phaseConfig.timeoutMs,
    );
    const startedAtMs = state.phases[phase].startedAt
      ? new Date(state.phases[phase].startedAt).getTime()
      : NaN;
    const elapsedMs = Number.isFinite(startedAtMs)
      ? Math.max(0, Date.now() - startedAtMs)
      : undefined;
    const message = `Phase "${phase}" timed out`;
    await this.recordDiagnosticTrace({
      startupId,
      pipelineRunId: state.pipelineRunId,
      userId: state.userId,
      phase,
      stepKey: "phase_timeout",
      error: message,
      failureSource: "phase_timeout",
      meta: {
        phaseStatus: status,
        timeoutBudgetMs,
        ...(typeof elapsedMs === "number" ? { elapsedMs } : {}),
      },
    });
    await this.pipelineState.updatePhase(startupId, phase, PhaseStatus.FAILED, message);
    await this.onPhaseFailed(startupId, phase, message);
  }

  private getPhasesFrom(phase: PipelinePhase): PipelinePhase[] {
    const orderedPhases = this.phaseTransition
      .getConfig()
      .phases.map((entry) => entry.phase);
    const index = orderedPhases.indexOf(phase);
    if (index < 0) {
      return [];
    }

    return orderedPhases.slice(index);
  }

  private isPhaseStatusTerminal(status: PhaseStatus | undefined): boolean {
    return (
      status === PhaseStatus.COMPLETED ||
      status === PhaseStatus.FAILED ||
      status === PhaseStatus.SKIPPED
    );
  }

  private async resetPhaseForRerun(params: {
    startupId: string;
    userId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    clearResult: boolean;
    preserveTelemetry?: boolean;
    skipProgressUpdate?: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    if (params.clearResult) {
      await this.pipelineState.clearPhaseResult(params.startupId, params.phase);
    }
    await this.pipelineState.resetRetryCount(params.startupId, params.phase);
    if (params.preserveTelemetry) {
      await this.pipelineState.resetPhaseStatus(params.startupId, params.phase);
    } else {
      await this.pipelineState.resetPhase(params.startupId, params.phase);
    }
    if (!params.skipProgressUpdate) {
      await this.progressTracker.updatePhaseProgress({
        startupId: params.startupId,
        userId: params.userId,
        pipelineRunId: params.pipelineRunId,
        phase: params.phase,
        status: PhaseStatus.PENDING,
      });
    }
    this.logger.debug(
      `[Pipeline] resetPhaseForRerun | Startup: ${params.startupId} | Run: ${params.pipelineRunId} | Phase: ${params.phase} | ClearResult: ${params.clearResult} | PreserveTelemetry: ${Boolean(params.preserveTelemetry)} | SkipProgressUpdate: ${Boolean(params.skipProgressUpdate)} | Duration: ${Date.now() - startedAt}ms`,
    );
  }

  private isValidAgentForPhase(
    phase: PipelinePhase.RESEARCH | PipelinePhase.EVALUATION,
    agentKey: string,
  ): boolean {
    const keys: readonly string[] =
      phase === PipelinePhase.RESEARCH ? RESEARCH_AGENT_KEYS : EVALUATION_AGENT_KEYS;
    return keys.includes(agentKey);
  }

  private async consumePhaseFeedbackSafely(
    startupId: string,
    phase: PipelinePhase,
  ): Promise<void> {
    try {
      await this.pipelineFeedback.markConsumedByScope({
        startupId,
        phase,
        agentKey: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to mark phase-level feedback consumed for ${phase}: ${message}`,
      );
    }
  }

  private async beginManualRun(
    state: PipelineState,
    currentPhase: PipelinePhase,
  ): Promise<string> {
    const startedAt = Date.now();
    const nextRunId = randomUUID();
    const initialPhaseStatuses = Object.fromEntries(
      Object.entries(state.phases).map(([phase, value]) => [
        phase,
        value.status,
      ]),
    ) as Partial<Record<PipelinePhase, PhaseStatus>>;

    if (state.status === PipelineStatus.RUNNING) {
      const cancelPrevStartedAt = Date.now();
      await this.updatePipelineRunStatus(
        state.pipelineRunId,
        PipelineStatus.CANCELLED,
        "Superseded by manual rerun",
      );
      this.logger.debug(
        `[Pipeline] beginManualRun | Step: cancelPreviousRunRecord | Startup: ${state.startupId} | PrevRun: ${state.pipelineRunId} | NextRun: ${nextRunId} | Duration: ${Date.now() - cancelPrevStartedAt}ms`,
      );
    }

    let stepStartedAt = Date.now();
    await this.pipelineState.setPipelineRunId(state.startupId, nextRunId);
    this.logger.debug(
      `[Pipeline] beginManualRun | Step: setPipelineRunId | Startup: ${state.startupId} | NextRun: ${nextRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    stepStartedAt = Date.now();
    await this.pipelineState.setStatus(state.startupId, PipelineStatus.RUNNING);
    this.logger.debug(
      `[Pipeline] beginManualRun | Step: setPipelineStatus(state) | Startup: ${state.startupId} | NextRun: ${nextRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    stepStartedAt = Date.now();
    await this.createPipelineRunRecord({
      ...state,
      pipelineRunId: nextRunId,
      status: PipelineStatus.RUNNING,
      quality: "standard",
    });
    this.logger.debug(
      `[Pipeline] beginManualRun | Step: createPipelineRunRecord | Startup: ${state.startupId} | NextRun: ${nextRunId} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    stepStartedAt = Date.now();
    await this.progressTracker.initProgress({
      startupId: state.startupId,
      userId: state.userId,
      pipelineRunId: nextRunId,
      phases: this.phaseTransition.getConfig().phases.map((entry) => entry.phase),
      initialPhaseStatuses,
      currentPhase,
    });
    this.logger.debug(
      `[Pipeline] beginManualRun | Step: initProgress | Startup: ${state.startupId} | NextRun: ${nextRunId} | CurrentPhase: ${currentPhase} | Duration: ${Date.now() - stepStartedAt}ms`,
    );
    this.logger.debug(
      `[Pipeline] beginManualRun | Total | Startup: ${state.startupId} | NextRun: ${nextRunId} | CurrentPhase: ${currentPhase} | Duration: ${Date.now() - startedAt}ms`,
    );

    return nextRunId;
  }
}
