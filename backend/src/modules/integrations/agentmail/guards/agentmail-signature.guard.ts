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
  private static readonly SIGNATURE_HEADER_CANDIDATES = [
    'svix-signature',
    'webhook-signature',
    'x-webhook-signature',
    'x-agentmail-signature',
    'agentmail-signature',
    'x-signature',
    'signature',
  ] as const;
  private static readonly SIGNED_ID_HEADER_CANDIDATES = [
    'svix-id',
    'webhook-id',
    'x-webhook-id',
  ] as const;
  private static readonly SIGNED_TIMESTAMP_HEADER_CANDIDATES = [
    'svix-timestamp',
    'webhook-timestamp',
    'x-webhook-timestamp',
  ] as const;

  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const signature = this.extractSignature(request);

    if (!signature) {
      this.logger.warn('Missing AgentMail signature header');
      throw new UnauthorizedException('Missing signature');
    }

    const secret = this.config.get<string>('AGENTMAIL_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('AGENTMAIL_WEBHOOK_SECRET not configured');
      throw new UnauthorizedException('Webhook not configured');
    }

    const payload = this.extractPayloadBytes(request);
    const isValid = this.validateSignature(request, payload, signature, secret);

    if (!isValid) {
      this.logger.warn('Invalid AgentMail signature');
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }

  private extractSignature(request: Request): string | null {
    for (const headerName of AgentMailSignatureGuard.SIGNATURE_HEADER_CANDIDATES) {
      const value = request.headers[headerName];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (Array.isArray(value) && value.length > 0) {
        const first = value[0];
        if (typeof first === 'string' && first.trim()) {
          return first.trim();
        }
      }
    }

    return null;
  }

  private extractPayloadBytes(request: Request): Buffer {
    const reqWithRaw = request as Request & { rawBody?: Buffer };
    if (reqWithRaw.rawBody && Buffer.isBuffer(reqWithRaw.rawBody)) {
      return reqWithRaw.rawBody;
    }

    // Fallback if raw body is unavailable in this environment.
    return Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');
  }

  private normalizeSignatures(signatureHeader: string): string[] {
    const tokens = signatureHeader
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const normalized: string[] = [];
    for (const token of tokens) {
      // Support formats: sha256=<hex>, v1=<hex>, <hex>
      if (/^sha256=[a-fA-F0-9]{64}$/.test(token)) {
        normalized.push(token.toLowerCase());
        continue;
      }

      if (/^v1=[a-fA-F0-9]{64}$/.test(token)) {
        normalized.push(`sha256=${token.slice(3).toLowerCase()}`);
        continue;
      }

      if (/^[a-fA-F0-9]{64}$/.test(token)) {
        normalized.push(`sha256=${token.toLowerCase()}`);
      }
    }

    return normalized;
  }

  private validateSvixSignature(
    request: Request,
    payload: Buffer,
    secret: string,
  ): boolean {
    try {
      if (!secret.startsWith('whsec_')) {
        return false;
      }

      const id = this.extractHeaderValue(
        request,
        AgentMailSignatureGuard.SIGNED_ID_HEADER_CANDIDATES,
      );
      const ts = this.extractHeaderValue(
        request,
        AgentMailSignatureGuard.SIGNED_TIMESTAMP_HEADER_CANDIDATES,
      );
      const sigHeader = this.extractHeaderValue(
        request,
        AgentMailSignatureGuard.SIGNATURE_HEADER_CANDIDATES,
      );

      if (!id || !ts || !sigHeader) {
        return false;
      }

      // Replay attack prevention: reject webhooks older than 5 minutes
      const tsMs = parseInt(ts, 10) * 1000;
      if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
        this.logger.warn('Svix webhook timestamp outside acceptable window — possible replay attack');
        return false;
      }

      const secretPart = secret.replace(/^whsec_/, '');
      const secretBytes = Buffer.from(secretPart, 'base64');
      const signedContent = `${id}.${ts}.${payload.toString('utf8')}`;
      const expected = crypto
        .createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64');

      const candidates = this.extractSvixSignatureCandidates(sigHeader);
      if (candidates.length === 0) {
        return false;
      }

      return candidates.some((candidate) => {
        if (candidate.length !== expected.length) return false;
        return crypto.timingSafeEqual(
          Buffer.from(candidate),
          Buffer.from(expected),
        );
      });
    } catch (error) {
      this.logger.error('Svix signature validation error', error);
      return false;
    }
  }

  private extractHeaderValue(
    request: Request,
    headerCandidates: readonly string[],
  ): string | null {
    for (const headerName of headerCandidates) {
      const value = request.headers[headerName];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (Array.isArray(value) && value.length > 0) {
        const first = value.find((candidate): candidate is string => {
          return typeof candidate === 'string' && candidate.trim().length > 0;
        });
        if (first) {
          return first.trim();
        }
      }
    }

    return null;
  }

  private validateSignature(
    request: Request,
    payload: Buffer,
    signatureHeader: string,
    secret: string,
  ): boolean {
    try {
      // Prefer Svix verification when relevant headers + secret format are present.
      const isSvixValid = this.validateSvixSignature(request, payload, secret);
      if (isSvixValid) {
        return true;
      }

      const providedSignatures = this.normalizeSignatures(signatureHeader);
      if (providedSignatures.length === 0) {
        return false;
      }

      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const expected = `sha256=${hmac.digest('hex').toLowerCase()}`;

      return providedSignatures.some((provided) => {
        if (provided.length !== expected.length) return false;
        return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
      });
    } catch (error) {
      this.logger.error('Signature validation error', error);
      return false;
    }
  }

  private extractSvixSignatureCandidates(signatureHeader: string): string[] {
    const normalized = signatureHeader.replace(/\s+/g, ',');
    const matches = [...normalized.matchAll(/v\d+[=,]([^,\s]+)/g)];

    if (matches.length > 0) {
      return matches
        .map((match) => match[1]?.trim())
        .filter((candidate): candidate is string => Boolean(candidate));
    }

    return signatureHeader
      .split(/[,\s]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => !/^v\d+$/.test(token));
  }
}
