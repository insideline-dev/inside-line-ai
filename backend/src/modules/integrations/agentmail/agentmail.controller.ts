import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AgentMailService } from './agentmail.service';
import { AgentMailSignatureGuard } from './guards';
import { CurrentUser } from '../../../auth/decorators';
import { Public } from '../../../auth/decorators';
import type { DbUser } from '../../../auth/user-auth.service';
import type {
  AgentMailWebhookDto,
  GetThreadsQueryDto,
  AgentMailConfigDto,
  SendEmailDto,
  ReplyEmailDto,
  CreateInboxDto,
} from './dto';

@ApiTags('integrations/agentmail')
@Controller('integrations/agentmail')
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
export class AgentMailController {
  constructor(private agentMailService: AgentMailService) {}

  // ============================================================================
  // WEBHOOK (Public, signature-validated via global AGENTMAIL_WEBHOOK_SECRET)
  // ============================================================================

  @Post('webhook')
  @Public()
  @UseGuards(AgentMailSignatureGuard)
  @Throttle({ default: { limit: 1000, ttl: 3600000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive AgentMail webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWebhook(@Body() payload: AgentMailWebhookDto) {
    await this.agentMailService.handleWebhook(payload);
    return { success: true };
  }

  // ============================================================================
  // INBOXES (Authenticated)
  // ============================================================================

  @Post('inboxes')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create inbox and save config' })
  @ApiResponse({ status: 201, description: 'Inbox created' })
  async createInbox(@CurrentUser() user: DbUser, @Body() body: CreateInboxDto) {
    return this.agentMailService.createInboxForUser(user.id, body);
  }

  @Get('inboxes')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'List inboxes (SDK)' })
  @ApiResponse({ status: 200, description: 'Inbox list' })
  async listInboxes(
    @Query('limit') limit?: number,
    @Query('pageToken') pageToken?: string,
  ) {
    return this.agentMailService.listInboxes(limit, pageToken);
  }

  @Get('inboxes/:id')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get inbox (SDK)' })
  @ApiResponse({ status: 200, description: 'Inbox details' })
  async getInbox(@Param('id') id: string) {
    return this.agentMailService.getInbox(id);
  }

  // ============================================================================
  // MESSAGES (Authenticated)
  // ============================================================================

  @Get('messages')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'List messages for current user' })
  @ApiResponse({ status: 200, description: 'Message list' })
  async listMessages(
    @CurrentUser() user: DbUser,
    @Query('limit') limit?: number,
    @Query('pageToken') pageToken?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    return this.agentMailService.listUserMessages(user.id, { limit, pageToken, before, after });
  }

  @Get('messages/:id')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get a single message' })
  @ApiResponse({ status: 200, description: 'Message details' })
  async getMessage(@CurrentUser() user: DbUser, @Param('id') id: string) {
    return this.agentMailService.getUserMessage(user.id, id);
  }

  @Post('messages/send')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 50, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send an email' })
  @ApiResponse({ status: 201, description: 'Email sent' })
  async sendEmail(@CurrentUser() user: DbUser, @Body() body: SendEmailDto) {
    return this.agentMailService.sendUserEmail(user.id, body);
  }

  @Post('messages/:threadId/reply')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 50, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reply to a message' })
  @ApiResponse({ status: 201, description: 'Reply sent' })
  async replyToMessage(
    @CurrentUser() user: DbUser,
    @Param('threadId') messageId: string,
    @Body() body: ReplyEmailDto,
  ) {
    return this.agentMailService.replyToUserEmail(user.id, messageId, body);
  }

  @Get('messages/:msgId/attachments/:attId')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Download an attachment' })
  @ApiResponse({ status: 200, description: 'Attachment data' })
  async downloadAttachment(
    @CurrentUser() user: DbUser,
    @Param('msgId') msgId: string,
    @Param('attId') attId: string,
  ) {
    return this.agentMailService.downloadUserAttachment(user.id, msgId, attId);
  }

  // ============================================================================
  // SDK THREADS (Authenticated)
  // ============================================================================

  @Get('sdk-threads')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'List threads from SDK' })
  @ApiResponse({ status: 200, description: 'Thread list from SDK' })
  async listSdkThreads(
    @CurrentUser() user: DbUser,
    @Query('limit') limit?: number,
    @Query('pageToken') pageToken?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    return this.agentMailService.listUserSdkThreads(user.id, { limit, pageToken, before, after });
  }

  // ============================================================================
  // LOCAL THREADS (DB, Authenticated)
  // ============================================================================

  @Get('threads')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get my email threads (paginated)' })
  @ApiResponse({ status: 200, description: 'List of threads' })
  async getThreads(@CurrentUser() user: DbUser, @Query() query: GetThreadsQueryDto) {
    return this.agentMailService.findThreads(user.id, query);
  }

  @Get('threads/:id')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get thread details' })
  @ApiResponse({ status: 200, description: 'Thread details' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async getThread(@CurrentUser() user: DbUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.agentMailService.findThread(id, user.id);
  }

  @Post('threads/:id/archive')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive thread' })
  @ApiResponse({ status: 200, description: 'Thread archived' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async archiveThread(
    @CurrentUser() user: DbUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agentMailService.archiveThread(id, user.id);
  }

  @Delete('threads/:id')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete thread' })
  @ApiResponse({ status: 204, description: 'Thread deleted' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async deleteThread(
    @CurrentUser() user: DbUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.agentMailService.deleteThread(id, user.id);
  }

  // ============================================================================
  // CONFIGURATION (Authenticated)
  // ============================================================================

  @Get('config')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get my AgentMail config' })
  @ApiResponse({ status: 200, description: 'Config retrieved' })
  async getConfig(@CurrentUser() user: DbUser) {
    return this.agentMailService.getConfig(user.id);
  }

  @Post('config')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save AgentMail config' })
  @ApiResponse({ status: 200, description: 'Config saved' })
  async saveConfig(@CurrentUser() user: DbUser, @Body() config: AgentMailConfigDto) {
    return this.agentMailService.saveConfig(user.id, config);
  }
}
