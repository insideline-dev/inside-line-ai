import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../auth/guards';
import { Public, CurrentUser } from '../../../auth/decorators';
import { UserRole } from '../../../auth/entities/auth.schema';
import { TwilioService } from './twilio.service';
import { TwilioSignatureGuard } from './guards';
import {
  TwilioWebhookDto,
  SendMessageDto,
  GetMessagesQueryDto,
  TwilioConfigDto,
} from './dto';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

@Controller('integrations/twilio')
export class TwilioController {
  constructor(private twilioService: TwilioService) {}

  // ============ WEBHOOK ENDPOINT (PUBLIC) ============

  @Public()
  @Post('webhook')
  @UseGuards(TwilioSignatureGuard)
  async handleWebhook(
    @Body() dto: TwilioWebhookDto,
    @Headers('x-twilio-signature') signature: string,
    @Req() req: Request,
  ) {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    return this.twilioService.handleWebhook(dto, signature, url);
  }

  // ============ MESSAGE MANAGEMENT (AUTHENTICATED) ============

  @Get('messages')
  @UseGuards(JwtAuthGuard)
  async getMessages(@CurrentUser() user: User, @Query() query: GetMessagesQueryDto) {
    return this.twilioService.getMessages(user.id, query);
  }

  @Post('messages')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@CurrentUser() user: User, @Body() dto: SendMessageDto) {
    return this.twilioService.sendMessage(user.id, dto);
  }

  @Get('messages/:conversationId')
  @UseGuards(JwtAuthGuard)
  async getConversation(
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.twilioService.getConversation(user.id, conversationId, query.page, query.limit);
  }

  // ============ CONFIGURATION (AUTHENTICATED) ============

  @Get('config')
  @UseGuards(JwtAuthGuard)
  async getConfig(@CurrentUser() user: User) {
    return this.twilioService.getConfig(user.id);
  }

  @Post('config')
  @UseGuards(JwtAuthGuard)
  async saveConfig(@CurrentUser() user: User, @Body() dto: TwilioConfigDto) {
    return this.twilioService.saveConfig(user.id, dto);
  }
}
