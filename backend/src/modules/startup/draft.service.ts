import { Injectable, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { startupDraft } from './entities/startup.schema';
import { SaveDraft } from './dto';

@Injectable()
export class DraftService {
  private readonly logger = new Logger(DraftService.name);

  constructor(private drizzle: DrizzleService) {}

  async save(startupId: string, userId: string, dto: SaveDraft) {
    return this.drizzle.withRLS(userId, async (db) => {
      const [existing] = await db
        .select()
        .from(startupDraft)
        .where(
          and(
            eq(startupDraft.startupId, startupId),
            eq(startupDraft.userId, userId),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(startupDraft)
          .set({
            draftData: dto.draftData,
            updatedAt: new Date(),
          })
          .where(eq(startupDraft.id, existing.id))
          .returning();

        this.logger.debug(`Updated draft for startup ${startupId}`);
        return updated;
      }

      const [created] = await db
        .insert(startupDraft)
        .values({
          startupId,
          userId,
          draftData: dto.draftData,
        })
        .returning();

      this.logger.debug(`Created draft for startup ${startupId}`);
      return created;
    });
  }

  async get(startupId: string, userId: string) {
    return this.drizzle.withRLS(userId, async (db) => {
      const [draft] = await db
        .select()
        .from(startupDraft)
        .where(
          and(
            eq(startupDraft.startupId, startupId),
            eq(startupDraft.userId, userId),
          ),
        )
        .limit(1);

      return draft ?? null;
    });
  }

  async delete(startupId: string) {
    await this.drizzle.db
      .delete(startupDraft)
      .where(eq(startupDraft.startupId, startupId));

    this.logger.debug(`Deleted draft for startup ${startupId}`);
  }
}
