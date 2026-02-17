import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

export type TwilioMessageParams = {
  from: string;
  to: string;
  body: string;
  mediaUrl?: string[];
};

@Injectable()
export class TwilioApiClientService {
  private readonly logger = new Logger(TwilioApiClientService.name);
  private client: ReturnType<typeof twilio> | null = null;
  private authToken: string | null = null;

  constructor(private config: ConfigService) {
    this.initialize();
  }

  private initialize() {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      this.logger.log('Twilio integration disabled: credentials not configured');
      return;
    }

    this.authToken = authToken;
    this.client = twilio(accountSid, authToken);
    this.logger.log('Twilio client initialized');
  }

  getClient(): ReturnType<typeof twilio> {
    if (!this.client) {
      throw new Error('Twilio client not initialized');
    }
    return this.client;
  }

  async sendMessage(params: TwilioMessageParams) {
    const client = this.getClient();

    const messageParams: any = {
      from: params.from,
      to: params.to,
      body: params.body,
    };

    if (params.mediaUrl && params.mediaUrl.length > 0) {
      messageParams.mediaUrl = params.mediaUrl;
    }

    const message = await client.messages.create(messageParams);

    this.logger.log(`Sent WhatsApp message: ${message.sid}`);
    return message;
  }

  validateWebhook(signature: string, url: string, params: Record<string, string>): boolean {
    if (!this.authToken) {
      this.logger.debug('Skipping Twilio webhook validation: auth token not configured');
      return false;
    }

    try {
      return twilio.validateRequest(this.authToken, signature, url, params);
    } catch (error) {
      this.logger.error('Error validating Twilio webhook', error);
      return false;
    }
  }
}
