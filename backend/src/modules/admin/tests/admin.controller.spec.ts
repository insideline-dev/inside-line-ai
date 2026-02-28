import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminController } from '../admin.controller';
import { AnalyticsService } from '../analytics.service';
import { UserManagementService } from '../user-management.service';
import { ScoringConfigService } from '../scoring-config.service';
import { DataImportService } from '../data-import.service';
import { QueueManagementService } from '../queue-management.service';
import { StartupService } from '../../startup/startup.service';
import { StartupIntakeService } from '../../startup/startup-intake.service';
import { IntegrationHealthService } from '../integration-health.service';
import { SystemConfigService } from '../system-config.service';
import { BulkDataService } from '../bulk-data.service';
import { AdminMatchingService } from '../admin-matching.service';
import { AiPromptService } from '../../ai/services/ai-prompt.service';
import { AiPromptRuntimeService } from '../../ai/services/ai-prompt-runtime.service';
import { AiModelConfigService } from '../../ai/services/ai-model-config.service';
import { AgentSchemaRegistryService } from '../../ai/services/agent-schema-registry.service';
import { PipelineFlowConfigService } from '../../ai/services/pipeline-flow-config.service';
import { PhaseTransitionService } from '../../ai/orchestrator/phase-transition.service';
import { AgentConfigService } from '../../ai/services/agent-config.service';
import { DynamicFlowCatalogService } from '../../ai/services/dynamic-flow-catalog.service';
import { SchemaCompilerService } from '../../ai/services/schema-compiler.service';
import { EarlyAccessService } from '../../early-access';
import { AdminInvestorService } from '../admin-investor.service';
import { AiConfigService } from '../../ai/services/ai-config.service';
import { UserRole } from '../../../auth/entities/auth.schema';
import { StartupStatus } from '../../startup/entities/startup.schema';
import { PipelinePhase } from '../../ai/interfaces/pipeline.interface';
import { DrizzleService } from '../../../database';

describe('AdminController', () => {
  let controller: AdminController;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let userManagementService: jest.Mocked<UserManagementService>;
  let scoringConfigService: jest.Mocked<ScoringConfigService>;
  let dataImportService: jest.Mocked<DataImportService>;
  let queueManagementService: jest.Mocked<QueueManagementService>;
  let startupService: jest.Mocked<StartupService>;
  let startupIntakeService: jest.Mocked<StartupIntakeService>;
  let adminMatchingService: jest.Mocked<AdminMatchingService>;
  let aiPromptService: jest.Mocked<AiPromptService>;
  let aiPromptRuntimeService: jest.Mocked<AiPromptRuntimeService>;
  let agentSchemaRegistryService: jest.Mocked<AgentSchemaRegistryService>;
  let agentConfigService: jest.Mocked<AgentConfigService>;
  let dynamicFlowCatalogService: jest.Mocked<DynamicFlowCatalogService>;
  let schemaCompilerService: jest.Mocked<SchemaCompilerService>;
  let earlyAccessService: jest.Mocked<EarlyAccessService>;

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
          provide: DrizzleService,
          useValue: {
            db: {
              select: jest.fn(),
            },
          },
        },
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
            getAll: jest.fn(),
            getByStage: jest.fn(),
            updateByStage: jest.fn(),
            seed: jest.fn(),
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
            adminFindAll: jest.fn(),
            adminFindPending: jest.fn(),
            approve: jest.fn(),
            reject: jest.fn(),
            reanalyze: jest.fn(),
            adminRetryPhase: jest.fn(),
            adminRetryAgent: jest.fn(),
          },
        },
        {
          provide: StartupIntakeService,
          useValue: {
            quickCreateStartup: jest.fn(),
          },
        },
        {
          provide: IntegrationHealthService,
          useValue: {
            getHealth: jest.fn(),
          },
        },
        {
          provide: SystemConfigService,
          useValue: {
            getConfig: jest.fn(),
          },
        },
        {
          provide: BulkDataService,
          useValue: {
            importStartups: jest.fn(),
            exportStartups: jest.fn(),
          },
        },
        {
          provide: AdminMatchingService,
          useValue: {
            triggerMatchForStartup: jest.fn(),
            getLatestMatchingStatus: jest.fn(),
          },
        },
        {
          provide: AiPromptService,
          useValue: {
            listPromptDefinitions: jest.fn(),
            getPromptCoverageAudit: jest.fn(),
            getFlowGraph: jest.fn(),
            getRevisionsByKey: jest.fn(),
            createDraft: jest.fn(),
            updateDraft: jest.fn(),
            publishRevision: jest.fn(),
            seedFromCode: jest.fn(),
          },
        },
        {
          provide: AiPromptRuntimeService,
          useValue: {
            getContextSchema: jest.fn(),
            previewPrompt: jest.fn(),
            previewPipelineContexts: jest.fn(),
          },
        },
        {
          provide: AiModelConfigService,
          useValue: {
            listRevisionsByKey: jest.fn(),
            resolveConfig: jest.fn(),
            createDraft: jest.fn(),
            updateDraft: jest.fn(),
            publishRevision: jest.fn(),
          },
        },
        {
          provide: AiConfigService,
          useValue: {
            getResearchAttemptTimeoutMs: jest.fn().mockReturnValue(3_600_000),
            getResearchAttemptTimeoutMsForAgent: jest.fn().mockReturnValue(3_600_000),
          },
        },
        {
          provide: AgentSchemaRegistryService,
          useValue: {
            listRevisionsByKey: jest.fn(),
            resolveDescriptorWithSource: jest.fn(),
            createDraft: jest.fn(),
            updateDraft: jest.fn(),
            publishRevision: jest.fn(),
            resolveDescriptor: jest.fn(),
          },
        },
        {
          provide: AgentConfigService,
          useValue: {
            listAll: jest.fn(),
            listByOrchestrator: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            toggleEnabled: jest.fn(),
          },
        },
        {
          provide: DynamicFlowCatalogService,
          useValue: {
            getFlowGraph: jest.fn(),
          },
        },
        {
          provide: SchemaCompilerService,
          useValue: {
            extractFieldPaths: jest.fn(),
          },
        },
        {
          provide: PipelineFlowConfigService,
          useValue: {
            listAll: jest.fn(),
            getPublished: jest.fn(),
            createDraft: jest.fn(),
            updateDraft: jest.fn(),
            publishDraft: jest.fn(),
            archive: jest.fn(),
          },
        },
        {
          provide: PhaseTransitionService,
          useValue: {
            refreshConfig: jest.fn(),
          },
        },
        {
          provide: EarlyAccessService,
          useValue: {
            createInvite: jest.fn(),
            listInvites: jest.fn(),
            revokeInvite: jest.fn(),
            listWaitlist: jest.fn(),
          },
        },
        {
          provide: AdminInvestorService,
          useValue: {
            getMonitorList: jest.fn(),
            getMonitorDetail: jest.fn(),
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
    startupIntakeService = module.get(StartupIntakeService);
    adminMatchingService = module.get(AdminMatchingService);
    aiPromptService = module.get(AiPromptService);
    aiPromptRuntimeService = module.get(AiPromptRuntimeService);
    agentSchemaRegistryService = module.get(AgentSchemaRegistryService);
    agentConfigService = module.get(AgentConfigService);
    dynamicFlowCatalogService = module.get(DynamicFlowCatalogService);
    schemaCompilerService = module.get(SchemaCompilerService);
    earlyAccessService = module.get(EarlyAccessService);
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

        userManagementService.findAll.mockResolvedValueOnce(mockResponse as any);

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

        startupService.adminFindPending.mockResolvedValueOnce(mockResponse as any);

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

    describe('POST /admin/startups/:id/reanalyze', () => {
      it('should trigger startup reanalysis', async () => {
        const payload = { jobId: 'pipeline-run-1' };
        startupService.reanalyze.mockResolvedValueOnce(payload as any);

        const result = await controller.reanalyzeStartup(mockAdmin, 'startup-1');

        expect(result).toEqual(payload);
        expect(startupService.reanalyze).toHaveBeenCalledWith(
          'startup-1',
          mockAdmin.id,
        );
      });
    });

    describe('POST /admin/startups/:id/match', () => {
      it('should queue investor matching for approved startup', async () => {
        const payload = {
          startupId: 'startup-1',
          analysisJobId: 'analysis-job-1',
          queueJobId: 'queue-job-1',
          status: 'queued',
          triggerSource: 'manual',
        };
        adminMatchingService.triggerMatchForStartup.mockResolvedValueOnce(payload as any);

        const result = await controller.matchStartupInvestors(mockAdmin, 'startup-1');

        expect(result).toEqual(payload);
        expect(adminMatchingService.triggerMatchForStartup).toHaveBeenCalledWith(
          'startup-1',
          mockAdmin.id,
        );
      });
    });

    describe('GET /admin/startups/:id/matching/status', () => {
      it('should return latest matching status', async () => {
        const payload = {
          startupId: 'startup-1',
          status: 'completed',
          jobId: 'analysis-job-1',
        };
        adminMatchingService.getLatestMatchingStatus.mockResolvedValueOnce(payload as any);

        const result = await controller.getStartupMatchingStatus('startup-1');

        expect(result).toEqual(payload);
        expect(adminMatchingService.getLatestMatchingStatus).toHaveBeenCalledWith(
          'startup-1',
        );
      });
    });

    describe('POST /admin/startups/:id/retry-phase', () => {
      it('should retry a specific pipeline phase', async () => {
        const dto = {
          phase: PipelinePhase.EVALUATION,
          forceRerun: false,
          feedback: 'Focus on revised unit economics assumptions',
        };
        const payload = { accepted: true };
        startupService.adminRetryPhase.mockResolvedValueOnce(payload as any);

        const result = await controller.retryStartupPhase(
          mockAdmin,
          'startup-1',
          dto,
        );

        expect(result).toEqual(payload);
        expect(startupService.adminRetryPhase).toHaveBeenCalledWith(
          'startup-1',
          mockAdmin.id,
          dto,
        );
      });
    });

    describe('POST /admin/startups/:id/retry-agent', () => {
      it('should retry a specific AI agent', async () => {
        const dto = {
          phase: PipelinePhase.EVALUATION,
          agent: 'market',
          feedback: 'Re-check TAM assumptions with updated sources',
        };
        const payload = { accepted: true };
        startupService.adminRetryAgent.mockResolvedValueOnce(payload as any);

        const result = await controller.retryStartupAgent(
          mockAdmin,
          'startup-1',
          dto,
        );

        expect(result).toEqual(payload);
        expect(startupService.adminRetryAgent).toHaveBeenCalledWith(
          'startup-1',
          mockAdmin.id,
          dto,
        );
      });
    });
  });

  describe('Scoring Configuration Endpoints', () => {
    describe('GET /admin/scoring/weights', () => {
      it('should return all scoring weights', async () => {
        const weights = [
          { stage: 'pre_seed', weights: { team: 30, market: 20 } },
          { stage: 'seed', weights: { team: 25, market: 18 } },
        ];

        scoringConfigService.getAll.mockResolvedValueOnce(weights as any);

        const result = await controller.getAllScoringWeights();

        expect(result).toEqual(weights);
        expect(scoringConfigService.getAll).toHaveBeenCalled();
      });
    });

    describe('GET /admin/scoring/weights/:stage', () => {
      it('should return scoring weights for a stage', async () => {
        const stageWeights = { stage: 'seed', weights: { team: 25, market: 18 } };

        scoringConfigService.getByStage.mockResolvedValueOnce(stageWeights as any);

        const result = await controller.getScoringWeightsByStage('seed');

        expect(result).toEqual(stageWeights);
        expect(scoringConfigService.getByStage).toHaveBeenCalledWith('seed');
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

  describe('AI Prompt Management Endpoints', () => {
    it('should return prompt definitions', async () => {
      const payload = [{ key: 'research.team' }];
      aiPromptService.listPromptDefinitions.mockResolvedValueOnce(payload as any);

      const result = await controller.getAiPrompts();

      expect(result).toEqual(payload);
      expect(aiPromptService.listPromptDefinitions).toHaveBeenCalled();
    });

    it('should return prompt coverage audit', async () => {
      const payload = {
        strictModeEnabled: false,
        items: [
          {
            key: 'evaluation.team',
            isCritical: true,
            hasPublishedGlobal: false,
            wouldFallback: true,
          },
        ],
      };
      aiPromptService.getPromptCoverageAudit.mockResolvedValueOnce(payload as any);

      const result = await controller.getAiPromptCoverageAudit();

      expect(result).toEqual(payload);
      expect(aiPromptService.getPromptCoverageAudit).toHaveBeenCalled();
    });

    it('should return flow graph metadata', async () => {
      const payload = { flows: [{ id: 'pipeline' }] };
      dynamicFlowCatalogService.getFlowGraph.mockResolvedValueOnce(payload as any);

      const result = await controller.getAiPromptFlow();

      expect(result).toEqual(payload);
      expect(dynamicFlowCatalogService.getFlowGraph).toHaveBeenCalled();
    });

    it('should seed prompts from code', async () => {
      const payload = { insertedTotal: 10, insertedGlobal: 2 };
      aiPromptService.seedFromCode.mockResolvedValueOnce(payload as any);

      const result = await controller.seedAiPrompts(mockAdmin as any);

      expect(result).toEqual(payload);
      expect(aiPromptService.seedFromCode).toHaveBeenCalledWith(mockAdmin.id);
    });

    it('should return prompt runtime context schema', async () => {
      const payload = {
        key: 'research.team',
        allowedVariables: ['contextJson'],
        requiredVariables: ['contextJson'],
        requiredPhases: ['extraction', 'scraping'],
        contextFields: [],
      };

      aiPromptRuntimeService.getContextSchema.mockReturnValueOnce(payload as any);

      const result = await controller.getAiPromptContextSchema('research.team');

      expect(result).toEqual(payload);
      expect(aiPromptRuntimeService.getContextSchema).toHaveBeenCalledWith('research.team');
    });

    it('should return prompt preview payload', async () => {
      const payload = {
        key: 'research.team',
        source: { promptSource: 'db', promptRevisionId: 'r1', effectiveStage: 'seed' },
        resolvedVariables: { contextJson: '{}' },
      };
      const body = { startupId: 'ed8f8dcb-4145-4af3-92ce-c8d879ec43db', stage: 'seed' };

      aiPromptRuntimeService.previewPrompt.mockResolvedValueOnce(payload as any);

      const result = await controller.previewAiPrompt('research.team', body as any);

      expect(result).toEqual(payload);
      expect(aiPromptRuntimeService.previewPrompt).toHaveBeenCalledWith('research.team', body);
    });

    it('should return pipeline context preview payload', async () => {
      const payload = {
        startupId: 'ed8f8dcb-4145-4af3-92ce-c8d879ec43db',
        effectiveStage: 'seed',
        generatedAt: new Date().toISOString(),
        agents: [],
      };
      const body = {
        startupId: 'ed8f8dcb-4145-4af3-92ce-c8d879ec43db',
        stage: 'seed',
      };

      aiPromptRuntimeService.previewPipelineContexts.mockResolvedValueOnce(payload as any);

      const result = await controller.previewAiPipelineContext(body as any);

      expect(result).toEqual(payload);
      expect(aiPromptRuntimeService.previewPipelineContexts).toHaveBeenCalledWith(body);
    });

    it('should list schema revisions', async () => {
      const payload = {
        definition: { key: 'evaluation.legal' },
        revisions: [],
      };

      agentSchemaRegistryService.listRevisionsByKey.mockResolvedValueOnce(payload as any);

      const result = await controller.getAiSchemaRevisions('evaluation.legal');

      expect(result).toEqual(payload);
      expect(agentSchemaRegistryService.listRevisionsByKey).toHaveBeenCalledWith('evaluation.legal');
    });

    it('should resolve runtime schema for prompt key with stage', async () => {
      const payload = {
        promptKey: 'evaluation.legal',
        stage: 'seed',
        source: 'code',
        schemaJson: {
          type: 'object',
          fields: {
            riskSummary: { type: 'string' },
          },
        },
      };

      agentSchemaRegistryService.resolveDescriptorWithSource.mockResolvedValueOnce(payload as any);

      const result = await controller.getAiSchemaResolvedAlias('evaluation.legal', 'seed' as any);

      expect(result).toEqual(payload);
      expect(agentSchemaRegistryService.resolveDescriptorWithSource).toHaveBeenCalledWith(
        'evaluation.legal',
        'seed',
      );
    });

    it('should create schema revision draft', async () => {
      const dto = {
        schemaJson: {
          type: 'object',
          fields: {
            score: { type: 'number', min: 0, max: 100 },
          },
        },
      };
      const payload = { id: 'rev-1', status: 'draft' };

      agentSchemaRegistryService.createDraft.mockResolvedValueOnce(payload as any);

      const result = await controller.createAiSchemaRevision(
        mockAdmin as any,
        'evaluation.legal',
        dto as any,
      );

      expect(result).toEqual(payload);
      expect(agentSchemaRegistryService.createDraft).toHaveBeenCalledWith(
        'evaluation.legal',
        mockAdmin.id,
        dto,
      );
    });

    it('should update schema revision draft', async () => {
      const dto = { notes: 'updated' };
      const payload = { id: 'rev-1', notes: 'updated' };

      agentSchemaRegistryService.updateDraft.mockResolvedValueOnce(payload as any);

      const result = await controller.updateAiSchemaRevision(
        'evaluation.legal',
        'rev-1',
        dto as any,
      );

      expect(result).toEqual(payload);
      expect(agentSchemaRegistryService.updateDraft).toHaveBeenCalledWith(
        'evaluation.legal',
        'rev-1',
        dto,
      );
    });

    it('should publish schema revision draft', async () => {
      const payload = { id: 'rev-1', status: 'published' };

      agentSchemaRegistryService.publishRevision.mockResolvedValueOnce(payload as any);

      const result = await controller.publishAiSchemaRevision(
        mockAdmin as any,
        'evaluation.legal',
        'rev-1',
      );

      expect(result).toEqual(payload);
      expect(agentSchemaRegistryService.publishRevision).toHaveBeenCalledWith(
        'evaluation.legal',
        'rev-1',
        mockAdmin.id,
      );
    });

    it('should list dynamic agent configs', async () => {
      const payload = [{ orchestratorNodeId: 'evaluation_orchestrator', agentKey: 'team' }];
      agentConfigService.listAll.mockResolvedValueOnce(payload as any);

      const result = await controller.getAiAgentConfigs();

      expect(result).toEqual({ items: payload });
      expect(agentConfigService.listAll).toHaveBeenCalled();
    });

    it('should create dynamic agent config', async () => {
      const dto = { agentKey: 'newAgent', label: 'New Agent' };
      const payload = { id: 'cfg-1', ...dto };
      agentConfigService.create.mockResolvedValueOnce(payload as any);

      const result = await controller.createAiAgentConfig(
        mockAdmin as any,
        'evaluation_orchestrator',
        dto as any,
      );

      expect(result).toEqual(payload);
      expect(agentConfigService.create).toHaveBeenCalledWith(
        'pipeline',
        'evaluation_orchestrator',
        mockAdmin.id,
        dto,
      );
    });

    it('should return upstream schema fields for agent node', async () => {
      dynamicFlowCatalogService.getFlowGraph.mockResolvedValueOnce({
        flows: [
          {
            id: 'pipeline',
            nodes: [
              { id: 'research_team', label: 'Team Research', promptKeys: ['research.team'] },
              { id: 'evaluation_team', label: 'Team Evaluation', promptKeys: ['evaluation.team'] },
            ],
            edges: [{ from: 'research_team', to: 'evaluation_team' }],
          },
        ],
      } as any);
      agentSchemaRegistryService.resolveDescriptor.mockResolvedValueOnce({
        type: 'object',
        fields: {
          score: { type: 'number' },
          findings: { type: 'array', items: { type: 'string' } },
        },
      } as any);
      schemaCompilerService.extractFieldPaths.mockReturnValueOnce(['score', 'findings[]']);

      const result = await controller.getAiAgentUpstreamFields('evaluation_team');

      expect(result).toEqual({
        items: [
          {
            nodeId: 'research_team',
            label: 'Team Research',
            fields: ['research_team', 'research_team.findings[]', 'research_team.score'],
          },
        ],
      });
      expect(agentSchemaRegistryService.resolveDescriptor).toHaveBeenCalledWith('research.team');
      expect(schemaCompilerService.extractFieldPaths).toHaveBeenCalled();
    });
  });
});
