import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DrizzleService } from "../../../database";
import { pipelineStateSnapshot } from "../entities";
import {
  type PipelineState,
  PipelineStatus,
} from "../interfaces/pipeline.interface";

const SNAPSHOT_VERSION = 1;

@Injectable()
export class PipelineStateSnapshotService {
  private readonly logger = new Logger(PipelineStateSnapshotService.name);

  constructor(private drizzle: DrizzleService) {}

  async saveCompletedSnapshot(state: PipelineState): Promise<void> {
    if (state.status !== PipelineStatus.COMPLETED) {
      return;
    }

    try {
      await this.drizzle.db
        .insert(pipelineStateSnapshot)
        .values({
          startupId: state.startupId,
          pipelineRunId: state.pipelineRunId,
          status: state.status,
          reusable: true,
          snapshotVersion: SNAPSHOT_VERSION,
          snapshot: state as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: pipelineStateSnapshot.pipelineRunId,
          set: {
            status: state.status,
            reusable: true,
            snapshotVersion: SNAPSHOT_VERSION,
            snapshot: state as unknown as Record<string, unknown>,
            invalidReason: null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: pipelineStateSnapshot.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[PipelineStateSnapshot] Failed to save snapshot for startup ${state.startupId}, run ${state.pipelineRunId}: ${message}`,
      );
    }
  }

  async getLatestReusableSnapshot(startupId: string): Promise<unknown | null> {
    try {
      const [row] = await this.drizzle.db
        .select({
          snapshot: pipelineStateSnapshot.snapshot,
          pipelineRunId: pipelineStateSnapshot.pipelineRunId,
          snapshotVersion: pipelineStateSnapshot.snapshotVersion,
        })
        .from(pipelineStateSnapshot)
        .where(
          and(
            eq(pipelineStateSnapshot.startupId, startupId),
            eq(pipelineStateSnapshot.reusable, true),
            eq(pipelineStateSnapshot.status, PipelineStatus.COMPLETED),
          ),
        )
        .orderBy(desc(pipelineStateSnapshot.createdAt))
        .limit(1);

      if (!row?.snapshot) {
        return null;
      }

      return row.snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[PipelineStateSnapshot] Failed to load reusable snapshot for startup ${startupId}: ${message}`,
      );
      return null;
    }
  }
}
