import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SubmissionService } from '../submission.service';
import { SubmissionRateLimitService } from '../submission-rate-limit.service';
import { DrizzleService } from '../../../database';
import { NotificationService } from '../../../notification';
import { UserAuthService } from '../../../auth/user-auth.service';
import {
  PortalLinkIntegrity,
  PortalSubmissionAuditOutcome,
  PortalSubmissionStatus,
} from '../entities';
import { StartupMatchingPipelineService } from '../../ai/services/startup-matching-pipeline.service';
import { StartupStage, StartupStatus } from '../../startup/entities/startup.schema';
import { QueueService } from '../../../queue';
import { PipelineService } from '../../ai/services/pipeline.service';
import { AiConfigService } from '../../ai/services/ai-config.service';

describe('SubmissionService', () => {
  let service: SubmissionService;
  let _drizzleService: jest.Mocked<DrizzleService>;
  let notificationService: jest.Mocked<NotificationService>;
  let userAuthService: jest.Mocked<UserAuthService>;
  let rateLimitService: {
    checkAttempt: jest.Mock;
    recordOutcome: jest.Mock;
  };

  type MockDb = Record<string, jest.Mock>;
  const createMockDb = (): MockDb => {
    const mockChain: MockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockResolvedValue([]),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      transaction: jest.fn((callback: (db: MockDb) => unknown) =>
        callback(createMockDb()),
      ),
    };
    return mockChain;
  };

  let mockDb: ReturnType<typeof createMockDb>;

  const mockPortalOwnerId = '123e4567-e89b-12d3-a456-426614174000';
  const mockFounderId = '123e4567-e89b-12d3-a456-426614174001';
  const mockPortalId = '123e4567-e89b-12d3-a456-426614174002';
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174003';
  const mockSubmissionId = '123e4567-e89b-12d3-a456-426614174004';
  const mockAuditId = '123e4567-e89b-12d3-a456-426614174099';

  const mockPortal = {
    id: mockPortalId,
    userId: mockPortalOwnerId,
    name: 'Acme Ventures',
    slug: 'acme-ventures',
    description: 'We invest in early-stage startups',
    logoUrl: null,
    brandColor: '#FF0000',
    isActive: true,
    linkIntegrity: PortalLinkIntegrity.STANDARD,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockFounder = {
    id: mockFounderId,
    email: 'founder@startup.com',
    name: 'Founder Name',
    emailVerified: false,
    image: null,
    role: 'user' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStartup = {
    id: mockStartupId,
    userId: mockFounderId,
    slug: 'test-startup',
    name: 'Test Startup',
    tagline: 'A revolutionary startup',
    description:
      'This is a test startup description that is long enough to pass validation requirements.',
    website: 'https://startup.com',
    location: 'San Francisco',
    industry: 'SaaS',
    stage: StartupStage.SEED,
    fundingTarget: 1000000,
    teamSize: 5,
    status: StartupStatus.SUBMITTED,
    pitchDeckUrl: null,
    demoUrl: null,
    submittedAt: new Date(),
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSubmission = {
    id: mockSubmissionId,
    portalId: mockPortalId,
    startupId: mockStartupId,
    status: PortalSubmissionStatus.PENDING,
    submittedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    rateLimitService = {
      checkAttempt: jest.fn().mockResolvedValue({ kind: 'allow' }),
      recordOutcome: jest.fn().mockResolvedValue({ id: mockAuditId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
            withRLS: jest.fn((_userId, callback) => callback(mockDb)),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: UserAuthService,
          useValue: {
            findUserByEmail: jest.fn(),
            createUser: jest.fn(),
          },
        },
        {
          provide: QueueService,
          useValue: {
            addJob: jest.fn(),
          },
        },
        {
          provide: PipelineService,
          useValue: {
            startPipeline: jest.fn(),
          },
        },
        {
          provide: AiConfigService,
          useValue: {
            getModelForPurpose: jest.fn().mockReturnValue('gpt-4'),
            isPipelineEnabled: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: StartupMatchingPipelineService,
          useValue: {
            queueStartupMatching: jest.fn().mockResolvedValue({
              startupId: mockStartupId,
              analysisJobId: 'analysis-job-1',
              queueJobId: 'queue-job-1',
              status: 'queued',
              triggerSource: 'approval',
            }),
          },
        },
        {
          provide: SubmissionRateLimitService,
          useValue: rateLimitService,
        },
      ],
    }).compile();

    service = module.get<SubmissionService>(SubmissionService);
    _drizzleService = module.get(DrizzleService);
    notificationService = module.get(NotificationService);
    userAuthService = module.get(UserAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const validDto = {
    name: 'Test Startup',
    tagline: 'A revolutionary startup',
    description:
      'This is a test startup description that is long enough to pass validation requirements.',
    website: 'https://startup.com',
    location: 'San Francisco',
    industry: 'SaaS',
    stage: StartupStage.SEED,
    fundingTarget: 1000000,
    teamSize: 5,
    founderEmail: 'founder@startup.com',
  };

  const primeAllowPathDbForAccept = () => {
    const txMock = createMockDb();
    mockDb.transaction.mockImplementation((callback) => {
      txMock.returning
        .mockResolvedValueOnce([mockStartup])
        .mockResolvedValueOnce([mockSubmission]);
      return callback(txMock);
    });
    return txMock;
  };

  describe('create', () => {
    it('should create submission for existing user and return audit metadata', async () => {
      const txMock = primeAllowPathDbForAccept();
      // portal lookup + 2 canonical dedupe lookups (name, website) -> none match
      mockDb.limit
        .mockResolvedValueOnce([mockPortal])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      userAuthService.findUserByEmail.mockResolvedValue(mockFounder);

      const result = await service.create(mockPortalId, validDto, {
        ipAddress: '1.2.3.4',
      });

      expect(result.outcome).toBe(PortalSubmissionAuditOutcome.ACCEPTED);
      expect(result.submission).toEqual(mockSubmission);
      expect(result.auditId).toBe(mockAuditId);
      expect(userAuthService.findUserByEmail).toHaveBeenCalledWith(
        'founder@startup.com',
      );
      expect(txMock.values).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          location: 'San Francisco',
          geoCountryCode: 'US',
          geoLevel1: 'l1:north_america',
          geoLevel2: 'l2:us_canada',
          geoLevel3: 'l3:us',
          geoPath: ['l1:north_america', 'l2:us_canada', 'l3:us'],
        }),
      );
      expect(notificationService.create).toHaveBeenCalled();
      // accepted audit row was written with the new startup id
      expect(rateLimitService.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: PortalSubmissionAuditOutcome.ACCEPTED,
          startupId: mockStartupId,
          ipAddress: '1.2.3.4',
          portalId: mockPortalId,
        }),
      );
    });

    it('should create submission and new user for new founder', async () => {
      primeAllowPathDbForAccept();
      // portal lookup + 2 canonical dedupe lookups (name, website) -> none match
      mockDb.limit
        .mockResolvedValueOnce([mockPortal])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      userAuthService.findUserByEmail.mockResolvedValue(undefined);
      userAuthService.createUser.mockResolvedValue(mockFounder);

      const result = await service.create(mockPortalId, {
        ...validDto,
        founderEmail: 'newfound@startup.com',
        founderName: 'New Founder',
      });

      expect(result.outcome).toBe(PortalSubmissionAuditOutcome.ACCEPTED);
      expect(result.submission).toEqual(mockSubmission);
      expect(userAuthService.createUser).toHaveBeenCalledWith({
        email: 'newfound@startup.com',
        name: 'New Founder',
        emailVerified: false,
      });
    });

    it('should throw NotFoundException if portal not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      await expect(service.create(mockPortalId, validDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if portal is inactive', async () => {
      mockDb.limit.mockResolvedValueOnce([{ ...mockPortal, isActive: false }]);
      await expect(service.create(mockPortalId, validDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('links a portal submission to an existing startup when canonical dedupe matches', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ ...mockPortal }])
        .mockResolvedValueOnce([
          {
            id: mockStartupId,
            name: 'Test Startup, Inc.',
            status: StartupStatus.SUBMITTED,
            userId: mockFounderId,
          },
        ]);

      const txMock = createMockDb();
      txMock.returning.mockResolvedValueOnce([mockSubmission]);
      mockDb.transaction.mockImplementation((callback) => callback(txMock));
      userAuthService.findUserByEmail.mockResolvedValue(mockFounder);

      const dto = {
        name: '  Test Startup, Inc.  ',
        tagline: '  A revolutionary startup  ',
        description:
          'This is a test startup description that is long enough to pass validation requirements.',
        website: 'https://startup.com',
        location: 'San Francisco',
        industry: 'SaaS',
        stage: StartupStage.SEED,
        fundingTarget: 1000000,
        teamSize: 5,
        founderEmail: 'founder@startup.com',
        founderName: 'Founder Name',
      };

      const result = await service.create(mockPortalId, dto, {
        ipAddress: '1.2.3.4',
      });

      // The merged path now returns PublicSubmissionResult (audit metadata)
      // instead of the raw submission row. The canonical-link guard still
      // suppresses the pipeline kick-off and emits the "Existing startup
      // linked" notification.
      expect(result.outcome).toBe(PortalSubmissionAuditOutcome.ACCEPTED);
      expect(result.submission).toEqual(mockSubmission);
      expect(notificationService.create).toHaveBeenCalledWith(
        mockPortalOwnerId,
        'New Portal Submission',
        'Existing startup linked from founder@startup.com: Test Startup, Inc.',
        'info',
        `/portals/${mockPortalId}/submissions`,
      );
      expect(txMock.insert).toHaveBeenCalledTimes(1);
    });

    it('should return 429 + write rate_limited audit when per-IP limit trips', async () => {
      mockDb.limit.mockResolvedValueOnce([mockPortal]);
      rateLimitService.checkAttempt.mockResolvedValueOnce({
        kind: 'rate_limited',
        reason: 'per_ip_burst',
        retryAfterSeconds: 300,
        message: 'slow down',
      });

      await expect(
        service.create(mockPortalId, validDto, { ipAddress: '9.9.9.9' }),
      ).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });

      expect(rateLimitService.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: PortalSubmissionAuditOutcome.RATE_LIMITED,
          ipAddress: '9.9.9.9',
        }),
      );
    });

    it('should return 409 + write duplicate_within_window audit on canonical match', async () => {
      mockDb.limit.mockResolvedValueOnce([mockPortal]);
      rateLimitService.checkAttempt.mockResolvedValueOnce({
        kind: 'duplicate_within_window',
        matchedStartupId: 'matched-startup-id',
        message: 'already submitted',
      });

      await expect(service.create(mockPortalId, validDto)).rejects.toThrow(
        ConflictException,
      );

      expect(rateLimitService.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: PortalSubmissionAuditOutcome.DUPLICATE_WITHIN_WINDOW,
          startupId: 'matched-startup-id',
          normalizedCompanyName: 'test startup',
        }),
      );
    });

    it('passes linkIntegrity from portal row into the rate-limit decision', async () => {
      primeAllowPathDbForAccept();
      mockDb.limit.mockResolvedValueOnce([
        { ...mockPortal, linkIntegrity: PortalLinkIntegrity.STRICT },
      ]);
      userAuthService.findUserByEmail.mockResolvedValue(mockFounder);

      await service.create(mockPortalId, validDto, { ipAddress: '7.7.7.7' });

      expect(rateLimitService.checkAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          linkIntegrity: PortalLinkIntegrity.STRICT,
          portalId: mockPortalId,
          ipAddress: '7.7.7.7',
          normalizedCompanyName: 'test startup',
        }),
      );
    });

    it('throws when founderEmail is missing (defense in depth)', async () => {
      mockDb.limit.mockResolvedValueOnce([mockPortal]);
      const { founderEmail: _omit, ...rest } = validDto;
      await expect(
        service.create(mockPortalId, rest as typeof validDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('429 retry-after stays inside HttpException payload for the controller to surface', async () => {
      mockDb.limit.mockResolvedValueOnce([mockPortal]);
      rateLimitService.checkAttempt.mockResolvedValueOnce({
        kind: 'rate_limited',
        reason: 'per_ip_burst',
        retryAfterSeconds: 42,
        message: 'slow down',
      });
      let caught: unknown = null;
      try {
        await service.create(mockPortalId, validDto, { ipAddress: '9.9.9.9' });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(HttpException);
      const payload = (caught as HttpException).getResponse() as {
        retryAfterSeconds?: number;
      };
      expect(payload.retryAfterSeconds).toBe(42);
    });
  });

  describe('findAll', () => {
    it.skip('should return paginated submissions for portal owner', async () => {
      // Skipping — covered by controller spec.
    });

    it('should throw NotFoundException if portal not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const query = { page: 1, limit: 10 };
      await expect(
        service.findAll(mockPortalId, mockPortalOwnerId, query),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('approve', () => {
    it('should approve submission', async () => {
      const submissionWithPortal = [
        {
          id: mockSubmissionId,
          portalId: mockPortalId,
          status: PortalSubmissionStatus.PENDING,
          portal: { userId: mockPortalOwnerId },
        },
      ];
      mockDb.limit.mockResolvedValueOnce(submissionWithPortal);
      mockDb.returning.mockResolvedValueOnce([
        { ...mockSubmission, status: PortalSubmissionStatus.APPROVED },
      ]);
      const result = await service.approve(mockSubmissionId, mockPortalOwnerId);
      expect(result.status).toBe(PortalSubmissionStatus.APPROVED);
    });

    it('should throw ForbiddenException if user does not own portal', async () => {
      const submissionWithPortal = [
        {
          id: mockSubmissionId,
          portalId: mockPortalId,
          status: PortalSubmissionStatus.PENDING,
          portal: { userId: 'different-user-id' },
        },
      ];
      mockDb.limit.mockResolvedValueOnce(submissionWithPortal);
      await expect(
        service.approve(mockSubmissionId, mockPortalOwnerId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reject', () => {
    it('should reject submission', async () => {
      const submissionWithPortal = [
        {
          id: mockSubmissionId,
          portalId: mockPortalId,
          status: PortalSubmissionStatus.PENDING,
          portal: { userId: mockPortalOwnerId },
        },
      ];
      mockDb.limit.mockResolvedValueOnce(submissionWithPortal);
      mockDb.returning.mockResolvedValueOnce([
        { ...mockSubmission, status: PortalSubmissionStatus.REJECTED },
      ]);
      const result = await service.reject(mockSubmissionId, mockPortalOwnerId);
      expect(result.status).toBe(PortalSubmissionStatus.REJECTED);
    });
  });
});
