import { relations } from "drizzle-orm/relations";
import { users, investorProfiles, investorTheses, stageScoringWeights, startupMatches, startups, teamMembers, adminReviews, startupEvaluations, agentConversations, agentMessages, accounts, refreshTokens, userProfiles, assets, notifications, startupDrafts, dataRooms, investorInterests, meetings, teamInvites, investorNotes, investorPortfolios, portals, portalSubmissions, scoutApplications, scoutSubmissions, scoutCommissions, analysisJobs, emailThreads, linkedinProfileCaches, agentPrompts, investorScoringPreferences, pipelineRuns, pipelineFailures, agentmailConfigs, pipelineFeedback, claraConversations, claraMessages, investorInboxSubmission, aiPromptDefinitions, aiPromptRevisions, earlyAccessInvites, pipelineAgentRuns, aiContextConfigRevisions, aiModelConfigRevisions, pipelineFlowConfigs, aiAgentSchemaRevisions, aiAgentConfigs, pipelineTemplates } from "./schema";

export const investorProfilesRelations = relations(investorProfiles, ({one, many}) => ({
	user: one(users, {
		fields: [investorProfiles.userId],
		references: [users.id]
	}),
	agentConversations: many(agentConversations),
}));

export const usersRelations = relations(users, ({many}) => ({
	investorProfiles: many(investorProfiles),
	investorTheses: many(investorTheses),
	stageScoringWeights: many(stageScoringWeights),
	startupMatches: many(startupMatches),
	teamMembers: many(teamMembers),
	adminReviews: many(adminReviews),
	accounts: many(accounts),
	refreshTokens: many(refreshTokens),
	userProfiles: many(userProfiles),
	assets: many(assets),
	notifications: many(notifications),
	startupDrafts: many(startupDrafts),
	investorInterests: many(investorInterests),
	meetings: many(meetings),
	teamInvites_invitedByUserId: many(teamInvites, {
		relationName: "teamInvites_invitedByUserId_users_id"
	}),
	teamInvites_acceptedByUserId: many(teamInvites, {
		relationName: "teamInvites_acceptedByUserId_users_id"
	}),
	investorNotes: many(investorNotes),
	investorPortfolios: many(investorPortfolios),
	portals: many(portals),
	scoutApplications_userId: many(scoutApplications, {
		relationName: "scoutApplications_userId_users_id"
	}),
	scoutApplications_investorId: many(scoutApplications, {
		relationName: "scoutApplications_investorId_users_id"
	}),
	scoutApplications_reviewedBy: many(scoutApplications, {
		relationName: "scoutApplications_reviewedBy_users_id"
	}),
	scoutSubmissions_scoutId: many(scoutSubmissions, {
		relationName: "scoutSubmissions_scoutId_users_id"
	}),
	scoutSubmissions_investorId: many(scoutSubmissions, {
		relationName: "scoutSubmissions_investorId_users_id"
	}),
	scoutCommissions: many(scoutCommissions),
	emailThreads: many(emailThreads),
	linkedinProfileCaches: many(linkedinProfileCaches),
	agentPrompts: many(agentPrompts),
	startups_userId: many(startups, {
		relationName: "startups_userId_users_id"
	}),
	startups_scoutId: many(startups, {
		relationName: "startups_scoutId_users_id"
	}),
	investorScoringPreferences: many(investorScoringPreferences),
	pipelineRuns: many(pipelineRuns),
	agentmailConfigs: many(agentmailConfigs),
	pipelineFeedbacks: many(pipelineFeedback),
	claraConversations: many(claraConversations),
	investorInboxSubmissions: many(investorInboxSubmission),
	aiPromptRevisions_createdBy: many(aiPromptRevisions, {
		relationName: "aiPromptRevisions_createdBy_users_id"
	}),
	aiPromptRevisions_publishedBy: many(aiPromptRevisions, {
		relationName: "aiPromptRevisions_publishedBy_users_id"
	}),
	earlyAccessInvites_redeemedByUserId: many(earlyAccessInvites, {
		relationName: "earlyAccessInvites_redeemedByUserId_users_id"
	}),
	earlyAccessInvites_createdByUserId: many(earlyAccessInvites, {
		relationName: "earlyAccessInvites_createdByUserId_users_id"
	}),
	aiContextConfigRevisions_createdBy: many(aiContextConfigRevisions, {
		relationName: "aiContextConfigRevisions_createdBy_users_id"
	}),
	aiContextConfigRevisions_publishedBy: many(aiContextConfigRevisions, {
		relationName: "aiContextConfigRevisions_publishedBy_users_id"
	}),
	aiModelConfigRevisions_createdBy: many(aiModelConfigRevisions, {
		relationName: "aiModelConfigRevisions_createdBy_users_id"
	}),
	aiModelConfigRevisions_publishedBy: many(aiModelConfigRevisions, {
		relationName: "aiModelConfigRevisions_publishedBy_users_id"
	}),
	pipelineFlowConfigs_createdBy: many(pipelineFlowConfigs, {
		relationName: "pipelineFlowConfigs_createdBy_users_id"
	}),
	pipelineFlowConfigs_publishedBy: many(pipelineFlowConfigs, {
		relationName: "pipelineFlowConfigs_publishedBy_users_id"
	}),
	aiAgentSchemaRevisions_createdBy: many(aiAgentSchemaRevisions, {
		relationName: "aiAgentSchemaRevisions_createdBy_users_id"
	}),
	aiAgentSchemaRevisions_publishedBy: many(aiAgentSchemaRevisions, {
		relationName: "aiAgentSchemaRevisions_publishedBy_users_id"
	}),
	aiAgentConfigs: many(aiAgentConfigs),
	pipelineTemplates_createdBy: many(pipelineTemplates, {
		relationName: "pipelineTemplates_createdBy_users_id"
	}),
	pipelineTemplates_publishedBy: many(pipelineTemplates, {
		relationName: "pipelineTemplates_publishedBy_users_id"
	}),
}));

export const investorThesesRelations = relations(investorTheses, ({one, many}) => ({
	user: one(users, {
		fields: [investorTheses.userId],
		references: [users.id]
	}),
	teamMembers: many(teamMembers),
	teamInvites: many(teamInvites),
}));

export const stageScoringWeightsRelations = relations(stageScoringWeights, ({one}) => ({
	user: one(users, {
		fields: [stageScoringWeights.lastModifiedBy],
		references: [users.id]
	}),
}));

export const startupMatchesRelations = relations(startupMatches, ({one}) => ({
	user: one(users, {
		fields: [startupMatches.investorId],
		references: [users.id]
	}),
	startup: one(startups, {
		fields: [startupMatches.startupId],
		references: [startups.id]
	}),
}));

export const startupsRelations = relations(startups, ({one, many}) => ({
	startupMatches: many(startupMatches),
	adminReviews: many(adminReviews),
	startupEvaluations: many(startupEvaluations),
	startupDrafts: many(startupDrafts),
	dataRooms: many(dataRooms),
	investorInterests: many(investorInterests),
	meetings: many(meetings),
	investorNotes: many(investorNotes),
	investorPortfolios: many(investorPortfolios),
	portalSubmissions: many(portalSubmissions),
	scoutSubmissions: many(scoutSubmissions),
	analysisJobs: many(analysisJobs),
	agentConversations: many(agentConversations),
	user_userId: one(users, {
		fields: [startups.userId],
		references: [users.id],
		relationName: "startups_userId_users_id"
	}),
	user_scoutId: one(users, {
		fields: [startups.scoutId],
		references: [users.id],
		relationName: "startups_scoutId_users_id"
	}),
	pipelineRuns: many(pipelineRuns),
	pipelineFailures: many(pipelineFailures),
	pipelineFeedbacks: many(pipelineFeedback),
	claraConversations: many(claraConversations),
	investorInboxSubmissions: many(investorInboxSubmission),
	pipelineAgentRuns: many(pipelineAgentRuns),
}));

export const teamMembersRelations = relations(teamMembers, ({one}) => ({
	investorThesis: one(investorTheses, {
		fields: [teamMembers.investorThesisId],
		references: [investorTheses.id]
	}),
	user: one(users, {
		fields: [teamMembers.userId],
		references: [users.id]
	}),
}));

export const adminReviewsRelations = relations(adminReviews, ({one}) => ({
	startup: one(startups, {
		fields: [adminReviews.startupId],
		references: [startups.id]
	}),
	user: one(users, {
		fields: [adminReviews.reviewerId],
		references: [users.id]
	}),
}));

export const startupEvaluationsRelations = relations(startupEvaluations, ({one}) => ({
	startup: one(startups, {
		fields: [startupEvaluations.startupId],
		references: [startups.id]
	}),
}));

export const agentMessagesRelations = relations(agentMessages, ({one}) => ({
	agentConversation: one(agentConversations, {
		fields: [agentMessages.conversationId],
		references: [agentConversations.id]
	}),
}));

export const agentConversationsRelations = relations(agentConversations, ({one, many}) => ({
	agentMessages: many(agentMessages),
	investorProfile: one(investorProfiles, {
		fields: [agentConversations.investorProfileId],
		references: [investorProfiles.id]
	}),
	startup: one(startups, {
		fields: [agentConversations.currentStartupId],
		references: [startups.id]
	}),
}));

export const accountsRelations = relations(accounts, ({one}) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id]
	}),
}));

export const refreshTokensRelations = relations(refreshTokens, ({one}) => ({
	user: one(users, {
		fields: [refreshTokens.userId],
		references: [users.id]
	}),
}));

export const userProfilesRelations = relations(userProfiles, ({one}) => ({
	user: one(users, {
		fields: [userProfiles.userId],
		references: [users.id]
	}),
}));

export const assetsRelations = relations(assets, ({one, many}) => ({
	user: one(users, {
		fields: [assets.userId],
		references: [users.id]
	}),
	dataRooms: many(dataRooms),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(users, {
		fields: [notifications.userId],
		references: [users.id]
	}),
}));

export const startupDraftsRelations = relations(startupDrafts, ({one}) => ({
	startup: one(startups, {
		fields: [startupDrafts.startupId],
		references: [startups.id]
	}),
	user: one(users, {
		fields: [startupDrafts.userId],
		references: [users.id]
	}),
}));

export const dataRoomsRelations = relations(dataRooms, ({one}) => ({
	startup: one(startups, {
		fields: [dataRooms.startupId],
		references: [startups.id]
	}),
	asset: one(assets, {
		fields: [dataRooms.assetId],
		references: [assets.id]
	}),
}));

export const investorInterestsRelations = relations(investorInterests, ({one}) => ({
	user: one(users, {
		fields: [investorInterests.investorId],
		references: [users.id]
	}),
	startup: one(startups, {
		fields: [investorInterests.startupId],
		references: [startups.id]
	}),
}));

export const meetingsRelations = relations(meetings, ({one}) => ({
	startup: one(startups, {
		fields: [meetings.startupId],
		references: [startups.id]
	}),
	user: one(users, {
		fields: [meetings.investorId],
		references: [users.id]
	}),
}));

export const teamInvitesRelations = relations(teamInvites, ({one}) => ({
	investorThesis: one(investorTheses, {
		fields: [teamInvites.investorThesisId],
		references: [investorTheses.id]
	}),
	user_invitedByUserId: one(users, {
		fields: [teamInvites.invitedByUserId],
		references: [users.id],
		relationName: "teamInvites_invitedByUserId_users_id"
	}),
	user_acceptedByUserId: one(users, {
		fields: [teamInvites.acceptedByUserId],
		references: [users.id],
		relationName: "teamInvites_acceptedByUserId_users_id"
	}),
}));

export const investorNotesRelations = relations(investorNotes, ({one}) => ({
	user: one(users, {
		fields: [investorNotes.investorId],
		references: [users.id]
	}),
	startup: one(startups, {
		fields: [investorNotes.startupId],
		references: [startups.id]
	}),
}));

export const investorPortfoliosRelations = relations(investorPortfolios, ({one}) => ({
	user: one(users, {
		fields: [investorPortfolios.investorId],
		references: [users.id]
	}),
	startup: one(startups, {
		fields: [investorPortfolios.startupId],
		references: [startups.id]
	}),
}));

export const portalsRelations = relations(portals, ({one, many}) => ({
	user: one(users, {
		fields: [portals.userId],
		references: [users.id]
	}),
	portalSubmissions: many(portalSubmissions),
}));

export const portalSubmissionsRelations = relations(portalSubmissions, ({one}) => ({
	portal: one(portals, {
		fields: [portalSubmissions.portalId],
		references: [portals.id]
	}),
	startup: one(startups, {
		fields: [portalSubmissions.startupId],
		references: [startups.id]
	}),
}));

export const scoutApplicationsRelations = relations(scoutApplications, ({one}) => ({
	user_userId: one(users, {
		fields: [scoutApplications.userId],
		references: [users.id],
		relationName: "scoutApplications_userId_users_id"
	}),
	user_investorId: one(users, {
		fields: [scoutApplications.investorId],
		references: [users.id],
		relationName: "scoutApplications_investorId_users_id"
	}),
	user_reviewedBy: one(users, {
		fields: [scoutApplications.reviewedBy],
		references: [users.id],
		relationName: "scoutApplications_reviewedBy_users_id"
	}),
}));

export const scoutSubmissionsRelations = relations(scoutSubmissions, ({one, many}) => ({
	user_scoutId: one(users, {
		fields: [scoutSubmissions.scoutId],
		references: [users.id],
		relationName: "scoutSubmissions_scoutId_users_id"
	}),
	startup: one(startups, {
		fields: [scoutSubmissions.startupId],
		references: [startups.id]
	}),
	user_investorId: one(users, {
		fields: [scoutSubmissions.investorId],
		references: [users.id],
		relationName: "scoutSubmissions_investorId_users_id"
	}),
	scoutCommissions: many(scoutCommissions),
}));

export const scoutCommissionsRelations = relations(scoutCommissions, ({one}) => ({
	user: one(users, {
		fields: [scoutCommissions.scoutId],
		references: [users.id]
	}),
	scoutSubmission: one(scoutSubmissions, {
		fields: [scoutCommissions.submissionId],
		references: [scoutSubmissions.id]
	}),
}));

export const analysisJobsRelations = relations(analysisJobs, ({one}) => ({
	startup: one(startups, {
		fields: [analysisJobs.startupId],
		references: [startups.id]
	}),
}));

export const emailThreadsRelations = relations(emailThreads, ({one}) => ({
	user: one(users, {
		fields: [emailThreads.userId],
		references: [users.id]
	}),
}));

export const linkedinProfileCachesRelations = relations(linkedinProfileCaches, ({one}) => ({
	user: one(users, {
		fields: [linkedinProfileCaches.userId],
		references: [users.id]
	}),
}));

export const agentPromptsRelations = relations(agentPrompts, ({one}) => ({
	user: one(users, {
		fields: [agentPrompts.lastModifiedBy],
		references: [users.id]
	}),
}));

export const investorScoringPreferencesRelations = relations(investorScoringPreferences, ({one}) => ({
	user: one(users, {
		fields: [investorScoringPreferences.investorId],
		references: [users.id]
	}),
}));

export const pipelineRunsRelations = relations(pipelineRuns, ({one, many}) => ({
	startup: one(startups, {
		fields: [pipelineRuns.startupId],
		references: [startups.id]
	}),
	user: one(users, {
		fields: [pipelineRuns.userId],
		references: [users.id]
	}),
	pipelineFailures: many(pipelineFailures),
	pipelineAgentRuns: many(pipelineAgentRuns),
}));

export const pipelineFailuresRelations = relations(pipelineFailures, ({one}) => ({
	pipelineRun: one(pipelineRuns, {
		fields: [pipelineFailures.pipelineRunId],
		references: [pipelineRuns.pipelineRunId]
	}),
	startup: one(startups, {
		fields: [pipelineFailures.startupId],
		references: [startups.id]
	}),
}));

export const agentmailConfigsRelations = relations(agentmailConfigs, ({one}) => ({
	user: one(users, {
		fields: [agentmailConfigs.userId],
		references: [users.id]
	}),
}));

export const pipelineFeedbackRelations = relations(pipelineFeedback, ({one}) => ({
	startup: one(startups, {
		fields: [pipelineFeedback.startupId],
		references: [startups.id]
	}),
	user: one(users, {
		fields: [pipelineFeedback.createdBy],
		references: [users.id]
	}),
}));

export const claraConversationsRelations = relations(claraConversations, ({one, many}) => ({
	user: one(users, {
		fields: [claraConversations.investorUserId],
		references: [users.id]
	}),
	startup: one(startups, {
		fields: [claraConversations.startupId],
		references: [startups.id]
	}),
	claraMessages: many(claraMessages),
}));

export const claraMessagesRelations = relations(claraMessages, ({one}) => ({
	claraConversation: one(claraConversations, {
		fields: [claraMessages.conversationId],
		references: [claraConversations.id]
	}),
}));

export const investorInboxSubmissionRelations = relations(investorInboxSubmission, ({one}) => ({
	user: one(users, {
		fields: [investorInboxSubmission.userId],
		references: [users.id]
	}),
	startup: one(startups, {
		fields: [investorInboxSubmission.startupId],
		references: [startups.id]
	}),
}));

export const aiPromptRevisionsRelations = relations(aiPromptRevisions, ({one}) => ({
	aiPromptDefinition: one(aiPromptDefinitions, {
		fields: [aiPromptRevisions.definitionId],
		references: [aiPromptDefinitions.id]
	}),
	user_createdBy: one(users, {
		fields: [aiPromptRevisions.createdBy],
		references: [users.id],
		relationName: "aiPromptRevisions_createdBy_users_id"
	}),
	user_publishedBy: one(users, {
		fields: [aiPromptRevisions.publishedBy],
		references: [users.id],
		relationName: "aiPromptRevisions_publishedBy_users_id"
	}),
}));

export const aiPromptDefinitionsRelations = relations(aiPromptDefinitions, ({many}) => ({
	aiPromptRevisions: many(aiPromptRevisions),
	aiContextConfigRevisions: many(aiContextConfigRevisions),
	aiModelConfigRevisions: many(aiModelConfigRevisions),
	aiAgentSchemaRevisions: many(aiAgentSchemaRevisions),
	aiAgentConfigs: many(aiAgentConfigs),
}));

export const earlyAccessInvitesRelations = relations(earlyAccessInvites, ({one}) => ({
	user_redeemedByUserId: one(users, {
		fields: [earlyAccessInvites.redeemedByUserId],
		references: [users.id],
		relationName: "earlyAccessInvites_redeemedByUserId_users_id"
	}),
	user_createdByUserId: one(users, {
		fields: [earlyAccessInvites.createdByUserId],
		references: [users.id],
		relationName: "earlyAccessInvites_createdByUserId_users_id"
	}),
}));

export const pipelineAgentRunsRelations = relations(pipelineAgentRuns, ({one}) => ({
	pipelineRun: one(pipelineRuns, {
		fields: [pipelineAgentRuns.pipelineRunId],
		references: [pipelineRuns.pipelineRunId]
	}),
	startup: one(startups, {
		fields: [pipelineAgentRuns.startupId],
		references: [startups.id]
	}),
}));

export const aiContextConfigRevisionsRelations = relations(aiContextConfigRevisions, ({one}) => ({
	aiPromptDefinition: one(aiPromptDefinitions, {
		fields: [aiContextConfigRevisions.definitionId],
		references: [aiPromptDefinitions.id]
	}),
	user_createdBy: one(users, {
		fields: [aiContextConfigRevisions.createdBy],
		references: [users.id],
		relationName: "aiContextConfigRevisions_createdBy_users_id"
	}),
	user_publishedBy: one(users, {
		fields: [aiContextConfigRevisions.publishedBy],
		references: [users.id],
		relationName: "aiContextConfigRevisions_publishedBy_users_id"
	}),
}));

export const aiModelConfigRevisionsRelations = relations(aiModelConfigRevisions, ({one}) => ({
	aiPromptDefinition: one(aiPromptDefinitions, {
		fields: [aiModelConfigRevisions.definitionId],
		references: [aiPromptDefinitions.id]
	}),
	user_createdBy: one(users, {
		fields: [aiModelConfigRevisions.createdBy],
		references: [users.id],
		relationName: "aiModelConfigRevisions_createdBy_users_id"
	}),
	user_publishedBy: one(users, {
		fields: [aiModelConfigRevisions.publishedBy],
		references: [users.id],
		relationName: "aiModelConfigRevisions_publishedBy_users_id"
	}),
}));

export const pipelineFlowConfigsRelations = relations(pipelineFlowConfigs, ({one}) => ({
	user_createdBy: one(users, {
		fields: [pipelineFlowConfigs.createdBy],
		references: [users.id],
		relationName: "pipelineFlowConfigs_createdBy_users_id"
	}),
	user_publishedBy: one(users, {
		fields: [pipelineFlowConfigs.publishedBy],
		references: [users.id],
		relationName: "pipelineFlowConfigs_publishedBy_users_id"
	}),
}));

export const aiAgentSchemaRevisionsRelations = relations(aiAgentSchemaRevisions, ({one}) => ({
	aiPromptDefinition: one(aiPromptDefinitions, {
		fields: [aiAgentSchemaRevisions.definitionId],
		references: [aiPromptDefinitions.id]
	}),
	user_createdBy: one(users, {
		fields: [aiAgentSchemaRevisions.createdBy],
		references: [users.id],
		relationName: "aiAgentSchemaRevisions_createdBy_users_id"
	}),
	user_publishedBy: one(users, {
		fields: [aiAgentSchemaRevisions.publishedBy],
		references: [users.id],
		relationName: "aiAgentSchemaRevisions_publishedBy_users_id"
	}),
}));

export const aiAgentConfigsRelations = relations(aiAgentConfigs, ({one}) => ({
	aiPromptDefinition: one(aiPromptDefinitions, {
		fields: [aiAgentConfigs.promptDefinitionId],
		references: [aiPromptDefinitions.id]
	}),
	user: one(users, {
		fields: [aiAgentConfigs.createdBy],
		references: [users.id]
	}),
}));

export const pipelineTemplatesRelations = relations(pipelineTemplates, ({one}) => ({
	user_createdBy: one(users, {
		fields: [pipelineTemplates.createdBy],
		references: [users.id],
		relationName: "pipelineTemplates_createdBy_users_id"
	}),
	user_publishedBy: one(users, {
		fields: [pipelineTemplates.publishedBy],
		references: [users.id],
		relationName: "pipelineTemplates_publishedBy_users_id"
	}),
}));