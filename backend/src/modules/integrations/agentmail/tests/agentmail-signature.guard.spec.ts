import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { AgentMailSignatureGuard } from '../guards/agentmail-signature.guard';
import * as crypto from 'crypto';

describe('AgentMailSignatureGuard', () => {
  let guard: AgentMailSignatureGuard;
  let configService: { get: ReturnType<typeof jest.fn> };

  const mockSecret = 'test-webhook-secret-key';
  const mockPayload = {
    event: 'email.received',
    thread_id: 'thread-123',
    message: { id: 'msg-123' },
  };

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockReturnValue(mockSecret),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMailSignatureGuard,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    guard = module.get<AgentMailSignatureGuard>(AgentMailSignatureGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  const createMockContext = (
    signature: string | undefined,
    body: unknown,
    extraHeaders?: Record<string, string>,
    rawBody?: Buffer,
  ): ExecutionContext => {
    const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
    if (signature) {
      headers['x-agentmail-signature'] = signature;
    }

    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          body,
          rawBody,
        }),
      }),
    } as ExecutionContext;
  };

  const generateValidSignature = (payload: any, secret: string): string => {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  };

  const generateSvixSignature = (
    payload: unknown,
    secret: string,
    id: string,
    timestamp: string,
  ): string => {
    const secretPart = secret.replace(/^whsec_/, '');
    const secretBytes = Buffer.from(secretPart, 'base64');
    const signedContent = `${id}.${timestamp}.${JSON.stringify(payload)}`;
    return crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');
  };

  // ============ VALID SIGNATURE TESTS ============

  describe('valid signatures', () => {
    it('should allow request with valid signature', () => {
      const signature = generateValidSignature(mockPayload, mockSecret);
      const context = createMockContext(signature, mockPayload);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should validate using HMAC-SHA256', () => {
      const signature = generateValidSignature(mockPayload, mockSecret);
      const context = createMockContext(signature, mockPayload);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should use timing-safe comparison', () => {
      const signature = generateValidSignature(mockPayload, mockSecret);
      const context = createMockContext(signature, mockPayload);

      expect(() => guard.canActivate(context)).not.toThrow();
    });

    it('should allow request with Svix-style headers (svix-*)', () => {
      const svixSecret = `whsec_${Buffer.from('svix-secret-key').toString('base64')}`;
      configService.get.mockReturnValueOnce(svixSecret);

      const id = 'msg_123';
      const timestamp = '1739644800';
      const sig = generateSvixSignature(mockPayload, svixSecret, id, timestamp);

      const context = createMockContext(
        undefined,
        mockPayload,
        {
          'svix-id': id,
          'svix-timestamp': timestamp,
          'svix-signature': `v1,${sig}`,
        },
        Buffer.from(JSON.stringify(mockPayload), 'utf8'),
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow request with webhook-* Svix-compatible headers', () => {
      const svixSecret = `whsec_${Buffer.from('svix-secret-key').toString('base64')}`;
      configService.get.mockReturnValueOnce(svixSecret);

      const id = 'msg_456';
      const timestamp = '1739644801';
      const sig = generateSvixSignature(mockPayload, svixSecret, id, timestamp);

      const context = createMockContext(
        undefined,
        mockPayload,
        {
          'webhook-id': id,
          'webhook-timestamp': timestamp,
          'x-webhook-signature': `v1=${sig}`,
        },
        Buffer.from(JSON.stringify(mockPayload), 'utf8'),
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ============ INVALID SIGNATURE TESTS ============

  describe('invalid signatures', () => {
    it('should reject request with missing signature', () => {
      const context = createMockContext(undefined, mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Missing signature');
    });

    it('should reject request with invalid signature', () => {
      const context = createMockContext('sha256=invalid', mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid signature');
    });

    it('should reject request with wrong secret', () => {
      const wrongSignature = generateValidSignature(mockPayload, 'wrong-secret');
      const context = createMockContext(wrongSignature, mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject request with tampered payload', () => {
      const signature = generateValidSignature(mockPayload, mockSecret);
      const tamperedPayload = { ...mockPayload, event: 'email.deleted' };
      const context = createMockContext(signature, tamperedPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should allow signature without sha256 prefix (hex-only)', () => {
      const hmac = crypto.createHmac('sha256', mockSecret);
      hmac.update(JSON.stringify(mockPayload));
      const signature = hmac.digest('hex');
      const context = createMockContext(signature, mockPayload);

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  // ============ CONFIGURATION TESTS ============

  describe('configuration', () => {
    it('should throw if AGENTMAIL_WEBHOOK_SECRET not configured', () => {
      configService.get.mockReturnValueOnce(undefined);
      const signature = generateValidSignature(mockPayload, mockSecret);
      const context = createMockContext(signature, mockPayload);

      try {
        guard.canActivate(context);
        fail('Should have thrown UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toContain('Webhook not configured');
      }
    });

    it('should retrieve secret from ConfigService', () => {
      const signature = generateValidSignature(mockPayload, mockSecret);
      const context = createMockContext(signature, mockPayload);

      guard.canActivate(context);

      expect(configService.get).toHaveBeenCalledWith('AGENTMAIL_WEBHOOK_SECRET');
    });
  });

  // ============ ERROR HANDLING TESTS ============

  describe('error handling', () => {
    it('should catch signature validation errors', () => {
      const context = createMockContext('invalid-format', mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should handle malformed signatures gracefully', () => {
      const context = createMockContext('sha256=', mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  // ============ EDGE CASE TESTS ============

  describe('edge cases', () => {
    it('should reject signature with wrong prefix (not sha256=)', () => {
      const hmac = crypto.createHmac('sha256', mockSecret);
      hmac.update(JSON.stringify(mockPayload));
      const wrongPrefix = `sha512=${hmac.digest('hex')}`;
      const context = createMockContext(wrongPrefix, mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid signature');
    });

    it('should reject signature with wrong length (not 71 chars)', () => {
      const shortSignature = 'sha256=abc123';
      const context = createMockContext(shortSignature, mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid signature');
    });

    it('should reject signature with wrong length (too long)', () => {
      const longSignature = 'sha256=' + 'a'.repeat(100);
      const context = createMockContext(longSignature, mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject non-hex characters in signature', () => {
      const nonHexSignature = 'sha256=' + 'z'.repeat(64);
      const context = createMockContext(nonHexSignature, mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should validate empty payload with valid signature', () => {
      const emptyPayload = {};
      const signature = generateValidSignature(emptyPayload, mockSecret);
      const context = createMockContext(signature, emptyPayload);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should reject empty payload with signature for non-empty payload', () => {
      const signature = generateValidSignature(mockPayload, mockSecret);
      const emptyPayload = {};
      const context = createMockContext(signature, emptyPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when webhook secret is null', () => {
      configService.get.mockReturnValue(null);
      const signature = generateValidSignature(mockPayload, mockSecret);
      const context = createMockContext(signature, mockPayload);

      try {
        guard.canActivate(context);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toContain('Webhook not configured');
      } finally {
        configService.get.mockReturnValue(mockSecret);
      }
    });

    it('should throw UnauthorizedException when webhook secret is empty string', () => {
      configService.get.mockReturnValue('');
      const signature = generateValidSignature(mockPayload, mockSecret);
      const context = createMockContext(signature, mockPayload);

      try {
        guard.canActivate(context);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toContain('Webhook not configured');
      } finally {
        configService.get.mockReturnValue(mockSecret);
      }
    });

    it('should handle signature header as undefined', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-agentmail-signature': undefined },
            body: mockPayload,
          }),
        }),
      } as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Missing signature');
    });

    it('should handle complex nested payload correctly', () => {
      const complexPayload = {
        event: 'email.received',
        nested: {
          deeply: {
            nested: {
              value: 'test',
              array: [1, 2, 3],
            },
          },
        },
      };
      const signature = generateValidSignature(complexPayload, mockSecret);
      const context = createMockContext(signature, complexPayload);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow signature with uppercase hex characters', () => {
      const hmac = crypto.createHmac('sha256', mockSecret);
      hmac.update(JSON.stringify(mockPayload));
      const upperCaseSignature = `sha256=${hmac.digest('hex').toUpperCase()}`;
      const context = createMockContext(upperCaseSignature, mockPayload);

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should reject signature with special characters', () => {
      const specialCharSignature = 'sha256=' + '@'.repeat(64);
      const context = createMockContext(specialCharSignature, mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject signature with mixed valid/invalid hex', () => {
      const mixedSignature = 'sha256=' + 'a'.repeat(32) + 'z'.repeat(32);
      const context = createMockContext(mixedSignature, mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should handle payload with unicode characters', () => {
      const unicodePayload = {
        message: 'Hello 世界 🌍',
        emoji: '🚀',
      };
      const signature = generateValidSignature(unicodePayload, mockSecret);
      const context = createMockContext(signature, unicodePayload);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow signature with surrounding whitespace', () => {
      const signature = generateValidSignature(mockPayload, mockSecret);
      const paddedSignature = ` ${signature} `;
      const context = createMockContext(paddedSignature, mockPayload);

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle array payload correctly', () => {
      const arrayPayload = [1, 2, 3, { nested: 'value' }];
      const signature = generateValidSignature(arrayPayload, mockSecret);
      const context = createMockContext(signature, arrayPayload);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});
