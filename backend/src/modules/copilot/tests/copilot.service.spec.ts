import { beforeEach, describe, expect, it, jest } from "bun:test";
import { CopilotService } from "../copilot.service";
import type { CopilotPendingAction } from "../interfaces/copilot.interface";
import type { ClaraAgentRuntimeState } from "../../clara/interfaces/clara.interface";

describe("CopilotService", () => {
  let auditService: {
    record: jest.Mock;
  };
  let service: CopilotService;

  const createRuntime = (): ClaraAgentRuntimeState => ({
    replyHandled: false,
    replyText: null,
    replyAttachments: [],
    pendingAction: null,
  });

  const pendingAction: CopilotPendingAction = {
    actionKey: "toggle_saved_match",
    confirmationMessage:
      "I can save Acme to your shortlist. Reply CONFIRM to continue or CANCEL to stop.",
    successMessage: "Acme is now saved to your shortlist.",
    targetSummary: "Acme",
    payload: {
      startupId: "startup-1",
    },
    startupId: "startup-1",
  };

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    service = new CopilotService(auditService as never);
  });

  it("returns a deterministic confirmation reply when the agent proposes an action", async () => {
    const runtime = createRuntime();

    const result = await service.handleTurn({
      ctx: {
        bodyText: "save Acme to my shortlist",
        fromEmail: "investor@example.com",
        threadId: "thread-1",
      },
      actor: {
        userId: "investor-1",
        role: "investor",
      },
      conversationId: "conversation-1",
      conversationMemory: null,
      runtime,
      runAgentLoop: async () => {
        runtime.pendingAction = pendingAction;
        return "Working on it.";
      },
      executePendingAction: async () => {
        throw new Error("should not execute before confirmation");
      },
    });

    expect(result.replyText).toBe(pendingAction.confirmationMessage);
    expect(result.pendingAction).toEqual(pendingAction);
    expect(result.clearPendingAction).toBe(false);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: "toggle_saved_match",
        actorUserId: "investor-1",
        actorRole: "investor",
        conversationId: "conversation-1",
        startupId: "startup-1",
        status: "proposed",
      }),
    );
  });

  it("executes a pending action when the user replies with confirm", async () => {
    const runtime = createRuntime();
    const executePendingAction = jest.fn().mockResolvedValue({
      message: "Acme is now saved to your shortlist.",
      result: { startupId: "startup-1", isSaved: true },
    });

    const result = await service.handleTurn({
      ctx: {
        bodyText: "confirm",
        fromEmail: "investor@example.com",
        threadId: "thread-1",
      },
      actor: {
        userId: "investor-1",
        role: "investor",
      },
      conversationId: "conversation-1",
      conversationMemory: {
        pendingAction,
      },
      runtime,
      runAgentLoop: async () => {
        throw new Error("should not ask the model to handle confirmations");
      },
      executePendingAction,
    });

    expect(executePendingAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: pendingAction.actionKey,
        startupId: pendingAction.startupId,
      }),
    );
    expect(result.replyText).toBe("Acme is now saved to your shortlist.");
    expect(result.pendingAction).toBeNull();
    expect(result.clearPendingAction).toBe(true);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: "toggle_saved_match",
        status: "executed",
      }),
    );
  });

  it("cancels a pending action when the user replies with cancel", async () => {
    const runtime = createRuntime();

    const result = await service.handleTurn({
      ctx: {
        bodyText: "cancel",
        fromEmail: "investor@example.com",
        threadId: "thread-1",
      },
      actor: {
        userId: "investor-1",
        role: "investor",
      },
      conversationId: "conversation-1",
      conversationMemory: {
        pendingAction,
      },
      runtime,
      runAgentLoop: async () => {
        throw new Error("should not ask the model to handle cancellations");
      },
      executePendingAction: async () => {
        throw new Error("should not execute cancelled action");
      },
    });

    expect(result.replyText).toContain("Cancelled");
    expect(result.pendingAction).toBeNull();
    expect(result.clearPendingAction).toBe(true);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: "toggle_saved_match",
        status: "cancelled",
      }),
    );
  });
});
