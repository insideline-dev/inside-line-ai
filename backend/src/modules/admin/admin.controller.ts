import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { JwtAuthGuard } from '../../auth/guards';
import { CurrentUser } from '../../auth/decorators';
import { UserRole } from '../../auth/entities/auth.schema';
import { RolesGuard } from '../startup/guards';
import { Roles } from '../startup/decorators/roles.decorator';
import { StartupService } from '../startup/startup.service';
import { StartupIntakeService } from '../startup/startup-intake.service';
import { DrizzleService } from '../../database';
import { claraConversation } from '../clara/entities/clara-conversation.schema';
import { claraMessage } from '../clara/entities/clara-message.schema';
import { startup } from '../startup/entities/startup.schema';
import { desc, eq } from 'drizzle-orm';
import { AnalyticsService } from './analytics.service';
import { UserManagementService } from './user-management.service';
import { ScoringConfigService } from './scoring-config.service';
import { DataImportService } from './data-import.service';
import { QueueManagementService } from './queue-management.service';
import { IntegrationHealthService } from './integration-health.service';
import { SystemConfigService } from './system-config.service';
import { BulkDataService } from './bulk-data.service';
import { AdminMatchingService } from './admin-matching.service';
import { AiPromptService } from '../ai/services/ai-prompt.service';
import { AiPromptRuntimeService } from '../ai/services/ai-prompt-runtime.service';
import { AiModelConfigService } from '../ai/services/ai-model-config.service';
import { AI_RUNTIME_ALLOWED_MODEL_NAMES } from '../ai/services/ai-runtime-config.schema';
import { QUEUE_NAMES, QueueName } from '../../queue';
import { EarlyAccessService, CreateEarlyAccessInviteDto } from '../early-access';
import { AI_SCHEMAS } from '../ai/schemas';
import {
  GetUsersQueryDto,
  UpdateUserDto,
  UpdateStageWeightsDto,
  ExportUsersQueryDto,
  ExportStartupsQueryDto,
  GetStartupStatsQueryDto,
  RetryPhaseDto,
  RetryAgentDto,
  CreateAiPromptRevisionDto,
  UpdateAiPromptRevisionDto,
  CreateAiModelConfigDraftDto,
  UpdateAiModelConfigDraftDto,
  AiPromptDefinitionsResponseDto,
  AiPromptRevisionsResponseDto,
  AiPromptRevisionResponseDto,
  AiPromptSeedResultDto,
  AiModelConfigResponseDto,
  AiPromptFlowResponseDto,
  AiPromptContextSchemaResponseDto,
  PreviewAiPromptRequestDto,
  AiPromptPreviewResponseDto,
  AiPromptOutputSchemaResponseDto,
  PreviewAiPipelineContextRequestDto,
  AiPipelineContextPreviewResponseDto,
  QuickCreateStartupDto,
} from './dto';
import { GetStartupsQueryDto } from '../startup/dto';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

@Controller('admin')
@ApiTags("Admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private drizzle: DrizzleService,
    private analyticsService: AnalyticsService,
    private userManagementService: UserManagementService,
    private scoringConfigService: ScoringConfigService,
    private dataImportService: DataImportService,
    private queueManagementService: QueueManagementService,
    private startupService: StartupService,
    private startupIntakeService: StartupIntakeService,
    private integrationHealthService: IntegrationHealthService,
    private systemConfigService: SystemConfigService,
    private bulkDataService: BulkDataService,
    private adminMatchingService: AdminMatchingService,
    private aiPromptService: AiPromptService,
    private aiPromptRuntimeService: AiPromptRuntimeService,
    private aiModelConfigService: AiModelConfigService,
    private earlyAccessService: EarlyAccessService,
  ) {}

  private resolveOutputSchemaForKey(key: string): z.ZodTypeAny | null {
    const schemaMap: Record<string, z.ZodTypeAny> = {
      'extraction.fields': AI_SCHEMAS.extraction,
      'research.team': AI_SCHEMAS.research.team,
      'research.market': AI_SCHEMAS.research.market,
      'research.product': AI_SCHEMAS.research.product,
      'research.news': AI_SCHEMAS.research.news,
      'research.competitor': AI_SCHEMAS.research.competitor,
      'evaluation.team': AI_SCHEMAS.evaluation.team,
      'evaluation.market': AI_SCHEMAS.evaluation.market,
      'evaluation.product': AI_SCHEMAS.evaluation.product,
      'evaluation.traction': AI_SCHEMAS.evaluation.traction,
      'evaluation.businessModel': AI_SCHEMAS.evaluation.businessModel,
      'evaluation.gtm': AI_SCHEMAS.evaluation.gtm,
      'evaluation.financials': AI_SCHEMAS.evaluation.financials,
      'evaluation.competitiveAdvantage': AI_SCHEMAS.evaluation.competitiveAdvantage,
      'evaluation.legal': AI_SCHEMAS.evaluation.legal,
      'evaluation.dealTerms': AI_SCHEMAS.evaluation.dealTerms,
      'evaluation.exitPotential': AI_SCHEMAS.evaluation.exitPotential,
      'synthesis.final': AI_SCHEMAS.synthesis,
      'matching.thesis': AI_SCHEMAS.thesisAlignment,
    };

    return schemaMap[key] ?? null;
  }

  private async buildAiModelConfigResponse(key: string) {
    const { definition, revisions } = await this.aiModelConfigService.listRevisionsByKey(key);
    const resolved = await this.aiModelConfigService.resolveConfig({
      key: definition.key as Parameters<AiModelConfigService['resolveConfig']>[0]['key'],
    });

    return {
      resolved,
      revisions,
      allowedModels: [...AI_RUNTIME_ALLOWED_MODEL_NAMES],
    };
  }

  // ============ ANALYTICS ENDPOINTS ============

  @Get('stats')
  async getStats() {
    return this.analyticsService.getOverview();
  }

  @Get('stats/startups')
  async getStartupStats(@Query() query: GetStartupStatsQueryDto) {
    return this.analyticsService.getStartupStats(query.days);
  }

  @Get('stats/investors')
  async getInvestorStats() {
    return this.analyticsService.getInvestorStats();
  }

  // ============ INTEGRATIONS & CONFIG ENDPOINTS ============

  @Get('integrations/health')
  async getIntegrationHealth() {
    return this.integrationHealthService.getHealth();
  }

  @Get('config')
  async getSystemConfig() {
    return this.systemConfigService.getConfig();
  }

  // ============ USER MANAGEMENT ENDPOINTS ============

  @Get('users')
  async getUsers(@Query() query: GetUsersQueryDto) {
    return this.userManagementService.findAll(query);
  }

  @Get('users/:id')
  async getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.userManagementService.findOne(id);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userManagementService.update(id, dto);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    await this.userManagementService.delete(id);
    return { success: true, message: 'User deleted' };
  }

  @Post('users/:id/impersonate')
  async impersonateUser(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userManagementService.impersonate(admin.id, id);
  }

  // ============ EARLY ACCESS ENDPOINTS ============

  @Post('early-access/invites')
  async createEarlyAccessInvite(
    @CurrentUser() admin: User,
    @Body() dto: CreateEarlyAccessInviteDto,
  ) {
    return this.earlyAccessService.createInvite(admin.id, dto);
  }

  @Get('early-access/invites')
  async listEarlyAccessInvites() {
    return this.earlyAccessService.listInvites();
  }

  @Post('early-access/invites/:id/revoke')
  async revokeEarlyAccessInvite(@Param('id', ParseUUIDPipe) id: string) {
    await this.earlyAccessService.revokeInvite(id);
    return { success: true, message: 'Invite revoked' };
  }

  @Get('early-access/waitlist')
  async getWaitlistEntries() {
    return this.earlyAccessService.listWaitlist();
  }

  @Post('early-access/waitlist/:id/approve')
  @ApiOperation({ summary: 'Approve a waitlist entry by generating an invite' })
  async approveWaitlistEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.earlyAccessService.approveWaitlistEntry(id, adminId);
  }

  // ============ STARTUP MANAGEMENT ENDPOINTS ============
  // These reuse existing StartupService methods that already have admin logic

  @Get('startups')
  async getAllStartups(@Query() query: GetStartupsQueryDto) {
    return this.startupService.adminFindAll(query);
  }

  @Get('startups/pending')
  async getPendingStartups(@Query() query: GetStartupsQueryDto) {
    return this.startupService.adminFindPending(query);
  }

  @Post('startups/quick-create')
  @ApiOperation({ summary: 'Quick-create a startup and trigger the AI pipeline' })
  async quickCreateStartup(
    @CurrentUser() admin: User,
    @Body() dto: QuickCreateStartupDto,
  ) {
    return this.startupIntakeService.quickCreateStartup({
      adminUserId: admin.id,
      ...dto,
    });
  }

  @Post('startups/:id/approve')
  async approveStartup(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.startupService.approve(id, admin.id);
  }

  @Post('startups/:id/reject')
  async rejectStartup(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        'Rejection reason must be at least 10 characters',
      );
    }
    return this.startupService.reject(id, admin.id, reason);
  }

  @Post('startups/:id/match')
  @ApiOperation({ summary: 'Trigger investor thesis matching for an approved startup' })
  async matchStartupInvestors(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminMatchingService.triggerMatchForStartup(id, admin.id);
  }

  @Get('startups/:id/matching/status')
  @ApiOperation({ summary: 'Get latest investor matching status for startup' })
  async getStartupMatchingStatus(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminMatchingService.getLatestMatchingStatus(id);
  }

  @Post('startups/:id/reanalyze')
  async reanalyzeStartup(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.startupService.reanalyze(id, admin.id);
  }

  @Post('startups/:id/retry-phase')
  async retryStartupPhase(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetryPhaseDto,
  ) {
    return this.startupService.adminRetryPhase(id, admin.id, dto);
  }

  @Post('startups/:id/retry-agent')
  async retryStartupAgent(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetryAgentDto,
  ) {
    return this.startupService.adminRetryAgent(id, admin.id, dto);
  }

  // ============ SCORING CONFIGURATION ENDPOINTS ============

  @Get('scoring/weights')
  async getAllScoringWeights() {
    return this.scoringConfigService.getAll();
  }

  @Get('scoring/weights/:stage')
  async getScoringWeightsByStage(@Param('stage') stage: string) {
    return this.scoringConfigService.getByStage(stage);
  }

  @Put('scoring/weights/:stage')
  async updateScoringWeightsByStage(
    @CurrentUser() admin: User,
    @Param('stage') stage: string,
    @Body() dto: UpdateStageWeightsDto,
  ) {
    return this.scoringConfigService.updateByStage(stage, dto, admin.id);
  }

  @Post('scoring/weights/seed')
  async seedScoringWeights(@CurrentUser() admin: User) {
    return this.scoringConfigService.seed(admin.id);
  }

  // ============ AI PROMPT MANAGEMENT ============

  @Get('ai-prompts')
  @ApiOperation({ summary: "List AI prompt definitions and published revisions" })
  @ApiResponse({ status: 200, type: AiPromptDefinitionsResponseDto })
  async getAiPrompts() {
    return this.aiPromptService.listPromptDefinitions();
  }

  @Get('ai-prompts/flow')
  @ApiOperation({ summary: "Get AI flow metadata for visual prompt management" })
  @ApiResponse({ status: 200, type: AiPromptFlowResponseDto })
  async getAiPromptFlow() {
    return this.aiPromptService.getFlowGraph();
  }

  @Get('ai-prompts/:key/revisions')
  @ApiOperation({ summary: "List revisions for a prompt key" })
  @ApiResponse({ status: 200, type: AiPromptRevisionsResponseDto })
  async getAiPromptRevisions(@Param('key') key: string) {
    return this.aiPromptService.getRevisionsByKey(key);
  }

  @Get('ai-prompts/:key/model-config')
  @ApiOperation({ summary: "Get resolved model config, revisions history, and allowed models" })
  @ApiResponse({ status: 200, type: AiModelConfigResponseDto })
  async getAiModelConfig(@Param('key') key: string) {
    return this.buildAiModelConfigResponse(key);
  }

  @Post('ai-prompts/:key/model-config')
  @ApiOperation({ summary: "Create model config draft revision" })
  @ApiResponse({ status: 201, type: AiModelConfigResponseDto })
  async createAiModelConfigDraft(
    @CurrentUser() admin: User,
    @Param('key') key: string,
    @Body() dto: CreateAiModelConfigDraftDto,
  ) {
    await this.aiModelConfigService.createDraft(key, admin.id, dto);
    return this.buildAiModelConfigResponse(key);
  }

  @Patch('ai-prompts/:key/model-config/:revisionId')
  @ApiOperation({ summary: "Update model config draft revision" })
  @ApiResponse({ status: 200, type: AiModelConfigResponseDto })
  async updateAiModelConfigDraft(
    @Param('key') key: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: UpdateAiModelConfigDraftDto,
  ) {
    await this.aiModelConfigService.updateDraft(key, revisionId, dto);
    return this.buildAiModelConfigResponse(key);
  }

  @Post('ai-prompts/:key/model-config/:revisionId/publish')
  @ApiOperation({ summary: "Publish model config draft revision" })
  @ApiResponse({ status: 201, type: AiModelConfigResponseDto })
  async publishAiModelConfigDraft(
    @CurrentUser() admin: User,
    @Param('key') key: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ) {
    await this.aiModelConfigService.publishRevision(key, revisionId, admin.id);
    return this.buildAiModelConfigResponse(key);
  }

  @Delete('ai-prompts/:key/model-config/:revisionId')
  @ApiOperation({ summary: "Archive model config draft revision (soft delete)" })
  async deleteAiModelConfigDraft(
    @Param('key') key: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ) {
    await this.aiModelConfigService.archiveRevision(key, revisionId);
    return { success: true, message: 'Revision archived' };
  }

  @Get('ai-prompts/:key/output-schema')
  @ApiOperation({ summary: "Get output JSON schema for a prompt key" })
  @ApiResponse({ status: 200, type: AiPromptOutputSchemaResponseDto })
  async getAiPromptOutputSchema(@Param('key') key: string) {
    const zodSchema = this.resolveOutputSchemaForKey(key);
    if (!zodSchema) {
      throw new BadRequestException(`No output schema found for key: ${key}`);
    }

    return {
      key,
      jsonSchema: z.toJSONSchema(zodSchema),
      note: 'Schema defined in code. Editable schema config coming in a future update.',
    };
  }

  @Get('ai-prompts/:key/context-schema')
  @ApiOperation({ summary: "Get runtime context schema and variable provenance for a prompt key" })
  @ApiResponse({ status: 200, type: AiPromptContextSchemaResponseDto })
  async getAiPromptContextSchema(@Param('key') key: string) {
    return this.aiPromptRuntimeService.getContextSchema(key);
  }

  @Post('ai-prompts/:key/preview')
  @ApiOperation({ summary: "Preview rendered prompt, resolved variables, and effective model config" })
  @ApiResponse({ status: 200, type: AiPromptPreviewResponseDto })
  async previewAiPrompt(
    @Param('key') key: string,
    @Body() dto: PreviewAiPromptRequestDto,
  ) {
    return this.aiPromptRuntimeService.previewPrompt(key, dto);
  }

  @Post('ai-prompts/pipeline-context-preview')
  @ApiOperation({ summary: "Preview runtime context passed to all research and evaluation agents for a startup" })
  @ApiResponse({ status: 200, type: AiPipelineContextPreviewResponseDto })
  async previewAiPipelineContext(
    @Body() dto: PreviewAiPipelineContextRequestDto,
  ) {
    return this.aiPromptRuntimeService.previewPipelineContexts(dto);
  }

  @Post('ai-prompts/:key/revisions')
  @ApiOperation({ summary: "Create prompt draft revision" })
  @ApiResponse({ status: 201, type: AiPromptRevisionResponseDto })
  async createAiPromptRevision(
    @CurrentUser() admin: User,
    @Param('key') key: string,
    @Body() dto: CreateAiPromptRevisionDto,
  ) {
    return this.aiPromptService.createDraft(key, admin.id, dto);
  }

  @Put('ai-prompts/:key/revisions/:revisionId')
  @ApiOperation({ summary: "Update prompt draft revision" })
  @ApiResponse({ status: 200, type: AiPromptRevisionResponseDto })
  async updateAiPromptRevision(
    @Param('key') key: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: UpdateAiPromptRevisionDto,
  ) {
    return this.aiPromptService.updateDraft(key, revisionId, dto);
  }

  @Post('ai-prompts/:key/revisions/:revisionId/publish')
  @ApiOperation({ summary: "Publish prompt draft revision" })
  @ApiResponse({ status: 201, type: AiPromptRevisionResponseDto })
  async publishAiPromptRevision(
    @CurrentUser() admin: User,
    @Param('key') key: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ) {
    return this.aiPromptService.publishRevision(key, revisionId, admin.id);
  }

  @Post('ai-prompts/seed-from-code')
  @ApiOperation({ summary: "Seed prompt defaults for global and stage-specific variants" })
  @ApiResponse({ status: 201, type: AiPromptSeedResultDto })
  async seedAiPrompts(@CurrentUser() admin: User) {
    return this.aiPromptService.seedFromCode(admin.id);
  }

  // ============ DATA IMPORT/EXPORT ENDPOINTS ============

  @Post('data/import/users')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importUsers(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }

    const content = file.buffer.toString('utf-8');
    return this.dataImportService.importUsers(content);
  }

  @Post('data/import/startups')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importStartups(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }

    const content = file.buffer.toString('utf-8');
    return this.dataImportService.importStartups(content);
  }

  @Get('data/export/users')
  async exportUsers(
    @Query() query: ExportUsersQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.dataImportService.exportUsers(query);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=users-${Date.now()}.csv`,
    );
    res.send(csv);
  }

  @Get('data/export/startups')
  async exportStartups(
    @Query() query: ExportStartupsQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.dataImportService.exportStartups(query);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=startups-${Date.now()}.csv`,
    );
    res.send(csv);
  }

  // ============ BULK DATA ENDPOINTS ============

  @Post('bulk/import-startups')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async bulkImportStartups(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }

    return this.bulkDataService.importStartups(file.buffer);
  }

  @Get('bulk/export-startups')
  async bulkExportStartups(
    @Query() query: ExportStartupsQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.bulkDataService.exportStartups(query);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=startups.csv');
    res.send(csv);
  }

  // ============ QUEUE MANAGEMENT ENDPOINTS ============

  @Get('queue/status')
  async getQueueStatus() {
    return this.queueManagementService.getStatus();
  }

  @Post('queue/retry/:jobId')
  async retryJob(
    @Param('jobId') jobId: string,
    @Query('queue') queueName?: string,
  ) {
    const queue = (queueName as QueueName) || QUEUE_NAMES.TASK;
    return this.queueManagementService.retryJob(queue, jobId);
  }

  // ============ LOCATION NORMALIZATION ENDPOINTS ============

  @Post('normalize-locations')
  async normalizeLocations() {
    return this.analyticsService.normalizeLocations();
  }

  // ============ CLARA CONVERSATIONS ============

  @Get('conversations')
  @ApiOperation({ summary: 'List Clara AI conversations' })
  async getConversations() {
    const rows = await this.drizzle.db
      .select({
        id: claraConversation.id,
        threadId: claraConversation.threadId,
        investorEmail: claraConversation.investorEmail,
        investorName: claraConversation.investorName,
        startupId: claraConversation.startupId,
        startupName: startup.name,
        status: claraConversation.status,
        lastIntent: claraConversation.lastIntent,
        messageCount: claraConversation.messageCount,
        lastMessageAt: claraConversation.lastMessageAt,
        createdAt: claraConversation.createdAt,
      })
      .from(claraConversation)
      .leftJoin(startup, eq(claraConversation.startupId, startup.id))
      .orderBy(desc(claraConversation.lastMessageAt));

    return { data: rows, total: rows.length };
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages for a Clara conversation' })
  async getConversationMessages(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const messages = await this.drizzle.db
      .select({
        id: claraMessage.id,
        direction: claraMessage.direction,
        fromEmail: claraMessage.fromEmail,
        subject: claraMessage.subject,
        bodyText: claraMessage.bodyText,
        intent: claraMessage.intent,
        intentConfidence: claraMessage.intentConfidence,
        processed: claraMessage.processed,
        errorMessage: claraMessage.errorMessage,
        createdAt: claraMessage.createdAt,
      })
      .from(claraMessage)
      .where(eq(claraMessage.conversationId, id))
      .orderBy(claraMessage.createdAt);

    return { data: messages };
  }

  // ============================================================================
  // AI PLACEHOLDERS
  // ============================================================================

  // AI_PLACEHOLDER
  @Get('agents')
  async getAgents() {
    return { data: [], total: 0, message: 'AI feature coming soon' };
  }
}
