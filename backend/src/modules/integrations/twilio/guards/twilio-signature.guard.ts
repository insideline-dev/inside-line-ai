import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { TwilioApiClientService } from '../twilio-api-client.service';

@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  private readonly logger = new Logger(TwilioSignatureGuard.name);

  constructor(private twilioClient: TwilioApiClientService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const signature = request.headers['x-twilio-signature'] as string;

    if (!signature) {
      this.logger.warn('Missing X-Twilio-Signature header');
      throw new UnauthorizedException('Missing Twilio signature');
    }

    const url = `${request.protocol}://${request.get('host')}${request.originalUrl}`;
    const params = request.body as Record<string, string>;

    const isValid = this.twilioClient.validateWebhook(signature, url, params);

    if (!isValid) {
      this.logger.warn('Invalid Twilio signature');
      throw new UnauthorizedException('Invalid Twilio signature');
    }

    return true;
  }
}
