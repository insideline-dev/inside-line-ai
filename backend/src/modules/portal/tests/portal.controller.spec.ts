import { Test, TestingModule } from '@nestjs/testing';
import { PortalController } from '../portal.controller';
import { PortalService } from '../portal.service';
import { SubmissionService } from '../submission.service';
import { UserRole } from '../../../auth/entities/auth.schema';
import {
  PortalLinkIntegrity,
  PortalSubmissionAuditOutcome,
  PortalSubmissionStatus,
} from '../entities';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StartupStage } from '../../startup/entities/startup.schema';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

describe('PortalController', () => {
  let controller: PortalController;
  let portalService: jest.Mocked<PortalService>;
  let submissionService: jest.Mocked<SubmissionService>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'investor@example.com',
    name: 'Investor User',
    role: UserRole.INVESTOR,
    emailVerified: true,
    image: null,
  };

  const mockPortal = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    userId: mockUser.id,
    name: 'Acme Ventures',
    slug: 'acme-ventures',
    description: 'We invest in early-stage startups',
    logoUrl: 'https://example.com/logo.png',
    brandColor: '#FF0000',
    isActive: true,
    linkIntegrity: PortalLinkIntegrity.STANDARD,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const buildExpressMocks = (xff?: string) => {
    const req = {
      headers: xff ? { 'x-forwarded-for': xff } : {},
    } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    return { req, res, setHeader };
  };

  const mockSubmission = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    portalId: mockPortal.id,
    startupId: '123e4567-e89b-12d3-a456-426614174003',
    status: PortalSubmissionStatus.PENDING,
    submittedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortalController],
      providers: [
        {
          provide: PortalService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            findBySlug: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: SubmissionService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            approve: jest.fn(),
            reject: jest.fn(),
            listAudit: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PortalController>(PortalController);
    portalService = module.get(PortalService);
    submissionService = module.get(SubmissionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a portal', async () => {
      portalService.create.mockResolvedValue(mockPortal);

      const dto = {
        name: 'Acme Ventures',
        description: 'We invest in early-stage startups',
        brandColor: '#FF0000',
      };

      const result = await controller.create(mockUser, dto);

      expect(result).toEqual(mockPortal);
      expect(portalService.create).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('findAll', () => {
    it('should return paginated portals', async () => {
      const paginatedResult = {
        data: [mockPortal],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };

      portalService.findAll.mockResolvedValue(paginatedResult);

      const query = { page: 1, limit: 10 };
      const result = await controller.findAll(mockUser, query);

      expect(result).toEqual(paginatedResult);
      expect(portalService.findAll).toHaveBeenCalledWith(mockUser.id, query);
    });
  });

  describe('findOne', () => {
    it('should return a portal by ID', async () => {
      portalService.findOne.mockResolvedValue(mockPortal);

      const result = await controller.findOne(mockUser, mockPortal.id);

      expect(result).toEqual(mockPortal);
      expect(portalService.findOne).toHaveBeenCalledWith(
        mockPortal.id,
        mockUser.id,
      );
    });
  });

  describe('update', () => {
    it('should update a portal', async () => {
      const updatedPortal = { ...mockPortal, name: 'Updated Name' };
      portalService.update.mockResolvedValue(updatedPortal);

      const dto = { name: 'Updated Name' };
      const result = await controller.update(mockUser, mockPortal.id, dto);

      expect(result).toEqual(updatedPortal);
      expect(portalService.update).toHaveBeenCalledWith(
        mockPortal.id,
        mockUser.id,
        dto,
      );
    });
  });

  describe('delete', () => {
    it('should delete a portal', async () => {
      portalService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(mockUser, mockPortal.id);

      expect(result).toEqual({ success: true, message: 'Portal deleted' });
      expect(portalService.delete).toHaveBeenCalledWith(
        mockPortal.id,
        mockUser.id,
      );
    });
  });

  describe('getSubmissions', () => {
    it('should return paginated submissions', async () => {
      const paginatedResult = {
        data: [mockSubmission],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };

      submissionService.findAll.mockResolvedValue(paginatedResult as unknown);

      const query = { page: 1, limit: 10 };
      const result = await controller.getSubmissions(
        mockUser,
        mockPortal.id,
        query,
      );

      expect(result).toEqual(paginatedResult);
      expect(submissionService.findAll).toHaveBeenCalledWith(
        mockPortal.id,
        mockUser.id,
        query,
      );
    });
  });

  describe('approveSubmission', () => {
    it('should approve a submission', async () => {
      const approvedSubmission = {
        ...mockSubmission,
        status: PortalSubmissionStatus.APPROVED,
      };
      submissionService.approve.mockResolvedValue(approvedSubmission);

      const result = await controller.approveSubmission(
        mockUser,
        mockPortal.id,
        mockSubmission.id,
      );

      expect(result).toEqual(approvedSubmission);
      expect(submissionService.approve).toHaveBeenCalledWith(
        mockSubmission.id,
        mockUser.id,
      );
    });
  });

  describe('rejectSubmission', () => {
    it('should reject a submission', async () => {
      const rejectedSubmission = {
        ...mockSubmission,
        status: PortalSubmissionStatus.REJECTED,
      };
      submissionService.reject.mockResolvedValue(rejectedSubmission);

      const result = await controller.rejectSubmission(
        mockUser,
        mockPortal.id,
        mockSubmission.id,
      );

      expect(result).toEqual(rejectedSubmission);
      expect(submissionService.reject).toHaveBeenCalledWith(
        mockSubmission.id,
        mockUser.id,
      );
    });
  });

  describe('getPortalBySlug (public)', () => {
    it('should return portal by slug', async () => {
      portalService.findBySlug.mockResolvedValue(mockPortal);

      const result = await controller.getPortalBySlug('acme-ventures');

      expect(result).toEqual(mockPortal);
      expect(portalService.findBySlug).toHaveBeenCalledWith('acme-ventures');
    });
  });

  describe('submitToPortal (public)', () => {
    const dto = {
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

    it('should submit startup to portal and forward client IP', async () => {
      portalService.findBySlug.mockResolvedValue(mockPortal);
      const result = {
        outcome: PortalSubmissionAuditOutcome.ACCEPTED,
        submission: mockSubmission,
        auditId: 'audit-1',
      };
      submissionService.create.mockResolvedValue(result);

      const { req, res } = buildExpressMocks('203.0.113.5, 10.0.0.1');
      const got = await controller.submitToPortal(
        'acme-ventures',
        dto,
        '10.0.0.1',
        req,
        res,
      );

      expect(got).toEqual(result);
      expect(portalService.findBySlug).toHaveBeenCalledWith('acme-ventures');
      expect(submissionService.create).toHaveBeenCalledWith(
        mockPortal.id,
        dto,
        { ipAddress: '203.0.113.5' },
      );
    });

    it('sets Retry-After on 429 responses', async () => {
      portalService.findBySlug.mockResolvedValue(mockPortal);
      submissionService.create.mockRejectedValue(
        new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'slow down',
            retryAfterSeconds: 300,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      const { req, res, setHeader } = buildExpressMocks();
      await expect(
        controller.submitToPortal('acme-ventures', dto, '1.1.1.1', req, res),
      ).rejects.toBeInstanceOf(HttpException);
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '300');
    });
  });

  describe('listSubmissionAudit', () => {
    it('returns audit rows when caller owns the portal', async () => {
      portalService.findOne.mockResolvedValue(mockPortal);
      submissionService.listAudit.mockResolvedValue([]);
      const result = await controller.listSubmissionAudit(
        mockUser,
        mockPortal.id,
      );
      expect(result).toEqual([]);
      expect(portalService.findOne).toHaveBeenCalledWith(
        mockPortal.id,
        mockUser.id,
      );
    });

    it('rejects malformed since', async () => {
      portalService.findOne.mockResolvedValue(mockPortal);
      await expect(
        controller.listSubmissionAudit(mockUser, mockPortal.id, 'not-a-date'),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });
});
