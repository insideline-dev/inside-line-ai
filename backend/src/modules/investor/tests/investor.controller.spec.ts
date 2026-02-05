import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvestorController } from '../investor.controller';
import { ThesisService } from '../thesis.service';
import { ScoringService } from '../scoring.service';
import { MatchService } from '../match.service';
import { TeamService } from '../team.service';
import { InvestorNoteService } from '../investor-note.service';
import { PortfolioService } from '../portfolio.service';
import { DealPipelineService } from '../deal-pipeline.service';
import { MessagingService } from '../messaging.service';
import { UserRole } from '../../../auth/entities/auth.schema';

describe('InvestorController', () => {
  let controller: InvestorController;
  let thesisService: jest.Mocked<ThesisService>;
  let scoringService: jest.Mocked<ScoringService>;
  let matchService: jest.Mocked<MatchService>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'investor@test.com',
    name: 'Test Investor',
    role: UserRole.INVESTOR,
    emailVerified: true,
    image: null,
  };

  const mockThesis = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    userId: mockUser.id,
    industries: ['fintech'],
    stages: ['seed'],
    checkSizeMin: 100000,
    checkSizeMax: 1000000,
    geographicFocus: ['North America'],
    mustHaveFeatures: ['AI/ML'],
    dealBreakers: ['crypto'],
    notes: 'Test thesis',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockWeights = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    userId: mockUser.id,
    marketWeight: 30,
    teamWeight: 25,
    productWeight: 20,
    tractionWeight: 15,
    financialsWeight: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMatch = {
    id: '123e4567-e89b-12d3-a456-426614174003',
    investorId: mockUser.id,
    startupId: '123e4567-e89b-12d3-a456-426614174004',
    overallScore: 85,
    marketScore: 90,
    teamScore: 85,
    productScore: 80,
    tractionScore: 75,
    financialsScore: 85,
    matchReason: 'Strong market fit',
    isSaved: false,
    viewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestorController],
      providers: [
        {
          provide: ThesisService,
          useValue: {
            findOne: jest.fn(),
            upsert: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: ScoringService,
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: MatchService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            toggleSaved: jest.fn(),
            updateViewedAt: jest.fn(),
            regenerateMatches: jest.fn(),
          },
        },
        {
          provide: TeamService,
          useValue: {
            getTeam: jest.fn(),
            createInvite: jest.fn(),
            cancelInvite: jest.fn(),
            removeMember: jest.fn(),
            acceptInvite: jest.fn(),
          },
        },
        {
          provide: InvestorNoteService,
          useValue: {
            create: jest.fn(),
            getAllNotes: jest.fn(),
            getNotes: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: PortfolioService,
          useValue: {
            addToPortfolio: jest.fn(),
            getPortfolio: jest.fn(),
          },
        },
        {
          provide: DealPipelineService,
          useValue: {
            getPipeline: jest.fn(),
          },
        },
        {
          provide: MessagingService,
          useValue: {
            getConversations: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InvestorController>(InvestorController);
    thesisService = module.get(ThesisService);
    scoringService = module.get(ScoringService);
    matchService = module.get(MatchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Thesis endpoints', () => {
    describe('GET /investor/thesis', () => {
      it('should return thesis', async () => {
        thesisService.findOne.mockResolvedValue(mockThesis);

        const result = await controller.getThesis(mockUser);

        expect(result).toEqual(mockThesis);
        expect(thesisService.findOne).toHaveBeenCalledWith(mockUser.id);
      });

      it('should return null when thesis does not exist', async () => {
        thesisService.findOne.mockResolvedValue(null);

        const result = await controller.getThesis(mockUser);

        expect(result).toBeNull();
      });
    });

    describe('POST /investor/thesis', () => {
      const createDto = {
        industries: ['fintech'],
        stages: ['seed'],
        checkSizeMin: 100000,
        checkSizeMax: 1000000,
        geographicFocus: ['North America'],
        mustHaveFeatures: ['AI/ML'],
        dealBreakers: ['crypto'],
        notes: 'Test thesis',
      };

      it('should create or update thesis and queue match regeneration', async () => {
        thesisService.upsert.mockResolvedValue(mockThesis);

        const result = await controller.createOrUpdateThesis(
          mockUser,
          createDto,
        );

        expect(result).toEqual(mockThesis);
        expect(thesisService.upsert).toHaveBeenCalledWith(
          mockUser.id,
          createDto,
        );
        expect(matchService.regenerateMatches).toHaveBeenCalledWith(
          mockUser.id,
        );
      });
    });

    describe('DELETE /investor/thesis', () => {
      it('should delete thesis', async () => {
        thesisService.delete.mockResolvedValue(undefined);

        const result = await controller.deleteThesis(mockUser);

        expect(result).toEqual({
          success: true,
          message: 'Thesis deleted',
        });
        expect(thesisService.delete).toHaveBeenCalledWith(mockUser.id);
      });

      it('should throw NotFoundException when thesis does not exist', async () => {
        thesisService.delete.mockRejectedValue(
          new NotFoundException('Thesis not found'),
        );

        await expect(controller.deleteThesis(mockUser)).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  describe('Scoring endpoints', () => {
    describe('GET /investor/scoring', () => {
      it('should return scoring weights', async () => {
        scoringService.findOne.mockResolvedValue(mockWeights);

        const result = await controller.getScoringWeights(mockUser);

        expect(result).toEqual(mockWeights);
        expect(scoringService.findOne).toHaveBeenCalledWith(mockUser.id);
      });

      it('should return default weights when none exist', async () => {
        const defaultWeights = {
          id: '',
          userId: mockUser.id,
          marketWeight: 20,
          teamWeight: 20,
          productWeight: 20,
          tractionWeight: 20,
          financialsWeight: 20,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        scoringService.findOne.mockResolvedValue(defaultWeights);

        const result = await controller.getScoringWeights(mockUser);

        expect(result.marketWeight).toBe(20);
        expect(result.teamWeight).toBe(20);
      });
    });

    describe('PUT /investor/scoring', () => {
      const updateDto = {
        marketWeight: 30,
        teamWeight: 25,
        productWeight: 20,
        tractionWeight: 15,
        financialsWeight: 10,
      };

      it('should update scoring weights and queue match regeneration', async () => {
        scoringService.update.mockResolvedValue(mockWeights);

        const result = await controller.updateScoringWeights(
          mockUser,
          updateDto,
        );

        expect(result).toEqual(mockWeights);
        expect(scoringService.update).toHaveBeenCalledWith(
          mockUser.id,
          updateDto,
        );
        expect(matchService.regenerateMatches).toHaveBeenCalledWith(
          mockUser.id,
        );
      });
    });
  });

  describe('Match endpoints', () => {
    describe('GET /investor/matches', () => {
      const query = {
        page: 1,
        limit: 20,
      };

      it('should return paginated matches', async () => {
        const paginatedResult = {
          data: [mockMatch],
          meta: {
            total: 1,
            page: 1,
            limit: 20,
            totalPages: 1,
          },
        };
        matchService.findAll.mockResolvedValue(paginatedResult);

        const result = await controller.getMatches(mockUser, query);

        expect(result).toEqual(paginatedResult);
        expect(matchService.findAll).toHaveBeenCalledWith(mockUser.id, query);
      });

      it('should filter by minScore', async () => {
        const filteredQuery = { ...query, minScore: 80 };
        matchService.findAll.mockResolvedValue({
          data: [mockMatch],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });

        await controller.getMatches(mockUser, filteredQuery);

        expect(matchService.findAll).toHaveBeenCalledWith(
          mockUser.id,
          filteredQuery,
        );
      });

      it('should filter by isSaved', async () => {
        const filteredQuery = { ...query, isSaved: true };
        matchService.findAll.mockResolvedValue({
          data: [{ ...mockMatch, isSaved: true }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });

        await controller.getMatches(mockUser, filteredQuery);

        expect(matchService.findAll).toHaveBeenCalledWith(
          mockUser.id,
          filteredQuery,
        );
      });
    });

    describe('GET /investor/matches/:startupId', () => {
      it('should return match details and update viewedAt', async () => {
        matchService.findOne.mockResolvedValue(mockMatch);
        matchService.updateViewedAt.mockResolvedValue({
          ...mockMatch,
          viewedAt: new Date(),
        });

        const result = await controller.getMatchDetails(
          mockUser,
          mockMatch.startupId,
        );

        expect(result).toEqual(mockMatch);
        expect(matchService.findOne).toHaveBeenCalledWith(
          mockUser.id,
          mockMatch.startupId,
        );
        expect(matchService.updateViewedAt).toHaveBeenCalledWith(
          mockUser.id,
          mockMatch.startupId,
        );
      });

      it('should throw NotFoundException when match does not exist', async () => {
        matchService.findOne.mockRejectedValue(
          new NotFoundException('Match not found'),
        );

        await expect(
          controller.getMatchDetails(mockUser, 'invalid-id'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('PATCH /investor/matches/:startupId/save', () => {
      it('should toggle saved status', async () => {
        const savedMatch = { ...mockMatch, isSaved: true };
        matchService.toggleSaved.mockResolvedValue(savedMatch);

        const result = await controller.toggleSaved(
          mockUser,
          mockMatch.startupId,
        );

        expect(result.isSaved).toBe(true);
        expect(matchService.toggleSaved).toHaveBeenCalledWith(
          mockUser.id,
          mockMatch.startupId,
        );
      });
    });
  });
});
