import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SubmissionRateLimitService } from '../submission-rate-limit.service';
import { DrizzleService } from '../../../database';
import {
  PortalLinkIntegrity,
  PortalSubmissionAuditOutcome,
} from '../entities';

describe('SubmissionRateLimitService', () => {
  let service: SubmissionRateLimitService;
  let countSpy: jest.Mock;
  let candidatesSpy: jest.Mock;
  let insertSpy: jest.Mock;

  /**
   * The service makes three kinds of reads:
   *  1) per-IP count   -> single `count(*)` row from the audit table.
   *  2) per-email count-> single `count(*)` row from the audit table.
   *  3) candidates     -> a leftJoin on portal_submission + startup.
   *
   * We expose a queue so each test scripts the next few results.
   */
  const queue: Array<{ tag: 'count' | 'candidates' | 'insert'; value: unknown }> = [];

  beforeEach(async () => {
    queue.length = 0;
    countSpy = jest.fn();
    candidatesSpy = jest.fn();
    insertSpy = jest.fn();

    const buildSelectChain = () => {
      const chain: Record<string, jest.Mock> = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn(),
        leftJoin: jest.fn().mockReturnThis(),
      };
      chain.where.mockImplementation(async () => {
        const next = queue.shift();
        if (!next) throw new Error('unscripted select');
        if (next.tag === 'count') {
          countSpy(next.value);
          return [{ count: next.value }];
        }
        candidatesSpy(next.value);
        return next.value as unknown[];
      });
      return chain;
    };

    const db = {
      select: jest.fn().mockImplementation(() => buildSelectChain()),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockImplementation(async () => {
            const next = queue.shift();
            insertSpy(next?.value ?? null);
            return [{ id: 'audit-id', ...(next?.value as object) }];
          }),
        }),
      }),
    };

    const config = {
      get: jest.fn((key: string, fallback?: number) => {
        const defaults: Record<string, number> = {
          PORTAL_RATE_LIMIT_IP_PER_5MIN: 10,
          PORTAL_RATE_LIMIT_IP_WINDOW_SECONDS: 300,
          PORTAL_RATE_LIMIT_EMAIL_PER_30D: 5,
          PORTAL_DEDUPE_WINDOW_DAYS: 30,
        };
        return defaults[key] ?? fallback;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionRateLimitService,
        { provide: DrizzleService, useValue: { db } },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(SubmissionRateLimitService);
  });

  describe('checkAttempt', () => {
    it('allows when under all thresholds (standard portal, no canonical match)', async () => {
      // IP count check
      queue.push({ tag: 'count', value: 0 });
      const decision = await service.checkAttempt({
        portalId: 'p1',
        linkIntegrity: PortalLinkIntegrity.STANDARD,
        founderEmailHash: 'hashx',
        ipAddress: '1.1.1.1',
        normalizedCompanyName: 'acme ai',
      });
      expect(decision).toEqual({ kind: 'allow' });
    });

    it('rate-limits per IP burst', async () => {
      queue.push({ tag: 'count', value: 10 });
      const decision = await service.checkAttempt({
        portalId: 'p1',
        linkIntegrity: PortalLinkIntegrity.STANDARD,
        founderEmailHash: 'hashx',
        ipAddress: '1.1.1.1',
        normalizedCompanyName: 'acme ai',
      });
      expect(decision.kind).toBe('rate_limited');
      if (decision.kind === 'rate_limited') {
        expect(decision.reason).toBe('per_ip_burst');
        expect(decision.retryAfterSeconds).toBe(300);
      }
    });

    it('skips per-IP check when ipAddress is null', async () => {
      // No IP -> goes straight to lenient allow (standard portal, no email
      // check, no canonical check).
      const decision = await service.checkAttempt({
        portalId: 'p1',
        linkIntegrity: PortalLinkIntegrity.STANDARD,
        founderEmailHash: 'hashx',
        ipAddress: null,
        normalizedCompanyName: 'acme ai',
      });
      expect(decision).toEqual({ kind: 'allow' });
    });

    it('enforces per-email rate limit only on strict portals', async () => {
      // IP count, then per-email count
      queue.push({ tag: 'count', value: 0 });
      queue.push({ tag: 'count', value: 5 });
      const decision = await service.checkAttempt({
        portalId: 'p1',
        linkIntegrity: PortalLinkIntegrity.STRICT,
        founderEmailHash: 'hashx',
        ipAddress: '1.1.1.1',
        normalizedCompanyName: 'acme ai',
      });
      expect(decision.kind).toBe('rate_limited');
      if (decision.kind === 'rate_limited') {
        expect(decision.reason).toBe('per_email_window');
      }
    });

    it('returns duplicate_within_window on canonical match (strict portal)', async () => {
      // IP count, per-email count, then candidates
      queue.push({ tag: 'count', value: 0 });
      queue.push({ tag: 'count', value: 0 });
      queue.push({
        tag: 'candidates',
        value: [{ startupId: 'startup-1', name: 'Acme.AI' }],
      });
      const decision = await service.checkAttempt({
        portalId: 'p1',
        linkIntegrity: PortalLinkIntegrity.STRICT,
        founderEmailHash: 'hashx',
        ipAddress: '1.1.1.1',
        normalizedCompanyName: 'acme ai',
      });
      expect(decision.kind).toBe('duplicate_within_window');
      if (decision.kind === 'duplicate_within_window') {
        expect(decision.matchedStartupId).toBe('startup-1');
      }
    });

    it('allows when canonical match has no overlap on a strict portal', async () => {
      queue.push({ tag: 'count', value: 0 });
      queue.push({ tag: 'count', value: 0 });
      queue.push({
        tag: 'candidates',
        value: [{ startupId: 'startup-2', name: 'Globex Industries' }],
      });
      const decision = await service.checkAttempt({
        portalId: 'p1',
        linkIntegrity: PortalLinkIntegrity.STRICT,
        founderEmailHash: 'hashx',
        ipAddress: '1.1.1.1',
        normalizedCompanyName: 'acme ai',
      });
      expect(decision).toEqual({ kind: 'allow' });
    });

    it('lenient portal skips per-email + canonical checks entirely', async () => {
      // Only the IP check runs.
      queue.push({ tag: 'count', value: 0 });
      const decision = await service.checkAttempt({
        portalId: 'p1',
        linkIntegrity: PortalLinkIntegrity.LENIENT,
        founderEmailHash: 'hashx',
        ipAddress: '1.1.1.1',
        normalizedCompanyName: 'acme ai',
      });
      expect(decision).toEqual({ kind: 'allow' });
      // Verify we only scripted+consumed one count.
      expect(queue.length).toBe(0);
    });
  });

  describe('recordOutcome', () => {
    it('persists the audit row and returns it', async () => {
      queue.push({
        tag: 'insert',
        value: { outcome: PortalSubmissionAuditOutcome.ACCEPTED },
      });
      const row = await service.recordOutcome({
        portalId: 'p1',
        founderEmail: 'a@b.com',
        founderEmailHash: 'h',
        ipAddress: null,
        submittedCompanyName: null,
        normalizedCompanyName: null,
        outcome: PortalSubmissionAuditOutcome.ACCEPTED,
        startupId: null,
      });
      expect(row).not.toBeNull();
      expect(insertSpy).toHaveBeenCalled();
    });
  });
});
