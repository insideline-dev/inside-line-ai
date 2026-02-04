import { Test, TestingModule } from '@nestjs/testing';
import { ScoutController } from '../scout.controller';
import { ScoutService } from '../scout.service';
import { SubmissionService } from '../submission.service';
import { ScoutGuard } from '../guards/scout.guard';
import { DrizzleService } from '../../../database';
import { UserRole } from '../../../auth/entities/auth.schema';
import { ScoutApplicationStatus } from '../entities/scout.schema';
import { StartupStage } from '../../startup/entities/startup.schema';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

describe('ScoutController', () => {
  let controller: ScoutController;
  let scoutService: jest.Mocked<ScoutService>;
  let submissionService: jest.Mocked<SubmissionService>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    name: 'Test User',
    role: UserRole.USER,
    emailVerified: true,
    image: null,
  };

  const mockInvestor: User = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    email: 'investor@example.com',
    name: 'Test Investor',
    role: UserRole.INVESTOR,
    emailVerified: true,
    image: null,
  };

  const mockApplication = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    userId: mockUser.id,
    investorId: mockInvestor.id,
    bio: 'Experienced scout',
    linkedinUrl: 'https://linkedin.com/in/test',
    portfolio: ['Company A'],
    status: ScoutApplicationStatus.PENDING,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScoutController],
      providers: [
        {
          provide: ScoutService,
          useValue: {
            apply: jest.fn(),
            findApplications: jest.fn(),
            findApplicationsForInvestor: jest.fn(),
            approve: jest.fn(),
            reject: jest.fn(),
          },
        },
        {
          provide: SubmissionService,
          useValue: {
            submit: jest.fn(),
            findAll: jest.fn(),
            findAllForInvestor: jest.fn(),
          },
        },
        {
          provide: ScoutGuard,
          useValue: {
            canActivate: jest.fn(() => true),
          },
        },
        {
          provide: DrizzleService,
          useValue: {
            db: {},
          },
        },
      ],
    }).compile();

    controller = module.get<ScoutController>(ScoutController);
    scoutService = module.get(ScoutService);
    submissionService = module.get(SubmissionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('apply', () => {
    it('should create scout application', async () => {
      const dto = {
        investorId: mockInvestor.id,
        bio: 'Experienced scout with track record of successful referrals',
        linkedinUrl: 'https://linkedin.com/in/test',
        portfolio: ['Company A'],
      };

      scoutService.apply.mockResolvedValue(mockApplication);

      const result = await controller.apply(mockUser, dto);

      expect(result).toEqual(mockApplication);
      expect(scoutService.apply).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('getMyApplications', () => {
    it('should return user applications', async () => {
      const query = { page: 1, limit: 10 };
      const response = {
        data: [mockApplication],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };

      scoutService.findApplications.mockResolvedValue(response);

      const result = await controller.getMyApplications(mockUser, query);

      expect(result).toEqual(response);
      expect(scoutService.findApplications).toHaveBeenCalledWith(
        mockUser.id,
        query,
      );
    });
  });

  describe('submit', () => {
    it('should submit startup as scout', async () => {
      const dto = {
        investorId: mockInvestor.id,
        startupData: {
          name: 'Test Startup',
          tagline: 'A test startup',
          description:
            'This is a test startup description that is long enough to pass validation.',
          website: 'https://test.com',
          location: 'San Francisco',
          industry: 'SaaS',
          stage: StartupStage.SEED,
          fundingTarget: 1000000,
          teamSize: 5,
        },
        notes: 'Great team',
      };

      const mockResult = {
        startup: { id: 'startup-id', name: 'Test Startup' },
        submission: { id: 'submission-id', scoutId: mockUser.id },
      };

      submissionService.submit.mockResolvedValue(mockResult as any);

      const result = await controller.submit(mockUser, dto);

      expect(result).toEqual(mockResult);
      expect(submissionService.submit).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('getMySubmissions', () => {
    it('should return scout submissions', async () => {
      const query = { page: 1, limit: 10 };
      const response = {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };

      submissionService.findAll.mockResolvedValue(response);

      const result = await controller.getMySubmissions(mockUser, query);

      expect(result).toEqual(response);
      expect(submissionService.findAll).toHaveBeenCalledWith(
        mockUser.id,
        query,
      );
    });
  });

  describe('getScoutApplications', () => {
    it('should return applications for investor', async () => {
      const query = { page: 1, limit: 10 };
      const response = {
        data: [mockApplication],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };

      scoutService.findApplicationsForInvestor.mockResolvedValue(response);

      const result = await controller.getScoutApplications(mockInvestor, query);

      expect(result).toEqual(response);
      expect(scoutService.findApplicationsForInvestor).toHaveBeenCalledWith(
        mockInvestor.id,
        query,
      );
    });
  });

  describe('approveApplication', () => {
    it('should approve scout application', async () => {
      const approvedApp = {
        ...mockApplication,
        status: ScoutApplicationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: mockInvestor.id,
      };

      scoutService.approve.mockResolvedValue(approvedApp);

      const result = await controller.approveApplication(
        mockInvestor,
        mockApplication.id,
      );

      expect(result.status).toBe(ScoutApplicationStatus.APPROVED);
      expect(scoutService.approve).toHaveBeenCalledWith(
        mockApplication.id,
        mockInvestor.id,
      );
    });
  });

  describe('rejectApplication', () => {
    it('should reject scout application', async () => {
      const dto = { rejectionReason: 'Insufficient track record' };
      const rejectedApp = {
        ...mockApplication,
        status: ScoutApplicationStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedBy: mockInvestor.id,
        rejectionReason: dto.rejectionReason,
      };

      scoutService.reject.mockResolvedValue(rejectedApp);

      const result = await controller.rejectApplication(
        mockInvestor,
        mockApplication.id,
        dto,
      );

      expect(result.status).toBe(ScoutApplicationStatus.REJECTED);
      expect(result.rejectionReason).toBe(dto.rejectionReason);
      expect(scoutService.reject).toHaveBeenCalledWith(
        mockApplication.id,
        mockInvestor.id,
        dto,
      );
    });
  });

  describe('getScoutSubmissions', () => {
    it('should return submissions for investor', async () => {
      const query = { page: 1, limit: 10 };
      const response = {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };

      submissionService.findAllForInvestor.mockResolvedValue(response);

      const result = await controller.getScoutSubmissions(mockInvestor, query);

      expect(result).toEqual(response);
      expect(submissionService.findAllForInvestor).toHaveBeenCalledWith(
        mockInvestor.id,
        query,
      );
    });
  });
});
