export interface AgentPrompt {
  id: number;
  agentKey: string;
  displayName: string;
  description?: string;
  category?: string;
  systemPrompt: string;
  humanPrompt?: string;
  tools?: string[];
  inputs?: { key: string; description: string; required: boolean }[];
  outputs?: { key: string; type: string; description: string }[];
  parentAgent?: string;
  executionOrder?: number;
  isParallel?: boolean;
  version: number;
  lastModifiedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Analytics {
  totalStartups: number;
  startupsByStatus: Record<string, number>;
  startupsByStage: Record<string, number>;
  averageScore: number;
  scoreDistribution: { range: string; count: number }[];
  submissionsOverTime: { date: string; count: number }[];
  topSectors: { sector: string; count: number }[];
  conversionRates: {
    submittedToAnalyzed: number;
    analyzedToApproved: number;
    approvedToMatched: number;
  };
}

export interface DashboardStats {
  pendingReview: number;
  analyzing: number;
  approved: number;
  rejected: number;
  totalStartups: number;
  totalInvestors: number;
  totalMatches: number;
  avgScore: number;
}

export interface AgentConversation {
  id: number;
  investorProfileId?: number;
  senderEmail?: string;
  senderPhone?: string;
  senderName?: string;
  emailThreadId?: string;
  whatsappThreadId?: string;
  status: "active" | "waiting_response" | "resolved" | "archived";
  lastMessageAt?: string;
  currentStartupId?: number;
  context?: Record<string, unknown>;
  messageCount: number;
  isAuthenticated: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentMessage {
  id: number;
  conversationId: number;
  channel: "email" | "whatsapp" | "sms";
  direction: "inbound" | "outbound";
  content: string;
  intent?: "question" | "submission" | "follow_up" | "greeting" | "unknown";
  extractedEntities?: Record<string, unknown>;
  externalMessageId?: string;
  inReplyToMessageId?: number;
  attachments?: { name: string; url: string; type: string }[];
  aiResponseMetadata?: Record<string, unknown>;
  deliveryStatus?: string;
  deliveryError?: string;
  createdAt: string;
}

export interface AdminReview {
  id: number;
  startupId: number;
  reviewerId: string;
  scoreOverride?: number;
  memoEdits?: Record<string, unknown>;
  adminNotes?: string;
  flaggedConcerns?: string[];
  investorVisibility?: Record<string, boolean>;
  decision?: string;
  reviewedAt?: string;
  createdAt: string;
}
