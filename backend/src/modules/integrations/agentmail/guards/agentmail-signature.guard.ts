import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class AgentMailSignatureGuard implements CanActivate {
  private readonly logger = new Logger(AgentMailSignatureGuard.name);

  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.headers['x-agentmail-signature'] as string;

    if (!signature) {
      this.logger.warn('Missing AgentMail signature header');
      throw new UnauthorizedException('Missing signature');
    }

    const secret = this.config.get<string>('AGENTMAIL_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('AGENTMAIL_WEBHOOK_SECRET not configured');
      throw new UnauthorizedException('Webhook not configured');
    }

    const payload = JSON.stringify(request.body);
    const isValid = this.validateSignature(payload, signature, secret);

    if (!isValid) {
      this.logger.warn('Invalid AgentMail signature');
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }

  private validateSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const expected = `sha256=${hmac.digest('hex')}`;

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch (error) {
      this.logger.error('Signature validation error', error);
      return false;
    }
  }
}
