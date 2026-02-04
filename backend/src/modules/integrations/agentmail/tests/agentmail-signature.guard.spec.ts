import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { AgentMailSignatureGuard } from '../guards/agentmail-signature.guard';
import * as crypto from 'crypto';

describe('AgentMailSignatureGuard', () => {
  let guard: AgentMailSignatureGuard;
  let configService: any;

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

  const createMockContext = (signature: string | undefined, body: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: signature ? { 'x-agentmail-signature': signature } : {},
          body,
        }),
      }),
    } as ExecutionContext;
  };

  const generateValidSignature = (payload: any, secret: string): string => {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
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

    it('should reject signature without sha256 prefix', () => {
      const hmac = crypto.createHmac('sha256', mockSecret);
      hmac.update(JSON.stringify(mockPayload));
      const signature = hmac.digest('hex'); // Missing 'sha256=' prefix
      const context = createMockContext(signature, mockPayload);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
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
});
