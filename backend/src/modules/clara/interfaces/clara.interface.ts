export enum ClaraIntent {
  SUBMISSION = "submission",
  QUESTION = "question",
  REPORT_REQUEST = "report_request",
  FOLLOW_UP = "follow_up",
  GREETING = "greeting",
}

export enum ConversationStatus {
  ACTIVE = "active",
  AWAITING_INFO = "awaiting_info",
  PROCESSING = "processing",
  COMPLETED = "completed",
  ARCHIVED = "archived",
}

export enum MessageDirection {
  INBOUND = "inbound",
  OUTBOUND = "outbound",
}

export interface IntentClassification {
  intent: ClaraIntent;
  confidence: number;
  reasoning: string;
  extractedCompanyName?: string;
}

export interface AttachmentMeta {
  filename: string;
  contentType: string;
  attachmentId: string;
  storagePath?: string;
  isPitchDeck: boolean;
  status: "pending" | "downloaded" | "uploaded" | "failed";
}

export interface MessageContext {
  channel?: "email" | "whatsapp" | "other";
  threadId: string;
  messageId: string;
  inboxId: string;
  subject: string | null;
  bodyText: string | null;
  fromEmail: string;
  fromName: string | null;
  attachments: AttachmentMeta[];
  conversationHistory: ConversationMessage[];
  actorUserId: string | null;
  actorRole?: string | null;
  investorUserId: string | null;
  startupId: string | null;
  startupStage?: string | null;
  conversationStatus: ConversationStatus;
  conversationMemory?: Record<string, unknown> | null;
}

export interface ConversationMessage {
  direction: MessageDirection;
  bodyText: string | null;
  subject: string | null;
  intent: string | null;
  createdAt: Date;
}

export interface SubmissionResult {
  startupId: string;
  startupName: string;
  isDuplicate: boolean;
  isEnriched?: boolean;
  status: string;
  pipelineStarted?: boolean;
  missingFields?: Array<"website" | "stage">;
}

export interface ClaraAgentRuntimeState {
  replyHandled: boolean;
  replyText: string | null;
  replyAttachments: Array<{
    filename: string;
    contentType: string;
  }>;
}
