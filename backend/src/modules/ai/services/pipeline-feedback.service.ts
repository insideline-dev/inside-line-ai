import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import {
  pipelineFeedback,
  type PipelineFeedback,
} from "../entities/pipeline-feedback.schema";
import { PipelinePhase } from "../interfaces/pipeline.interface";

export interface RecordPipelineFeedbackInput {
  startupId: string;
  phase: PipelinePhase;
  agentKey?: string;
  feedback: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineFeedbackContext {
  items: PipelineFeedback[];
}

@Injectable()
export class PipelineFeedbackService {
  constructor(private drizzle: DrizzleService) {}

  async record(input: RecordPipelineFeedbackInput): Promise<PipelineFeedback> {
    const [created] = await this.drizzle.db
      .insert(pipelineFeedback)
      .values({
        startupId: input.startupId,
        phase: input.phase,
        agentKey: input.agentKey ?? null,
        feedback: input.feedback,
        createdBy: input.createdBy,
        metadata: input.metadata ?? null,
      })
      .returning();

    return created;
  }

  async getContext(params: {
    startupId: string;
    phase: PipelinePhase;
    agentKey?: string;
    limit?: number;
  }): Promise<PipelineFeedbackContext> {
    const limit = Math.max(1, Math.min(params.limit ?? 5, 200));
    const filters = [
      eq(pipelineFeedback.startupId, params.startupId),
      eq(pipelineFeedback.phase, params.phase),
      isNull(pipelineFeedback.consumedAt),
    ];

    if (params.agentKey) {
      filters.push(eq(pipelineFeedback.agentKey, params.agentKey));
    }

    const items = await this.drizzle.db
      .select()
      .from(pipelineFeedback)
      .where(and(...filters))
      .orderBy(desc(pipelineFeedback.createdAt))
      .limit(limit);

    return { items };
  }

  async markConsumedByScope(params: {
    startupId: string;
    phase: PipelinePhase;
    agentKey?: string | null;
  }): Promise<number> {
    const filters = [
      eq(pipelineFeedback.startupId, params.startupId),
      eq(pipelineFeedback.phase, params.phase),
      isNull(pipelineFeedback.consumedAt),
    ];

    if (params.agentKey === null) {
      filters.push(isNull(pipelineFeedback.agentKey));
    } else if (typeof params.agentKey === "string") {
      filters.push(eq(pipelineFeedback.agentKey, params.agentKey));
    }

    const rows = await this.drizzle.db
      .update(pipelineFeedback)
      .set({
        consumedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(...filters))
      .returning({ id: pipelineFeedback.id });

    return rows.length;
  }

  async markConsumed(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const rows = await this.drizzle.db
      .update(pipelineFeedback)
      .set({
        consumedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(pipelineFeedback.id, ids),
          isNull(pipelineFeedback.consumedAt),
        ),
      )
      .returning({ id: pipelineFeedback.id });

    return rows.length;
  }
}
