import { 
  type User, 
  type InsertUser, 
  type Startup,
  type InsertStartup,
  type UpdateStartup,
  type StartupEvaluation,
  type InsertStartupEvaluation,
  type AdminReview,
  type InsertAdminReview,
  type InvestorProfile,
  type InsertInvestorProfile,
  type InvestmentThesis,
  type InsertInvestmentThesis,
  type InvestorMatch,
  type InsertInvestorMatch,
  type UserProfile,
  type InsertUserProfile,
  type TeamInvite,
  type InsertTeamInvite,
  type TeamMember,
  type InsertTeamMember,
  type LinkedinProfileCache,
  type InsertLinkedinProfileCache,
  type AgentPrompt,
  type InsertAgentPrompt,
  type UpdateAgentPrompt,
  type StageScoringWeights,
  type InsertStageScoringWeights,
  type UpdateStageScoringWeights,
  type InvestorScoringPreference,
  type InsertInvestorScoringPreference,
  type Notification,
  type InsertNotification,
  type InvestorPortalSettings,
  type InsertInvestorPortalSettings,
  type StartupDraft,
  type InsertStartupDraft,
  type UpdateStartupDraft,
  type AgentConversation,
  type InsertAgentConversation,
  type AgentMessage,
  type InsertAgentMessage,
  type AgentInbox,
  type InsertAgentInbox,
  type ScoutApplication,
  type InsertScoutApplication,
  startups,
  startupEvaluations,
  adminReviews,
  investorProfiles,
  investmentTheses,
  investorMatches,
  userProfiles,
  users,
  teamInvites,
  teamMembers,
  linkedinProfileCache,
  agentPrompts,
  stageScoringWeights,
  investorScoringPreferences,
  notifications,
  investorPortalSettings,
  startupDrafts,
  agentConversations,
  agentMessages,
  agentInboxes,
  scoutApplications
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray, gt, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: InsertUser): Promise<User>;
  
  // User Profiles
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  getAllUserProfiles(): Promise<UserProfile[]>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: string, profile: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;
  
  // Startups
  getStartup(id: number): Promise<Startup | undefined>;
  getStartupsByFounder(founderId: string): Promise<Startup[]>;
  getPrivateStartupsBySubmitter(submitterId: string): Promise<Startup[]>;
  getAllStartups(): Promise<Startup[]>;
  getStartupsByStatus(status: string): Promise<Startup[]>;
  createStartup(startup: InsertStartup): Promise<Startup>;
  updateStartup(id: number, updates: UpdateStartup): Promise<Startup | undefined>;
  deleteStartup(id: number): Promise<boolean>;
  
  // Startup Evaluations
  getEvaluation(startupId: number): Promise<StartupEvaluation | undefined>;
  createEvaluation(evaluation: InsertStartupEvaluation): Promise<StartupEvaluation>;
  updateEvaluation(id: number, updates: Partial<InsertStartupEvaluation>): Promise<StartupEvaluation | undefined>;
  upsertEvaluation(evaluation: InsertStartupEvaluation): Promise<StartupEvaluation>;
  
  // Admin Reviews
  getAdminReview(startupId: number): Promise<AdminReview | undefined>;
  createAdminReview(review: InsertAdminReview): Promise<AdminReview>;
  
  // Investor Profiles
  getInvestorProfile(userId: string): Promise<InvestorProfile | undefined>;
  getInvestorProfileById(id: number): Promise<InvestorProfile | undefined>;
  getAllInvestorProfiles(): Promise<InvestorProfile[]>;
  createInvestorProfile(profile: InsertInvestorProfile): Promise<InvestorProfile>;
  updateInvestorProfile(userId: string, updates: Partial<InsertInvestorProfile>): Promise<InvestorProfile | undefined>;
  
  // Investment Theses
  getInvestmentThesis(investorId: number): Promise<InvestmentThesis | undefined>;
  createOrUpdateThesis(investorId: number, thesis: Partial<InsertInvestmentThesis>): Promise<InvestmentThesis>;
  
  // Investor Matches
  getMatchesByInvestor(investorId: number): Promise<InvestorMatch[]>;
  getMatchesByStartup(startupId: number): Promise<InvestorMatch[]>;
  getMatchByInvestorAndStartup(investorId: number, startupId: number): Promise<InvestorMatch | undefined>;
  createMatch(match: InsertInvestorMatch): Promise<InvestorMatch>;
  updateMatchStatus(id: number, status: string, notes?: string): Promise<InvestorMatch | undefined>;
  updateMatchFitScore(id: number, fitScore: number, fitRationale: string): Promise<InvestorMatch | undefined>;
  
  // Team Invites
  getTeamInvitesByInvestorProfile(investorProfileId: number): Promise<TeamInvite[]>;
  createTeamInvite(invite: InsertTeamInvite): Promise<TeamInvite>;
  getTeamInviteByCode(inviteCode: string): Promise<TeamInvite | undefined>;
  updateTeamInviteStatus(id: number, status: "pending" | "accepted" | "expired" | "cancelled", acceptedByUserId?: string): Promise<TeamInvite | undefined>;
  
  // Team Members
  getTeamMembersByInvestorProfile(investorProfileId: number): Promise<TeamMember[]>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  removeTeamMember(id: number): Promise<void>;
  
  // LinkedIn Profile Cache
  getCachedLinkedinProfile(linkedinUrl: string): Promise<LinkedinProfileCache | undefined>;
  cacheLinkedinProfile(cache: InsertLinkedinProfileCache): Promise<LinkedinProfileCache>;
  invalidateLinkedinCache(linkedinUrl: string): Promise<void>;
  
  // Agent Prompts
  getAllAgentPrompts(): Promise<AgentPrompt[]>;
  getAgentPrompt(agentKey: string): Promise<AgentPrompt | undefined>;
  getAgentPromptById(id: number): Promise<AgentPrompt | undefined>;
  createAgentPrompt(prompt: InsertAgentPrompt): Promise<AgentPrompt>;
  updateAgentPrompt(agentKey: string, updates: UpdateAgentPrompt): Promise<AgentPrompt | undefined>;
  seedAgentPrompts(): Promise<void>;
  
  // Stage Scoring Weights
  getAllStageScoringWeights(): Promise<StageScoringWeights[]>;
  getStageScoringWeights(stage: string): Promise<StageScoringWeights | undefined>;
  upsertStageScoringWeights(data: InsertStageScoringWeights): Promise<StageScoringWeights>;
  updateStageScoringWeights(stage: string, updates: UpdateStageScoringWeights): Promise<StageScoringWeights | undefined>;
  seedStageScoringWeights(): Promise<void>;
  
  // Investor Scoring Preferences
  getInvestorScoringPreferences(investorId: number): Promise<InvestorScoringPreference[]>;
  getInvestorScoringPreference(investorId: number, stage: string): Promise<InvestorScoringPreference | undefined>;
  upsertInvestorScoringPreference(data: InsertInvestorScoringPreference): Promise<InvestorScoringPreference>;
  
  // Notifications
  getNotificationsByUser(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number, userId: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;
  
  // Investor Portal Settings
  getPortalSettingsByInvestorId(investorId: number): Promise<InvestorPortalSettings | undefined>;
  getPortalSettingsBySlug(slug: string): Promise<InvestorPortalSettings | undefined>;
  createPortalSettings(settings: InsertInvestorPortalSettings): Promise<InvestorPortalSettings>;
  updatePortalSettings(investorId: number, updates: Partial<InsertInvestorPortalSettings>): Promise<InvestorPortalSettings | undefined>;
  isSlugAvailable(slug: string, excludeInvestorId?: number): Promise<boolean>;
  
  // Startup Drafts
  getDraftsByFounder(founderId: string): Promise<StartupDraft[]>;
  getDraft(id: number): Promise<StartupDraft | undefined>;
  createDraft(draft: InsertStartupDraft): Promise<StartupDraft>;
  updateDraft(id: number, updates: UpdateStartupDraft): Promise<StartupDraft | undefined>;
  deleteDraft(id: number): Promise<boolean>;
  
  // Agent Conversations
  getConversation(id: number): Promise<AgentConversation | undefined>;
  getConversationByEmail(email: string): Promise<AgentConversation | undefined>;
  getConversationByPhone(phone: string): Promise<AgentConversation | undefined>;
  getConversationByEmailThread(emailThreadId: string): Promise<AgentConversation | undefined>;
  getConversationByWhatsAppThread(whatsappThreadId: string): Promise<AgentConversation | undefined>;
  getConversationsByInvestor(investorProfileId: number): Promise<AgentConversation[]>;
  getAllConversations(): Promise<AgentConversation[]>;
  createConversation(conversation: InsertAgentConversation): Promise<AgentConversation>;
  updateConversation(id: number, updates: Partial<InsertAgentConversation>): Promise<AgentConversation | undefined>;
  deleteConversation(id: number): Promise<boolean>;
  
  // Investor lookup by phone/email
  getInvestorProfileByPhone(phone: string): Promise<InvestorProfile | undefined>;
  getInvestorProfileByEmail(email: string): Promise<InvestorProfile | undefined>;
  getStartupsForInvestor(investorId: number): Promise<{ matched: Startup[]; submitted: Startup[] }>;
  
  // Agent Messages
  getMessage(id: number): Promise<AgentMessage | undefined>;
  getMessagesByConversation(conversationId: number): Promise<AgentMessage[]>;
  createMessage(message: InsertAgentMessage): Promise<AgentMessage>;
  updateMessage(id: number, updates: Partial<InsertAgentMessage>): Promise<AgentMessage | undefined>;
  
  // Agent Inboxes
  getActiveInbox(): Promise<AgentInbox | undefined>;
  getInbox(id: number): Promise<AgentInbox | undefined>;
  createInbox(inbox: InsertAgentInbox): Promise<AgentInbox>;
  updateInbox(id: number, updates: Partial<InsertAgentInbox>): Promise<AgentInbox | undefined>;
  
  // Data Import (for production migration)
  importStartup(startup: Startup): Promise<Startup>;
  importEvaluation(evaluation: StartupEvaluation): Promise<StartupEvaluation>;
  importThesis(thesis: InvestmentThesis): Promise<InvestmentThesis>;
  importScoringWeight(weight: StageScoringWeights): Promise<StageScoringWeights>;
  
  // Scout Applications
  getScoutApplication(id: number): Promise<ScoutApplication | undefined>;
  getScoutApplicationByUserId(userId: string): Promise<ScoutApplication | undefined>;
  getAllScoutApplications(): Promise<ScoutApplication[]>;
  getScoutApplicationsByStatus(status: string): Promise<ScoutApplication[]>;
  createScoutApplication(application: InsertScoutApplication): Promise<ScoutApplication>;
  updateScoutApplicationStatus(id: number, status: "approved" | "rejected", reviewedBy: string, reviewNotes?: string): Promise<ScoutApplication | undefined>;
  
  // Scout startups
  getStartupsByScout(scoutId: string): Promise<Startup[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async upsertUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .onConflictDoUpdate({ 
        target: users.id, 
        set: {
          username: insertUser.username,
          email: insertUser.email,
          firstName: insertUser.firstName,
          lastName: insertUser.lastName,
          profileImageUrl: insertUser.profileImageUrl,
          updatedAt: new Date()
        }
      })
      .returning();
    return user;
  }

  // User Profiles
  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async getAllUserProfiles(): Promise<UserProfile[]> {
    return await db.select().from(userProfiles);
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [created] = await db.insert(userProfiles).values(profile).returning();
    return created;
  }

  async updateUserProfile(userId: string, updates: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [updated] = await db
      .update(userProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return updated;
  }

  // Startups
  async getStartup(id: number): Promise<Startup | undefined> {
    const [startup] = await db.select().from(startups).where(eq(startups.id, id));
    return startup;
  }

  async getStartupsByFounder(founderId: string): Promise<Startup[]> {
    return db.select().from(startups).where(eq(startups.founderId, founderId)).orderBy(desc(startups.createdAt));
  }

  async getPrivateStartupsBySubmitter(submitterId: string): Promise<Startup[]> {
    return db.select().from(startups).where(
      and(
        eq(startups.founderId, submitterId),
        eq(startups.isPrivate, true)
      )
    ).orderBy(desc(startups.createdAt));
  }

  async getAllStartups(): Promise<Startup[]> {
    return db.select().from(startups).orderBy(desc(startups.createdAt));
  }

  async getStartupsByStatus(status: string): Promise<Startup[]> {
    return db.select().from(startups).where(eq(startups.status, status as any)).orderBy(desc(startups.createdAt));
  }

  async createStartup(startup: InsertStartup): Promise<Startup> {
    const [created] = await db.insert(startups).values(startup).returning();
    return created;
  }

  async updateStartup(id: number, updates: UpdateStartup): Promise<Startup | undefined> {
    const [updated] = await db
      .update(startups)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(startups.id, id))
      .returning();
    return updated;
  }

  async deleteStartup(id: number): Promise<boolean> {
    // First, clear any references in agent_conversations
    await db.update(agentConversations)
      .set({ currentStartupId: null })
      .where(eq(agentConversations.currentStartupId, id));
    
    // Then delete the startup
    const result = await db.delete(startups).where(eq(startups.id, id));
    return true;
  }

  // Startup Evaluations
  async getEvaluation(startupId: number): Promise<StartupEvaluation | undefined> {
    const [evaluation] = await db.select().from(startupEvaluations).where(eq(startupEvaluations.startupId, startupId));
    return evaluation;
  }

  async createEvaluation(evaluation: InsertStartupEvaluation): Promise<StartupEvaluation> {
    const [created] = await db.insert(startupEvaluations).values(evaluation).returning();
    return created;
  }

  async updateEvaluation(id: number, updates: Partial<InsertStartupEvaluation>): Promise<StartupEvaluation | undefined> {
    const [updated] = await db
      .update(startupEvaluations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(startupEvaluations.id, id))
      .returning();
    return updated;
  }

  async upsertEvaluation(evaluation: InsertStartupEvaluation): Promise<StartupEvaluation> {
    // Check if evaluation exists for this startup
    const existing = await this.getEvaluation(evaluation.startupId);
    if (existing) {
      // Update existing evaluation
      const [updated] = await db
        .update(startupEvaluations)
        .set({ ...evaluation, updatedAt: new Date() })
        .where(eq(startupEvaluations.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new evaluation
      return this.createEvaluation(evaluation);
    }
  }

  // Admin Reviews
  async getAdminReview(startupId: number): Promise<AdminReview | undefined> {
    const [review] = await db.select().from(adminReviews).where(eq(adminReviews.startupId, startupId));
    return review;
  }

  async createAdminReview(review: InsertAdminReview): Promise<AdminReview> {
    const [created] = await db.insert(adminReviews).values(review).returning();
    return created;
  }

  // Investor Profiles
  async getInvestorProfile(userId: string): Promise<InvestorProfile | undefined> {
    const [profile] = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, userId));
    return profile;
  }

  async getAllInvestorProfiles(): Promise<InvestorProfile[]> {
    return db.select().from(investorProfiles);
  }

  async getInvestorProfileById(id: number): Promise<InvestorProfile | undefined> {
    const [profile] = await db.select().from(investorProfiles).where(eq(investorProfiles.id, id));
    return profile;
  }

  async createInvestorProfile(profile: InsertInvestorProfile): Promise<InvestorProfile> {
    const [created] = await db.insert(investorProfiles).values(profile).returning();
    return created;
  }

  async updateInvestorProfile(userId: string, updates: Partial<InsertInvestorProfile>): Promise<InvestorProfile | undefined> {
    const [updated] = await db
      .update(investorProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(investorProfiles.userId, userId))
      .returning();
    return updated;
  }

  // Investment Theses
  async getInvestmentThesis(investorId: number): Promise<InvestmentThesis | undefined> {
    const [thesis] = await db.select().from(investmentTheses).where(eq(investmentTheses.investorId, investorId));
    return thesis;
  }

  async createOrUpdateThesis(investorId: number, thesisData: Partial<InsertInvestmentThesis>): Promise<InvestmentThesis> {
    const existing = await this.getInvestmentThesis(investorId);
    
    if (existing) {
      const [updated] = await db
        .update(investmentTheses)
        .set({ ...thesisData, updatedAt: new Date() })
        .where(eq(investmentTheses.investorId, investorId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(investmentTheses)
        .values({ ...thesisData, investorId } as InsertInvestmentThesis)
        .returning();
      return created;
    }
  }

  // Investor Matches
  async getMatchesByInvestor(investorId: number): Promise<InvestorMatch[]> {
    return db.select().from(investorMatches).where(eq(investorMatches.investorId, investorId)).orderBy(desc(investorMatches.matchedAt));
  }

  async getMatchesByStartup(startupId: number): Promise<InvestorMatch[]> {
    return db.select().from(investorMatches).where(eq(investorMatches.startupId, startupId));
  }

  async getMatchByInvestorAndStartup(investorId: number, startupId: number): Promise<InvestorMatch | undefined> {
    const [match] = await db.select().from(investorMatches)
      .where(and(eq(investorMatches.investorId, investorId), eq(investorMatches.startupId, startupId)));
    return match;
  }

  async createMatch(match: InsertInvestorMatch): Promise<InvestorMatch> {
    const [created] = await db.insert(investorMatches).values(match).returning();
    return created;
  }

  async updateMatchStatus(id: number, status: string, notes?: string): Promise<InvestorMatch | undefined> {
    const [updated] = await db
      .update(investorMatches)
      .set({ status, notes, actionTakenAt: new Date() })
      .where(eq(investorMatches.id, id))
      .returning();
    return updated;
  }

  async updateMatchFitScore(id: number, fitScore: number, fitRationale: string): Promise<InvestorMatch | undefined> {
    const [updated] = await db
      .update(investorMatches)
      .set({ thesisFitScore: fitScore, fitRationale })
      .where(eq(investorMatches.id, id))
      .returning();
    return updated;
  }

  // Team Invites
  async getTeamInvitesByInvestorProfile(investorProfileId: number): Promise<TeamInvite[]> {
    return db.select().from(teamInvites)
      .where(eq(teamInvites.investorProfileId, investorProfileId))
      .orderBy(desc(teamInvites.createdAt));
  }

  async createTeamInvite(invite: InsertTeamInvite): Promise<TeamInvite> {
    const [created] = await db.insert(teamInvites).values(invite).returning();
    return created;
  }

  async getTeamInviteByCode(inviteCode: string): Promise<TeamInvite | undefined> {
    const [invite] = await db.select().from(teamInvites)
      .where(eq(teamInvites.inviteCode, inviteCode));
    return invite;
  }

  async updateTeamInviteStatus(id: number, status: "pending" | "accepted" | "expired" | "cancelled", acceptedByUserId?: string): Promise<TeamInvite | undefined> {
    const updateData: Partial<TeamInvite> = { status };
    if (acceptedByUserId) {
      updateData.acceptedByUserId = acceptedByUserId;
      updateData.acceptedAt = new Date();
    }
    const [updated] = await db.update(teamInvites)
      .set(updateData)
      .where(eq(teamInvites.id, id))
      .returning();
    return updated;
  }

  // Team Members
  async getTeamMembersByInvestorProfile(investorProfileId: number): Promise<TeamMember[]> {
    return db.select().from(teamMembers)
      .where(eq(teamMembers.investorProfileId, investorProfileId))
      .orderBy(desc(teamMembers.joinedAt));
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const [created] = await db.insert(teamMembers).values(member).returning();
    return created;
  }

  async removeTeamMember(id: number): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  // LinkedIn Profile Cache
  async getCachedLinkedinProfile(linkedinUrl: string): Promise<LinkedinProfileCache | undefined> {
    const normalizedUrl = linkedinUrl.toLowerCase().trim().replace(/\/$/, '');
    const [cached] = await db.select().from(linkedinProfileCache)
      .where(and(
        eq(linkedinProfileCache.linkedinUrl, normalizedUrl),
        gt(linkedinProfileCache.expiresAt, new Date())
      ))
      .limit(1);
    return cached;
  }

  async cacheLinkedinProfile(cache: InsertLinkedinProfileCache): Promise<LinkedinProfileCache> {
    const normalizedUrl = cache.linkedinUrl.toLowerCase().trim().replace(/\/$/, '');
    
    // Upsert - try to update existing or insert new
    const existing = await db.select().from(linkedinProfileCache)
      .where(eq(linkedinProfileCache.linkedinUrl, normalizedUrl))
      .limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db.update(linkedinProfileCache)
        .set({
          profileData: cache.profileData,
          linkedinIdentifier: cache.linkedinIdentifier,
          fetchedAt: new Date(),
          expiresAt: cache.expiresAt,
        })
        .where(eq(linkedinProfileCache.linkedinUrl, normalizedUrl))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(linkedinProfileCache)
      .values({ ...cache, linkedinUrl: normalizedUrl })
      .returning();
    return created;
  }

  async invalidateLinkedinCache(linkedinUrl: string): Promise<void> {
    const normalizedUrl = linkedinUrl.toLowerCase().trim().replace(/\/$/, '');
    await db.delete(linkedinProfileCache)
      .where(eq(linkedinProfileCache.linkedinUrl, normalizedUrl));
  }

  async getAllCachedLinkedinProfiles(): Promise<LinkedinProfileCache[]> {
    return db.select().from(linkedinProfileCache)
      .where(gt(linkedinProfileCache.expiresAt, new Date()));
  }

  // Agent Prompts
  async getAllAgentPrompts(): Promise<AgentPrompt[]> {
    return db.select().from(agentPrompts).orderBy(agentPrompts.executionOrder);
  }

  async getAgentPrompt(agentKey: string): Promise<AgentPrompt | undefined> {
    const [prompt] = await db.select().from(agentPrompts).where(eq(agentPrompts.agentKey, agentKey));
    return prompt;
  }

  async getAgentPromptById(id: number): Promise<AgentPrompt | undefined> {
    const [prompt] = await db.select().from(agentPrompts).where(eq(agentPrompts.id, id));
    return prompt;
  }

  async createAgentPrompt(prompt: InsertAgentPrompt): Promise<AgentPrompt> {
    const [created] = await db.insert(agentPrompts).values(prompt).returning();
    return created;
  }

  async updateAgentPrompt(agentKey: string, updates: UpdateAgentPrompt): Promise<AgentPrompt | undefined> {
    const existing = await this.getAgentPrompt(agentKey);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(agentPrompts)
      .set({ 
        ...updates, 
        version: (existing.version || 1) + 1,
        updatedAt: new Date() 
      })
      .where(eq(agentPrompts.agentKey, agentKey))
      .returning();
    return updated;
  }

  async seedAgentPrompts(): Promise<void> {
    const existingPrompts = await this.getAllAgentPrompts();
    const existingKeys = new Set(existingPrompts.map(p => p.agentKey));
    
    console.log("[Seed] Checking for missing agent prompts...");
    
    const defaultPrompts: InsertAgentPrompt[] = [
      {
        agentKey: "orchestrator",
        displayName: "Startup Evaluation Orchestrator",
        description: "Controls and coordinates all analysis agents, managing parallel execution and result synthesis",
        category: "orchestrator",
        systemPrompt: "You are the orchestrator for the startup evaluation system. You coordinate multiple specialized agents to analyze startups comprehensively.",
        humanPrompt: "Evaluate startup: {companyName}",
        tools: ["parallel_execution", "result_aggregation"],
        inputs: [
          { key: "startupId", description: "ID of the startup to evaluate", required: true },
          { key: "autoApprove", description: "Whether to auto-approve after analysis", required: false }
        ],
        outputs: [
          { key: "evaluation", type: "object", description: "Complete startup evaluation" }
        ],
        parentAgent: null,
        executionOrder: 0,
        isParallel: false
      },
      {
        agentKey: "team",
        displayName: "Team Analysis Agent",
        description: "Evaluates founding team credentials, founder-market fit, track record, and team composition",
        category: "analysis",
        systemPrompt: `You are an elite VC Team Analyst Agent with deep expertise in founder evaluation. You analyze teams with the rigor of top-tier VCs like Sequoia, a16z, and Benchmark.

=== EVALUATION FRAMEWORK (Weight: 20% of total score) ===

**1. FOUNDER-MARKET FIT (40% of team score)**
Score based on direct domain expertise alignment:
- 90-100: Founders previously built/scaled a company in same space OR held C-level/VP roles at market leaders in this exact domain
- 75-89: Deep operational experience (5+ years) in adjacent space with transferable expertise
- 60-74: Relevant industry experience but not in core problem domain; strong general entrepreneurial background
- 40-59: Limited direct domain experience but strong technical/business fundamentals
- 0-39: No relevant domain experience; pure generalists

**2. TRACK RECORD (25% of team score)**
Evaluate prior achievements:
- Previous successful exits (acquisition $10M+, IPO)
- Tenure at tier-1 companies (FAANG, top startups, industry leaders)
- Previously raised institutional VC funding
- Built and scaled teams (10+ to 100+)
- Published patents, research, or industry recognition

**3. TEAM COMPOSITION (20% of team score)**
Assess role coverage and balance:
- CEO/Business Leader: Vision, fundraising, GTM, partnerships
- CTO/Technical Leader: Architecture, product development, technical hiring
- Industry Expert: Domain knowledge, customer relationships, market credibility
- CRITICAL: At {stage} stage, which roles are essential vs nice-to-have?

**4. EXECUTION CAPABILITY (15% of team score)**
Signals of ability to execute:
- Have they worked together before? (co-founder history reduces risk)
- Full-time commitment vs part-time/advisors
- Complementary skill sets (avoid overlap gaps)
- Speed indicators: How fast did they ship MVP? Raise funding?

=== SCORING GUIDELINES ===
- Be CRITICAL and data-driven. VCs reject 99% of deals.
- Adjust expectations by stage: Seed teams can have gaps; Series B should be complete
- Red flags: Solo non-technical founder in deep-tech, all-advisor team, no one with startup experience
- Green flags: Repeat founders, worked together before, domain expertise + execution track record`,
        humanPrompt: `Analyze this startup's founding team with VC-level rigor:

=== COMPANY CONTEXT ===
Company: {companyName}
Sector: {sector}
Stage: {stage}

Company Description:
{companyDescription}

=== PITCH DECK / BUSINESS CONTEXT ===
{deckContext}

=== TEAM MEMBERS WITH LINKEDIN DATA ===
{teamMembersData}

{adminGuidance}

=== EVALUATION INSTRUCTIONS ===
1. For each founder, assess their SPECIFIC relevance to this company's problem and market
2. Consider what skills/experience are CRITICAL for success in {sector} at {stage} stage
3. Identify gaps that could derail execution
4. Be rigorous - most startups fail due to team issues

Provide your comprehensive team evaluation.`,
        tools: ["linkedin_enrichment", "web_search"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "stage", description: "Funding stage", required: true },
          { key: "companyDescription", description: "Company description", required: true },
          { key: "deckContext", description: "Extracted pitch deck content", required: false },
          { key: "teamMembersData", description: "Team member profiles with LinkedIn data", required: true },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "founders", type: "array", description: "Individual founder evaluations" },
          { key: "teamComposition", type: "object", description: "Team composition analysis" },
          { key: "overallScore", type: "number", description: "Team score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 1,
        isParallel: true
      },
      {
        agentKey: "market",
        displayName: "Market Analysis Agent",
        description: "Analyzes TAM/SAM/SOM, market dynamics, competitive landscape, and validates market claims",
        category: "analysis",
        systemPrompt: `You are a VC Market Research Agent specializing in market analysis for investment memos.

Your role is to analyze:
1. TAM/SAM/SOM: Validate market size claims using bottom-up calculations
2. Market Growth (CAGR): Is the market expanding or contracting?
3. Why Now: Regulatory changes, technology shifts, or market timing
4. Competitive Landscape: Key players, positioning, and differentiation
5. Market Dynamics: Barriers to entry, network effects, winner-take-all dynamics

**CLAIM VALIDATION IS CRITICAL:**
- Compare any TAM, growth rate, or market size claims from the pitch deck against the web research findings
- If the deck claims a specific TAM (e.g., "$50B market"), verify this against independent research
- If the deck claims a growth rate (e.g., "40% CAGR"), validate against industry reports
- Flag any discrepancies between company claims and external data
- Rate the credibility of market claims (inflated, accurate, conservative)`,
        humanPrompt: `Analyze the market opportunity for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}
Location: {location}

=== EXTRACTED CONTEXT FROM DECK/WEBSITE ===
{researchContext}

Additional context from pitch materials:
{deckContext}

=== LIVE WEB RESEARCH ===
{webResearch}

{adminGuidance}

IMPORTANT: Compare the company's claims from the pitch deck against the web research findings. Flag any TAM, growth rate, or market position claims that don't match external data.`,
        tools: ["web_search", "market_research"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "website", description: "Company website URL", required: true },
          { key: "companyDescription", description: "Company description", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "location", description: "Company location", required: true },
          { key: "researchContext", description: "Research context from deck/website", required: false },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "webResearch", description: "Live web research results", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "Market analysis narrative" },
          { key: "marketCredibility", type: "number", description: "Market credibility score" },
          { key: "overallScore", type: "number", description: "Market score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 2,
        isParallel: true
      },
      {
        agentKey: "product",
        displayName: "Product Analysis Agent",
        description: "Evaluates product differentiation, technology readiness, competitive moat, and defensibility",
        category: "analysis",
        systemPrompt: `You are a VC Product/Technology Analyst Agent specializing in product evaluation.

Your role is to analyze:
1. Product Differentiation: What makes this product unique?
2. Technology Readiness: MVP, beta, production-ready?
3. Competitive Moat: Patents, network effects, data advantages
4. User Experience: Based on screenshots/demos if available
5. Scalability: Can the technology scale?

Extract specific features, tech stack, and assess defensibility of the product.`,
        humanPrompt: `Analyze the product for:

Company: {companyName}
Website: {website}
Description: {companyDescription}
Sector: {sector}
Stage: {stage}

=== DECK CONTEXT ===
{deckContext}

=== WEBSITE CONTENT ===
{websiteContent}

{adminGuidance}

Provide comprehensive product analysis.`,
        tools: ["web_scraping", "tech_detection"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "website", description: "Company website URL", required: true },
          { key: "companyDescription", description: "Company/product description", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "stage", description: "Funding stage", required: false },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "websiteContent", description: "Scraped website content", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "Product analysis narrative" },
          { key: "extractedFeatures", type: "array", description: "List of product features" },
          { key: "overallScore", type: "number", description: "Product score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 3,
        isParallel: true
      },
      {
        agentKey: "traction",
        displayName: "Traction Analysis Agent",
        description: "Analyzes growth metrics, revenue stage, user engagement, and validates traction claims",
        category: "analysis",
        systemPrompt: `You are a VC Traction Analyst Agent specializing in growth metrics for investment memos.

Your role is to analyze:
1. Revenue Stage: Pre-revenue, early-revenue, scaling, or mature
2. Growth Velocity: Month-over-month growth rates
3. User Quality: Active users vs signups, engagement metrics
4. Retention: Churn rates and cohort analysis
5. Momentum Credibility: How believable are the traction claims?

Cross-reference claimed metrics against typical benchmarks for the sector and stage.`,
        humanPrompt: `Analyze the traction for:

Company: {companyName}
Stage: {stage}
Sector: {sector}

=== DECK CONTEXT ===
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Validate and score the traction.`,
        tools: ["metrics_validation"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "stage", description: "Funding stage", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "webResearch", description: "Web research results", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "Traction analysis narrative" },
          { key: "revenueStage", type: "string", description: "Revenue stage classification" },
          { key: "overallScore", type: "number", description: "Traction score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 4,
        isParallel: true
      },
      {
        agentKey: "businessModel",
        displayName: "Business Model Agent",
        description: "Analyzes unit economics, revenue model, margins, and pricing strategy",
        category: "analysis",
        systemPrompt: `You are a VC Business Model Analyst Agent specializing in unit economics and revenue models.

Your role is to analyze:
1. Unit Economics: CAC (Customer Acquisition Cost) vs. LTV (Lifetime Value)
2. Margins: Gross margin profile (Software should be 70-80%; E-commerce lower)
3. Pricing Strategy: Is pricing aligned with market and value delivered?
4. Revenue Model: Subscription, transaction-based, freemium, enterprise
5. Payback Period: How long to recover customer acquisition costs`,
        humanPrompt: `Analyze the business model for:

Company: {companyName}
Sector: {sector}
Stage: {stage}

=== DECK CONTEXT ===
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Provide comprehensive business model analysis.`,
        tools: ["financial_modeling"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "stage", description: "Funding stage", required: true },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "webResearch", description: "Web research results", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "Business model narrative" },
          { key: "unitEconomics", type: "object", description: "Unit economics analysis" },
          { key: "overallScore", type: "number", description: "Business model score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 5,
        isParallel: true
      },
      {
        agentKey: "gtm",
        displayName: "Go-To-Market Agent",
        description: "Evaluates customer acquisition strategy, sales motion, channel mix, and scalability",
        category: "analysis",
        systemPrompt: `You are a VC Go-To-Market Analyst Agent specializing in GTM strategy evaluation.

Your role is to analyze:
1. Customer Acquisition: Channels, CAC, efficiency
2. Sales Motion: Product-led, sales-led, or hybrid
3. Channel Mix: Direct, partners, marketplaces
4. Virality Potential: Network effects, referral mechanics
5. Scalability: Can this GTM scale efficiently?`,
        humanPrompt: `Analyze the go-to-market strategy for:

Company: {companyName}
Sector: {sector}
Stage: {stage}

=== DECK CONTEXT ===
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Provide comprehensive GTM analysis.`,
        tools: ["market_research"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "stage", description: "Funding stage", required: true },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "webResearch", description: "Web research results", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "GTM analysis narrative" },
          { key: "salesMotion", type: "object", description: "Sales motion analysis" },
          { key: "overallScore", type: "number", description: "GTM score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 6,
        isParallel: true
      },
      {
        agentKey: "financials",
        displayName: "Financials Agent",
        description: "Analyzes capital efficiency, runway, burn rate, and financial projections",
        category: "analysis",
        systemPrompt: `You are a VC Financial Analyst Agent specializing in startup financial analysis.

Your role is to analyze:
1. Capital Efficiency: Revenue per dollar raised
2. Runway: Months of runway at current burn
3. Burn Rate: Monthly cash consumption
4. Financial Projections: Revenue forecasts and assumptions
5. Use of Funds: How will the new capital be deployed?`,
        humanPrompt: `Analyze the financials for:

Company: {companyName}
Stage: {stage}
Round Size: {roundSize} {roundCurrency}
Valuation: {valuation} ({valuationType})
Raise Type: {raiseType}
Lead Investor Secured: {leadSecured} {leadInvestorName}
Previous Funding: {hasPreviousFunding} - {previousFundingAmount} {previousFundingCurrency} from {previousInvestors} ({previousRoundType})

=== DECK CONTEXT ===
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Provide comprehensive financial analysis.`,
        tools: ["financial_modeling"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "stage", description: "Funding stage", required: true },
          { key: "roundSize", description: "Current round size", required: false },
          { key: "roundCurrency", description: "Round currency", required: false },
          { key: "valuation", description: "Target valuation", required: false },
          { key: "valuationType", description: "Pre or post money", required: false },
          { key: "raiseType", description: "Type of raise", required: false },
          { key: "leadSecured", description: "Lead investor secured", required: false },
          { key: "leadInvestorName", description: "Lead investor name", required: false },
          { key: "hasPreviousFunding", description: "Has previous funding", required: false },
          { key: "previousFundingAmount", description: "Previous funding amount", required: false },
          { key: "previousFundingCurrency", description: "Previous funding currency", required: false },
          { key: "previousInvestors", description: "Previous investors", required: false },
          { key: "previousRoundType", description: "Previous round type", required: false },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "webResearch", description: "Web research results", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "Financial analysis narrative" },
          { key: "capitalEfficiency", type: "object", description: "Capital efficiency metrics" },
          { key: "overallScore", type: "number", description: "Financials score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 7,
        isParallel: true
      },
      {
        agentKey: "competitiveAdvantage",
        displayName: "Competitive Advantage Agent",
        description: "Analyzes moat, defensibility, competitive positioning, and barriers to entry",
        category: "analysis",
        systemPrompt: `You are a VC Competitive Advantage Analyst Agent specializing in moat assessment.

Your role is to analyze:
1. Defensibility: Network effects, high switching costs, data moats, brand
2. Positioning: Blue ocean vs. Red ocean strategy
3. Competitor Analysis: Direct and indirect competitors, their strengths
4. Barriers to Entry: What prevents competition?
5. Sustainable Advantage: Will this moat strengthen or weaken over time?`,
        humanPrompt: `Analyze the competitive advantage for:

Company: {companyName}
Sector: {sector}
Website: {website}

=== DECK CONTEXT ===
{deckContext}

=== COMPETITOR RESEARCH ===
{competitorResearch}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Provide comprehensive competitive analysis.`,
        tools: ["web_search", "competitor_research"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "website", description: "Company website", required: false },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "competitorResearch", description: "Competitor research results", required: false },
          { key: "webResearch", description: "Web research results", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "Competitive analysis narrative" },
          { key: "moatAssessment", type: "object", description: "Moat strength assessment" },
          { key: "overallScore", type: "number", description: "Competitive advantage score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 8,
        isParallel: true
      },
      {
        agentKey: "legal",
        displayName: "Legal & Regulatory Agent",
        description: "Assesses compliance, IP ownership, regulatory risks, and legal structure",
        category: "analysis",
        systemPrompt: `You are a VC Legal & Regulatory Analyst Agent specializing in compliance and IP assessment.

Your role is to analyze:
1. Compliance: GDPR, HIPAA, Fintech licenses, industry regulations
2. IP Ownership: Patents, trademarks, trade secrets
3. Regulatory Risk: Upcoming regulations that could impact the business
4. Legal Structure: Corporate structure, jurisdiction considerations
5. Cap Table Concerns: Potential issues with equity distribution`,
        humanPrompt: `Analyze the legal and regulatory landscape for:

Company: {companyName}
Sector: {sector}
Location: {location}

=== DECK CONTEXT ===
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Provide comprehensive legal/regulatory analysis.`,
        tools: ["regulatory_research"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "location", description: "Company location", required: true },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "webResearch", description: "Web research results", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "Legal analysis narrative" },
          { key: "regulatoryRisks", type: "array", description: "Identified regulatory risks" },
          { key: "overallScore", type: "number", description: "Legal score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 9,
        isParallel: true
      },
      {
        agentKey: "dealTerms",
        displayName: "Deal Terms Agent",
        description: "Evaluates valuation, deal structure, investor rights, and terms attractiveness",
        category: "analysis",
        systemPrompt: `You are a VC Deal Terms Analyst Agent specializing in valuation and term sheet analysis.

Your role is to analyze:
1. Valuation: Pre/post money, comparables, stage-appropriate
2. Deal Structure: SAFE, convertible, priced round
3. Investor Rights: Pro-rata, board seats, information rights
4. Terms Attractiveness: Founder-friendly vs investor-friendly
5. Red Flags: Unusual terms, structure concerns`,
        humanPrompt: `Analyze the deal terms for:

Company: {companyName}
Stage: {stage}
Round Size: {roundSize} {roundCurrency}
Valuation: {valuation} ({valuationType})
Raise Type: {raiseType}
Lead Investor Secured: {leadSecured} {leadInvestorName}
Previous Funding: {hasPreviousFunding} - {previousFundingAmount} {previousFundingCurrency} from {previousInvestors} ({previousRoundType})

=== DECK CONTEXT ===
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Provide comprehensive deal terms analysis.`,
        tools: ["comparable_analysis"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "stage", description: "Funding stage", required: true },
          { key: "roundSize", description: "Current round size", required: false },
          { key: "roundCurrency", description: "Round currency", required: false },
          { key: "valuation", description: "Target valuation", required: false },
          { key: "valuationType", description: "Pre or post money", required: false },
          { key: "raiseType", description: "Type of raise (SAFE, equity, etc.)", required: false },
          { key: "leadSecured", description: "Lead investor secured", required: false },
          { key: "leadInvestorName", description: "Lead investor name", required: false },
          { key: "hasPreviousFunding", description: "Has previous funding", required: false },
          { key: "previousFundingAmount", description: "Previous funding amount", required: false },
          { key: "previousFundingCurrency", description: "Previous funding currency", required: false },
          { key: "previousInvestors", description: "Previous investors", required: false },
          { key: "previousRoundType", description: "Previous round type", required: false },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "webResearch", description: "Web research results", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "Deal terms narrative" },
          { key: "valuationAssessment", type: "object", description: "Valuation analysis" },
          { key: "overallScore", type: "number", description: "Deal terms score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 10,
        isParallel: true
      },
      {
        agentKey: "exitPotential",
        displayName: "Exit Potential Agent",
        description: "Analyzes exit pathways, comparable exits, acquirer landscape, and return potential",
        category: "analysis",
        systemPrompt: `You are a VC Exit Potential Analyst Agent specializing in exit strategy assessment.

Your role is to analyze:
1. Exit Pathways: IPO, M&A, secondary sale
2. Comparable Exits: Recent exits in the space, multiples achieved
3. Acquirer Landscape: Strategic buyers, PE interest
4. Timeline: Realistic path to exit
5. Return Potential: Expected multiple based on entry valuation`,
        humanPrompt: `Analyze the exit potential for:

Company: {companyName}
Sector: {sector}
Location: {location}
Stage: {stage}

=== DECK CONTEXT ===
{deckContext}

=== WEB RESEARCH ===
{webResearch}

{adminGuidance}

Provide comprehensive exit potential analysis.`,
        tools: ["exit_research", "comparable_analysis"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "location", description: "Company location", required: false },
          { key: "stage", description: "Funding stage", required: true },
          { key: "deckContext", description: "Pitch deck content", required: false },
          { key: "webResearch", description: "Web research results", required: false },
          { key: "adminGuidance", description: "Admin feedback for re-analysis", required: false }
        ],
        outputs: [
          { key: "narrativeSummary", type: "string", description: "Exit potential narrative" },
          { key: "exitPathways", type: "array", description: "Potential exit pathways" },
          { key: "overallScore", type: "number", description: "Exit potential score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 11,
        isParallel: true
      },
      {
        agentKey: "synthesis",
        displayName: "Synthesis Agent",
        description: "Combines all agent outputs into final investment memo, founder report, and overall scoring",
        category: "synthesis",
        systemPrompt: `You are a senior VC investment memo writer. Your task is to synthesize all agent analyses into a cohesive investment memo and founder feedback report.

=== OUTPUT REQUIREMENTS ===
1. Executive Summary: 5-6 paragraph comprehensive summary
2. Investment Memo: Structured for investment committee review
3. Founder Report: Actionable feedback for the founding team
4. Overall Score: Weighted combination of all section scores
5. Key Strengths & Risks: Top 3-5 each`,
        humanPrompt: `Synthesize all analyses for:

Company: {companyName}

=== SECTION ANALYSES ===
{allSectionAnalyses}

=== SCORING SUMMARY ===
{scoringSummary}

Generate the final investment memo, founder report, and overall assessment.`,
        tools: ["result_aggregation"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "allSectionAnalyses", description: "All section analysis results", required: true },
          { key: "scoringSummary", description: "Summary of all section scores", required: true }
        ],
        outputs: [
          { key: "executiveSummary", type: "string", description: "Executive summary" },
          { key: "investorMemo", type: "object", description: "Complete investor memo" },
          { key: "founderReport", type: "object", description: "Founder feedback report" },
          { key: "overallScore", type: "number", description: "Overall score 0-100" }
        ],
        parentAgent: "orchestrator",
        executionOrder: 12,
        isParallel: false
      },
      // ============ RESEARCH PIPELINE AGENTS ============
      // Stage 3 research agents with editable prompts
      // Note: Stages 1-2 (Data Extraction, LinkedIn Research) are process steps, not agents
      {
        agentKey: "researchOrchestrator",
        displayName: "Research Orchestrator",
        description: "Generates research parameters and coordinates the 4 specialized deep research agents",
        category: "orchestrator",
        systemPrompt: `You are the Research Orchestrator. Your role is to coordinate comprehensive startup research using 4 specialized agents.

=== YOUR RESPONSIBILITIES ===
1. **Generate Research Parameters**: Analyze deck/website content to extract:
   - Specific market and target customers
   - Product description and key features
   - Known competitors mentioned
   - Claimed metrics (TAM, growth rates, revenue)
   - Geographic focus and business model
   
2. **Delegate to Research Agents**: Dispatch parameters to:
   - Team Deep Research Agent (o3-deep-research)
   - Market Deep Research Agent (o3-deep-research)
   - Product/Competitor Deep Research Agent (o3-deep-research)
   - News Search Agent (standard search)

3. **Aggregate Results**: Combine all research findings with confidence scores

=== MODEL SELECTION ===
- Use o3-deep-research-2025-06-26 for Team, Market, and Product research
- Use standard web search for News research`,
        humanPrompt: `Coordinate research for startup evaluation:

Company: {companyName}
Sector: {sector}
Website: {website}

=== EXTRACTED DATA ===
{deckContent}

=== WEBSITE CONTENT ===
{websiteContent}

=== TEAM MEMBERS ===
{teamMembers}

Generate research parameters and coordinate all 4 research agents.`,
        tools: ["research_parameter_generator", "agent_dispatcher", "result_aggregator"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "website", description: "Company website URL", required: true },
          { key: "deckContent", description: "Extracted deck content", required: false },
          { key: "websiteContent", description: "Scraped website content", required: false },
          { key: "teamMembers", description: "Enriched team members", required: false }
        ],
        outputs: [
          { key: "researchParameters", type: "object", description: "Generated research parameters" },
          { key: "aggregatedResearch", type: "object", description: "Combined research from all agents" },
          { key: "totalSources", type: "number", description: "Total sources consulted" }
        ],
        parentAgent: null,
        executionOrder: 2,
        isParallel: false
      },
      {
        agentKey: "teamDeepResearch",
        displayName: "Team Deep Research Agent",
        description: "Uses o3-deep-research to find patents, previous exits, track record, and verify credentials for each team member",
        category: "research",
        systemPrompt: `You are the Team Deep Research Agent powered by o3-deep-research-2025-06-26.

=== YOUR MISSION ===
Conduct exhaustive research on each team member to uncover:

1. **Previous Exits**: Any companies founded/co-founded that were acquired or went public
2. **Patents & IP**: Patent filings, technical publications, research contributions
3. **Track Record Verification**: Validate claimed positions, titles, and achievements
4. **Notable Connections**: Prominent investors, advisors, or network relationships
5. **Red Flags**: Lawsuits, fraud allegations, failed companies, or inconsistencies

=== RESEARCH APPROACH ===
- Cross-reference multiple sources (Crunchbase, LinkedIn, news, patent databases)
- Verify claims made in pitch deck against external data
- Assign confidence scores to each finding

=== OUTPUT FORMAT ===
For each team member provide:
- Verified experience timeline
- Patents and publications list
- Previous exits with details
- Red flags or concerns
- Overall credibility score (0-100)
- Sources consulted`,
        humanPrompt: `Deep research on team members:

Company: {companyName}
Sector: {sector}

=== TEAM MEMBERS TO RESEARCH ===
{teamMembers}

=== CLAIMS FROM PITCH DECK ===
{deckClaims}

Verify all claims and uncover additional information about each team member.`,
        tools: ["deep_research", "patent_search", "crunchbase_api", "news_search"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "teamMembers", description: "Team members to research", required: true },
          { key: "deckClaims", description: "Claims about team from pitch deck", required: false }
        ],
        outputs: [
          { key: "teamResearch", type: "array", description: "Deep research results per team member" },
          { key: "overallConfidence", type: "number", description: "Overall confidence score" },
          { key: "sources", type: "array", description: "All sources consulted" }
        ],
        parentAgent: "researchOrchestrator",
        executionOrder: 3,
        isParallel: true
      },
      {
        agentKey: "marketDeepResearch",
        displayName: "Market Deep Research Agent",
        description: "Uses o3-deep-research to validate TAM/SAM/SOM, find growth rates, identify market trends, and verify market claims",
        category: "research",
        systemPrompt: `You are the Market Deep Research Agent powered by o3-deep-research-2025-06-26.

=== YOUR MISSION ===
Conduct rigorous market research to validate and supplement pitch deck claims:

1. **TAM/SAM/SOM Validation**: 
   - Compare claimed market sizes against industry reports
   - Build bottom-up market sizing when possible
   - Flag inflated or unrealistic claims

2. **Market Growth Rates**:
   - Find CAGR data from reputable sources (Gartner, McKinsey, industry analysts)
   - Validate any growth claims from the pitch deck

3. **Key Trends**:
   - Identify tailwinds and headwinds for this specific market
   - "Why now" factors that enable this opportunity

4. **Regulatory Environment**:
   - Upcoming regulations that could help or hurt
   - Compliance requirements in target geographies

=== CONFIDENCE SCORING ===
Assign confidence levels to each data point:
- 90-100: Multiple authoritative sources agree
- 70-89: Single authoritative source or multiple secondary sources
- 50-69: Estimated based on adjacent data
- Below 50: Speculative or conflicting data`,
        humanPrompt: `Deep market research for:

Company: {companyName}
Sector: {sector}
Location: {location}

=== CLAIMED MARKET DATA ===
TAM: {claimedTam}
Growth Rate: {claimedGrowthRate}
Target Market: {targetMarket}

=== PRODUCT CONTEXT ===
{productDescription}

Validate all market claims and provide comprehensive market analysis with sources.`,
        tools: ["deep_research", "industry_reports", "market_analysis"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "location", description: "Geographic focus", required: false },
          { key: "claimedTam", description: "TAM claimed in pitch deck", required: false },
          { key: "claimedGrowthRate", description: "Growth rate claimed", required: false },
          { key: "targetMarket", description: "Specific target market", required: false },
          { key: "productDescription", description: "Product description", required: false }
        ],
        outputs: [
          { key: "marketResearch", type: "object", description: "Comprehensive market research" },
          { key: "claimValidation", type: "object", description: "Validation of deck claims" },
          { key: "sources", type: "array", description: "All sources consulted" }
        ],
        parentAgent: "researchOrchestrator",
        executionOrder: 3,
        isParallel: true
      },
      {
        agentKey: "productDeepResearch",
        displayName: "Product & Competitor Research Agent",
        description: "Uses o3-deep-research to analyze competitive landscape, find direct/indirect competitors, and assess differentiation",
        category: "research",
        systemPrompt: `You are the Product & Competitor Deep Research Agent powered by o3-deep-research-2025-06-26.

=== YOUR MISSION ===
Conduct comprehensive competitive analysis:

1. **Competitor Identification**:
   - Direct competitors (same solution, same market)
   - Indirect competitors (different solution, same problem)
   - Potential future competitors (adjacent players who could pivot)

2. **For Each Competitor, Research**:
   - Funding history and investors
   - Employee count and growth
   - Product features and pricing
   - Market positioning and messaging
   - Strengths and weaknesses

3. **Competitive Dynamics**:
   - Market share distribution
   - Barriers to entry
   - Network effects or switching costs
   - Technology differentiation

4. **Product Assessment**:
   - How the startup's product compares
   - Unique features or advantages
   - Technology stack insights

=== OUTPUT FORMAT ===
Provide detailed competitor profiles with confidence scores and sources.`,
        humanPrompt: `Competitive research for:

Company: {companyName}
Sector: {sector}
Website: {website}

=== PRODUCT DESCRIPTION ===
{productDescription}

=== KNOWN COMPETITORS ===
{knownCompetitors}

=== CLAIMED DIFFERENTIATION ===
{claimedDifferentiation}

Research all competitors and assess competitive positioning.`,
        tools: ["deep_research", "crunchbase_api", "product_analysis", "pricing_research"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "sector", description: "Industry sector", required: true },
          { key: "website", description: "Company website URL", required: true },
          { key: "productDescription", description: "Product description", required: false },
          { key: "knownCompetitors", description: "Competitors mentioned in deck", required: false },
          { key: "claimedDifferentiation", description: "Claimed competitive advantages", required: false }
        ],
        outputs: [
          { key: "competitors", type: "array", description: "Detailed competitor profiles" },
          { key: "competitivePosition", type: "object", description: "Competitive positioning analysis" },
          { key: "sources", type: "array", description: "All sources consulted" }
        ],
        parentAgent: "researchOrchestrator",
        executionOrder: 3,
        isParallel: true
      },
      {
        agentKey: "newsSearch",
        displayName: "News Search Agent",
        description: "Searches for recent news, funding announcements, press coverage, and sentiment about the company",
        category: "research",
        systemPrompt: `You are the News Search Agent using standard web search.

=== YOUR MISSION ===
Find all relevant news and public information about the company:

1. **Company Mentions**:
   - Press releases and announcements
   - News articles and features
   - Industry publication mentions
   - Podcast or video appearances

2. **Funding News**:
   - Previous funding rounds
   - Investor announcements
   - Valuation mentions

3. **Sentiment Analysis**:
   - Overall tone of coverage (positive/neutral/negative)
   - Customer reviews or complaints
   - Employee reviews (Glassdoor)

4. **Timeline Events**:
   - Product launches
   - Partnership announcements
   - Leadership changes
   - Controversies or issues

=== OUTPUT FORMAT ===
Provide chronological list of mentions with sentiment scores and source links.`,
        humanPrompt: `Search news and public mentions for:

Company: {companyName}
Website: {website}

=== TEAM MEMBERS ===
{founderNames}

=== TIMEFRAME ===
Focus on the last 2 years, but include any significant historical events.

Find all news, press coverage, and public mentions.`,
        tools: ["web_search", "news_api", "sentiment_analysis"],
        inputs: [
          { key: "companyName", description: "Name of the company", required: true },
          { key: "website", description: "Company website URL", required: true },
          { key: "founderNames", description: "Names of founders to search", required: false }
        ],
        outputs: [
          { key: "mentions", type: "array", description: "All news mentions" },
          { key: "overallSentiment", type: "string", description: "Overall sentiment assessment" },
          { key: "totalMentions", type: "number", description: "Total number of mentions" },
          { key: "sources", type: "array", description: "All sources consulted" }
        ],
        parentAgent: "researchOrchestrator",
        executionOrder: 3,
        isParallel: true
      },
      // Stage 5: Investor Matching Agents
      {
        agentKey: "investorThesis",
        displayName: "Investor Thesis Agent",
        description: "Scrapes investor websites for portfolio companies and generates holistic thesis summaries",
        category: "investor",
        systemPrompt: `You are an expert VC analyst. Create a holistic investment thesis summary that captures the investor's focus, preferences, and investment patterns.

Analyze the provided thesis information and portfolio to understand:
1. Investment philosophy and focus areas
2. Typical company profile they invest in
3. Key criteria they look for
4. Pattern of investments from their portfolio

Return a JSON object with this structure:
{{
  "thesisSummary": "A comprehensive 3-5 paragraph summary of the investor's thesis, investment philosophy, and what makes a company a good fit for them",
  "keyPatterns": ["pattern 1", "pattern 2"],
  "idealCompanyProfile": "Brief description of their ideal investment target"
}}

Write the thesis summary in third person, as if describing the investor to a startup founder.
Be specific about sectors, stages, and company characteristics they prefer.`,
        humanPrompt: `INVESTOR INFORMATION:
Fund Name: {fundName}
Fund Description: {fundDescription}
Target Stages: {stages}
Target Sectors: {sectors}
Target Geographies: {geographies}
Business Models: {businessModels}
Check Size Range: {checkSizeMin} - {checkSizeMax}
Minimum Revenue: {minRevenue}
Minimum Growth Rate: {minGrowthRate}
Thesis Narrative: {thesisNarrative}
Anti-Portfolio: {antiPortfolio}

PORTFOLIO COMPANIES:
{portfolioCompanies}

Generate a comprehensive thesis summary based on this information.`,
        tools: ["web_scraping"],
        inputs: [
          { key: "fundName", required: true, description: "Investor fund name" },
          { key: "fundDescription", required: false, description: "Fund description" },
          { key: "stages", required: false, description: "Target funding stages" },
          { key: "sectors", required: false, description: "Target sectors" },
          { key: "geographies", required: false, description: "Target geographies" },
          { key: "businessModels", required: false, description: "Target business models" },
          { key: "checkSizeMin", required: false, description: "Minimum check size" },
          { key: "checkSizeMax", required: false, description: "Maximum check size" },
          { key: "minRevenue", required: false, description: "Minimum revenue requirement" },
          { key: "minGrowthRate", required: false, description: "Minimum growth rate" },
          { key: "thesisNarrative", required: false, description: "Free-form thesis narrative" },
          { key: "antiPortfolio", required: false, description: "Anti-portfolio criteria" },
          { key: "portfolioCompanies", required: false, description: "List of portfolio companies" }
        ],
        outputs: [
          { key: "thesisSummary", type: "string", description: "Comprehensive thesis summary" },
          { key: "keyPatterns", type: "array", description: "Investment patterns identified" },
          { key: "idealCompanyProfile", type: "string", description: "Ideal company profile description" }
        ],
        parentAgent: null,
        executionOrder: 5,
        isParallel: false
      },
      {
        agentKey: "thesisAlignment",
        displayName: "Thesis Alignment Agent",
        description: "Scores startup-investor fit by analyzing thesis alignment and generating fit rationale",
        category: "investor",
        systemPrompt: `You are an expert VC analyst evaluating startup-investor fit. Analyze how well a startup aligns with an investor's thesis and produce a fit assessment.

Consider:
1. Sector/industry alignment
2. Stage fit
3. Geographic preferences
4. Business model alignment
5. Revenue and traction requirements
6. Team requirements
7. Investment thesis narrative alignment
8. Anti-portfolio considerations

Return a JSON object with this structure:
{{
  "fitScore": <number 1-100>,
  "rationale": "<2-3 sentence summary of fit, suitable for investor dashboard display>",
  "keyStrengths": ["strength 1", "strength 2"],
  "concerns": ["concern 1", "concern 2"]
}}

The rationale should be concise and highlight the most important fit factors.`,
        humanPrompt: `INVESTOR THESIS:
Fund: {fundName}
Fund Description: {fundDescription}
Target Stages: {stages}
Target Sectors: {sectors}
Target Geographies: {geographies}
Business Models: {businessModels}
Check Size: {checkSize}
Minimum Revenue: {minRevenue}
Thesis Narrative: {thesisNarrative}
Anti-Portfolio: {antiPortfolio}
Holistic Thesis Summary: {thesisSummary}

STARTUP INFORMATION:
Company: {companyName}
Stage: {startupStage}
Industry: {startupIndustries}
Location: {location}
Description: {description}
Round Size: {roundSize}
Valuation: {valuation}

STARTUP EVALUATION SUMMARY:
Overall Score: {overallScore}
Product Summary: {productSummary}
Executive Summary: {executiveSummary}

Analyze alignment and provide a fit score with rationale.`,
        tools: [],
        inputs: [
          { key: "fundName", required: true, description: "Investor fund name" },
          { key: "fundDescription", required: false, description: "Fund description" },
          { key: "stages", required: false, description: "Target stages" },
          { key: "sectors", required: false, description: "Target sectors" },
          { key: "geographies", required: false, description: "Target geographies" },
          { key: "businessModels", required: false, description: "Target business models" },
          { key: "checkSize", required: false, description: "Check size range" },
          { key: "minRevenue", required: false, description: "Minimum revenue" },
          { key: "thesisNarrative", required: false, description: "Thesis narrative" },
          { key: "antiPortfolio", required: false, description: "Anti-portfolio criteria" },
          { key: "thesisSummary", required: false, description: "Holistic thesis summary" },
          { key: "companyName", required: true, description: "Startup name" },
          { key: "startupStage", required: false, description: "Startup stage" },
          { key: "startupIndustries", required: false, description: "Startup industries" },
          { key: "location", required: false, description: "Startup location" },
          { key: "description", required: false, description: "Startup description" },
          { key: "roundSize", required: false, description: "Current round size" },
          { key: "valuation", required: false, description: "Valuation" },
          { key: "overallScore", required: false, description: "Startup overall score" },
          { key: "productSummary", required: false, description: "Product summary" },
          { key: "executiveSummary", required: false, description: "Executive summary" }
        ],
        outputs: [
          { key: "fitScore", type: "number", description: "Fit score 1-100" },
          { key: "rationale", type: "string", description: "Fit rationale summary" },
          { key: "keyStrengths", type: "array", description: "Key alignment strengths" },
          { key: "concerns", type: "array", description: "Alignment concerns" }
        ],
        parentAgent: null,
        executionOrder: 5,
        isParallel: true
      }
    ];

    // Only add prompts that don't already exist
    const newPrompts = defaultPrompts.filter(p => !existingKeys.has(p.agentKey));
    
    if (newPrompts.length === 0) {
      console.log("[Seed] Agent prompts already exist, skipping seed");
      return;
    }
    
    for (const prompt of newPrompts) {
      await this.createAgentPrompt(prompt);
      console.log(`[Seed] Added new agent: ${prompt.agentKey}`);
    }
    
    console.log(`[Seed] Successfully seeded ${newPrompts.length} new agent prompts (${existingPrompts.length} already existed)`);
  }

  // Stage Scoring Weights
  async getAllStageScoringWeights(): Promise<StageScoringWeights[]> {
    return db.select().from(stageScoringWeights);
  }

  async getStageScoringWeights(stage: string): Promise<StageScoringWeights | undefined> {
    const [weights] = await db.select().from(stageScoringWeights).where(eq(stageScoringWeights.stage, stage as any));
    return weights;
  }

  async upsertStageScoringWeights(data: InsertStageScoringWeights): Promise<StageScoringWeights> {
    const [result] = await db
      .insert(stageScoringWeights)
      .values(data)
      .onConflictDoUpdate({
        target: stageScoringWeights.stage,
        set: {
          weights: data.weights,
          rationale: data.rationale,
          overallRationale: data.overallRationale,
          lastModifiedBy: data.lastModifiedBy,
          updatedAt: new Date()
        }
      })
      .returning();
    return result;
  }

  async updateStageScoringWeights(stage: string, updates: UpdateStageScoringWeights): Promise<StageScoringWeights | undefined> {
    const [updated] = await db
      .update(stageScoringWeights)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(stageScoringWeights.stage, stage as any))
      .returning();
    return updated;
  }

  async seedStageScoringWeights(): Promise<void> {
    const existing = await this.getAllStageScoringWeights();
    if (existing.length > 0) {
      console.log("[Seed] Stage scoring weights already exist, skipping seed");
      return;
    }

    const defaultWeights: InsertStageScoringWeights[] = [
      {
        stage: "pre_seed",
        weights: {
          team: 30,
          market: 20,
          product: 10,
          traction: 5,
          businessModel: 8,
          gtm: 5,
          financials: 2,
          competitiveAdvantage: 8,
          legal: 5,
          dealTerms: 5,
          exitPotential: 2
        },
        rationale: {
          team: "At pre-seed, the team is everything. With minimal product and no revenue, investors bet almost entirely on founders' ability to execute. Track record, domain expertise, and founder-market fit are critical.",
          market: "Market opportunity matters significantly even at pre-seed. A strong team in a weak market will struggle, so TAM and market dynamics are carefully evaluated.",
          product: "Product is often just an idea or early prototype at pre-seed. Vision and technical feasibility matter more than current product quality.",
          traction: "Little to no traction is expected at pre-seed. Early user signals or LOIs are positive but not required.",
          businessModel: "Business model should be directionally sound but is expected to evolve significantly. Unit economics are theoretical at this stage.",
          gtm: "Go-to-market is typically undefined. Investors look for founder understanding of the path to first customers.",
          financials: "Financials are minimal - mostly projections. Capital efficiency thinking is observed but hard numbers don't exist.",
          competitiveAdvantage: "Defensibility thesis matters. What unique insight or asset gives this team an unfair advantage?",
          legal: "Basic legal hygiene (incorporation, IP assignment) is expected. Regulatory complexity affects some sectors.",
          dealTerms: "Terms should be founder-friendly at pre-seed. Valuation should reflect the risk level.",
          exitPotential: "Exit is very distant. Sector-level exit activity is a minor consideration."
        },
        overallRationale: "Pre-seed investments are fundamentally bets on people. The team carries 30% weight because without proven product or revenue, the founders' ability to figure things out is the primary value driver."
      },
      {
        stage: "seed",
        weights: {
          team: 25,
          market: 18,
          product: 12,
          traction: 10,
          businessModel: 10,
          gtm: 7,
          financials: 3,
          competitiveAdvantage: 7,
          legal: 3,
          dealTerms: 3,
          exitPotential: 2
        },
        rationale: {
          team: "Team remains crucial but slightly less dominant as there's now some product evidence. Execution proof starts to complement team assessment.",
          market: "Market validation becomes more tangible. Early customer conversations should inform market sizing.",
          product: "MVP or beta should exist. Product quality and user feedback start to matter.",
          traction: "Early traction signals emerge - users, waitlists, pilots, or early revenue. These provide first execution evidence.",
          businessModel: "Business model should be clearer. Initial pricing and customer acquisition approaches should be defined.",
          gtm: "Go-to-market experiments should be underway. Early channel identification is expected.",
          financials: "Still early, but burn rate awareness and runway planning should be evident.",
          competitiveAdvantage: "Moat thesis should be refined based on market learnings.",
          legal: "Standard legal matters. Industry-specific compliance may be relevant.",
          dealTerms: "Valuation should reflect early progress. Clean terms remain important.",
          exitPotential: "Still distant but sector dynamics inform long-term potential."
        },
        overallRationale: "Seed stage shifts from pure team bet toward validating product-market fit hypothesis. Traction signals start to matter as proof points emerge."
      },
      {
        stage: "series_a",
        weights: {
          team: 20,
          market: 15,
          product: 12,
          traction: 15,
          businessModel: 12,
          gtm: 8,
          financials: 5,
          competitiveAdvantage: 6,
          legal: 2,
          dealTerms: 3,
          exitPotential: 2
        },
        rationale: {
          team: "Team must demonstrate ability to scale beyond founding team. First hires and leadership development matter.",
          market: "Market thesis should be validated by customer behavior, not just research.",
          product: "Product should show clear differentiation and user love. Feature roadmap should be customer-driven.",
          traction: "Repeatable growth is expected. Early PMF signals through retention and organic growth.",
          businessModel: "Unit economics should show path to profitability. LTV/CAC should be improving.",
          gtm: "Go-to-market playbook should be emerging. Sales and marketing efficiency matters.",
          financials: "Financial discipline expected. Burn should correlate with growth.",
          competitiveAdvantage: "Defensibility should be building through data, network effects, or switching costs.",
          legal: "Clean legal structure. Any industry-specific requirements addressed.",
          dealTerms: "Valuation should reflect traction. Governance terms become more relevant.",
          exitPotential: "Long-term exit path becomes clearer with market position evidence."
        },
        overallRationale: "Series A is about proving product-market fit is real and scalable. Traction and business model validation share emphasis with team quality."
      },
      {
        stage: "series_b",
        weights: {
          team: 15,
          market: 12,
          product: 10,
          traction: 18,
          businessModel: 15,
          gtm: 10,
          financials: 8,
          competitiveAdvantage: 5,
          legal: 2,
          dealTerms: 3,
          exitPotential: 2
        },
        rationale: {
          team: "Executive team should be scaling. Functional leaders in place for next growth phase.",
          market: "Market position established. Focus on market share capture.",
          product: "Product should be market leader in key dimensions. Platform evolution underway.",
          traction: "Strong growth with improving efficiency. Retention and expansion revenue critical.",
          businessModel: "Unit economics should be proven. Contribution margins should be healthy.",
          gtm: "Sales and marketing machine should be scaling. Multiple channels working.",
          financials: "Financial rigor expected. Metrics and forecasting should be reliable.",
          competitiveAdvantage: "Moat should be measurable. Competitive position defensible.",
          legal: "Clean legal matters. International expansion considerations.",
          dealTerms: "Valuation reflects growth and efficiency. Governance evolves.",
          exitPotential: "Exit visibility improves. Strategic interest may emerge."
        },
        overallRationale: "Series B is about scaling what works. Traction and unit economics prove the model. Execution at scale becomes the primary evaluation criteria."
      },
      {
        stage: "series_c",
        weights: {
          team: 12,
          market: 10,
          product: 8,
          traction: 18,
          businessModel: 15,
          gtm: 10,
          financials: 12,
          competitiveAdvantage: 5,
          legal: 3,
          dealTerms: 4,
          exitPotential: 3
        },
        rationale: {
          team: "C-suite should be complete. Board governance mature.",
          market: "Clear market leader or strong #2 position expected.",
          product: "Product suite expanding. Platform effects emerging.",
          traction: "Consistent growth at scale. Net revenue retention strong.",
          businessModel: "Clear path to profitability. Proven unit economics at scale.",
          gtm: "Multi-channel, possibly international GTM proven.",
          financials: "Financial operations mature. Auditable financials expected.",
          competitiveAdvantage: "Defensibility proven. Sustainable competitive advantages.",
          legal: "Compliance mature. IPO-ready legal structure considerations.",
          dealTerms: "Premium valuations for clear leaders. Terms reflect maturity.",
          exitPotential: "Exit paths concrete. M&A interest or IPO timeline visible."
        },
        overallRationale: "Series C is about proving path to profitability at scale. Financial performance and sustainable growth dominate evaluation criteria."
      },
      {
        stage: "series_d",
        weights: {
          team: 10,
          market: 8,
          product: 7,
          traction: 18,
          businessModel: 15,
          gtm: 8,
          financials: 15,
          competitiveAdvantage: 5,
          legal: 4,
          dealTerms: 5,
          exitPotential: 5
        },
        rationale: {
          team: "Proven executive team with scale experience. Succession planning considered.",
          market: "Market leadership established. International expansion likely.",
          product: "Multiple product lines or comprehensive platform.",
          traction: "Consistent growth at significant scale. Predictable revenue.",
          businessModel: "Profitable or clear line of sight. Strong unit economics.",
          gtm: "Enterprise and/or international sales proven.",
          financials: "Sophisticated financial operations. Board-ready reporting.",
          competitiveAdvantage: "Durable advantages. High barriers to entry.",
          legal: "IPO-ready compliance. Clean cap table and governance.",
          dealTerms: "Growth equity or pre-IPO dynamics. Liquidity considerations.",
          exitPotential: "Active exit planning. IPO or strategic M&A on horizon."
        },
        overallRationale: "Series D focuses on financial performance and exit readiness. Companies should demonstrate profitability potential and clear exit path."
      },
      {
        stage: "series_e",
        weights: {
          team: 8,
          market: 7,
          product: 6,
          traction: 18,
          businessModel: 15,
          gtm: 7,
          financials: 17,
          competitiveAdvantage: 5,
          legal: 5,
          dealTerms: 6,
          exitPotential: 6
        },
        rationale: {
          team: "Blue-chip executive team. Public company readiness.",
          market: "Category defining or clear leader.",
          product: "Comprehensive product portfolio.",
          traction: "Large scale with continued growth. Predictable metrics.",
          businessModel: "Proven profitability or clear path.",
          gtm: "Global GTM machine. Multiple scaled channels.",
          financials: "Public company-grade financial operations.",
          competitiveAdvantage: "Strong moat. Acquisition defense possible.",
          legal: "Public company compliance ready. SOX readiness.",
          dealTerms: "Pre-IPO dynamics. Secondary considerations.",
          exitPotential: "Active IPO or M&A process. Near-term liquidity."
        },
        overallRationale: "Series E is pre-IPO or late-stage optimization. Financial performance, governance readiness, and exit timing dominate evaluation."
      },
      {
        stage: "series_f_plus",
        weights: {
          team: 7,
          market: 6,
          product: 5,
          traction: 17,
          businessModel: 15,
          gtm: 6,
          financials: 18,
          competitiveAdvantage: 5,
          legal: 6,
          dealTerms: 8,
          exitPotential: 7
        },
        rationale: {
          team: "Public company-ready leadership. Strong governance.",
          market: "Established market position. Expansion opportunities.",
          product: "Mature product portfolio. Innovation pipeline.",
          traction: "Large scale operations. Sustainable growth.",
          businessModel: "Profitable or clear profitability path.",
          gtm: "Global sales organization. Channel diversification.",
          financials: "Audited financials. Public company readiness.",
          competitiveAdvantage: "Durable moat. Strategic value.",
          legal: "Full compliance readiness. Clean structure.",
          dealTerms: "Exit-focused terms. Liquidity priorities.",
          exitPotential: "Imminent exit. Active IPO/M&A process."
        },
        overallRationale: "Series F+ is about exit execution. Financial performance, legal/governance readiness, and deal terms for exit dominate evaluation."
      }
    ];

    for (const weights of defaultWeights) {
      await this.upsertStageScoringWeights(weights);
    }
    
    console.log(`[Seed] Successfully seeded ${defaultWeights.length} stage scoring weights`);
  }

  // Investor Scoring Preferences
  async getInvestorScoringPreferences(investorId: number): Promise<InvestorScoringPreference[]> {
    return db.select().from(investorScoringPreferences).where(eq(investorScoringPreferences.investorId, investorId));
  }

  async getInvestorScoringPreference(investorId: number, stage: string): Promise<InvestorScoringPreference | undefined> {
    const [pref] = await db.select().from(investorScoringPreferences).where(
      and(
        eq(investorScoringPreferences.investorId, investorId),
        eq(investorScoringPreferences.stage, stage as any)
      )
    );
    return pref;
  }

  async upsertInvestorScoringPreference(data: InsertInvestorScoringPreference): Promise<InvestorScoringPreference> {
    const existing = await this.getInvestorScoringPreference(data.investorId, data.stage as string);
    
    if (existing) {
      const [updated] = await db
        .update(investorScoringPreferences)
        .set({
          useCustomWeights: data.useCustomWeights,
          customWeights: data.customWeights,
          updatedAt: new Date()
        })
        .where(eq(investorScoringPreferences.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(investorScoringPreferences).values(data).returning();
    return created;
  }

  // Notifications
  async getNotificationsByUser(userId: string, limit: number = 50): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select().from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result.length;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: number, userId: string): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return updated;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  // Investor Portal Settings
  async getPortalSettingsByInvestorId(investorId: number): Promise<InvestorPortalSettings | undefined> {
    const [settings] = await db.select().from(investorPortalSettings).where(eq(investorPortalSettings.investorId, investorId));
    return settings;
  }

  async getPortalSettingsBySlug(slug: string): Promise<InvestorPortalSettings | undefined> {
    const [settings] = await db.select().from(investorPortalSettings).where(eq(investorPortalSettings.slug, slug.toLowerCase()));
    return settings;
  }

  async createPortalSettings(settings: InsertInvestorPortalSettings): Promise<InvestorPortalSettings> {
    const [created] = await db.insert(investorPortalSettings).values({
      ...settings,
      slug: settings.slug.toLowerCase()
    }).returning();
    return created;
  }

  async updatePortalSettings(investorId: number, updates: Partial<InsertInvestorPortalSettings>): Promise<InvestorPortalSettings | undefined> {
    const updateData: any = { ...updates, updatedAt: new Date() };
    if (updates.slug) {
      updateData.slug = updates.slug.toLowerCase();
    }
    const [updated] = await db
      .update(investorPortalSettings)
      .set(updateData)
      .where(eq(investorPortalSettings.investorId, investorId))
      .returning();
    return updated;
  }

  async isSlugAvailable(slug: string, excludeInvestorId?: number): Promise<boolean> {
    const existing = await this.getPortalSettingsBySlug(slug.toLowerCase());
    if (!existing) return true;
    if (excludeInvestorId && existing.investorId === excludeInvestorId) return true;
    return false;
  }

  // Startup Drafts
  async getDraftsByFounder(founderId: string): Promise<StartupDraft[]> {
    return await db.select().from(startupDrafts)
      .where(eq(startupDrafts.founderId, founderId))
      .orderBy(desc(startupDrafts.lastSavedAt));
  }

  async getDraft(id: number): Promise<StartupDraft | undefined> {
    const [draft] = await db.select().from(startupDrafts).where(eq(startupDrafts.id, id));
    return draft;
  }

  async createDraft(draft: InsertStartupDraft): Promise<StartupDraft> {
    const [created] = await db.insert(startupDrafts).values(draft).returning();
    return created;
  }

  async updateDraft(id: number, updates: UpdateStartupDraft): Promise<StartupDraft | undefined> {
    const [updated] = await db
      .update(startupDrafts)
      .set({ ...updates, lastSavedAt: new Date() })
      .where(eq(startupDrafts.id, id))
      .returning();
    return updated;
  }

  async deleteDraft(id: number): Promise<boolean> {
    const result = await db.delete(startupDrafts).where(eq(startupDrafts.id, id));
    return true;
  }

  // Agent Conversations
  async getConversation(id: number): Promise<AgentConversation | undefined> {
    const [conversation] = await db.select().from(agentConversations).where(eq(agentConversations.id, id));
    return conversation;
  }

  async getConversationByEmail(email: string): Promise<AgentConversation | undefined> {
    const [conversation] = await db.select().from(agentConversations)
      .where(eq(agentConversations.senderEmail, email.toLowerCase()));
    return conversation;
  }

  async getConversationByPhone(phone: string): Promise<AgentConversation | undefined> {
    const normalizedPhone = phone.replace(/\D/g, '');
    const [conversation] = await db.select().from(agentConversations)
      .where(eq(agentConversations.senderPhone, normalizedPhone));
    return conversation;
  }

  async getConversationByEmailThread(emailThreadId: string): Promise<AgentConversation | undefined> {
    const [conversation] = await db.select().from(agentConversations)
      .where(eq(agentConversations.emailThreadId, emailThreadId));
    return conversation;
  }

  async getConversationByWhatsAppThread(whatsappThreadId: string): Promise<AgentConversation | undefined> {
    const [conversation] = await db.select().from(agentConversations)
      .where(eq(agentConversations.whatsappThreadId, whatsappThreadId));
    return conversation;
  }

  async getInvestorProfileByPhone(phone: string): Promise<InvestorProfile | undefined> {
    const normalizedPhone = phone.replace(/\D/g, '');
    const allProfiles = await db.select().from(investorProfiles);
    
    for (const profile of allProfiles) {
      const user = await this.getUser(profile.userId);
      const userProfile = await this.getUserProfile(profile.userId);
      if (user) {
        // Check if investor has this phone number (would need phone field on user)
        // For now, we return undefined - this needs user phone tracking
      }
    }
    return undefined;
  }

  async getInvestorProfileByEmail(email: string): Promise<InvestorProfile | undefined> {
    if (!email) return undefined;
    const normalizedEmail = email.toLowerCase().trim();
    
    // Find user with this email
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (!user) return undefined;
    
    // Get their investor profile
    const [profile] = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, user.id));
    return profile;
  }

  async getStartupsForInvestor(investorId: number): Promise<{ matched: Startup[]; submitted: Startup[] }> {
    // Get matched startups (via investorMatches table)
    const matches = await db.select()
      .from(investorMatches)
      .where(eq(investorMatches.investorId, investorId));
    
    const matchedStartupIds = matches.map(m => m.startupId);
    const matchedStartups = matchedStartupIds.length > 0 
      ? await db.select().from(startups).where(inArray(startups.id, matchedStartupIds))
      : [];

    // Get submitted startups - those where founder submitted via investor's portal
    // Check if investor has a portal and find startups submitted through it
    const profile = await this.getInvestorProfileById(investorId);
    let submittedStartups: Startup[] = [];
    
    if (profile) {
      // Find startups where the submission was by an investor (role) or through portal
      // For now, return startups where the investor is the submitter 
      submittedStartups = await db.select()
        .from(startups)
        .where(eq(startups.founderId, profile.userId));
    }

    return { matched: matchedStartups, submitted: submittedStartups };
  }

  async getConversationsByInvestor(investorProfileId: number): Promise<AgentConversation[]> {
    return await db.select().from(agentConversations)
      .where(eq(agentConversations.investorProfileId, investorProfileId))
      .orderBy(desc(agentConversations.lastMessageAt));
  }

  async getAllConversations(): Promise<AgentConversation[]> {
    return await db.select().from(agentConversations)
      .orderBy(desc(agentConversations.lastMessageAt));
  }

  async createConversation(conversation: InsertAgentConversation): Promise<AgentConversation> {
    const insertData = {
      ...conversation,
      senderEmail: conversation.senderEmail?.toLowerCase(),
      senderPhone: conversation.senderPhone?.replace(/\D/g, ''),
    };
    const [created] = await db.insert(agentConversations).values(insertData).returning();
    return created;
  }

  async updateConversation(id: number, updates: Partial<InsertAgentConversation>): Promise<AgentConversation | undefined> {
    const updateData: any = { ...updates, updatedAt: new Date() };
    if (updates.senderEmail) {
      updateData.senderEmail = updates.senderEmail.toLowerCase();
    }
    if (updates.senderPhone) {
      updateData.senderPhone = updates.senderPhone.replace(/\D/g, '');
    }
    const [updated] = await db
      .update(agentConversations)
      .set(updateData)
      .where(eq(agentConversations.id, id))
      .returning();
    return updated;
  }

  async deleteConversation(id: number): Promise<boolean> {
    // Messages are cascade deleted via FK constraint
    await db.delete(agentConversations).where(eq(agentConversations.id, id));
    return true;
  }

  // Agent Messages
  async getMessage(id: number): Promise<AgentMessage | undefined> {
    const [message] = await db.select().from(agentMessages).where(eq(agentMessages.id, id));
    return message;
  }

  async getMessagesByConversation(conversationId: number): Promise<AgentMessage[]> {
    return await db.select().from(agentMessages)
      .where(eq(agentMessages.conversationId, conversationId))
      .orderBy(agentMessages.createdAt);
  }

  async createMessage(message: InsertAgentMessage): Promise<AgentMessage> {
    const [created] = await db.insert(agentMessages).values(message).returning();
    
    // Get message count for conversation
    const messages = await db.select().from(agentMessages)
      .where(eq(agentMessages.conversationId, message.conversationId));
    
    // Update conversation message count and last message time
    await db.update(agentConversations)
      .set({ 
        messageCount: messages.length,
        lastMessageAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(agentConversations.id, message.conversationId));
    
    return created;
  }

  async updateMessage(id: number, updates: Partial<InsertAgentMessage>): Promise<AgentMessage | undefined> {
    const [updated] = await db
      .update(agentMessages)
      .set(updates)
      .where(eq(agentMessages.id, id))
      .returning();
    return updated;
  }

  // Agent Inboxes
  async getActiveInbox(): Promise<AgentInbox | undefined> {
    const [inbox] = await db.select().from(agentInboxes)
      .where(eq(agentInboxes.isActive, true))
      .limit(1);
    return inbox;
  }

  async getInbox(id: number): Promise<AgentInbox | undefined> {
    const [inbox] = await db.select().from(agentInboxes).where(eq(agentInboxes.id, id));
    return inbox;
  }

  async createInbox(inbox: InsertAgentInbox): Promise<AgentInbox> {
    const [created] = await db.insert(agentInboxes).values(inbox).returning();
    return created;
  }

  async updateInbox(id: number, updates: Partial<InsertAgentInbox>): Promise<AgentInbox | undefined> {
    const [updated] = await db
      .update(agentInboxes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(agentInboxes.id, id))
      .returning();
    return updated;
  }

  // Data Import methods (for production migration)
  async importStartup(startup: Startup): Promise<Startup> {
    const [created] = await db.insert(startups).values(startup).onConflictDoNothing().returning();
    if (created) {
      // Update sequence to prevent ID conflicts
      await db.execute(sql`SELECT setval('startups_id_seq', GREATEST((SELECT MAX(id) FROM startups), currval('startups_id_seq')), true)`);
    }
    return created || startup;
  }

  async importEvaluation(evaluation: StartupEvaluation): Promise<StartupEvaluation> {
    const [created] = await db.insert(startupEvaluations).values(evaluation).onConflictDoNothing().returning();
    if (created) {
      await db.execute(sql`SELECT setval('startup_evaluations_id_seq', GREATEST((SELECT MAX(id) FROM startup_evaluations), currval('startup_evaluations_id_seq')), true)`);
    }
    return created || evaluation;
  }

  async importThesis(thesis: InvestmentThesis): Promise<InvestmentThesis> {
    const [created] = await db.insert(investmentTheses).values(thesis).onConflictDoNothing().returning();
    if (created) {
      await db.execute(sql`SELECT setval('investment_theses_id_seq', GREATEST((SELECT MAX(id) FROM investment_theses), currval('investment_theses_id_seq')), true)`);
    }
    return created || thesis;
  }

  async importScoringWeight(weight: StageScoringWeights): Promise<StageScoringWeights> {
    const [created] = await db.insert(stageScoringWeights).values(weight).onConflictDoNothing().returning();
    if (created) {
      await db.execute(sql`SELECT setval('stage_scoring_weights_id_seq', GREATEST((SELECT MAX(id) FROM stage_scoring_weights), currval('stage_scoring_weights_id_seq')), true)`);
    }
    return created || weight;
  }

  // Scout Applications
  async getScoutApplication(id: number): Promise<ScoutApplication | undefined> {
    const [application] = await db.select().from(scoutApplications).where(eq(scoutApplications.id, id));
    return application;
  }

  async getScoutApplicationByUserId(userId: string): Promise<ScoutApplication | undefined> {
    const [application] = await db.select().from(scoutApplications).where(eq(scoutApplications.userId, userId));
    return application;
  }

  async getAllScoutApplications(): Promise<ScoutApplication[]> {
    return await db.select().from(scoutApplications).orderBy(desc(scoutApplications.createdAt));
  }

  async getScoutApplicationsByStatus(status: string): Promise<ScoutApplication[]> {
    return await db.select().from(scoutApplications)
      .where(eq(scoutApplications.status, status as any))
      .orderBy(desc(scoutApplications.createdAt));
  }

  async createScoutApplication(application: InsertScoutApplication): Promise<ScoutApplication> {
    const [created] = await db.insert(scoutApplications).values(application).returning();
    return created;
  }

  async updateScoutApplicationStatus(
    id: number, 
    status: "approved" | "rejected", 
    reviewedBy: string, 
    reviewNotes?: string
  ): Promise<ScoutApplication | undefined> {
    const [updated] = await db
      .update(scoutApplications)
      .set({ 
        status, 
        reviewedBy, 
        reviewNotes,
        reviewedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(scoutApplications.id, id))
      .returning();
    return updated;
  }

  // Scout startups
  async getStartupsByScout(scoutId: string): Promise<Startup[]> {
    return await db.select().from(startups)
      .where(eq(startups.scoutId, scoutId))
      .orderBy(desc(startups.createdAt));
  }
}

export const storage = new DatabaseStorage();
