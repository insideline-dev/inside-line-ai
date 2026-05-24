import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { DrizzleService } from "../../database";
import type { ScreeningHandoffIssue } from "../ai/contracts/screening-output/v1.schema";
import {
  ddOpenQuestion,
  type DdOpenQuestionRow,
  type OpenQuestionStatus,
} from "./entities/open-question.schema";
import { UserRole } from "../../auth/entities/auth.schema";
import { startupMatch } from "../investor/entities/investor.schema";

@Injectable()
export class OpenQuestionService {
  private readonly logger = new Logger(OpenQuestionService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Upserts screening handoff issues into the DD ledger. Re-screening updates
   * open seeded rows but never overwrites resolved/dismissed entries.
   */
  async seedFromHandoff(
    startupId: string,
    issues: readonly ScreeningHandoffIssue[],
  ): Promise<{ seeded: number; updated: number }> {
    if (issues.length === 0) {
      return { seeded: 0, updated: 0 };
    }

    let seeded = 0;
    let updated = 0;

    for (const issue of issues) {
      const [existing] = await this.drizzle.db
        .select()
        .from(ddOpenQuestion)
        .where(
          and(
            eq(ddOpenQuestion.startupId, startupId),
            eq(ddOpenQuestion.key, issue.key),
          ),
        )
        .limit(1);

      if (!existing) {
        await this.drizzle.db.insert(ddOpenQuestion).values({
          startupId,
          key: issue.key,
          label: issue.label,
          summary: issue.summary,
          seedSource: "screening_seed",
          screeningSource: issue.source,
          status: "open",
        });
        seeded += 1;
        continue;
      }

      if (existing.status !== "open" || existing.seedSource !== "screening_seed") {
        continue;
      }

      await this.drizzle.db
        .update(ddOpenQuestion)
        .set({
          label: issue.label,
          summary: issue.summary,
          screeningSource: issue.source,
          updatedAt: new Date(),
        })
        .where(eq(ddOpenQuestion.id, existing.id));
      updated += 1;
    }

    this.logger.debug(
      `Seeded open questions for startup=${startupId}: ${seeded} new, ${updated} updated`,
    );
    return { seeded, updated };
  }

  async listForStartup(
    startupId: string,
    viewerUserId: string,
    viewerRole?: UserRole,
  ): Promise<DdOpenQuestionRow[]> {
    if (viewerRole !== UserRole.ADMIN) {
      await this.assertInvestorAccess(startupId, viewerUserId);
    }

    return this.drizzle.db
      .select()
      .from(ddOpenQuestion)
      .where(eq(ddOpenQuestion.startupId, startupId))
      .orderBy(asc(ddOpenQuestion.createdAt));
  }

  async update(
    startupId: string,
    questionId: string,
    viewerUserId: string,
    input: { status?: OpenQuestionStatus; ownerUserId?: string | null },
    viewerRole?: UserRole,
  ): Promise<DdOpenQuestionRow> {
    if (viewerRole !== UserRole.ADMIN) {
      await this.assertInvestorAccess(startupId, viewerUserId);
    }

    const [row] = await this.drizzle.db
      .select()
      .from(ddOpenQuestion)
      .where(
        and(
          eq(ddOpenQuestion.id, questionId),
          eq(ddOpenQuestion.startupId, startupId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException("Open question not found");
    }

    const updates: Partial<typeof ddOpenQuestion.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.status !== undefined) {
      updates.status = input.status;
      updates.resolvedAt =
        input.status === "resolved" || input.status === "dismissed"
          ? new Date()
          : null;
    }

    if (input.ownerUserId !== undefined) {
      updates.ownerUserId = input.ownerUserId;
    }

    const [updated] = await this.drizzle.db
      .update(ddOpenQuestion)
      .set(updates)
      .where(eq(ddOpenQuestion.id, questionId))
      .returning();

    return updated;
  }

  private async assertInvestorAccess(
    startupId: string,
    viewerUserId: string,
  ): Promise<void> {
    const [match] = await this.drizzle.db
      .select({ id: startupMatch.id })
      .from(startupMatch)
      .where(
        and(
          eq(startupMatch.startupId, startupId),
          eq(startupMatch.investorId, viewerUserId),
        ),
      )
      .limit(1);

    if (!match) {
      throw new ForbiddenException("No access to this deal");
    }
  }
}
