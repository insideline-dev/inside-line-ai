import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminInvestorService } from '../admin-investor.service';
import { DrizzleService } from '../../../database';

describe('AdminInvestorService', () => {
  let service: AdminInvestorService;

  const createMockDb = () => {
    const resolveQueue: unknown[] = [];
    const db = {
      _queue: resolveQueue,
      select: jest.fn().mockImplementation(() => db),
      from: jest.fn().mockImplementation(() => db),
      where: jest.fn().mockImplementation(() => db),
      leftJoin: jest.fn().mockImplementation(() => db),
      innerJoin: jest.fn().mockImplementation(() => db),
      orderBy: jest.fn().mockImplementation(() => db),
      limit: jest.fn().mockImplementation(() => db),
      then: jest.fn().mockImplementation((resolve: (value: unknown) => unknown) => {
        const value = resolveQueue.length > 0 ? resolveQueue.shift() : [];
        return Promise.resolve(resolve(value));
      }),
    };
    return db;
  };

  let mockDb: ReturnType<typeof createMockDb>;

  const mockInvestorId = 'investor-uuid-001';

  const mockInvestorRow = {
    userId: mockInvestorId,
    userName: 'Jane Investor',
    userEmail: 'jane@vc.com',
    fundName: 'Acme Capital',
    aum: 50_000_000,
    teamSize: 5,
    website: 'https://acmecapital.com',
    logoUrl: null,
    industries: ['SaaS', 'FinTech'],
    stages: ['Seed', 'Series A'],
    checkSizeMin: 250_000,
    checkSizeMax: 2_000_000,
    thesisSummary: 'Focused on B2B SaaS',
    thesisSummaryGeneratedAt: new Date('2024-06-01'),
    isActive: true,
    thesisCreatedAt: new Date('2024-06-01'),
    matchCount: 12,
    createdAt: new Date('2024-01-15'),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminInvestorService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
      ],
    }).compile();

    service = module.get<AdminInvestorService>(AdminInvestorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── listInvestors ───────────────────────────────────────────────────────────

  describe('listInvestors', () => {
    it('should return an array of investors', async () => {
      mockDb._queue.push([mockInvestorRow]);

      const result = await service.listInvestors();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('should derive hasThesis=true when thesisCreatedAt is set', async () => {
      mockDb._queue.push([mockInvestorRow]);

      const [investor] = await service.listInvestors();

      expect(investor.hasThesis).toBe(true);
    });

    it('should derive hasThesis=false when thesisCreatedAt is null', async () => {
      mockDb._queue.push([{ ...mockInvestorRow, thesisCreatedAt: null }]);

      const [investor] = await service.listInvestors();

      expect(investor.hasThesis).toBe(false);
    });

    it('should default industries to [] when null', async () => {
      mockDb._queue.push([{ ...mockInvestorRow, industries: null }]);

      const [investor] = await service.listInvestors();

      expect(investor.industries).toEqual([]);
    });

    it('should default stages to [] when null', async () => {
      mockDb._queue.push([{ ...mockInvestorRow, stages: null }]);

      const [investor] = await service.listInvestors();

      expect(investor.stages).toEqual([]);
    });

    it('should preserve non-null industries and stages as-is', async () => {
      mockDb._queue.push([mockInvestorRow]);

      const [investor] = await service.listInvestors();

      expect(investor.industries).toEqual(['SaaS', 'FinTech']);
      expect(investor.stages).toEqual(['Seed', 'Series A']);
    });

    it('should return empty array when no investors exist', async () => {
      mockDb._queue.push([]);

      const result = await service.listInvestors();

      expect(result).toEqual([]);
    });

    it('should spread all original fields onto the result', async () => {
      mockDb._queue.push([mockInvestorRow]);

      const [investor] = await service.listInvestors();

      expect(investor.userId).toBe(mockInvestorId);
      expect(investor.userName).toBe('Jane Investor');
      expect(investor.fundName).toBe('Acme Capital');
      expect(investor.matchCount).toBe(12);
    });
  });

  // ─── getInvestorDetail ───────────────────────────────────────────────────────

  describe('getInvestorDetail', () => {
    const mockUserRow = {
      id: mockInvestorId,
      name: 'Jane Investor',
      email: 'jane@vc.com',
    };

    const mockProfile = {
      userId: mockInvestorId,
      fundName: 'Acme Capital',
      aum: 50_000_000,
    };

    const mockThesis = {
      userId: mockInvestorId,
      industries: ['SaaS'],
      stages: ['Seed'],
      isActive: true,
    };

    const mockMatches = [
      {
        id: 'match-001',
        startupId: 'startup-001',
        startupName: 'RocketCo',
        overallScore: 87,
        thesisFitScore: 90,
        fitRationale: 'Strong alignment',
        status: 'pending',
        statusChangedAt: null,
        isSaved: false,
        matchReason: 'Industry fit',
        createdAt: new Date('2024-06-10'),
      },
    ];

    const mockScoringPrefs = [
      {
        stage: 'Seed',
        useCustomWeights: false,
        customWeights: null,
      },
    ];

    it('should throw NotFoundException when user does not exist', async () => {
      // First query (user lookup) returns empty
      mockDb._queue.push([]);

      await expect(service.getInvestorDetail('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with correct message', async () => {
      mockDb._queue.push([]);

      await expect(service.getInvestorDetail('ghost-id')).rejects.toThrow(
        'Investor not found',
      );
    });

    it('should return correct shape when user exists', async () => {
      // First query: user lookup → [mockUserRow]
      mockDb._queue.push([mockUserRow]);
      // Promise.all queries (profile, thesis, matches, scoringPrefs)
      mockDb._queue.push([mockProfile]);   // profile .then(rows => rows[0] ?? null)
      mockDb._queue.push([mockThesis]);    // thesis  .then(rows => rows[0] ?? null)
      mockDb._queue.push(mockMatches);     // matches (array)
      mockDb._queue.push(mockScoringPrefs); // scoringPrefs

      const result = await service.getInvestorDetail(mockInvestorId);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('profile');
      expect(result).toHaveProperty('thesis');
      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('scoringPreferences');
    });

    it('should populate user fields correctly', async () => {
      mockDb._queue.push([mockUserRow]);
      mockDb._queue.push([mockProfile]);
      mockDb._queue.push([mockThesis]);
      mockDb._queue.push(mockMatches);
      mockDb._queue.push(mockScoringPrefs);

      const result = await service.getInvestorDetail(mockInvestorId);

      expect(result.user.id).toBe(mockInvestorId);
      expect(result.user.name).toBe('Jane Investor');
      expect(result.user.email).toBe('jane@vc.com');
    });

    it('should return null profile when no profile row exists', async () => {
      mockDb._queue.push([mockUserRow]);
      mockDb._queue.push([]);          // profile → null
      mockDb._queue.push([mockThesis]);
      mockDb._queue.push([]);
      mockDb._queue.push([]);

      const result = await service.getInvestorDetail(mockInvestorId);

      expect(result.profile).toBeNull();
    });

    it('should return null thesis when no thesis row exists', async () => {
      mockDb._queue.push([mockUserRow]);
      mockDb._queue.push([mockProfile]);
      mockDb._queue.push([]);          // thesis → null
      mockDb._queue.push([]);
      mockDb._queue.push([]);

      const result = await service.getInvestorDetail(mockInvestorId);

      expect(result.thesis).toBeNull();
    });

    it('should return empty arrays when no matches or prefs exist', async () => {
      mockDb._queue.push([mockUserRow]);
      mockDb._queue.push([mockProfile]);
      mockDb._queue.push([mockThesis]);
      mockDb._queue.push([]);           // no matches
      mockDb._queue.push([]);           // no scoring prefs

      const result = await service.getInvestorDetail(mockInvestorId);

      expect(result.matches).toEqual([]);
      expect(result.scoringPreferences).toEqual([]);
    });

    it('should return match data with correct fields', async () => {
      mockDb._queue.push([mockUserRow]);
      mockDb._queue.push([mockProfile]);
      mockDb._queue.push([mockThesis]);
      mockDb._queue.push(mockMatches);
      mockDb._queue.push(mockScoringPrefs);

      const result = await service.getInvestorDetail(mockInvestorId);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].startupName).toBe('RocketCo');
      expect(result.matches[0].overallScore).toBe(87);
    });

    it('should return scoring preferences array', async () => {
      mockDb._queue.push([mockUserRow]);
      mockDb._queue.push([mockProfile]);
      mockDb._queue.push([mockThesis]);
      mockDb._queue.push(mockMatches);
      mockDb._queue.push(mockScoringPrefs);

      const result = await service.getInvestorDetail(mockInvestorId);

      expect(result.scoringPreferences).toHaveLength(1);
      expect(result.scoringPreferences[0].stage).toBe('Seed');
    });
  });
});
