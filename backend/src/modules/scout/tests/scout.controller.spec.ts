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
    role: UserRole.FOUNDER,
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
    name: 'John Doe',
    email: 'john@example.com',
    linkedinUrl: 'https://linkedin.com/in/test',
    experience:
      'Experienced scout with track record of successful referrals and deep network in fintech. Have worked with over 50 startups and helped them connect with the right investors for their stage and industry.',
    motivation:
      'I want to help connect great startups with investors who can help them grow and succeed. My passion is discovering innovative companies early and matching them with investors who can provide not just capital but strategic value and guidance.',
    dealflowSources:
      'LinkedIn, Angel networks, YC alumni, local startup events',
    portfolio: ['Company A', 'Company B'],
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
    const validDto = {
      investorId: mockInvestor.id,
      name: 'John Doe',
      email: 'john@example.com',
      linkedinUrl: 'https://linkedin.com/in/test',
      experience:
        'Experienced scout with track record of successful referrals and deep network in fintech ecosystem. Have worked with over 50 startups and helped them connect with the right investors for their stage and industry.',
      motivation:
        'I want to help connect great startups with investors who can help them grow and succeed in the market. My passion is discovering innovative companies early and matching them with investors who can provide not just capital but strategic value and guidance.',
      dealflowSources:
        'LinkedIn, Angel networks, YC alumni, local startup events',
      portfolio: ['Company A', 'Company B'],
    };

    it('should create scout application', async () => {
      scoutService.apply.mockResolvedValue(mockApplication);

      const result = await controller.apply(mockUser, validDto);

      expect(result).toEqual(mockApplication);
      expect(scoutService.apply).toHaveBeenCalledWith(mockUser.id, validDto);
    });

    it('should validate request DTO matches new structure', async () => {
      scoutService.apply.mockResolvedValue(mockApplication);

      await controller.apply(mockUser, validDto);

      expect(scoutService.apply).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          investorId: expect.any(String),
          name: expect.any(String),
          email: expect.any(String),
          linkedinUrl: expect.any(String),
          experience: expect.any(String),
          motivation: expect.any(String),
          dealflowSources: expect.any(String),
          portfolio: expect.any(Array),
        }),
      );
    });

    it('should return proper error messages for validation failures', async () => {
      const invalidDto = {
        ...validDto,
        email: 'not-an-email',
      };

      scoutService.apply.mockRejectedValue(
        new Error('Validation failed: email must be a valid email'),
      );

      await expect(controller.apply(mockUser, invalidDto as any)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('email'),
        }),
      );
    });

    it('should handle missing required fields appropriately', async () => {
      const incompleteDto = {
        investorId: mockInvestor.id,
        name: 'John Doe',
      };

      scoutService.apply.mockRejectedValue(
        new Error('Validation failed: missing required fields'),
      );

      await expect(
        controller.apply(mockUser, incompleteDto as any),
      ).rejects.toThrow();
    });

    it('should handle name field validation (2-200 chars)', async () => {
      expect(validDto.name.length).toBeGreaterThanOrEqual(2);
      expect(validDto.name.length).toBeLessThanOrEqual(200);
    });

    it('should handle email format validation', async () => {
      expect(validDto.email).toContain('@');
      expect(validDto.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    it('should handle experience field validation (100-1000 chars)', async () => {
      expect(validDto.experience.length).toBeGreaterThanOrEqual(100);
      expect(validDto.experience.length).toBeLessThanOrEqual(1000);
    });

    it('should handle motivation field validation (100-1000 chars)', async () => {
      expect(validDto.motivation.length).toBeGreaterThanOrEqual(100);
      expect(validDto.motivation.length).toBeLessThanOrEqual(1000);
    });

    it('should handle dealflowSources field validation (50-500 chars)', async () => {
      expect(validDto.dealflowSources.length).toBeGreaterThanOrEqual(50);
      expect(validDto.dealflowSources.length).toBeLessThanOrEqual(500);
    });

    it('should handle optional portfolio array', async () => {
      const dtoWithoutPortfolio = { ...validDto };
      delete (dtoWithoutPortfolio as any).portfolio;

      scoutService.apply.mockResolvedValue({
        ...mockApplication,
        portfolio: [],
      });

      const result = await controller.apply(mockUser, dtoWithoutPortfolio);

      expect(scoutService.apply).toHaveBeenCalledWith(
        mockUser.id,
        dtoWithoutPortfolio,
      );
    });

    it('should handle portfolio max length validation (10 items)', async () => {
      expect(validDto.portfolio?.length).toBeLessThanOrEqual(10);
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
    const validSubmitDto = {
      investorId: mockInvestor.id,
      startupData: {
        name: 'Test Startup',
        tagline: 'A test startup',
        description:
          'This is a test startup description that is long enough to pass validation requirements and provide meaningful context.',
        website: 'https://test.com',
        location: 'San Francisco',
        industry: 'SaaS',
        stage: StartupStage.SEED,
        fundingTarget: 1000000,
        teamSize: 5,
      },
      notes: 'Great team',
    };

    it('should submit startup as scout', async () => {
      const mockResult = {
        startup: { id: 'startup-id', name: 'Test Startup' },
        submission: { id: 'submission-id', scoutId: mockUser.id },
      };

      submissionService.submit.mockResolvedValue(mockResult as any);

      const result = await controller.submit(mockUser, validSubmitDto);

      expect(result).toEqual(mockResult);
      expect(submissionService.submit).toHaveBeenCalledWith(mockUser.id, validSubmitDto);
    });

    it('should validate full CreateStartupDto structure', async () => {
      const mockResult = {
        startup: { id: 'startup-id', name: 'Test Startup' },
        submission: { id: 'submission-id', scoutId: mockUser.id },
      };

      submissionService.submit.mockResolvedValue(mockResult as any);

      await controller.submit(mockUser, validSubmitDto);

      expect(submissionService.submit).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          investorId: expect.any(String),
          startupData: expect.objectContaining({
            name: expect.any(String),
            tagline: expect.any(String),
            description: expect.any(String),
            website: expect.any(String),
            location: expect.any(String),
            industry: expect.any(String),
            stage: expect.any(String),
            fundingTarget: expect.any(Number),
            teamSize: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle optional startup fields', async () => {
      const dtoWithOptionals = {
        ...validSubmitDto,
        startupData: {
          ...validSubmitDto.startupData,
          pitchDeckUrl: 'https://example.com/deck.pdf',
          demoUrl: 'https://example.com/demo',
        },
      };

      const mockResult = {
        startup: { id: 'startup-id', name: 'Test Startup' },
        submission: { id: 'submission-id', scoutId: mockUser.id },
      };

      submissionService.submit.mockResolvedValue(mockResult as any);

      await controller.submit(mockUser, dtoWithOptionals);

      expect(submissionService.submit).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          startupData: expect.objectContaining({
            pitchDeckUrl: dtoWithOptionals.startupData.pitchDeckUrl,
            demoUrl: dtoWithOptionals.startupData.demoUrl,
          }),
        }),
      );
    });

    it('should validate required startup fields are present', async () => {
      const requiredFields = [
        'name',
        'tagline',
        'description',
        'website',
        'location',
        'industry',
        'stage',
        'fundingTarget',
        'teamSize',
      ];

      requiredFields.forEach((field) => {
        expect(validSubmitDto.startupData).toHaveProperty(field);
      });
    });

    it('should return error for missing startup fields', async () => {
      const incompleteDto = {
        investorId: mockInvestor.id,
        startupData: {
          name: 'Test Startup',
        },
      };

      submissionService.submit.mockRejectedValue(
        new Error('Validation failed: missing required startup fields'),
      );

      await expect(
        controller.submit(mockUser, incompleteDto as any),
      ).rejects.toThrow();
    });

    it('should validate startup description length (100-5000 chars)', async () => {
      expect(validSubmitDto.startupData.description.length).toBeGreaterThanOrEqual(100);
      expect(validSubmitDto.startupData.description.length).toBeLessThanOrEqual(5000);
    });

    it('should validate startup website URL format', async () => {
      expect(validSubmitDto.startupData.website).toMatch(/^https?:\/\//);
    });

    it('should validate positive fundingTarget', async () => {
      expect(validSubmitDto.startupData.fundingTarget).toBeGreaterThan(0);
      expect(Number.isInteger(validSubmitDto.startupData.fundingTarget)).toBe(true);
    });

    it('should validate positive teamSize', async () => {
      expect(validSubmitDto.startupData.teamSize).toBeGreaterThan(0);
      expect(Number.isInteger(validSubmitDto.startupData.teamSize)).toBe(true);
    });

    it('should handle optional notes field', async () => {
      const dtoWithoutNotes = {
        investorId: mockInvestor.id,
        startupData: validSubmitDto.startupData,
      };

      const mockResult = {
        startup: { id: 'startup-id', name: 'Test Startup' },
        submission: { id: 'submission-id', scoutId: mockUser.id },
      };

      submissionService.submit.mockResolvedValue(mockResult as any);

      await controller.submit(mockUser, dtoWithoutNotes);

      expect(submissionService.submit).toHaveBeenCalledWith(
        mockUser.id,
        dtoWithoutNotes,
      );
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
