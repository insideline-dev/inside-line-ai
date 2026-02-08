export interface AgentPrompt {
  id: string;
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
  topIndustries: { industry: string; count: number }[];
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
  id: string;
  investorThesisId?: string;
  senderEmail?: string;
  senderPhone?: string;
  senderName?: string;
  emailThreadId?: string;
  whatsappThreadId?: string;
  status: "active" | "waiting_response" | "resolved" | "archived";
  lastMessageAt?: string;
  currentStartupId?: string;
  context?: Record<string, unknown>;
  messageCount: number;
  isAuthenticated: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentMessage {
  id: string;
  conversationId: string;
  channel: "email" | "whatsapp" | "sms";
  direction: "inbound" | "outbound";
  content: string;
  intent?: "question" | "submission" | "follow_up" | "greeting" | "unknown";
  extractedEntities?: Record<string, unknown>;
  externalMessageId?: string;
  inReplyToMessageId?: string;
  attachments?: { name: string; url: string; type: string }[];
  aiResponseMetadata?: Record<string, unknown>;
  deliveryStatus?: string;
  deliveryError?: string;
  createdAt: string;
}

export interface AdminReview {
  id: string;
  startupId: string;
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
