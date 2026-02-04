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
import type { AgentMailWebhookDto, GetThreadsQueryDto, AgentMailConfigDto } from './dto';

@ApiTags('integrations/agentmail')
@Controller('integrations/agentmail')
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
export class AgentMailController {
  constructor(private agentMailService: AgentMailService) {}

  // ============================================================================
  // WEBHOOK (Public, signature-validated)
  // ============================================================================

  @Post('webhook')
  @Public()
  @UseGuards(AgentMailSignatureGuard)
  @Throttle({ default: { limit: 1000, ttl: 3600000 } }) // 1000/hour
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive AgentMail webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWebhook(@Body() payload: AgentMailWebhookDto) {
    await this.agentMailService.handleWebhook(payload);
    return { success: true };
  }

  // ============================================================================
  // EMAIL THREADS (Authenticated)
  // ============================================================================

  @Get('threads')
  @ApiBearerAuth('JWT')
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100/min
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
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 10/hour
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save AgentMail config' })
  @ApiResponse({ status: 200, description: 'Config saved' })
  async saveConfig(@CurrentUser() user: DbUser, @Body() config: AgentMailConfigDto) {
    return this.agentMailService.saveConfig(user.id, config);
  }
}
