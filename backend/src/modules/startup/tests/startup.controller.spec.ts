import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { StartupController } from '../startup.controller';
import { StartupService } from '../startup.service';
import { DraftService } from '../draft.service';
import { PdfService } from '../pdf.service';
import { DataRoomService } from '../data-room.service';
import { InvestorInterestService } from '../investor-interest.service';
import { MeetingService } from '../meeting.service';
import { UserRole } from '../../../auth/entities/auth.schema';
import { StartupStatus, StartupStage } from '../entities/startup.schema';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
};

describe('StartupController', () => {
  let controller: StartupController;
  let startupService: jest.Mocked<StartupService>;
  let draftService: jest.Mocked<DraftService>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    name: 'Test User',
    role: UserRole.FOUNDER,
    emailVerified: true,
    image: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const mockStartup = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    userId: mockUser.id,
    name: 'Test Startup',
    slug: 'test-startup',
    tagline: 'A test startup',
    description: 'This is a test startup description that is long enough to pass validation requirements.',
    website: 'https://test.com',
    location: 'San Francisco',
    industry: 'SaaS',
    stage: StartupStage.SEED,
    fundingTarget: 1000000,
    teamSize: 5,
    status: StartupStatus.DRAFT,
    pitchDeckUrl: null,
    demoUrl: null,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    startupService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      adminFindOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      submit: jest.fn(),
      resubmit: jest.fn(),
      getJobs: jest.fn(),
      getUploadUrl: jest.fn(),
      findApproved: jest.fn(),
      findApprovedById: jest.fn(),
      adminFindAll: jest.fn(),
      adminFindPending: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      reanalyze: jest.fn(),
      adminUpdate: jest.fn(),
      adminDelete: jest.fn(),
      findBySlug: jest.fn(),
      getProgress: jest.fn(),
      adminGetProgress: jest.fn(),
    } as unknown as jest.Mocked<StartupService>;

    draftService = {
      save: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<DraftService>;

    const pdfService = {
      generateMemo: jest.fn(),
      generateReport: jest.fn(),
    } as unknown as jest.Mocked<PdfService>;

    const dataRoomService = {
      uploadFile: jest.fn(),
      uploadDocument: jest.fn(),
      getDocuments: jest.fn(),
      updatePermissions: jest.fn(),
      deleteDocument: jest.fn(),
    } as unknown as jest.Mocked<DataRoomService>;

    const interestService = {
      getInterest: jest.fn(),
      respondToInterest: jest.fn(),
    } as unknown as jest.Mocked<InvestorInterestService>;

    const meetingService = {
      scheduleMeeting: jest.fn(),
      getMeetings: jest.fn(),
    } as unknown as jest.Mocked<MeetingService>;

    controller = new StartupController(
      startupService,
      draftService,
      pdfService,
      dataRoomService,
      interestService,
      meetingService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a startup', async () => {
      const dto = {
        name: 'Test Startup',
        tagline: 'A test startup',
        description: 'This is a test startup description that is long enough to pass validation requirements.',
        website: 'https://test.com',
        location: 'San Francisco',
        industry: 'SaaS',
        stage: StartupStage.SEED,
        fundingTarget: 1000000,
        teamSize: 5,
      };

      startupService.create.mockResolvedValueOnce(mockStartup);

      const result = await controller.create(mockUser, dto);

      expect(result).toEqual(mockStartup);
      expect(startupService.create).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('findAll', () => {
    it('should return paginated startups', async () => {
      const query = {
        page: 1,
        limit: 20,
      };

      const response = {
        data: [mockStartup],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      };

      startupService.findAll.mockResolvedValueOnce(response);

      const result = await controller.findAll(mockUser, query);

      expect(result).toEqual(response);
      expect(startupService.findAll).toHaveBeenCalledWith(mockUser.id, query);
    });
  });

  describe('findOne', () => {
    it('should return a single startup', async () => {
      startupService.findOne.mockResolvedValueOnce(mockStartup);

      const result = await controller.findOne(mockUser, mockStartup.id);

      expect(result).toEqual(mockStartup);
      expect(startupService.findOne).toHaveBeenCalledWith(mockStartup.id, mockUser.id);
    });

    it('should use admin lookup for admin users', async () => {
      const adminUser = { ...mockUser, role: UserRole.ADMIN };
      startupService.adminFindOne.mockResolvedValueOnce(mockStartup);

      const result = await controller.findOne(adminUser, mockStartup.id);

      expect(result).toEqual(mockStartup);
      expect(startupService.adminFindOne).toHaveBeenCalledWith(mockStartup.id);
      expect(startupService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a startup', async () => {
      const dto = { name: 'Updated Name' };
      const updated = { ...mockStartup, name: 'Updated Name' };

      startupService.update.mockResolvedValueOnce(updated);

      const result = await controller.update(mockUser, mockStartup.id, dto);

      expect(result).toEqual(updated);
      expect(startupService.update).toHaveBeenCalledWith(mockStartup.id, mockUser.id, dto);
    });
  });

  describe('delete', () => {
    it('should delete a startup', async () => {
      startupService.delete.mockResolvedValueOnce(undefined);

      const result = await controller.delete(mockUser, mockStartup.id);

      expect(result).toEqual({ success: true, message: 'Startup deleted' });
      expect(startupService.delete).toHaveBeenCalledWith(mockStartup.id, mockUser.id);
    });
  });

  describe('submit', () => {
    it('should submit a startup', async () => {
      const submitted = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      };

      startupService.submit.mockResolvedValueOnce(submitted);

      const result = await controller.submit(mockUser, mockStartup.id, {});

      expect(result).toEqual(submitted);
      expect(startupService.submit).toHaveBeenCalledWith(mockStartup.id, mockUser.id);
    });
  });

  describe('resubmit', () => {
    it('should resubmit a rejected startup', async () => {
      const resubmitted = {
        ...mockStartup,
        status: StartupStatus.SUBMITTED,
        submittedAt: new Date(),
      };

      startupService.resubmit.mockResolvedValueOnce(resubmitted);

      const result = await controller.resubmit(mockUser, mockStartup.id, {});

      expect(result).toEqual(resubmitted);
      expect(startupService.resubmit).toHaveBeenCalledWith(mockStartup.id, mockUser.id);
    });
  });

  describe('getJobs', () => {
    it('should return analysis jobs', async () => {
      const jobs = {
        jobs: [],
        message: 'Job tracking not implemented yet',
      };

      startupService.getJobs.mockResolvedValueOnce(jobs);

      const result = await controller.getJobs(mockUser, mockStartup.id);

      expect(result).toEqual(jobs);
      expect(startupService.getJobs).toHaveBeenCalledWith(mockStartup.id, mockUser.id);
    });
  });

  describe('getUploadUrl', () => {
    it('should generate presigned upload URL', async () => {
      const dto = {
        fileName: 'pitch.pdf',
        fileType: 'application/pdf',
        fileSize: 1024000,
      };

      const uploadUrl = {
        uploadUrl: 'https://upload.com',
        key: 'key123',
        publicUrl: 'https://public.com',
      };

      startupService.getUploadUrl.mockResolvedValueOnce(uploadUrl);

      const result = await controller.getUploadUrl(mockUser, mockStartup.id, dto);

      expect(result).toEqual(uploadUrl);
      expect(startupService.getUploadUrl).toHaveBeenCalledWith(
        mockStartup.id,
        mockUser.id,
        dto,
      );
    });
  });

  describe('saveDraft', () => {
    it('should save draft data', async () => {
      const dto = {
        draftData: { name: 'Test', tagline: 'Test tagline' },
      };

      const draft = {
        id: 'draft-id',
        startupId: mockStartup.id,
        userId: mockUser.id,
        draftData: dto.draftData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      draftService.save.mockResolvedValueOnce(draft);

      const result = await controller.saveDraft(mockUser, mockStartup.id, dto);

      expect(result).toEqual(draft);
      expect(draftService.save).toHaveBeenCalledWith(mockStartup.id, mockUser.id, dto);
    });
  });

  describe('getDraft', () => {
    it('should get draft data', async () => {
      const draft = {
        id: 'draft-id',
        startupId: mockStartup.id,
        userId: mockUser.id,
        draftData: { name: 'Test' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      draftService.get.mockResolvedValueOnce(draft);

      const result = await controller.getDraft(mockUser, mockStartup.id);

      expect(result).toEqual(draft);
      expect(draftService.get).toHaveBeenCalledWith(mockStartup.id, mockUser.id);
    });
  });

  describe('getProgress', () => {
    it('should return progress for draft status', async () => {
      const progressResponse = {
        status: StartupStatus.DRAFT,
        progress: null,
      };

      startupService.getProgress.mockResolvedValueOnce(progressResponse);

      const result = await controller.getProgress(mockUser, mockStartup.id);

      expect(result).toEqual(progressResponse);
      expect(startupService.getProgress).toHaveBeenCalledWith(mockStartup.id, mockUser.id);
    });

    it('should use admin progress endpoint for admin users', async () => {
      const adminUser = { ...mockUser, role: UserRole.ADMIN };
      const progressResponse = {
        status: StartupStatus.ANALYZING,
        progress: {
          overallProgress: 45,
          currentPhase: 'research',
          phasesCompleted: ['extraction', 'scraping'],
          phases: {},
        },
      };
      startupService.adminGetProgress.mockResolvedValueOnce(progressResponse as any);

      const result = await controller.getProgress(adminUser, mockStartup.id);

      expect(result).toEqual(progressResponse);
      expect(startupService.adminGetProgress).toHaveBeenCalledWith(mockStartup.id);
      expect(startupService.getProgress).not.toHaveBeenCalled();
    });

    it('should return progress with analysis data for analyzing status', async () => {
      const progressResponse = {
        status: 'analyzing',
        progress: {
          overallProgress: 65,
          currentPhase: 'market-analysis',
          phasesCompleted: ['document-review', 'team-analysis'],
          phases: {
            'document-review': { status: 'completed', progress: 100 },
            'team-analysis': { status: 'completed', progress: 100 },
            'market-analysis': { status: 'in-progress', progress: 65 },
            'financial-analysis': { status: 'pending', progress: 0 },
          },
        },
      };

      startupService.getProgress.mockResolvedValueOnce(progressResponse);

      const result = await controller.getProgress(mockUser, mockStartup.id);

      expect(result).toEqual(progressResponse);
      expect(startupService.getProgress).toHaveBeenCalledWith(mockStartup.id, mockUser.id);
    });
  });

  describe('findApproved', () => {
    it('should return approved startups', async () => {
      const query = {
        page: 1,
        limit: 20,
      };

      const approved = {
        ...mockStartup,
        status: StartupStatus.APPROVED,
        approvedAt: new Date(),
      };

      const response = {
        data: [approved],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      };

      startupService.findApproved.mockResolvedValueOnce(response);

      const result = await controller.findApproved(mockUser, query);

      expect(result).toEqual(response);
      expect(startupService.findApproved).toHaveBeenCalledWith(query);
    });
  });

  describe('findApprovedById', () => {
    it('should return approved startup by id', async () => {
      const approved = {
        ...mockStartup,
        status: StartupStatus.APPROVED,
        approvedAt: new Date(),
      };

      startupService.findApprovedById.mockResolvedValueOnce(approved);

      const result = await controller.findApprovedById(mockUser, mockStartup.id);

      expect(result).toEqual(approved);
      expect(startupService.findApprovedById).toHaveBeenCalledWith(mockStartup.id);
    });
  });

  describe('admin endpoints', () => {
    const adminUser = { ...mockUser, role: UserRole.ADMIN };

    describe('adminFindAll', () => {
      it('should return all startups for admin', async () => {
        const query = { page: 1, limit: 20 };
        const response = {
          data: [mockStartup],
          meta: {
            total: 1,
            page: 1,
            limit: 20,
            totalPages: 1,
          },
        };

        startupService.adminFindAll.mockResolvedValueOnce(response);

        const result = await controller.adminFindAll(adminUser, query);

        expect(result).toEqual(response);
        expect(startupService.adminFindAll).toHaveBeenCalledWith(query);
      });
    });

    describe('adminFindPending', () => {
      it('should return pending startups for admin', async () => {
        const query = { page: 1, limit: 20 };
        const response = {
          data: [{ ...mockStartup, status: StartupStatus.SUBMITTED }],
          meta: {
            total: 1,
            page: 1,
            limit: 20,
            totalPages: 1,
          },
        };

        startupService.adminFindPending.mockResolvedValueOnce(response);

        const result = await controller.adminFindPending(adminUser, query);

        expect(result).toEqual(response);
        expect(startupService.adminFindPending).toHaveBeenCalledWith(query);
      });
    });

    describe('approve', () => {
      it('should approve a startup', async () => {
        const approved = {
          ...mockStartup,
          status: StartupStatus.APPROVED,
          approvedAt: new Date(),
        };

        startupService.approve.mockResolvedValueOnce(approved);

        const result = await controller.approve(adminUser, mockStartup.id, {});

        expect(result).toEqual(approved);
        expect(startupService.approve).toHaveBeenCalledWith(mockStartup.id, adminUser.id);
      });
    });

    describe('reject', () => {
      it('should reject a startup', async () => {
        const dto = { rejectionReason: 'Not ready for funding' };
        const rejected = {
          ...mockStartup,
          status: StartupStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: dto.rejectionReason,
        };

        startupService.reject.mockResolvedValueOnce(rejected);

        const result = await controller.reject(adminUser, mockStartup.id, dto);

        expect(result).toEqual(rejected);
        expect(startupService.reject).toHaveBeenCalledWith(
          mockStartup.id,
          adminUser.id,
          dto.rejectionReason,
        );
      });
    });

    describe('reanalyze', () => {
      it('should queue reanalysis job', async () => {
        const jobResult = { jobId: 'job-123' };

        startupService.reanalyze.mockResolvedValueOnce(jobResult);

        const result = await controller.reanalyze(adminUser, mockStartup.id);

        expect(result).toEqual(jobResult);
        expect(startupService.reanalyze).toHaveBeenCalledWith(
          mockStartup.id,
          adminUser.id,
        );
      });
    });

    describe('adminUpdate', () => {
      it('should allow admin to update any field', async () => {
        const dto = { name: 'Admin Updated' };
        const updated = { ...mockStartup, name: 'Admin Updated' };

        startupService.adminUpdate.mockResolvedValueOnce(updated);

        const result = await controller.adminUpdate(mockStartup.id, dto);

        expect(result).toEqual(updated);
        expect(startupService.adminUpdate).toHaveBeenCalledWith(mockStartup.id, dto);
      });
    });

    describe('adminDelete', () => {
      it('should allow admin to hard delete startup', async () => {
        startupService.adminDelete.mockResolvedValueOnce(undefined);

        const result = await controller.adminDelete(mockStartup.id);

        expect(result).toEqual({ success: true, message: 'Startup deleted' });
        expect(startupService.adminDelete).toHaveBeenCalledWith(mockStartup.id);
      });
    });
  });

  describe('findBySlug', () => {
    it('should return approved startup by slug', async () => {
      const approved = {
        ...mockStartup,
        status: StartupStatus.APPROVED,
        approvedAt: new Date(),
      };

      startupService.findBySlug.mockResolvedValueOnce(approved);

      const result = await controller.findBySlug('test-startup');

      expect(result).toEqual(approved);
      expect(startupService.findBySlug).toHaveBeenCalledWith('test-startup');
    });
  });
});
