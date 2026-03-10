import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../../database";
import { copilotActionAudit } from "./entities/copilot-action-audit.schema";
import type { CopilotActionAuditInput } from "./interfaces/copilot.interface";

@Injectable()
export class CopilotAuditService {
  constructor(private drizzle: DrizzleService) {}

  async record(input: CopilotActionAuditInput): Promise<void> {
    await this.drizzle.db.insert(copilotActionAudit).values({
      conversationId: input.conversationId ?? null,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      channel: input.channel,
      threadId: input.threadId,
      actionKey: input.actionKey,
      status: input.status,
      startupId: input.startupId ?? null,
      targetSummary: input.targetSummary ?? null,
      payload: input.payload ?? null,
      result: input.result ?? null,
    });
  }
}
