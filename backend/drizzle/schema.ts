import { pgTable, unique, uuid, text, boolean, timestamp, index, foreignKey, integer, real, doublePrecision, jsonb, uniqueIndex, varchar, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const adminReviewDecision = pgEnum("admin_review_decision", ['approved', 'rejected', 'needs_revision'])
export const agentCategory = pgEnum("agent_category", ['orchestrator', 'analysis', 'synthesis'])
export const aiFlowNodeKind = pgEnum("ai_flow_node_kind", ['prompt', 'system'])
export const aiPromptSearchMode = pgEnum("ai_prompt_search_mode", ['off', 'provider_grounded_search', 'brave_tool_search', 'provider_and_brave_search'])
export const aiPromptStatus = pgEnum("ai_prompt_status", ['draft', 'published', 'archived'])
export const aiPromptSurface = pgEnum("ai_prompt_surface", ['pipeline', 'clara'])
export const analysisJobPriority = pgEnum("analysis_job_priority", ['high', 'medium', 'low'])
export const analysisJobStatus = pgEnum("analysis_job_status", ['pending', 'processing', 'completed', 'failed'])
export const analysisJobType = pgEnum("analysis_job_type", ['scoring', 'pdf', 'matching', 'market_analysis'])
export const channelType = pgEnum("channel_type", ['email', 'whatsapp', 'sms'])
export const claraConversationStatus = pgEnum("clara_conversation_status", ['active', 'awaiting_info', 'processing', 'completed', 'archived'])
export const claraMessageDirection = pgEnum("clara_message_direction", ['inbound', 'outbound'])
export const conversationStatus = pgEnum("conversation_status", ['active', 'waiting_response', 'resolved', 'archived'])
export const earlyAccessInviteStatus = pgEnum("early_access_invite_status", ['pending', 'redeemed', 'revoked', 'expired'])
export const investorInterestStatus = pgEnum("investor_interest_status", ['interested', 'passed', 'meeting_scheduled'])
export const inviteStatus = pgEnum("invite_status", ['pending', 'accepted', 'expired', 'cancelled'])
export const matchStatus = pgEnum("match_status", ['new', 'reviewing', 'engaged', 'closed', 'passed'])
export const meetingStatus = pgEnum("meeting_status", ['scheduled', 'completed', 'cancelled'])
export const messageDirection = pgEnum("message_direction", ['inbound', 'outbound'])
export const messageIntent = pgEnum("message_intent", ['question', 'submission', 'follow_up', 'greeting', 'unknown'])
export const notificationType = pgEnum("notification_type", ['info', 'success', 'warning', 'error', 'match'])
export const pipelineAgentRunStatus = pgEnum("pipeline_agent_run_status", ['running', 'completed', 'failed', 'fallback'])
export const pipelineFlowConfigStatus = pgEnum("pipeline_flow_config_status", ['draft', 'published', 'archived'])
export const pipelinePhase = pgEnum("pipeline_phase", ['extraction', 'enrichment', 'scraping', 'research', 'evaluation', 'synthesis'])
export const pipelineRunStatus = pgEnum("pipeline_run_status", ['running', 'completed', 'failed', 'cancelled'])
export const pipelineTemplateStatus = pgEnum("pipeline_template_status", ['draft', 'published', 'archived'])
export const pipelineTraceKind = pgEnum("pipeline_trace_kind", ['ai_agent', 'phase_step'])
export const portalSubmissionStatus = pgEnum("portal_submission_status", ['pending', 'approved', 'rejected'])
export const raiseType = pgEnum("raise_type", ['safe', 'convertible_note', 'equity', 'safe_equity', 'undecided'])
export const scoutApplicationStatus = pgEnum("scout_application_status", ['pending', 'approved', 'rejected'])
export const scoutCommissionStatus = pgEnum("scout_commission_status", ['pending', 'paid'])
export const startupStage = pgEnum("startup_stage", ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'series_e', 'series_f_plus'])
export const startupStatus = pgEnum("startup_status", ['draft', 'submitted', 'analyzing', 'pending_review', 'approved', 'rejected'])
export const teamRole = pgEnum("team_role", ['member', 'admin'])
export const trl = pgEnum("trl", ['idea', 'mvp', 'scaling', 'mature'])
export const userRole = pgEnum("user_role", ['founder', 'investor', 'admin', 'scout'])
export const valuationType = pgEnum("valuation_type", ['pre_money', 'post_money'])
export const webhookSource = pgEnum("webhook_source", ['agentmail', 'twilio'])


export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	role: userRole().default('founder').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
}, (table) => [
	unique("users_email_unique").on(table.email),
]);

export const verifications = pgTable("verifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	type: text().default('magic_link').notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("verification_identifier_idx").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
]);

export const investorProfiles = pgTable("investor_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	fundName: text("fund_name").notNull(),
	fundDescription: text("fund_description"),
	aum: text(),
	teamSize: integer("team_size"),
	website: text(),
	logoUrl: text("logo_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("investor_profile_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "investor_profiles_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("investor_profiles_user_id_unique").on(table.userId),
]);

export const investorTheses = pgTable("investor_theses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	industries: text().array(),
	stages: text().array(),
	checkSizeMin: integer("check_size_min"),
	checkSizeMax: integer("check_size_max"),
	geographicFocus: text("geographic_focus").array(),
	mustHaveFeatures: text("must_have_features").array(),
	dealBreakers: text("deal_breakers").array(),
	notes: text(),
	businessModels: text("business_models").array(),
	minRevenue: integer("min_revenue"),
	minGrowthRate: real("min_growth_rate"),
	minTeamSize: integer("min_team_size"),
	thesisNarrative: text("thesis_narrative"),
	antiPortfolio: text("anti_portfolio"),
	website: text(),
	fundSize: doublePrecision("fund_size"),
	thesisSummary: text("thesis_summary"),
	portfolioCompanies: jsonb("portfolio_companies"),
	thesisSummaryGeneratedAt: timestamp("thesis_summary_generated_at", { mode: 'string' }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	geographicFocusNodes: text("geographic_focus_nodes").array(),
	minThesisFitScore: integer("min_thesis_fit_score"),
	minStartupScore: integer("min_startup_score"),
}, (table) => [
	index("investor_thesis_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "investor_theses_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("investor_theses_user_id_unique").on(table.userId),
]);

export const stageScoringWeights = pgTable("stage_scoring_weights", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	stage: startupStage().notNull(),
	weights: jsonb().notNull(),
	rationale: jsonb().notNull(),
	overallRationale: text("overall_rationale"),
	lastModifiedBy: uuid("last_modified_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("stage_scoring_weight_stage_idx").using("btree", table.stage.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.lastModifiedBy],
			foreignColumns: [users.id],
			name: "stage_scoring_weights_last_modified_by_users_id_fk"
		}),
	unique("stage_scoring_weights_stage_unique").on(table.stage),
]);

export const startupMatches = pgTable("startup_matches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	investorId: uuid("investor_id").notNull(),
	startupId: uuid("startup_id").notNull(),
	overallScore: integer("overall_score").notNull(),
	marketScore: integer("market_score"),
	teamScore: integer("team_score"),
	productScore: integer("product_score"),
	tractionScore: integer("traction_score"),
	financialsScore: integer("financials_score"),
	matchReason: text("match_reason"),
	isSaved: boolean("is_saved").default(false).notNull(),
	viewedAt: timestamp("viewed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	status: matchStatus().default('new').notNull(),
	statusChangedAt: timestamp("status_changed_at", { mode: 'string' }),
	passReason: text("pass_reason"),
	passNotes: text("pass_notes"),
	investmentAmount: doublePrecision("investment_amount"),
	investmentCurrency: text("investment_currency").default('USD'),
	investmentDate: timestamp("investment_date", { mode: 'string' }),
	investmentNotes: text("investment_notes"),
	meetingRequested: boolean("meeting_requested").default(false),
	meetingRequestedAt: timestamp("meeting_requested_at", { mode: 'string' }),
	thesisFitScore: integer("thesis_fit_score"),
	fitRationale: text("fit_rationale"),
}, (table) => [
	index("match_investor_saved_idx").using("btree", table.investorId.asc().nullsLast().op("uuid_ops"), table.isSaved.asc().nullsLast().op("bool_ops")),
	index("match_investor_score_idx").using("btree", table.investorId.asc().nullsLast().op("int4_ops"), table.overallScore.asc().nullsLast().op("uuid_ops")),
	index("match_investor_status_idx").using("btree", table.investorId.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("match_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.investorId],
			foreignColumns: [users.id],
			name: "startup_matches_investor_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "startup_matches_startup_id_startups_id_fk"
		}).onDelete("cascade"),
]);

export const teamMembers = pgTable("team_members", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	investorThesisId: uuid("investor_thesis_id").notNull(),
	userId: uuid("user_id").notNull(),
	email: text().notNull(),
	role: teamRole().notNull(),
	joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("team_member_thesis_idx").using("btree", table.investorThesisId.asc().nullsLast().op("uuid_ops")),
	index("team_member_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.investorThesisId],
			foreignColumns: [investorTheses.id],
			name: "team_members_investor_thesis_id_investor_theses_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "team_members_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const adminReviews = pgTable("admin_reviews", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startupId: uuid("startup_id").notNull(),
	reviewerId: uuid("reviewer_id").notNull(),
	scoreOverride: real("score_override"),
	memoEdits: jsonb("memo_edits"),
	adminNotes: text("admin_notes"),
	flaggedConcerns: jsonb("flagged_concerns"),
	investorVisibility: jsonb("investor_visibility"),
	decision: adminReviewDecision(),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("admin_review_reviewer_idx").using("btree", table.reviewerId.asc().nullsLast().op("uuid_ops")),
	index("admin_review_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "admin_reviews_startup_id_startups_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reviewerId],
			foreignColumns: [users.id],
			name: "admin_reviews_reviewer_id_users_id_fk"
		}),
]);

export const startupEvaluations = pgTable("startup_evaluations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startupId: uuid("startup_id").notNull(),
	websiteData: jsonb("website_data"),
	websiteScore: real("website_score"),
	messagingClarityScore: real("messaging_clarity_score"),
	deckData: jsonb("deck_data"),
	deckScore: real("deck_score"),
	missingSlideFlags: jsonb("missing_slide_flags"),
	teamData: jsonb("team_data"),
	teamMemberEvaluations: jsonb("team_member_evaluations"),
	teamScore: real("team_score"),
	founderMarketFit: real("founder_market_fit"),
	executionRiskNotes: text("execution_risk_notes"),
	teamComposition: jsonb("team_composition"),
	marketData: jsonb("market_data"),
	marketScore: real("market_score"),
	tamValidation: jsonb("tam_validation"),
	marketCredibility: real("market_credibility"),
	productData: jsonb("product_data"),
	productScore: real("product_score"),
	productSummary: text("product_summary"),
	extractedScreenshots: jsonb("extracted_screenshots"),
	extractedDemoVideos: jsonb("extracted_demo_videos"),
	extractedFeatures: jsonb("extracted_features"),
	extractedTechStack: jsonb("extracted_tech_stack"),
	tractionData: jsonb("traction_data"),
	tractionScore: real("traction_score"),
	momentumScore: real("momentum_score"),
	tractionCredibility: real("traction_credibility"),
	businessModelData: jsonb("business_model_data"),
	businessModelScore: real("business_model_score"),
	gtmData: jsonb("gtm_data"),
	gtmScore: real("gtm_score"),
	financialsData: jsonb("financials_data"),
	financialsScore: real("financials_score"),
	competitiveAdvantageData: jsonb("competitive_advantage_data"),
	competitiveAdvantageScore: real("competitive_advantage_score"),
	legalData: jsonb("legal_data"),
	legalScore: real("legal_score"),
	dealTermsData: jsonb("deal_terms_data"),
	dealTermsScore: real("deal_terms_score"),
	exitPotentialData: jsonb("exit_potential_data"),
	exitPotentialScore: real("exit_potential_score"),
	sectionScores: jsonb("section_scores"),
	overallScore: real("overall_score"),
	percentileRank: real("percentile_rank"),
	keyStrengths: jsonb("key_strengths"),
	keyRisks: jsonb("key_risks"),
	recommendations: jsonb(),
	dataConfidenceNotes: text("data_confidence_notes"),
	executiveSummary: text("executive_summary"),
	founderReport: jsonb("founder_report"),
	investorMemo: jsonb("investor_memo"),
	sources: jsonb(),
	adminFeedback: jsonb("admin_feedback"),
	webResearchData: jsonb("web_research_data"),
	deckContent: text("deck_content"),
	deckFilesHash: text("deck_files_hash"),
	comprehensiveResearchData: jsonb("comprehensive_research_data"),
	websiteScraped: text("website_scraped"),
	analysisProgress: jsonb("analysis_progress"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("startup_evaluation_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "startup_evaluations_startup_id_startups_id_fk"
		}).onDelete("cascade"),
	unique("startup_evaluations_startup_id_unique").on(table.startupId),
]);

export const agentMessages = pgTable("agent_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	channel: channelType().notNull(),
	direction: messageDirection().notNull(),
	content: text().notNull(),
	intent: messageIntent(),
	extractedEntities: jsonb("extracted_entities"),
	externalMessageId: text("external_message_id"),
	inReplyToMessageId: uuid("in_reply_to_message_id"),
	attachments: jsonb(),
	aiResponseMetadata: jsonb("ai_response_metadata"),
	deliveryStatus: text("delivery_status"),
	deliveryError: text("delivery_error"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("agent_message_conversation_idx").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")),
	index("agent_message_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [agentConversations.id],
			name: "agent_messages_conversation_id_agent_conversations_id_fk"
		}).onDelete("cascade"),
]);

export const attachmentDownloads = pgTable("attachment_downloads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	inboxId: text("inbox_id").notNull(),
	messageId: text("message_id").notNull(),
	attachmentId: text("attachment_id").notNull(),
	filename: text(),
	contentType: text("content_type"),
	downloadUrl: text("download_url").notNull(),
	status: text().default('pending').notNull(),
	errorMessage: text("error_message"),
	savedPath: text("saved_path"),
	fileSize: integer("file_size"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
}, (table) => [
	index("attachment_download_inbox_message_idx").using("btree", table.inboxId.asc().nullsLast().op("text_ops"), table.messageId.asc().nullsLast().op("text_ops")),
]);

export const accounts = pgTable("accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: uuid("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("account_provider_accountId_idx").using("btree", table.providerId.asc().nullsLast().op("text_ops"), table.accountId.asc().nullsLast().op("text_ops")),
	index("account_userId_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "accounts_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const refreshTokens = pgTable("refresh_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	token: text().notNull(),
	userId: uuid("user_id").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	family: text().notNull(),
	used: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("refresh_token_family_idx").using("btree", table.family.asc().nullsLast().op("text_ops")),
	index("refresh_token_userId_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "refresh_tokens_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("refresh_tokens_token_unique").on(table.token),
]);

export const userProfiles = pgTable("user_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	companyName: text("company_name"),
	title: text(),
	linkedinUrl: text("linkedin_url"),
	bio: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_profiles_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("user_profiles_user_id_unique").on(table.userId),
]);

export const assets = pgTable("assets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	projectId: uuid("project_id"),
	key: text().notNull(),
	url: text().notNull(),
	type: text().notNull(),
	mimeType: text("mime_type").notNull(),
	size: integer().notNull(),
	provider: text(),
	jobId: text("job_id"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("asset_project_idx").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("asset_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	index("asset_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "assets_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("assets_key_unique").on(table.key),
]);

export const notifications = pgTable("notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: text().notNull(),
	message: text().notNull(),
	type: notificationType().default('info').notNull(),
	link: text(),
	read: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("notification_user_read_created_idx").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.read.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const startupDrafts = pgTable("startup_drafts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startupId: uuid("startup_id").notNull(),
	userId: uuid("user_id").notNull(),
	draftData: jsonb("draft_data").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("startup_draft_startupId_updated_idx").using("btree", table.startupId.asc().nullsLast().op("timestamp_ops"), table.updatedAt.asc().nullsLast().op("timestamp_ops")),
	index("startup_draft_userId_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "startup_drafts_startup_id_startups_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "startup_drafts_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("startup_drafts_startup_id_unique").on(table.startupId),
]);

export const dataRooms = pgTable("data_rooms", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startupId: uuid("startup_id").notNull(),
	assetId: uuid("asset_id").notNull(),
	category: text().notNull(),
	visibleToInvestors: jsonb("visible_to_investors").default([]),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("data_room_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("data_room_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "data_rooms_startup_id_startups_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.assetId],
			foreignColumns: [assets.id],
			name: "data_rooms_asset_id_assets_id_fk"
		}).onDelete("cascade"),
]);

export const investorInterests = pgTable("investor_interests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	investorId: uuid("investor_id").notNull(),
	startupId: uuid("startup_id").notNull(),
	status: investorInterestStatus().default('interested').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("investor_interest_investor_idx").using("btree", table.investorId.asc().nullsLast().op("uuid_ops")),
	index("investor_interest_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	index("investor_interest_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.investorId],
			foreignColumns: [users.id],
			name: "investor_interests_investor_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "investor_interests_startup_id_startups_id_fk"
		}).onDelete("cascade"),
]);

export const meetings = pgTable("meetings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startupId: uuid("startup_id").notNull(),
	investorId: uuid("investor_id").notNull(),
	scheduledAt: timestamp("scheduled_at", { mode: 'string' }).notNull(),
	duration: integer().default(30).notNull(),
	location: text(),
	notes: text(),
	status: meetingStatus().default('scheduled').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("meeting_investor_idx").using("btree", table.investorId.asc().nullsLast().op("uuid_ops")),
	index("meeting_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	index("meeting_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "meetings_startup_id_startups_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.investorId],
			foreignColumns: [users.id],
			name: "meetings_investor_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const teamInvites = pgTable("team_invites", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	investorThesisId: uuid("investor_thesis_id").notNull(),
	invitedByUserId: uuid("invited_by_user_id").notNull(),
	email: text().notNull(),
	role: teamRole().notNull(),
	inviteCode: text("invite_code").notNull(),
	status: inviteStatus().default('pending').notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	acceptedByUserId: uuid("accepted_by_user_id"),
	acceptedAt: timestamp("accepted_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("team_invite_code_idx").using("btree", table.inviteCode.asc().nullsLast().op("text_ops")),
	index("team_invite_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("team_invite_thesis_idx").using("btree", table.investorThesisId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.investorThesisId],
			foreignColumns: [investorTheses.id],
			name: "team_invites_investor_thesis_id_investor_theses_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invitedByUserId],
			foreignColumns: [users.id],
			name: "team_invites_invited_by_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.acceptedByUserId],
			foreignColumns: [users.id],
			name: "team_invites_accepted_by_user_id_users_id_fk"
		}).onDelete("set null"),
	unique("team_invites_invite_code_unique").on(table.inviteCode),
]);

export const investorNotes = pgTable("investor_notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	investorId: uuid("investor_id").notNull(),
	startupId: uuid("startup_id").notNull(),
	content: text().notNull(),
	category: text(),
	isPinned: boolean("is_pinned").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("investor_note_investor_idx").using("btree", table.investorId.asc().nullsLast().op("uuid_ops")),
	index("investor_note_investor_startup_idx").using("btree", table.investorId.asc().nullsLast().op("uuid_ops"), table.startupId.asc().nullsLast().op("uuid_ops")),
	index("investor_note_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.investorId],
			foreignColumns: [users.id],
			name: "investor_notes_investor_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "investor_notes_startup_id_startups_id_fk"
		}).onDelete("cascade"),
]);

export const investorPortfolios = pgTable("investor_portfolios", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	investorId: uuid("investor_id").notNull(),
	startupId: uuid("startup_id").notNull(),
	dealSize: integer("deal_size"),
	dealStage: text("deal_stage"),
	investedAt: timestamp("invested_at", { mode: 'string' }).notNull(),
	exitedAt: timestamp("exited_at", { mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("investor_portfolio_investor_idx").using("btree", table.investorId.asc().nullsLast().op("uuid_ops")),
	index("investor_portfolio_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.investorId],
			foreignColumns: [users.id],
			name: "investor_portfolios_investor_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "investor_portfolios_startup_id_startups_id_fk"
		}).onDelete("cascade"),
]);

export const portals = pgTable("portals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	logoUrl: text("logo_url"),
	brandColor: text("brand_color"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("portal_slug_idx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	index("portal_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "portals_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("portals_slug_unique").on(table.slug),
]);

export const portalSubmissions = pgTable("portal_submissions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	portalId: uuid("portal_id").notNull(),
	startupId: uuid("startup_id").notNull(),
	status: portalSubmissionStatus().default('pending').notNull(),
	submittedAt: timestamp("submitted_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("portal_submission_portal_submitted_idx").using("btree", table.portalId.asc().nullsLast().op("timestamp_ops"), table.submittedAt.asc().nullsLast().op("timestamp_ops")),
	index("portal_submission_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.portalId],
			foreignColumns: [portals.id],
			name: "portal_submissions_portal_id_portals_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "portal_submissions_startup_id_startups_id_fk"
		}).onDelete("cascade"),
]);

export const scoutApplications = pgTable("scout_applications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	investorId: uuid("investor_id").notNull(),
	linkedinUrl: text("linkedin_url"),
	portfolio: text().array(),
	status: scoutApplicationStatus().default('pending').notNull(),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	reviewedBy: uuid("reviewed_by"),
	rejectionReason: text("rejection_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	name: text(),
	email: text(),
	experience: text(),
	motivation: text(),
	dealflowSources: text("dealflow_sources"),
}, (table) => [
	index("scout_application_investor_status_idx").using("btree", table.investorId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	index("scout_application_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "scout_applications_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.investorId],
			foreignColumns: [users.id],
			name: "scout_applications_investor_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "scout_applications_reviewed_by_users_id_fk"
		}).onDelete("set null"),
]);

export const scoutSubmissions = pgTable("scout_submissions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scoutId: uuid("scout_id").notNull(),
	startupId: uuid("startup_id").notNull(),
	investorId: uuid("investor_id").notNull(),
	commissionRate: integer("commission_rate"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("scout_submission_investor_created_idx").using("btree", table.investorId.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("scout_submission_scout_idx").using("btree", table.scoutId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.scoutId],
			foreignColumns: [users.id],
			name: "scout_submissions_scout_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "scout_submissions_startup_id_startups_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.investorId],
			foreignColumns: [users.id],
			name: "scout_submissions_investor_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const scoutCommissions = pgTable("scout_commissions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scoutId: uuid("scout_id").notNull(),
	submissionId: uuid("submission_id").notNull(),
	dealSize: integer("deal_size").notNull(),
	commissionRate: integer("commission_rate").notNull(),
	commissionAmount: integer("commission_amount").notNull(),
	status: scoutCommissionStatus().default('pending').notNull(),
	paidAt: timestamp("paid_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("scout_commission_scout_idx").using("btree", table.scoutId.asc().nullsLast().op("uuid_ops")),
	index("scout_commission_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("scout_commission_submission_idx").using("btree", table.submissionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.scoutId],
			foreignColumns: [users.id],
			name: "scout_commissions_scout_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.submissionId],
			foreignColumns: [scoutSubmissions.id],
			name: "scout_commissions_submission_id_scout_submissions_id_fk"
		}).onDelete("cascade"),
]);

export const analysisJobs = pgTable("analysis_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startupId: uuid("startup_id").notNull(),
	jobType: analysisJobType("job_type").notNull(),
	status: analysisJobStatus().default('pending').notNull(),
	priority: analysisJobPriority().default('medium').notNull(),
	result: jsonb(),
	errorMessage: text("error_message"),
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("analysis_job_startup_type_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops"), table.jobType.asc().nullsLast().op("uuid_ops")),
	index("analysis_job_status_priority_created_idx").using("btree", table.status.asc().nullsLast().op("timestamp_ops"), table.priority.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "analysis_jobs_startup_id_startups_id_fk"
		}).onDelete("cascade"),
]);

export const emailThreads = pgTable("email_threads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	threadId: text("thread_id").notNull(),
	subject: text(),
	participants: text().array(),
	lastMessageAt: timestamp("last_message_at", { mode: 'string' }),
	unreadCount: integer("unread_count").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("email_thread_user_last_message_idx").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.lastMessageAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "email_threads_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const integrationWebhooks = pgTable("integration_webhooks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	source: webhookSource().notNull(),
	eventType: text("event_type").notNull(),
	payload: jsonb().notNull(),
	processed: boolean().default(false).notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("webhook_source_processed_created_idx").using("btree", table.source.asc().nullsLast().op("timestamp_ops"), table.processed.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
]);

export const linkedinProfileCaches = pgTable("linkedin_profile_caches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	linkedinUrl: text("linkedin_url").notNull(),
	linkedinIdentifier: text("linkedin_identifier").notNull(),
	profileData: jsonb("profile_data").notNull(),
	fetchedAt: timestamp("fetched_at", { mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("linkedin_cache_url_expires_idx").using("btree", table.linkedinUrl.asc().nullsLast().op("timestamp_ops"), table.expiresAt.asc().nullsLast().op("text_ops")),
	index("linkedin_cache_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "linkedin_profile_caches_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("linkedin_profile_caches_linkedin_url_unique").on(table.linkedinUrl),
]);

export const agentConversations = pgTable("agent_conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	investorProfileId: uuid("investor_profile_id"),
	senderEmail: text("sender_email"),
	senderPhone: text("sender_phone"),
	senderName: text("sender_name"),
	emailThreadId: text("email_thread_id"),
	whatsappThreadId: text("whatsapp_thread_id"),
	status: conversationStatus().default('active').notNull(),
	lastMessageAt: timestamp("last_message_at", { mode: 'string' }).defaultNow().notNull(),
	currentStartupId: uuid("current_startup_id"),
	context: jsonb(),
	messageCount: integer("message_count").default(0).notNull(),
	isAuthenticated: boolean("is_authenticated").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("agent_conversation_email_idx").using("btree", table.senderEmail.asc().nullsLast().op("text_ops")),
	index("agent_conversation_investor_idx").using("btree", table.investorProfileId.asc().nullsLast().op("uuid_ops")),
	index("agent_conversation_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.investorProfileId],
			foreignColumns: [investorProfiles.id],
			name: "agent_conversations_investor_profile_id_investor_profiles_id_fk"
		}),
	foreignKey({
			columns: [table.currentStartupId],
			foreignColumns: [startups.id],
			name: "agent_conversations_current_startup_id_startups_id_fk"
		}),
]);

export const agentInboxes = pgTable("agent_inboxes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	agentmailInboxId: text("agentmail_inbox_id"),
	emailAddress: text("email_address"),
	twilioPhoneNumber: text("twilio_phone_number"),
	isActive: boolean("is_active").default(true).notNull(),
	welcomeMessage: text("welcome_message"),
	autoReplyEnabled: boolean("auto_reply_enabled").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const agentPrompts = pgTable("agent_prompts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	agentKey: varchar("agent_key", { length: 50 }).notNull(),
	displayName: text("display_name").notNull(),
	description: text(),
	category: agentCategory().notNull(),
	systemPrompt: text("system_prompt").notNull(),
	humanPrompt: text("human_prompt").notNull(),
	tools: jsonb(),
	inputs: jsonb(),
	outputs: jsonb(),
	parentAgent: text("parent_agent"),
	executionOrder: integer("execution_order").default(0),
	isParallel: boolean("is_parallel").default(true),
	version: integer().default(1).notNull(),
	lastModifiedBy: uuid("last_modified_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("agent_prompt_key_idx").using("btree", table.agentKey.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.lastModifiedBy],
			foreignColumns: [users.id],
			name: "agent_prompts_last_modified_by_users_id_fk"
		}),
	unique("agent_prompts_agent_key_unique").on(table.agentKey),
]);

export const startups = pgTable("startups", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	submittedByRole: userRole("submitted_by_role").default('founder'),
	scoutId: uuid("scout_id"),
	isPrivate: boolean("is_private").default(false),
	name: text().notNull(),
	slug: text().notNull(),
	tagline: text().notNull(),
	description: text().notNull(),
	website: text().notNull(),
	location: text().notNull(),
	normalizedRegion: text("normalized_region"),
	industry: text().notNull(),
	sectorIndustryGroup: text("sector_industry_group"),
	sectorIndustry: text("sector_industry"),
	stage: startupStage().notNull(),
	fundingTarget: integer("funding_target").notNull(),
	teamSize: integer("team_size").notNull(),
	status: startupStatus().default('draft').notNull(),
	pitchDeckUrl: text("pitch_deck_url"),
	demoUrl: text("demo_url"),
	logoUrl: text("logo_url"),
	pitchDeckPath: text("pitch_deck_path"),
	files: jsonb(),
	teamMembers: jsonb("team_members"),
	roundCurrency: text("round_currency").default('USD'),
	valuation: doublePrecision(),
	valuationKnown: boolean("valuation_known").default(true),
	valuationType: valuationType("valuation_type"),
	raiseType: raiseType("raise_type"),
	leadSecured: boolean("lead_secured"),
	leadInvestorName: text("lead_investor_name"),
	contactName: text("contact_name"),
	contactEmail: text("contact_email"),
	contactPhone: text("contact_phone"),
	contactPhoneCountryCode: text("contact_phone_country_code"),
	hasPreviousFunding: boolean("has_previous_funding"),
	previousFundingAmount: doublePrecision("previous_funding_amount"),
	previousFundingCurrency: text("previous_funding_currency"),
	previousInvestors: text("previous_investors"),
	previousRoundType: text("previous_round_type"),
	overallScore: real("overall_score"),
	percentileRank: real("percentile_rank"),
	productDescription: text("product_description"),
	technologyReadinessLevel: trl("technology_readiness_level"),
	productScreenshots: jsonb("product_screenshots"),
	demoVideoUrl: text("demo_video_url"),
	submittedAt: timestamp("submitted_at", { mode: 'string' }),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	rejectedAt: timestamp("rejected_at", { mode: 'string' }),
	rejectionReason: text("rejection_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	geoCountryCode: text("geo_country_code"),
	geoLevel1: text("geo_level_1"),
	geoLevel2: text("geo_level_2"),
	geoLevel3: text("geo_level_3"),
	geoPath: text("geo_path").array(),
}, (table) => [
	index("startup_geo_level1_idx").using("btree", table.geoLevel1.asc().nullsLast().op("text_ops")),
	index("startup_geo_level2_idx").using("btree", table.geoLevel2.asc().nullsLast().op("text_ops")),
	index("startup_geo_level3_idx").using("btree", table.geoLevel3.asc().nullsLast().op("text_ops")),
	index("startup_industry_idx").using("btree", table.industry.asc().nullsLast().op("text_ops")),
	index("startup_location_idx").using("btree", table.location.asc().nullsLast().op("text_ops")),
	uniqueIndex("startup_slug_idx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	index("startup_stage_idx").using("btree", table.stage.asc().nullsLast().op("enum_ops")),
	index("startup_status_created_idx").using("btree", table.status.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("startup_userId_status_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "startups_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.scoutId],
			foreignColumns: [users.id],
			name: "startups_scout_id_users_id_fk"
		}),
	unique("startups_slug_unique").on(table.slug),
]);

export const investorScoringPreferences = pgTable("investor_scoring_preferences", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	investorId: uuid("investor_id").notNull(),
	stage: startupStage().notNull(),
	useCustomWeights: boolean("use_custom_weights").default(false).notNull(),
	customWeights: jsonb("custom_weights"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	customRationale: jsonb("custom_rationale"),
}, (table) => [
	index("investor_scoring_preference_investor_stage_idx").using("btree", table.investorId.asc().nullsLast().op("uuid_ops"), table.stage.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.investorId],
			foreignColumns: [users.id],
			name: "investor_scoring_preferences_investor_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const pipelineRuns = pgTable("pipeline_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	pipelineRunId: text("pipeline_run_id").notNull(),
	startupId: uuid("startup_id").notNull(),
	userId: uuid("user_id").notNull(),
	status: pipelineRunStatus().default('running').notNull(),
	config: jsonb().notNull(),
	error: jsonb(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("pipeline_runs_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	index("pipeline_runs_status_started_idx").using("btree", table.status.asc().nullsLast().op("timestamp_ops"), table.startedAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "pipeline_runs_startup_id_startups_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "pipeline_runs_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("pipeline_runs_pipeline_run_id_unique").on(table.pipelineRunId),
]);

export const pipelineFailures = pgTable("pipeline_failures", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	pipelineRunId: text("pipeline_run_id").notNull(),
	startupId: uuid("startup_id").notNull(),
	phase: pipelinePhase().notNull(),
	jobData: jsonb("job_data"),
	error: jsonb().notNull(),
	retryCount: integer("retry_count").default(0).notNull(),
	attemptedAt: timestamp("attempted_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("pipeline_failures_pipeline_idx").using("btree", table.pipelineRunId.asc().nullsLast().op("text_ops")),
	index("pipeline_failures_startup_phase_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops"), table.phase.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.pipelineRunId],
			foreignColumns: [pipelineRuns.pipelineRunId],
			name: "pipeline_failures_pipeline_run_id_pipeline_runs_pipeline_run_id"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "pipeline_failures_startup_id_startups_id_fk"
		}).onDelete("cascade"),
]);

export const agentmailConfigs = pgTable("agentmail_configs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	inboxId: text("inbox_id").notNull(),
	inboxEmail: text("inbox_email"),
	displayName: text("display_name"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("agentmail_config_inbox_id_idx").using("btree", table.inboxId.asc().nullsLast().op("text_ops")),
	uniqueIndex("agentmail_config_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "agentmail_configs_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const pipelineFeedback = pgTable("pipeline_feedback", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startupId: uuid("startup_id").notNull(),
	phase: pipelinePhase().notNull(),
	agentKey: text("agent_key"),
	feedback: text().notNull(),
	metadata: jsonb(),
	createdBy: uuid("created_by").notNull(),
	consumedAt: timestamp("consumed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("pipeline_feedback_consumed_idx").using("btree", table.consumedAt.asc().nullsLast().op("timestamp_ops")),
	index("pipeline_feedback_startup_agent_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops"), table.agentKey.asc().nullsLast().op("uuid_ops")),
	index("pipeline_feedback_startup_phase_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops"), table.phase.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "pipeline_feedback_startup_id_startups_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "pipeline_feedback_created_by_users_id_fk"
		}).onDelete("cascade"),
]);

export const claraConversations = pgTable("clara_conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	threadId: text("thread_id").notNull(),
	investorUserId: uuid("investor_user_id"),
	investorEmail: text("investor_email").notNull(),
	investorName: text("investor_name"),
	startupId: uuid("startup_id"),
	status: claraConversationStatus().default('active').notNull(),
	lastIntent: text("last_intent"),
	messageCount: integer("message_count").default(0).notNull(),
	context: jsonb().default({}).notNull(),
	lastMessageAt: timestamp("last_message_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("clara_conv_investor_email_idx").using("btree", table.investorEmail.asc().nullsLast().op("text_ops")),
	index("clara_conv_startup_id_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	index("clara_conv_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	uniqueIndex("clara_conv_thread_id_idx").using("btree", table.threadId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.investorUserId],
			foreignColumns: [users.id],
			name: "clara_conversations_investor_user_id_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "clara_conversations_startup_id_startups_id_fk"
		}).onDelete("set null"),
]);

export const claraMessages = pgTable("clara_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	messageId: text("message_id").notNull(),
	direction: claraMessageDirection().notNull(),
	fromEmail: text("from_email").notNull(),
	subject: text(),
	bodyText: text("body_text"),
	intent: text(),
	intentConfidence: real("intent_confidence"),
	attachments: jsonb(),
	processed: boolean().default(false).notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("clara_msg_conversation_id_idx").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")),
	index("clara_msg_direction_idx").using("btree", table.direction.asc().nullsLast().op("enum_ops")),
	index("clara_msg_message_id_idx").using("btree", table.messageId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [claraConversations.id],
			name: "clara_messages_conversation_id_clara_conversations_id_fk"
		}).onDelete("cascade"),
]);

export const investorInboxSubmission = pgTable("investor_inbox_submission", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	threadId: text("thread_id").notNull(),
	messageId: text("message_id").notNull(),
	inboxId: text("inbox_id").notNull(),
	subject: text(),
	bodyText: text("body_text"),
	fromEmail: text("from_email").notNull(),
	attachmentKeys: jsonb("attachment_keys").default([]),
	suggestedCompanyName: text("suggested_company_name"),
	startupId: uuid("startup_id"),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "investor_inbox_submission_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "investor_inbox_submission_startup_id_startups_id_fk"
		}),
]);

export const aiPromptDefinitions = pgTable("ai_prompt_definitions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	key: varchar({ length: 120 }).notNull(),
	displayName: text("display_name").notNull(),
	description: text(),
	surface: aiPromptSurface().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("ai_prompt_definition_key_idx").using("btree", table.key.asc().nullsLast().op("text_ops")),
	unique("ai_prompt_definitions_key_unique").on(table.key),
]);

export const aiPromptRevisions = pgTable("ai_prompt_revisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	definitionId: uuid("definition_id").notNull(),
	stage: startupStage(),
	status: aiPromptStatus().default('draft').notNull(),
	systemPrompt: text("system_prompt").default(').notNull(),
	userPrompt: text("user_prompt").notNull(),
	notes: text(),
	version: integer().default(1).notNull(),
	createdBy: uuid("created_by"),
	publishedBy: uuid("published_by"),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_prompt_revision_def_stage_status_idx").using("btree", table.definitionId.asc().nullsLast().op("uuid_ops"), table.stage.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("ai_prompt_revision_definition_idx").using("btree", table.definitionId.asc().nullsLast().op("uuid_ops")),
	index("ai_prompt_revision_stage_idx").using("btree", table.stage.asc().nullsLast().op("enum_ops")),
	index("ai_prompt_revision_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.definitionId],
			foreignColumns: [aiPromptDefinitions.id],
			name: "ai_prompt_revisions_definition_id_ai_prompt_definitions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "ai_prompt_revisions_created_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.publishedBy],
			foreignColumns: [users.id],
			name: "ai_prompt_revisions_published_by_users_id_fk"
		}),
]);

export const waitlistEntries = pgTable("waitlist_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	companyName: text("company_name").notNull(),
	role: text().notNull(),
	website: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	consentToShareInfo: boolean("consent_to_share_info").default(false).notNull(),
	consentToEarlyAccess: boolean("consent_to_early_access").default(false).notNull(),
}, (table) => [
	index("waitlist_entries_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	unique("waitlist_entries_email_unique").on(table.email),
]);

export const earlyAccessInvites = pgTable("early_access_invites", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text().notNull(),
	tokenHash: text("token_hash").notNull(),
	status: earlyAccessInviteStatus().default('pending').notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	redeemedAt: timestamp("redeemed_at", { mode: 'string' }),
	redeemedByUserId: uuid("redeemed_by_user_id"),
	createdByUserId: uuid("created_by_user_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	role: userRole().default('founder').notNull(),
}, (table) => [
	index("early_access_invites_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("early_access_invites_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.redeemedByUserId],
			foreignColumns: [users.id],
			name: "early_access_invites_redeemed_by_user_id_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "early_access_invites_created_by_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("early_access_invites_token_hash_unique").on(table.tokenHash),
]);

export const pipelineAgentRuns = pgTable("pipeline_agent_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	pipelineRunId: text("pipeline_run_id").notNull(),
	startupId: uuid("startup_id").notNull(),
	phase: pipelinePhase().notNull(),
	agentKey: text("agent_key").notNull(),
	status: pipelineAgentRunStatus().notNull(),
	attempt: integer().default(1).notNull(),
	retryCount: integer("retry_count").default(0).notNull(),
	usedFallback: boolean("used_fallback").default(false).notNull(),
	inputPrompt: text("input_prompt"),
	outputText: text("output_text"),
	outputJson: jsonb("output_json"),
	error: text(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	traceKind: pipelineTraceKind("trace_kind").default('ai_agent').notNull(),
	stepKey: text("step_key"),
	inputJson: jsonb("input_json"),
	meta: jsonb(),
}, (table) => [
	index("pipeline_agent_runs_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("pipeline_agent_runs_pipeline_idx").using("btree", table.pipelineRunId.asc().nullsLast().op("text_ops")),
	index("pipeline_agent_runs_startup_idx").using("btree", table.startupId.asc().nullsLast().op("uuid_ops")),
	index("pipeline_agent_runs_startup_phase_agent_idx").using("btree", table.startupId.asc().nullsLast().op("text_ops"), table.phase.asc().nullsLast().op("enum_ops"), table.agentKey.asc().nullsLast().op("uuid_ops")),
	index("pipeline_agent_runs_startup_run_kind_phase_step_started_idx").using("btree", table.startupId.asc().nullsLast().op("text_ops"), table.pipelineRunId.asc().nullsLast().op("timestamp_ops"), table.traceKind.asc().nullsLast().op("text_ops"), table.phase.asc().nullsLast().op("text_ops"), table.stepKey.asc().nullsLast().op("text_ops"), table.startedAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.pipelineRunId],
			foreignColumns: [pipelineRuns.pipelineRunId],
			name: "pipeline_agent_runs_pipeline_run_id_pipeline_runs_pipeline_run_"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startupId],
			foreignColumns: [startups.id],
			name: "pipeline_agent_runs_startup_id_startups_id_fk"
		}).onDelete("cascade"),
]);

export const aiContextConfigRevisions = pgTable("ai_context_config_revisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	definitionId: uuid("definition_id").notNull(),
	stage: startupStage(),
	status: aiPromptStatus().default('draft').notNull(),
	configJson: jsonb("config_json").notNull(),
	notes: text(),
	version: integer().default(1).notNull(),
	createdBy: uuid("created_by"),
	publishedBy: uuid("published_by"),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_context_config_revision_def_stage_status_idx").using("btree", table.definitionId.asc().nullsLast().op("uuid_ops"), table.stage.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("ai_context_config_revision_definition_idx").using("btree", table.definitionId.asc().nullsLast().op("uuid_ops")),
	index("ai_context_config_revision_stage_idx").using("btree", table.stage.asc().nullsLast().op("enum_ops")),
	index("ai_context_config_revision_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.definitionId],
			foreignColumns: [aiPromptDefinitions.id],
			name: "ai_context_config_revisions_definition_id_ai_prompt_definitions"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "ai_context_config_revisions_created_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.publishedBy],
			foreignColumns: [users.id],
			name: "ai_context_config_revisions_published_by_users_id_fk"
		}),
]);

export const aiModelConfigRevisions = pgTable("ai_model_config_revisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	definitionId: uuid("definition_id").notNull(),
	stage: startupStage(),
	status: aiPromptStatus().default('draft').notNull(),
	modelName: varchar("model_name", { length: 120 }).notNull(),
	searchMode: aiPromptSearchMode("search_mode").default('off').notNull(),
	notes: text(),
	version: integer().default(1).notNull(),
	createdBy: uuid("created_by"),
	publishedBy: uuid("published_by"),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_model_config_revision_def_stage_status_idx").using("btree", table.definitionId.asc().nullsLast().op("uuid_ops"), table.stage.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("ai_model_config_revision_definition_idx").using("btree", table.definitionId.asc().nullsLast().op("uuid_ops")),
	index("ai_model_config_revision_stage_idx").using("btree", table.stage.asc().nullsLast().op("enum_ops")),
	index("ai_model_config_revision_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.definitionId],
			foreignColumns: [aiPromptDefinitions.id],
			name: "ai_model_config_revisions_definition_id_ai_prompt_definitions_i"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "ai_model_config_revisions_created_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.publishedBy],
			foreignColumns: [users.id],
			name: "ai_model_config_revisions_published_by_users_id_fk"
		}),
]);

export const pipelineFlowConfigs = pgTable("pipeline_flow_configs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	status: pipelineFlowConfigStatus().default('draft').notNull(),
	version: integer().default(1).notNull(),
	flowDefinition: jsonb("flow_definition").notNull(),
	pipelineConfig: jsonb("pipeline_config").notNull(),
	notes: text(),
	createdBy: uuid("created_by"),
	publishedBy: uuid("published_by"),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("pipeline_flow_config_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("pipeline_flow_config_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "pipeline_flow_configs_created_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.publishedBy],
			foreignColumns: [users.id],
			name: "pipeline_flow_configs_published_by_users_id_fk"
		}),
]);

export const aiAgentSchemaRevisions = pgTable("ai_agent_schema_revisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	definitionId: uuid("definition_id").notNull(),
	stage: startupStage(),
	status: aiPromptStatus().default('draft').notNull(),
	schemaJson: jsonb("schema_json").notNull(),
	version: integer().default(1).notNull(),
	notes: text(),
	createdBy: uuid("created_by"),
	publishedBy: uuid("published_by"),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_agent_schema_rev_def_stage_status_idx").using("btree", table.definitionId.asc().nullsLast().op("uuid_ops"), table.stage.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("ai_agent_schema_rev_definition_idx").using("btree", table.definitionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.definitionId],
			foreignColumns: [aiPromptDefinitions.id],
			name: "ai_agent_schema_revisions_definition_id_ai_prompt_definitions_i"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "ai_agent_schema_revisions_created_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.publishedBy],
			foreignColumns: [users.id],
			name: "ai_agent_schema_revisions_published_by_users_id_fk"
		}),
]);

export const aiAgentConfigs = pgTable("ai_agent_configs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	flowId: varchar("flow_id", { length: 50 }).notNull(),
	orchestratorNodeId: varchar("orchestrator_node_id", { length: 120 }).notNull(),
	agentKey: varchar("agent_key", { length: 120 }).notNull(),
	label: text().notNull(),
	description: text(),
	kind: aiFlowNodeKind().default('prompt').notNull(),
	enabled: boolean().default(true).notNull(),
	promptDefinitionId: uuid("prompt_definition_id"),
	executionPhase: integer("execution_phase").default(1).notNull(),
	dependsOn: jsonb("depends_on").default([]).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isCustom: boolean("is_custom").default(false).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_agent_config_orchestrator_idx").using("btree", table.flowId.asc().nullsLast().op("text_ops"), table.orchestratorNodeId.asc().nullsLast().op("text_ops")),
	uniqueIndex("ai_agent_config_unique_agent_idx").using("btree", table.flowId.asc().nullsLast().op("text_ops"), table.orchestratorNodeId.asc().nullsLast().op("text_ops"), table.agentKey.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.promptDefinitionId],
			foreignColumns: [aiPromptDefinitions.id],
			name: "ai_agent_configs_prompt_definition_id_ai_prompt_definitions_id_"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "ai_agent_configs_created_by_users_id_fk"
		}),
]);

export const pipelineTemplates = pgTable("pipeline_templates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	flowId: varchar("flow_id", { length: 50 }).notNull(),
	version: integer().default(1).notNull(),
	status: pipelineTemplateStatus().default('draft').notNull(),
	snapshot: jsonb().notNull(),
	notes: text(),
	createdBy: uuid("created_by"),
	publishedBy: uuid("published_by"),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("pipeline_template_flow_status_idx").using("btree", table.flowId.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("text_ops")),
	uniqueIndex("pipeline_template_flow_version_unique").using("btree", table.flowId.asc().nullsLast().op("text_ops"), table.version.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "pipeline_templates_created_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.publishedBy],
			foreignColumns: [users.id],
			name: "pipeline_templates_published_by_users_id_fk"
		}),
]);
