import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminController } from '../admin.controller';
import { AnalyticsService } from '../analytics.service';
import { UserManagementService } from '../user-management.service';
import { ScoringConfigService } from '../scoring-config.service';
import { DataImportService } from '../data-import.service';
import { QueueManagementService } from '../queue-management.service';
import { StartupService } from '../../startup/startup.service';
import { UserRole } from '../../../auth/entities/auth.schema';
import { StartupStatus } from '../../startup/entities/startup.schema';

describe('AdminController', () => {
  let controller: AdminController;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let userManagementService: jest.Mocked<UserManagementService>;
  let scoringConfigService: jest.Mocked<ScoringConfigService>;
  let dataImportService: jest.Mocked<DataImportService>;
  let queueManagementService: jest.Mocked<QueueManagementService>;
  let startupService: jest.Mocked<StartupService>;

  const mockAdmin = {
    id: 'admin-id',
    email: 'admin@example.com',
    name: 'Admin',
    role: UserRole.ADMIN,
    emailVerified: true,
    image: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            getOverview: jest.fn(),
            getStartupStats: jest.fn(),
            getInvestorStats: jest.fn(),
            normalizeLocations: jest.fn(),
          },
        },
        {
          provide: UserManagementService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            impersonate: jest.fn(),
          },
        },
        {
          provide: ScoringConfigService,
          useValue: {
            getDefaults: jest.fn(),
            updateDefaults: jest.fn(),
          },
        },
        {
          provide: DataImportService,
          useValue: {
            importUsers: jest.fn(),
            importStartups: jest.fn(),
            exportUsers: jest.fn(),
            exportStartups: jest.fn(),
          },
        },
        {
          provide: QueueManagementService,
          useValue: {
            getStatus: jest.fn(),
            retryJob: jest.fn(),
          },
        },
        {
          provide: StartupService,
          useValue: {
            adminFindPending: jest.fn(),
            approve: jest.fn(),
            reject: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    analyticsService = module.get(AnalyticsService);
    userManagementService = module.get(UserManagementService);
    scoringConfigService = module.get(ScoringConfigService);
    dataImportService = module.get(DataImportService);
    queueManagementService = module.get(QueueManagementService);
    startupService = module.get(StartupService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Analytics Endpoints', () => {
    describe('GET /admin/stats', () => {
      it('should return platform stats', async () => {
        const mockStats = {
          users: { total: 100, byRole: {}, weeklySignups: [] },
          startups: { total: 50, byStatus: {}, pending: 10 },
          matches: { total: 200, highScore: 50 },
          portals: { active: 5, totalSubmissions: 100 },
          topIndustries: [],
        };

        analyticsService.getOverview.mockResolvedValueOnce(mockStats);

        const result = await controller.getStats();

        expect(result).toEqual(mockStats);
        expect(analyticsService.getOverview).toHaveBeenCalled();
      });
    });

    describe('GET /admin/stats/startups', () => {
      it('should return startup stats with default days', async () => {
        const mockStats = {
          submissionsPerDay: [],
          approvalRate: 80,
          averageTimeToApproval: 24,
          topRejectionReasons: [],
        };

        analyticsService.getStartupStats.mockResolvedValueOnce(mockStats);

        const result = await controller.getStartupStats({ days: 30 });

        expect(result).toEqual(mockStats);
        expect(analyticsService.getStartupStats).toHaveBeenCalledWith(30);
      });
    });

    describe('GET /admin/stats/investors', () => {
      it('should return investor stats', async () => {
        const mockStats = {
          activeInvestors: 25,
          matchDistribution: [],
          mostActiveInvestors: [],
        };

        analyticsService.getInvestorStats.mockResolvedValueOnce(mockStats);

        const result = await controller.getInvestorStats();

        expect(result).toEqual(mockStats);
      });
    });
  });

  describe('User Management Endpoints', () => {
    describe('GET /admin/users', () => {
      it('should return paginated users', async () => {
        const mockResponse = {
          data: [{ id: 'user-1', name: 'Test', email: 'test@example.com' }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        };

        userManagementService.findAll.mockResolvedValueOnce(mockResponse);

        const result = await controller.getUsers({ page: 1, limit: 20 });

        expect(result).toEqual(mockResponse);
      });
    });

    describe('GET /admin/users/:id', () => {
      it('should return a user by id', async () => {
        const mockUser = { id: 'user-1', name: 'Test', email: 'test@example.com' };

        userManagementService.findOne.mockResolvedValueOnce(mockUser as any);

        const result = await controller.getUser('user-1');

        expect(result).toEqual(mockUser);
      });
    });

    describe('PATCH /admin/users/:id', () => {
      it('should update a user', async () => {
        const mockUser = { id: 'user-1', name: 'Updated', email: 'test@example.com' };

        userManagementService.update.mockResolvedValueOnce(mockUser as any);

        const result = await controller.updateUser('user-1', { name: 'Updated' });

        expect(result).toEqual(mockUser);
      });
    });

    describe('DELETE /admin/users/:id', () => {
      it('should delete a user', async () => {
        userManagementService.delete.mockResolvedValueOnce(undefined);

        const result = await controller.deleteUser('user-1');

        expect(result).toEqual({ success: true, message: 'User deleted' });
      });
    });

    describe('POST /admin/users/:id/impersonate', () => {
      it('should generate impersonation token', async () => {
        const mockResponse = {
          accessToken: 'token',
          expiresIn: 900,
          targetUser: { id: 'user-1', name: 'Test', email: 'test@example.com', role: UserRole.FOUNDER },
        };

        userManagementService.impersonate.mockResolvedValueOnce(mockResponse);

        const result = await controller.impersonateUser(mockAdmin, 'user-1');

        expect(result).toEqual(mockResponse);
        expect(userManagementService.impersonate).toHaveBeenCalledWith(
          mockAdmin.id,
          'user-1',
        );
      });
    });
  });

  describe('Startup Management Endpoints', () => {
    describe('GET /admin/startups/pending', () => {
      it('should return pending startups', async () => {
        const mockResponse = {
          data: [{ id: 'startup-1', status: StartupStatus.SUBMITTED }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        };

        startupService.adminFindPending.mockResolvedValueOnce(mockResponse);

        const result = await controller.getPendingStartups({ page: 1, limit: 20 });

        expect(result).toEqual(mockResponse);
      });
    });

    describe('POST /admin/startups/:id/approve', () => {
      it('should approve a startup', async () => {
        const mockStartup = { id: 'startup-1', status: StartupStatus.APPROVED };

        startupService.approve.mockResolvedValueOnce(mockStartup as any);

        const result = await controller.approveStartup(mockAdmin, 'startup-1');

        expect(result).toEqual(mockStartup);
        expect(startupService.approve).toHaveBeenCalledWith(
          'startup-1',
          mockAdmin.id,
        );
      });
    });

    describe('POST /admin/startups/:id/reject', () => {
      it('should reject a startup with reason', async () => {
        const mockStartup = {
          id: 'startup-1',
          status: StartupStatus.REJECTED,
          rejectionReason: 'Not ready for investment',
        };

        startupService.reject.mockResolvedValueOnce(mockStartup as any);

        const result = await controller.rejectStartup(
          mockAdmin,
          'startup-1',
          'Not ready for investment',
        );

        expect(result).toEqual(mockStartup);
      });

      it('should throw if reason is too short', async () => {
        await expect(
          controller.rejectStartup(mockAdmin, 'startup-1', 'short'),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw if reason is empty', async () => {
        await expect(
          controller.rejectStartup(mockAdmin, 'startup-1', ''),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('Scoring Configuration Endpoints', () => {
    describe('GET /admin/scoring/defaults', () => {
      it('should return default scoring weights', async () => {
        const defaults = {
          marketWeight: 20,
          teamWeight: 20,
          productWeight: 20,
          tractionWeight: 20,
          financialsWeight: 20,
        };

        scoringConfigService.getDefaults.mockResolvedValueOnce(defaults);

        const result = await controller.getScoringDefaults();

        expect(result).toEqual(defaults);
      });
    });

    describe('PUT /admin/scoring/defaults', () => {
      it('should update default scoring weights', async () => {
        const newDefaults = {
          marketWeight: 30,
          teamWeight: 25,
          productWeight: 20,
          tractionWeight: 15,
          financialsWeight: 10,
        };

        scoringConfigService.updateDefaults.mockResolvedValueOnce(newDefaults);

        const result = await controller.updateScoringDefaults(newDefaults);

        expect(result).toEqual(newDefaults);
      });
    });
  });

  describe('Data Import/Export Endpoints', () => {
    describe('POST /admin/data/import/users', () => {
      it('should import users from CSV', async () => {
        const mockResult = { imported: 10, skipped: 2, errors: [] };

        dataImportService.importUsers.mockResolvedValueOnce(mockResult);

        const mockFile = {
          buffer: Buffer.from('email,name\ntest@example.com,Test'),
          mimetype: 'text/csv',
          originalname: 'users.csv',
        } as Express.Multer.File;

        const result = await controller.importUsers(mockFile);

        expect(result).toEqual(mockResult);
      });

      it('should throw if no file provided', async () => {
        await expect(controller.importUsers(undefined as any)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should throw if file is not CSV', async () => {
        const mockFile = {
          buffer: Buffer.from('{}'),
          mimetype: 'application/json',
          originalname: 'users.json',
        } as Express.Multer.File;

        await expect(controller.importUsers(mockFile)).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('POST /admin/data/import/startups', () => {
      it('should import startups from CSV', async () => {
        const mockResult = { imported: 5, skipped: 1, errors: [] };

        dataImportService.importStartups.mockResolvedValueOnce(mockResult);

        const mockFile = {
          buffer: Buffer.from('user_email,name\ntest@example.com,Startup'),
          mimetype: 'text/csv',
          originalname: 'startups.csv',
        } as Express.Multer.File;

        const result = await controller.importStartups(mockFile);

        expect(result).toEqual(mockResult);
      });
    });

    describe('GET /admin/data/export/users', () => {
      it('should export users as CSV', async () => {
        const mockCsv = 'id,name,email\nuser-1,Test,test@example.com';

        dataImportService.exportUsers.mockResolvedValueOnce(mockCsv);

        const mockRes = {
          setHeader: jest.fn(),
          send: jest.fn(),
        } as any;

        await controller.exportUsers({}, mockRes);

        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Content-Type',
          'text/csv',
        );
        expect(mockRes.send).toHaveBeenCalledWith(mockCsv);
      });
    });

    describe('GET /admin/data/export/startups', () => {
      it('should export startups as CSV', async () => {
        const mockCsv = 'id,name\nstartup-1,Acme';

        dataImportService.exportStartups.mockResolvedValueOnce(mockCsv);

        const mockRes = {
          setHeader: jest.fn(),
          send: jest.fn(),
        } as any;

        await controller.exportStartups({}, mockRes);

        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Content-Type',
          'text/csv',
        );
        expect(mockRes.send).toHaveBeenCalledWith(mockCsv);
      });
    });
  });

  describe('Queue Management Endpoints', () => {
    describe('GET /admin/queue/status', () => {
      it('should return queue status', async () => {
        const mockStatus = {
          queues: [{ name: 'task-queue', waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 }],
          totalPending: 6,
          totalActive: 2,
          totalFailed: 3,
        };

        queueManagementService.getStatus.mockResolvedValueOnce(mockStatus);

        const result = await controller.getQueueStatus();

        expect(result).toEqual(mockStatus);
      });
    });

    describe('POST /admin/queue/retry/:jobId', () => {
      it('should retry a failed job', async () => {
        const mockResult = { success: true, message: 'Job retried' };

        queueManagementService.retryJob.mockResolvedValueOnce(mockResult);

        const result = await controller.retryJob('job-1');

        expect(result).toEqual(mockResult);
      });

      it('should use specified queue if provided', async () => {
        const mockResult = { success: true, message: 'Job retried' };

        queueManagementService.retryJob.mockResolvedValueOnce(mockResult);

        await controller.retryJob('job-1', 'task-queue');

        expect(queueManagementService.retryJob).toHaveBeenCalledWith(
          'task-queue',
          'job-1',
        );
      });
    });
  });

  describe('Location Normalization Endpoints', () => {
    describe('POST /admin/normalize-locations', () => {
      it('should return count of startups to normalize', async () => {
        const mockResult = {
          message: 'Found 42 startups with location data to normalize',
          startupsToNormalize: 42,
        };

        analyticsService.normalizeLocations.mockResolvedValueOnce(mockResult);

        const result = await controller.normalizeLocations();

        expect(result).toEqual(mockResult);
        expect(analyticsService.normalizeLocations).toHaveBeenCalled();
      });

      it('should return 0 when all locations are normalized', async () => {
        const mockResult = {
          message: 'Found 0 startups with location data to normalize',
          startupsToNormalize: 0,
        };

        analyticsService.normalizeLocations.mockResolvedValueOnce(mockResult);

        const result = await controller.normalizeLocations();

        expect(result).toEqual(mockResult);
      });
    });
  });
});
