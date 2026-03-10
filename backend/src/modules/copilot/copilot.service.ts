import { Injectable } from "@nestjs/common";
import { CopilotAuditService } from "./copilot-audit.service";
import type {
  CopilotActionExecutionResult,
  CopilotActor,
  CopilotPendingAction,
  CopilotRuntimeState,
  CopilotTurnContext,
  CopilotTurnResult,
} from "./interfaces/copilot.interface";

@Injectable()
export class CopilotService {
  constructor(private audit: CopilotAuditService) {}

  async handleTurn(params: {
    ctx: CopilotTurnContext;
    actor: CopilotActor;
    conversationId?: string | null;
    conversationMemory?: Record<string, unknown> | null;
    runtime: CopilotRuntimeState;
    runAgentLoop: () => Promise<string>;
    executePendingAction: (
      pendingAction: CopilotPendingAction,
    ) => Promise<CopilotActionExecutionResult>;
  }): Promise<CopilotTurnResult> {
    const {
      ctx,
      actor,
      conversationId = null,
      conversationMemory,
      runtime,
      runAgentLoop,
      executePendingAction,
    } = params;
    const pendingAction = this.readPendingAction(conversationMemory);
    const intent = this.readActionIntent(ctx.bodyText);

    if (pendingAction) {
      if (intent === "cancel") {
        await this.audit.record({
          actionKey: pendingAction.actionKey,
          status: "cancelled",
          actorUserId: actor.userId,
          actorRole: actor.role,
          actorEmail: ctx.fromEmail,
          channel: "email",
          threadId: ctx.threadId,
          conversationId,
          startupId: pendingAction.startupId ?? null,
          targetSummary: pendingAction.targetSummary,
          payload: pendingAction.payload,
        });
        return {
          replyText: `Cancelled the pending action for ${pendingAction.targetSummary}.`,
          pendingAction: null,
          clearPendingAction: true,
        };
      }

      if (intent === "confirm") {
        try {
          const execution = await executePendingAction(pendingAction);
          await this.audit.record({
            actionKey: pendingAction.actionKey,
            status: "executed",
            actorUserId: actor.userId,
            actorRole: actor.role,
            actorEmail: ctx.fromEmail,
            channel: "email",
            threadId: ctx.threadId,
            conversationId,
            startupId: pendingAction.startupId ?? null,
            targetSummary: pendingAction.targetSummary,
            payload: pendingAction.payload,
            result:
              execution.result && typeof execution.result === "object"
                ? (execution.result as Record<string, unknown>)
                : null,
          });
          return {
            replyText: execution.message,
            pendingAction: null,
            clearPendingAction: true,
          };
        } catch (error) {
          await this.audit.record({
            actionKey: pendingAction.actionKey,
            status: "failed",
            actorUserId: actor.userId,
            actorRole: actor.role,
            actorEmail: ctx.fromEmail,
            channel: "email",
            threadId: ctx.threadId,
            conversationId,
            startupId: pendingAction.startupId ?? null,
            targetSummary: pendingAction.targetSummary,
            payload: pendingAction.payload,
            result: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          return {
            replyText:
              error instanceof Error
                ? `I couldn't complete that action: ${error.message}`
                : "I couldn't complete that action.",
            pendingAction: null,
            clearPendingAction: true,
          };
        }
      }

      return {
        replyText: pendingAction.confirmationMessage,
        pendingAction,
        clearPendingAction: false,
      };
    }

    const replyText = await runAgentLoop();
    if (!runtime.pendingAction) {
      return {
        replyText,
        pendingAction: null,
        clearPendingAction: false,
      };
    }

    await this.audit.record({
      actionKey: runtime.pendingAction.actionKey,
      status: "proposed",
      actorUserId: actor.userId,
      actorRole: actor.role,
      actorEmail: ctx.fromEmail,
      channel: "email",
      threadId: ctx.threadId,
      conversationId,
      startupId: runtime.pendingAction.startupId ?? null,
      targetSummary: runtime.pendingAction.targetSummary,
      payload: runtime.pendingAction.payload,
    });

    return {
      replyText: runtime.pendingAction.confirmationMessage,
      pendingAction: runtime.pendingAction,
      clearPendingAction: false,
    };
  }

  private readPendingAction(
    conversationMemory?: Record<string, unknown> | null,
  ): CopilotPendingAction | null {
    const pendingAction = conversationMemory?.pendingAction;
    if (!pendingAction || typeof pendingAction !== "object" || Array.isArray(pendingAction)) {
      return null;
    }

    const action = pendingAction as Partial<CopilotPendingAction>;
    if (
      typeof action.actionKey !== "string" ||
      typeof action.confirmationMessage !== "string" ||
      typeof action.successMessage !== "string" ||
      typeof action.targetSummary !== "string" ||
      typeof action.payload !== "object" ||
      action.payload == null ||
      Array.isArray(action.payload)
    ) {
      return null;
    }

    return {
      actionKey: action.actionKey as CopilotPendingAction["actionKey"],
      confirmationMessage: action.confirmationMessage,
      successMessage: action.successMessage,
      targetSummary: action.targetSummary,
      payload: action.payload as Record<string, unknown>,
      startupId: action.startupId ?? null,
      matchId: action.matchId ?? null,
      noteId: action.noteId ?? null,
    };
  }

  private readActionIntent(bodyText: string | null): "confirm" | "cancel" | "other" {
    const normalized = (bodyText ?? "").trim().toLowerCase();
    if (/\bconfirm\b/.test(normalized)) {
      return "confirm";
    }
    if (/\bcancel\b/.test(normalized) || /\bnevermind\b/.test(normalized)) {
      return "cancel";
    }
    return "other";
  }
}
