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
  threadId: string;
  messageId: string;
  inboxId: string;
  subject: string | null;
  bodyText: string | null;
  fromEmail: string;
  fromName: string | null;
  attachments: AttachmentMeta[];
  conversationHistory: ConversationMessage[];
  investorUserId: string | null;
  startupId: string | null;
  conversationStatus: ConversationStatus;
}

export interface ConversationMessage {
  direction: MessageDirection;
  bodyText: string | null;
  subject: string | null;
  intent: string | null;
  createdAt: Date;
}
