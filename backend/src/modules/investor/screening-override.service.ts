import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { desc, eq, inArray } from "drizzle-orm";
import { DrizzleService } from "../../database";
import { UserRole } from "../../auth/entities/auth.schema";
import { startup } from "../startup/entities/startup.schema";
import { screeningDecision } from "../ai/entities/screening-decision.schema";
import {
  screeningDecisionOverride,
  type ScreeningDecisionOverrideRow,
  type ScreeningVerdict,
} from "../ai/entities/screening-decision-override.schema";
import { isVerdict } from "./screening-queue.service";
import { CalibrationRecomputeService } from "./calibration-recompute.service";
import { OpenQuestionService } from "../dd/open-question.service";
import { PipelineService } from "../ai/services/pipeline.service";
import { PipelinePhase } from "../ai/interfaces/pipeline.interface";
import { DealEventService } from "../startup/deal-event.service";

export interface ScreeningOverrideActor {
  id: string;
  role: UserRole;
}

export interface ScreeningOverrideInput {
  startupId: string;
  actor: ScreeningOverrideActor;
  targetClassification: ScreeningVerdict;
  reason: string;
  reasonCode?: string;
  source: "investor" | "admin";
}

export interface ScreeningOverrideAuditEntry {
  id: string;
  screeningDecisionId: string;
  startupId: string;
  actorUserId: string;
  actorRole: string;
  previousClassification: ScreeningVerdict;
  newClassification: ScreeningVerdict;
  reason: string;
  reasonCode: string | null;
  createdAt: string;
}

@Injectable()
export class ScreeningOverrideService {
  private readonly logger = new Logger(ScreeningOverrideService.name);

  constructor(
    private drizzle: DrizzleService,
    private calibrationRecompute: CalibrationRecomputeService,
    private openQuestions: OpenQuestionService,
    private pipelineService: PipelineService,
    private dealEvents: DealEventService,
  ) {}

  async createOverride(input: ScreeningOverrideInput): Promise<ScreeningOverrideAuditEntry> {
    const reason = input.reason.trim();
    if (reason.length < 3) {
      throw new BadRequestException("Override reason is required");
    }

    const startupOwnerId = await this.getStartupOwnerId(input.startupId);
    const decision = await this.getLatestDecision(input.startupId);
    if (!decision) {
      throw new NotFoundException("Screening decision not found");
    }

    await this.assertCanOverride(input.actor, input.startupId, input.source);

    const currentClassification = await this.getEffectiveClassification(
      decision.id,
      decision.classification,
    );
    if (currentClassification === input.targetClassification) {
      throw new BadRequestException("Target verdict matches the current verdict");
    }

    const [row] = await this.drizzle.db
      .insert(screeningDecisionOverride)
      .values({
        screeningDecisionId: decision.id,
        startupId: input.startupId,
        actorUserId: input.actor.id,
        actorRole: input.actor.role,
        previousClassification: currentClassification,
        newClassification: input.targetClassification,
        reason,
        reasonCode: input.reasonCode?.trim() || null,
        metadata: { source: input.source },
      })
      .returning();

    const auditEntry = this.toAuditEntry(row);
    void this.calibrationRecompute
      .enqueueRecompute(startupOwnerId, { force: false })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Auto-recompute enqueue failed for investor=${startupOwnerId}: ${message}`,
        );
      });

    if (input.targetClassification === "advance") {
      // Update the base screening_decision classification so the gate sees "advance"
      await this.drizzle.db
        .update(screeningDecision)
        .set({ classification: "advance" })
        .where(eq(screeningDecision.id, decision.id));

      void this.openQuestions
        .dismissTriageDecisionQuestions(input.startupId)
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Auto-dismiss open questions failed for startup=${input.startupId}: ${message}`,
          );
        });

      // Trigger evaluation → synthesis pipeline (same pattern as advanceFromScreening)
      void this.triggerDdPipeline(input.startupId, input.actor.id).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `DD pipeline trigger failed for startup=${input.startupId}: ${message}`,
        );
      });
    }

    return auditEntry;
  }

  /**
   * Trigger DD pipeline (research → evaluation → synthesis) after an advance override.
   * Prefer continuing from RESEARCH. If the startup is old and its cached
   * pipeline state is gone, restart the full pipeline from the beginning so
   * the deal gets re-screened instead of failing.
   */
  private async triggerDdPipeline(startupId: string, actorId: string): Promise<void> {
    let path: "rerun_from_research" | "fresh_full_pipeline" =
      "rerun_from_research";

    try {
      await this.pipelineService.rerunFromPhase(startupId, PipelinePhase.RESEARCH);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isStateMissing = /not found/i.test(message);
      if (!isStateMissing) {
        throw err;
      }

      await this.pipelineService.startPipeline(startupId, actorId);
      path = "fresh_full_pipeline";
    }

    void this.dealEvents.record({
      startupId,
      actorUserId: actorId,
      type: "due_diligence.started",
      payload: {
        trigger: "screening_override_advance",
        path,
      },
    });
  }

  async getOverridesForDecisionIds(
    decisionIds: string[],
  ): Promise<Map<string, ScreeningOverrideAuditEntry[]>> {
    if (decisionIds.length === 0) return new Map();

    const rows = await this.drizzle.db
      .select()
      .from(screeningDecisionOverride)
      .where(inArray(screeningDecisionOverride.screeningDecisionId, decisionIds))
      .orderBy(
        desc(screeningDecisionOverride.createdAt),
        desc(screeningDecisionOverride.id),
      );

    const out = new Map<string, ScreeningOverrideAuditEntry[]>();
    for (const row of rows) {
      const existing = out.get(row.screeningDecisionId) ?? [];
      existing.push(this.toAuditEntry(row));
      out.set(row.screeningDecisionId, existing);
    }
    return out;
  }

  private async getStartupOwnerId(startupId: string): Promise<string> {
    const [row] = await this.drizzle.db
      .select({ userId: startup.userId })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    if (!row) throw new NotFoundException("Startup not found");
    return row.userId;
  }

  private async getLatestDecision(startupId: string): Promise<{ id: string; classification: string } | null> {
    const [decision] = await this.drizzle.db
      .select({ id: screeningDecision.id, classification: screeningDecision.classification })
      .from(screeningDecision)
      .where(eq(screeningDecision.startupId, startupId))
      .orderBy(desc(screeningDecision.createdAt))
      .limit(1);

    return decision ?? null;
  }

  private async getEffectiveClassification(
    screeningDecisionId: string,
    fallbackClassification: string,
  ): Promise<ScreeningVerdict> {
    const [latestOverride] = await this.drizzle.db
      .select({ newClassification: screeningDecisionOverride.newClassification })
      .from(screeningDecisionOverride)
      .where(eq(screeningDecisionOverride.screeningDecisionId, screeningDecisionId))
      .orderBy(desc(screeningDecisionOverride.createdAt), desc(screeningDecisionOverride.id))
      .limit(1);

    const value = latestOverride?.newClassification ?? fallbackClassification;
    return isVerdict(value) ? value : "review";
  }

  private async assertCanOverride(
    actor: ScreeningOverrideActor,
    startupId: string,
    source: "investor" | "admin",
  ): Promise<void> {
    if (source === "admin") {
      if (actor.role !== UserRole.ADMIN) {
        throw new ForbiddenException("Admin role required");
      }
      const exists = await this.startupExists(startupId);
      if (!exists) throw new NotFoundException("Startup not found");
      return;
    }

    // Investors don't own startups (startup.userId is the founder).
    // Instead, verify the startup has a screening decision — if it's in
    // the screening pipeline, the investor has access to override it.
    const [decision] = await this.drizzle.db
      .select({ id: screeningDecision.id })
      .from(screeningDecision)
      .where(eq(screeningDecision.startupId, startupId))
      .limit(1);

    if (!decision) {
      throw new ForbiddenException("No screening decision exists for this startup");
    }
  }

  private async startupExists(startupId: string): Promise<boolean> {
    const [row] = await this.drizzle.db
      .select({ id: startup.id })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);
    return Boolean(row);
  }

  private toAuditEntry(row: ScreeningDecisionOverrideRow): ScreeningOverrideAuditEntry {
    return {
      id: row.id,
      screeningDecisionId: row.screeningDecisionId,
      startupId: row.startupId,
      actorUserId: row.actorUserId,
      actorRole: row.actorRole,
      previousClassification: isVerdict(row.previousClassification)
        ? row.previousClassification
        : "review",
      newClassification: isVerdict(row.newClassification)
        ? row.newClassification
        : "review",
      reason: row.reason,
      reasonCode: row.reasonCode,
      createdAt:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }
}
