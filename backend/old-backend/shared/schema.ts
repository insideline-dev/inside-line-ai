import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, pgEnum, serial, real, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export auth models
export * from "./models/auth";
export * from "./models/chat";

// Enums
export const userRoleEnum = pgEnum("user_role", ["founder", "investor", "admin", "scout"]);
export const scoutApplicationStatusEnum = pgEnum("scout_application_status", ["pending", "approved", "rejected"]);
export const startupStatusEnum = pgEnum("startup_status", ["submitted", "analyzing", "pending_review", "approved", "rejected"]);
export const stageEnum = pgEnum("stage", ["pre_seed", "seed", "series_a", "series_b", "series_c", "series_d", "series_e", "series_f_plus"]);
export const trlEnum = pgEnum("trl", ["idea", "mvp", "scaling", "mature"]);
export const raiseTypeEnum = pgEnum("raise_type", ["safe", "convertible_note", "equity", "safe_equity", "undecided"]);
export const valuationTypeEnum = pgEnum("valuation_type", ["pre_money", "post_money"]);

// User Profiles (extends auth users)
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  role: userRoleEnum("role").notNull().default("founder"),
  companyName: text("company_name"),
  title: text("title"),
  linkedinUrl: text("linkedin_url"),
  bio: text("bio"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Startups
export const startups = pgTable("startups", {
  id: serial("id").primaryKey(),
  founderId: varchar("founder_id").notNull(),
  submittedByRole: userRoleEnum("submitted_by_role").default("founder"), // Who submitted: founder, investor, admin, scout
  scoutId: varchar("scout_id"), // If submitted by a scout, track which scout
  isPrivate: boolean("is_private").default(false), // If true, only visible to submitter (investor/admin private submissions)
  name: text("name").notNull(),
  website: text("website"),
  pitchDeckUrl: text("pitch_deck_url"),
  pitchDeckPath: text("pitch_deck_path"),
  files: jsonb("files").$type<{ path: string; name: string; type: string }[]>(),
  teamMembers: jsonb("team_members").$type<{ name: string; role: string; linkedinUrl: string }[]>(),
  description: text("description"),
  stage: stageEnum("stage"),
  sector: text("sector"), // Now stores "industryGroup:industry" format
  sectorIndustryGroup: text("sector_industry_group"), // Level 1: Industry Group
  sectorIndustry: text("sector_industry"), // Level 2: Specific Industry
  location: text("location"),
  normalizedRegion: text("normalized_region"), // AI-normalized region code for investor matching (us, europe, asia, etc.)
  
  // Round details
  roundSize: doublePrecision("round_size"),
  roundCurrency: text("round_currency").default("USD"), // Currency code (USD, EUR, GBP, etc.)
  valuation: doublePrecision("valuation"),
  valuationKnown: boolean("valuation_known").default(true), // Whether founder has determined target valuation
  valuationType: valuationTypeEnum("valuation_type"), // pre_money or post_money
  raiseType: raiseTypeEnum("raise_type"), // SAFE, convertible, equity, etc.
  leadSecured: boolean("lead_secured"),
  leadInvestorName: text("lead_investor_name"),
  
  // Primary contact (required for founders)
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  contactPhoneCountryCode: text("contact_phone_country_code"),
  
  // Previous funding (optional)
  hasPreviousFunding: boolean("has_previous_funding"),
  previousFundingAmount: doublePrecision("previous_funding_amount"),
  previousFundingCurrency: text("previous_funding_currency"),
  previousInvestors: text("previous_investors"),
  previousRoundType: text("previous_round_type"),
  
  status: startupStatusEnum("status").notNull().default("submitted"),
  overallScore: real("overall_score"),
  percentileRank: real("percentile_rank"),
  
  // Product showcase (founder-submitted)
  productDescription: text("product_description"), // Detailed product description for AI analysis
  technologyReadinessLevel: trlEnum("technology_readiness_level"),
  productScreenshots: jsonb("product_screenshots").$type<string[]>(),
  demoVideoUrl: text("demo_video_url"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Startup Evaluations (AI-generated analysis) - 11 Section Framework
export const startupEvaluations = pgTable("startup_evaluations", {
  id: serial("id").primaryKey(),
  startupId: integer("startup_id").notNull().references(() => startups.id, { onDelete: "cascade" }),
  
  // Website Intelligence
  websiteData: jsonb("website_data"),
  websiteScore: real("website_score"),
  messagingClarityScore: real("messaging_clarity_score"),
  
  // Deck Intelligence
  deckData: jsonb("deck_data"),
  deckScore: real("deck_score"),
  missingSlideFlags: jsonb("missing_slide_flags"),
  
  // 1. Team Analysis
  teamData: jsonb("team_data"),
  teamMemberEvaluations: jsonb("team_member_evaluations").$type<{
    name: string;
    role: string;
    linkedinUrl: string;
    linkedinAnalysis: {
      currentPosition: string;
      company: string;
      yearsExperience: number;
      education: string[];
      previousCompanies: string[];
      skills: string[];
      relevantExperience: string;
      strengthsForRole: string[];
      potentialConcerns: string[];
      founderFitScore: number;
    } | null;
  }[]>(),
  teamScore: real("team_score"),
  founderMarketFit: real("founder_market_fit"),
  executionRiskNotes: text("execution_risk_notes"),
  teamComposition: jsonb("team_composition").$type<{
    hasBusinessLeader: boolean;
    hasTechnicalLeader: boolean;
    hasIndustryExpert: boolean;
    teamBalance: string;
    gapsIdentified: string[];
  }>(),
  
  // 2. Market Analysis
  marketData: jsonb("market_data"),
  marketScore: real("market_score"),
  tamValidation: jsonb("tam_validation"),
  marketCredibility: real("market_credibility"),
  
  // 3. Product/Technology Analysis
  productData: jsonb("product_data"),
  productScore: real("product_score"),
  productSummary: text("product_summary"), // Concise summary of what the product/service does
  
  // Product showcase (AI-extracted from website, deck, and online sources)
  extractedScreenshots: jsonb("extracted_screenshots").$type<{
    url: string;
    source: string; // "website" | "deck" | "online"
    caption?: string;
  }[]>(),
  extractedDemoVideos: jsonb("extracted_demo_videos").$type<{
    url: string;
    source: string; // "youtube" | "vimeo" | "website" | "online"
    title?: string;
  }[]>(),
  extractedFeatures: jsonb("extracted_features").$type<{
    name: string;
    description?: string;
    source: string; // "deck" | "website"
  }[]>(),
  extractedTechStack: jsonb("extracted_tech_stack").$type<{
    technology: string;
    category?: string; // "frontend" | "backend" | "database" | "infrastructure" | "ai/ml" | "other"
    source: string; // "deck" | "website" | "job_posting"
  }[]>(),
  
  // 4. Traction Analysis
  tractionData: jsonb("traction_data"),
  tractionScore: real("traction_score"),
  momentumScore: real("momentum_score"),
  tractionCredibility: real("traction_credibility"),
  
  // 5. Business Model & Unit Economics Analysis
  businessModelData: jsonb("business_model_data"),
  businessModelScore: real("business_model_score"),
  
  // 6. Go-To-Market Analysis
  gtmData: jsonb("gtm_data"),
  gtmScore: real("gtm_score"),
  
  // 7. Financials & Capital Efficiency Analysis
  financialsData: jsonb("financials_data"),
  financialsScore: real("financials_score"),
  
  // 8. Competitive Advantage/Moat Analysis
  competitiveAdvantageData: jsonb("competitive_advantage_data"),
  competitiveAdvantageScore: real("competitive_advantage_score"),
  
  // 9. Legal, Regulatory & IP Analysis
  legalData: jsonb("legal_data"),
  legalScore: real("legal_score"),
  
  // 10. Deal Terms & Valuation Analysis
  dealTermsData: jsonb("deal_terms_data"),
  dealTermsScore: real("deal_terms_score"),
  
  // 11. Exit Potential Analysis
  exitPotentialData: jsonb("exit_potential_data"),
  exitPotentialScore: real("exit_potential_score"),
  
  // Section Scores Summary (all 11 sections)
  sectionScores: jsonb("section_scores").$type<{
    team: number;
    market: number;
    product: number;
    traction: number;
    businessModel: number;
    gtm: number;
    financials: number;
    competitiveAdvantage: number;
    legal: number;
    dealTerms: number;
    exitPotential: number;
  }>(),
  
  // Final Scores
  overallScore: real("overall_score"),
  percentileRank: real("percentile_rank"),
  keyStrengths: jsonb("key_strengths"),
  keyRisks: jsonb("key_risks"),
  recommendations: jsonb("recommendations"),
  dataConfidenceNotes: text("data_confidence_notes"),
  
  // Executive Summary (5-6 paragraph comprehensive summary from synthesis)
  executiveSummary: text("executive_summary"),
  
  // Memos
  founderReport: jsonb("founder_report"),
  investorMemo: jsonb("investor_memo"),
  
  // Sources used by AI agents
  sources: jsonb("sources").$type<{
    category: "document" | "website" | "linkedin" | "api" | "database";
    name: string;
    url?: string;
    description?: string;
    agent: string;
    timestamp: string;
    dataExtracted?: string;
  }[]>(),
  
  // Admin feedback for re-triggering specific agents
  adminFeedback: jsonb("admin_feedback").$type<{
    team?: { comment: string; lastUpdated: string };
    market?: { comment: string; lastUpdated: string };
    product?: { comment: string; lastUpdated: string };
    traction?: { comment: string; lastUpdated: string };
    businessModel?: { comment: string; lastUpdated: string };
    gtm?: { comment: string; lastUpdated: string };
    financials?: { comment: string; lastUpdated: string };
    competitiveAdvantage?: { comment: string; lastUpdated: string };
    legal?: { comment: string; lastUpdated: string };
    dealTerms?: { comment: string; lastUpdated: string };
    exitPotential?: { comment: string; lastUpdated: string };
  }>(),

  // Cached web research data to avoid re-scraping on re-analysis
  webResearchData: jsonb("web_research_data"),

  // Cached deck content to avoid re-extraction on re-analysis
  deckContent: text("deck_content"),
  // Hash of file paths to detect if deck files changed
  deckFilesHash: text("deck_files_hash"),
  
  // Cached comprehensive research data to avoid re-scraping website
  comprehensiveResearchData: jsonb("comprehensive_research_data"),
  // Website URL that was scraped (to detect if website changed)
  websiteScraped: text("website_scraped"),
  
  // Real-time analysis progress tracking
  analysisProgress: jsonb("analysis_progress").$type<{
    currentStage: number; // 1-5 for the 5 orchestrator stages
    currentStageLabel: string; // Human-readable stage description
    completedAgents: string[]; // IDs of completed agents (team, market, product, etc.)
    currentAgent: string | null; // Currently running agent ID
    startedAt: string; // ISO timestamp when analysis started
    lastUpdatedAt: string; // ISO timestamp of last progress update
    stageProgress: {
      stage: number;
      label: string;
      status: "pending" | "running" | "completed";
      startedAt?: string;
      completedAt?: string;
    }[];
  }>(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Admin Reviews (Human-in-the-loop)
export const adminReviews = pgTable("admin_reviews", {
  id: serial("id").primaryKey(),
  startupId: integer("startup_id").notNull().references(() => startups.id, { onDelete: "cascade" }),
  reviewerId: varchar("reviewer_id").notNull(),
  
  // Override fields
  scoreOverride: real("score_override"),
  memoEdits: jsonb("memo_edits"),
  adminNotes: text("admin_notes"),
  flaggedConcerns: jsonb("flagged_concerns"),
  investorVisibility: jsonb("investor_visibility"), // Which investors can see this
  
  decision: text("decision"), // approved, rejected, needs_revision
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Investor Profiles
export const investorProfiles = pgTable("investor_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  fundName: text("fund_name").notNull(),
  fundDescription: text("fund_description"),
  aum: text("aum"), // Assets under management
  teamSize: integer("team_size"),
  website: text("website"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Investment Thesis
export const investmentTheses = pgTable("investment_theses", {
  id: serial("id").primaryKey(),
  investorId: integer("investor_id").notNull().references(() => investorProfiles.id, { onDelete: "cascade" }),
  
  // Structured inputs
  stages: jsonb("stages"), // ["seed", "series_a"]
  checkSizeMin: integer("check_size_min"),
  checkSizeMax: integer("check_size_max"),
  sectors: jsonb("sectors"), // ["fintech", "healthcare"] - now stores industry group values
  geographies: jsonb("geographies"), // ["US", "Europe"]
  businessModels: jsonb("business_models"), // ["B2B SaaS", "Marketplace"]
  
  // Metric thresholds
  minRevenue: integer("min_revenue"),
  minGrowthRate: real("min_growth_rate"),
  minTeamSize: integer("min_team_size"),
  
  // Unstructured inputs
  thesisNarrative: text("thesis_narrative"),
  antiPortfolio: text("anti_portfolio"), // What they won't invest in
  
  // Fund information
  website: text("website"),
  fundSize: doublePrecision("fund_size"), // Total assets under management
  
  // AI-generated thesis summary
  thesisSummary: text("thesis_summary"), // Holistic summary from InvestorThesisAgent
  portfolioCompanies: jsonb("portfolio_companies"), // Scraped from investor website
  thesisSummaryGeneratedAt: timestamp("thesis_summary_generated_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Investor-Startup Matches
export const investorMatches = pgTable("investor_matches", {
  id: serial("id").primaryKey(),
  investorId: integer("investor_id").notNull().references(() => investorProfiles.id, { onDelete: "cascade" }),
  startupId: integer("startup_id").notNull().references(() => startups.id, { onDelete: "cascade" }),
  
  thesisFitScore: real("thesis_fit_score"),
  fitRationale: text("fit_rationale"),
  matchedAt: timestamp("matched_at").defaultNow().notNull(),
  
  // Investor actions
  status: text("status").default("new"), // new, reviewing, interested, passed, watchlist
  actionTakenAt: timestamp("action_taken_at"),
  notes: text("notes"),
});

// Team Invites (for investor teams)
export const teamInviteStatusEnum = pgEnum("team_invite_status", ["pending", "accepted", "expired", "cancelled"]);

export const teamInvites = pgTable("team_invites", {
  id: serial("id").primaryKey(),
  investorProfileId: integer("investor_profile_id").notNull().references(() => investorProfiles.id, { onDelete: "cascade" }),
  invitedByUserId: varchar("invited_by_user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").default("member"), // admin, member
  status: teamInviteStatusEnum("status").notNull().default("pending"),
  inviteCode: varchar("invite_code", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedByUserId: varchar("accepted_by_user_id"),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Team Members (investor team)
export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  investorProfileId: integer("investor_profile_id").notNull().references(() => investorProfiles.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  role: text("role").default("member"), // admin, member
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

// Agent Prompts - stores editable agent prompts for the AI evaluation system
export const agentPrompts = pgTable("agent_prompts", {
  id: serial("id").primaryKey(),
  agentKey: varchar("agent_key", { length: 50 }).notNull().unique(), // team, market, product, etc.
  displayName: text("display_name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // orchestrator, analysis, synthesis
  
  // Prompt configuration
  systemPrompt: text("system_prompt").notNull(),
  humanPrompt: text("human_prompt").notNull(),
  
  // Agent metadata
  tools: jsonb("tools").$type<string[]>(), // List of tools this agent can use
  inputs: jsonb("inputs").$type<{ key: string; description: string; required: boolean }[]>(), // Expected input variables
  outputs: jsonb("outputs").$type<{ key: string; type: string; description: string }[]>(), // Expected output structure
  
  // Flow configuration for diagram
  parentAgent: text("parent_agent"), // Which agent controls this one (for hierarchy)
  executionOrder: integer("execution_order").default(0), // Order within parallel group
  isParallel: boolean("is_parallel").default(true), // Can run in parallel with siblings
  
  // Version tracking
  version: integer("version").default(1),
  lastModifiedBy: varchar("last_modified_by"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Scoring Section Weights type (shared across tables)
export type ScoringWeights = {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
};

export type ScoringRationale = {
  team: string;
  market: string;
  product: string;
  traction: string;
  businessModel: string;
  gtm: string;
  financials: string;
  competitiveAdvantage: string;
  legal: string;
  dealTerms: string;
  exitPotential: string;
};

// Stage Scoring Weights - default weights per startup stage with rationale
export const stageScoringWeights = pgTable("stage_scoring_weights", {
  id: serial("id").primaryKey(),
  stage: stageEnum("stage").notNull().unique(),
  weights: jsonb("weights").$type<ScoringWeights>().notNull(),
  rationale: jsonb("rationale").$type<ScoringRationale>().notNull(),
  overallRationale: text("overall_rationale"),
  lastModifiedBy: varchar("last_modified_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Investor Scoring Preferences - custom weights per investor per stage
export const investorScoringPreferences = pgTable("investor_scoring_preferences", {
  id: serial("id").primaryKey(),
  investorId: integer("investor_id").notNull().references(() => investorProfiles.id, { onDelete: "cascade" }),
  stage: stageEnum("stage").notNull(),
  useCustomWeights: boolean("use_custom_weights").default(false),
  customWeights: jsonb("custom_weights").$type<ScoringWeights>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// LinkedIn Profile Cache - stores enriched LinkedIn data to avoid repeated API calls
export const linkedinProfileCache = pgTable("linkedin_profile_cache", {
  id: serial("id").primaryKey(),
  linkedinUrl: text("linkedin_url").notNull().unique(),
  linkedinIdentifier: text("linkedin_identifier"),
  profileData: jsonb("profile_data").$type<{
    name: string;
    headline: string;
    summary: string;
    location: string;
    currentPosition: string;
    currentCompany: string;
    yearsExperience: number | null;
    education: string[];
    previousCompanies: string[];
    skills: string[];
    profilePictureUrl?: string;
    experienceDetails: {
      company: string;
      position: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      duration: string;
      description: string;
      isCurrent?: boolean;
    }[];
    educationDetails: {
      school: string;
      degree?: string;
      fieldOfStudy?: string;
      startDate?: string;
      endDate?: string;
    }[];
  }>(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const startupsRelations = relations(startups, ({ one, many }) => ({
  evaluations: many(startupEvaluations),
  adminReviews: many(adminReviews),
  investorMatches: many(investorMatches),
}));

export const startupEvaluationsRelations = relations(startupEvaluations, ({ one }) => ({
  startup: one(startups, {
    fields: [startupEvaluations.startupId],
    references: [startups.id],
  }),
}));

export const investorProfilesRelations = relations(investorProfiles, ({ one, many }) => ({
  theses: many(investmentTheses),
  matches: many(investorMatches),
}));

export const investmentThesesRelations = relations(investmentTheses, ({ one }) => ({
  investor: one(investorProfiles, {
    fields: [investmentTheses.investorId],
    references: [investorProfiles.id],
  }),
}));

// Insert schemas
export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStartupSchema = createInsertSchema(startups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  overallScore: true,
  percentileRank: true,
});

export const updateStartupSchema = createInsertSchema(startups).omit({
  id: true,
  founderId: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const insertStartupEvaluationSchema = createInsertSchema(startupEvaluations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAdminReviewSchema = createInsertSchema(adminReviews).omit({
  id: true,
  createdAt: true,
});

export const insertInvestorProfileSchema = createInsertSchema(investorProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvestmentThesisSchema = createInsertSchema(investmentTheses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvestorMatchSchema = createInsertSchema(investorMatches).omit({
  id: true,
  matchedAt: true,
});

// Types
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;

export type Startup = typeof startups.$inferSelect;
export type InsertStartup = z.infer<typeof insertStartupSchema>;

export type StartupEvaluation = typeof startupEvaluations.$inferSelect;
export type InsertStartupEvaluation = z.infer<typeof insertStartupEvaluationSchema>;

export type AdminReview = typeof adminReviews.$inferSelect;
export type InsertAdminReview = z.infer<typeof insertAdminReviewSchema>;

export type InvestorProfile = typeof investorProfiles.$inferSelect;
export type InsertInvestorProfile = z.infer<typeof insertInvestorProfileSchema>;

export type InvestmentThesis = typeof investmentTheses.$inferSelect;
export type InsertInvestmentThesis = z.infer<typeof insertInvestmentThesisSchema>;

export type InvestorMatch = typeof investorMatches.$inferSelect;
export type InsertInvestorMatch = z.infer<typeof insertInvestorMatchSchema>;

export type UpdateStartup = z.infer<typeof updateStartupSchema>;

// Team Invites
export const insertTeamInviteSchema = createInsertSchema(teamInvites).omit({
  id: true,
  createdAt: true,
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  joinedAt: true,
});

export type TeamInvite = typeof teamInvites.$inferSelect;
export type InsertTeamInvite = z.infer<typeof insertTeamInviteSchema>;

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

// LinkedIn Profile Cache
export const insertLinkedinProfileCacheSchema = createInsertSchema(linkedinProfileCache).omit({
  id: true,
  createdAt: true,
});

export type LinkedinProfileCache = typeof linkedinProfileCache.$inferSelect;
export type InsertLinkedinProfileCache = z.infer<typeof insertLinkedinProfileCacheSchema>;

// Agent Prompts
export const insertAgentPromptSchema = createInsertSchema(agentPrompts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAgentPromptSchema = createInsertSchema(agentPrompts).omit({
  id: true,
  agentKey: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type AgentPrompt = typeof agentPrompts.$inferSelect;
export type InsertAgentPrompt = z.infer<typeof insertAgentPromptSchema>;
export type UpdateAgentPrompt = z.infer<typeof updateAgentPromptSchema>;

// Stage Scoring Weights
export const insertStageScoringWeightsSchema = createInsertSchema(stageScoringWeights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateStageScoringWeightsSchema = createInsertSchema(stageScoringWeights).omit({
  id: true,
  stage: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type StageScoringWeights = typeof stageScoringWeights.$inferSelect;
export type InsertStageScoringWeights = z.infer<typeof insertStageScoringWeightsSchema>;
export type UpdateStageScoringWeights = z.infer<typeof updateStageScoringWeightsSchema>;

// Investor Scoring Preferences
export const insertInvestorScoringPreferencesSchema = createInsertSchema(investorScoringPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InvestorScoringPreference = typeof investorScoringPreferences.$inferSelect;
export type InsertInvestorScoringPreference = z.infer<typeof insertInvestorScoringPreferencesSchema>;

// Notifications
export const notificationTypeEnum = pgEnum("notification_type", ["analysis_complete", "startup_approved", "startup_rejected", "new_match", "system"]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  startupId: integer("startup_id").references(() => startups.id, { onDelete: "cascade" }),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Investor Portal Settings - branded submission pages for investors
export const investorPortalSettings = pgTable("investor_portal_settings", {
  id: serial("id").primaryKey(),
  investorId: integer("investor_id").notNull().references(() => investorProfiles.id, { onDelete: "cascade" }).unique(),
  
  // URL configuration
  slug: varchar("slug", { length: 100 }).notNull().unique(), // e.g., "acme-ventures" -> /apply/acme-ventures
  
  // Branding
  welcomeMessage: text("welcome_message"), // Custom welcome text for startups
  tagline: text("tagline"), // Short tagline under fund name
  accentColor: varchar("accent_color", { length: 7 }).default("#6366f1"), // Hex color for branding
  
  // Form configuration
  requiredFields: jsonb("required_fields").$type<string[]>().default([]), // Which fields are required: website, pitchDeck, etc.
  
  // Status
  isEnabled: boolean("is_enabled").default(false).notNull(), // Portal is off by default
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvestorPortalSettingsSchema = createInsertSchema(investorPortalSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InvestorPortalSettings = typeof investorPortalSettings.$inferSelect;
export type InsertInvestorPortalSettings = z.infer<typeof insertInvestorPortalSettingsSchema>;

// Startup Drafts - auto-saved form progress for founders
export const startupDrafts = pgTable("startup_drafts", {
  id: serial("id").primaryKey(),
  founderId: varchar("founder_id").notNull(),
  
  // Form data (stored as JSON to preserve all fields)
  formData: jsonb("form_data").$type<{
    name?: string;
    website?: string;
    description?: string;
    stage?: string;
    sectorIndustryGroup?: string;
    sectorIndustry?: string;
    location?: string;
    roundSize?: string;
    roundCurrency?: string;
    valuation?: string;
    valuationKnown?: boolean;
    valuationType?: string;
    raiseType?: string;
    leadSecured?: boolean;
    leadInvestorName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactPhoneCountryCode?: string;
    hasPreviousFunding?: boolean;
    previousFundingAmount?: string;
    previousFundingCurrency?: string;
    previousInvestors?: string;
    previousRoundType?: string;
    technologyReadinessLevel?: string;
    demoVideoUrl?: string;
    productDescription?: string;
  }>().notNull(),
  
  // Files and team (stored separately for easier handling)
  pitchDeckPath: text("pitch_deck_path"),
  uploadedFiles: jsonb("uploaded_files").$type<{ path: string; name: string; type: string }[]>(),
  teamMembers: jsonb("team_members").$type<{ name: string; role: string; linkedinUrl: string }[]>(),
  productScreenshots: jsonb("product_screenshots").$type<string[]>(),
  
  // Metadata
  lastSavedAt: timestamp("last_saved_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStartupDraftSchema = createInsertSchema(startupDrafts).omit({
  id: true,
  createdAt: true,
  lastSavedAt: true,
});

export const updateStartupDraftSchema = createInsertSchema(startupDrafts).omit({
  id: true,
  founderId: true,
  createdAt: true,
}).partial();

export type StartupDraft = typeof startupDrafts.$inferSelect;
export type InsertStartupDraft = z.infer<typeof insertStartupDraftSchema>;
export type UpdateStartupDraft = z.infer<typeof updateStartupDraftSchema>;

// AI Communication Agent - Enums
export const channelTypeEnum = pgEnum("channel_type", ["email", "whatsapp", "sms"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["active", "waiting_response", "resolved", "archived"]);
export const messageIntentEnum = pgEnum("message_intent", ["question", "submission", "follow_up", "greeting", "unknown"]);

// AI Communication Agent - Conversations (unified thread tracking across channels)
export const agentConversations = pgTable("agent_conversations", {
  id: serial("id").primaryKey(),
  
  // Investor identification (null if unknown/unregistered)
  investorProfileId: integer("investor_profile_id").references(() => investorProfiles.id),
  
  // Contact identifiers (for matching and display)
  senderEmail: text("sender_email"),
  senderPhone: text("sender_phone"),
  senderName: text("sender_name"),
  
  // External thread identifiers for each channel
  emailThreadId: text("email_thread_id"), // AgentMail thread ID
  whatsappThreadId: text("whatsapp_thread_id"), // Twilio WhatsApp conversation SID or phone number
  
  // Current conversation state
  status: conversationStatusEnum("status").notNull().default("active"),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  
  // Context tracking
  currentStartupId: integer("current_startup_id").references(() => startups.id), // If discussing a specific startup
  context: jsonb("context").$type<{
    lastIntent: string;
    mentionedStartups: number[];
    pendingQuestions: string[];
    extractedData: Record<string, any>;
    conversationSummary: string;
  }>(),
  
  // Metadata
  messageCount: integer("message_count").default(0),
  isAuthenticated: boolean("is_authenticated").default(false), // Whether we've verified investor identity
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI Communication Agent - Messages
export const agentMessages = pgTable("agent_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => agentConversations.id, { onDelete: "cascade" }),
  
  // Message content
  channel: channelTypeEnum("channel").notNull(),
  direction: messageDirectionEnum("direction").notNull(),
  content: text("content").notNull(),
  
  // AI analysis
  intent: messageIntentEnum("intent"),
  extractedEntities: jsonb("extracted_entities").$type<{
    startupNames: string[];
    founderEmails: string[];
    founderNames: string[];
    urls: string[];
    attachments: { name: string; type: string; url?: string }[];
  }>(),
  
  // External references
  externalMessageId: text("external_message_id"), // AgentMail message ID or Twilio SID
  inReplyToMessageId: integer("in_reply_to_message_id"),
  
  // Attachments
  attachments: jsonb("attachments").$type<{
    filename: string;
    contentType: string;
    url?: string;
    path?: string;
  }[]>(),
  
  // AI response metadata (for outbound messages)
  aiResponseMetadata: jsonb("ai_response_metadata").$type<{
    model: string;
    promptTokens: number;
    completionTokens: number;
    processingTimeMs: number;
    agentDecision: string;
  }>(),
  
  // Delivery status for outbound
  deliveryStatus: text("delivery_status"), // sent, delivered, failed
  deliveryError: text("delivery_error"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Communication Agent - Inbox Configuration
export const agentInboxes = pgTable("agent_inboxes", {
  id: serial("id").primaryKey(),
  
  // AgentMail inbox
  agentMailInboxId: text("agentmail_inbox_id"),
  emailAddress: text("email_address"),
  
  // Twilio WhatsApp configuration
  twilioPhoneNumber: text("twilio_phone_number"),
  
  // Settings
  isActive: boolean("is_active").default(true),
  welcomeMessage: text("welcome_message"),
  autoReplyEnabled: boolean("auto_reply_enabled").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations for agent conversations
export const agentConversationsRelations = relations(agentConversations, ({ one, many }) => ({
  investorProfile: one(investorProfiles, {
    fields: [agentConversations.investorProfileId],
    references: [investorProfiles.id],
  }),
  currentStartup: one(startups, {
    fields: [agentConversations.currentStartupId],
    references: [startups.id],
  }),
  messages: many(agentMessages),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  conversation: one(agentConversations, {
    fields: [agentMessages.conversationId],
    references: [agentConversations.id],
  }),
}));

// Insert schemas for agent tables
export const insertAgentConversationSchema = createInsertSchema(agentConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  messageCount: true,
});

export const insertAgentMessageSchema = createInsertSchema(agentMessages).omit({
  id: true,
  createdAt: true,
});

export const insertAgentInboxSchema = createInsertSchema(agentInboxes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for agent tables
export type AgentConversation = typeof agentConversations.$inferSelect;
export type InsertAgentConversation = z.infer<typeof insertAgentConversationSchema>;

export type AgentMessage = typeof agentMessages.$inferSelect;
export type InsertAgentMessage = z.infer<typeof insertAgentMessageSchema>;

export type AgentInbox = typeof agentInboxes.$inferSelect;
export type InsertAgentInbox = z.infer<typeof insertAgentInboxSchema>;

// Attachment Downloads - logs download URLs before fetching for debugging
export const attachmentDownloads = pgTable("attachment_downloads", {
  id: serial("id").primaryKey(),
  
  // AgentMail identifiers
  inboxId: text("inbox_id").notNull(),
  messageId: text("message_id").notNull(),
  attachmentId: text("attachment_id").notNull(),
  
  // File metadata
  filename: text("filename"),
  contentType: text("content_type"),
  
  // Download URL from AgentMail
  downloadUrl: text("download_url").notNull(),
  
  // Status tracking
  status: text("status").notNull().default("pending"), // pending, downloading, completed, failed
  errorMessage: text("error_message"),
  
  // Result
  savedPath: text("saved_path"), // Object storage path once saved
  fileSize: integer("file_size"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertAttachmentDownloadSchema = createInsertSchema(attachmentDownloads).omit({
  id: true,
  createdAt: true,
});

export type AttachmentDownload = typeof attachmentDownloads.$inferSelect;
export type InsertAttachmentDownload = z.infer<typeof insertAttachmentDownloadSchema>;

// Scout Applications - track scout applications requiring admin approval
export const scoutApplications = pgTable("scout_applications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(), // The user applying to be a scout
  name: text("name").notNull(),
  email: text("email").notNull(),
  linkedinUrl: text("linkedin_url"),
  experience: text("experience"), // Brief description of relevant experience
  motivation: text("motivation"), // Why they want to be a scout
  dealflowSources: text("dealflow_sources"), // Where they source deals from
  status: scoutApplicationStatusEnum("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by"), // Admin who reviewed the application
  reviewNotes: text("review_notes"), // Admin notes on the application
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScoutApplicationSchema = createInsertSchema(scoutApplications).omit({
  id: true,
  status: true,
  reviewedBy: true,
  reviewNotes: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type ScoutApplication = typeof scoutApplications.$inferSelect;
export type InsertScoutApplication = z.infer<typeof insertScoutApplicationSchema>;

