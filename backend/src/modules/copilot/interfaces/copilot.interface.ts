export type CopilotActionKey =
  | "create_note"
  | "update_note"
  | "toggle_saved_match"
  | "update_match_status"
  | "reanalyze_startup";

export type CopilotActionAuditStatus =
  | "proposed"
  | "executed"
  | "cancelled"
  | "failed";

export interface CopilotPendingAction {
  actionKey: CopilotActionKey;
  confirmationMessage: string;
  successMessage: string;
  targetSummary: string;
  payload: Record<string, unknown>;
  startupId?: string | null;
  matchId?: string | null;
  noteId?: string | null;
}

export interface CopilotActor {
  userId: string | null;
  role: string | null;
}

export interface CopilotTurnContext {
  bodyText: string | null;
  fromEmail: string;
  threadId: string;
}

export interface CopilotRuntimeState {
  pendingAction: CopilotPendingAction | null;
}

export interface CopilotTurnResult {
  replyText: string;
  pendingAction: CopilotPendingAction | null;
  clearPendingAction: boolean;
}

export interface CopilotActionExecutionResult {
  message: string;
  result?: unknown;
}

export interface CopilotActionAuditInput {
  actionKey: CopilotActionKey;
  status: CopilotActionAuditStatus;
  actorUserId: string | null;
  actorRole: string | null;
  actorEmail: string;
  threadId: string;
  channel: "email" | "other";
  conversationId?: string | null;
  startupId?: string | null;
  targetSummary?: string | null;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
}
