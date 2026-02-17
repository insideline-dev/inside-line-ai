import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ScoringPreferencesService } from '../scoring-preferences.service';
import { DrizzleService } from '../../../database';
import { StartupStage } from '../../startup/entities/startup.schema';
import { UpdateScoringPreferencesSchema } from '../dto';

describe('ScoringPreferencesService', () => {
  let service: ScoringPreferencesService;
  let drizzleService: jest.Mocked<DrizzleService>;
  const createMockDb = () => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockStage = StartupStage.SEED;

  const mockCustomWeights = {
    team: 20,
    market: 15,
    product: 15,
    traction: 10,
    businessModel: 10,
    gtm: 10,
    financials: 5,
    competitiveAdvantage: 5,
    legal: 5,
    dealTerms: 3,
    exitPotential: 2,
  };

  const mockDefaultWeights = {
    team: 18,
    market: 18,
    product: 18,
    traction: 9,
    businessModel: 9,
    gtm: 9,
    financials: 9,
    competitiveAdvantage: 3,
    legal: 3,
    dealTerms: 2,
    exitPotential: 2,
  };

  const mockPreference = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    investorId: mockUserId,
    stage: mockStage,
    useCustomWeights: true,
    customWeights: mockCustomWeights,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRationale = {
    team: 'Team rationale',
    market: 'Market rationale',
    product: 'Product rationale',
    traction: 'Traction rationale',
    businessModel: 'Business model rationale',
    gtm: 'GTM rationale',
    financials: 'Financials rationale',
    competitiveAdvantage: 'Competitive advantage rationale',
    legal: 'Legal rationale',
    dealTerms: 'Deal terms rationale',
    exitPotential: 'Exit potential rationale',
  };

  const mockStageDefault = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    stage: mockStage,
    weights: mockDefaultWeights,
    rationale: mockRationale,
    overallRationale: 'Default rationale',
    lastModifiedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringPreferencesService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
            withRLS: jest.fn((userId, callback) => callback(mockDb)),
          },
        },
      ],
    }).compile();

    service = module.get<ScoringPreferencesService>(ScoringPreferencesService);
    drizzleService = module.get(DrizzleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return all preferences when they exist', async () => {
      const mockPreferences = [
        mockPreference,
        { ...mockPreference, stage: StartupStage.SERIES_A },
      ];
      mockDb.where.mockResolvedValue(mockPreferences);

      const result = await service.getAll(mockUserId);

      expect(result).toEqual(mockPreferences);
      expect(drizzleService.withRLS).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function),
      );
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should return empty array when no preferences exist', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await service.getAll(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('getByStage', () => {
    it('should return preference for a specific stage', async () => {
      mockDb.limit.mockResolvedValue([mockPreference]);

      const result = await service.getByStage(mockUserId, mockStage);

      expect(result).toEqual(mockPreference);
      expect(drizzleService.withRLS).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function),
      );
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it('should return null when no preference exists for that stage', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.getByStage(mockUserId, mockStage);

      expect(result).toBeNull();
    });
  });

  describe('getEffectiveWeights', () => {
    it('should return custom weights when useCustomWeights is true and customWeights exist', async () => {
      mockDb.limit.mockResolvedValueOnce([mockPreference]);

      const result = await service.getEffectiveWeights(mockUserId, mockStage);

      expect(result).toEqual(mockCustomWeights);
    });

    it('should fall back to admin stage defaults when useCustomWeights is false', async () => {
      const preferenceWithoutCustom = {
        ...mockPreference,
        useCustomWeights: false,
        customWeights: null,
      };
      mockDb.limit.mockResolvedValueOnce([preferenceWithoutCustom]);
      mockDb.limit.mockResolvedValueOnce([mockStageDefault]);

      const result = await service.getEffectiveWeights(mockUserId, mockStage);

      expect(result).toEqual(mockDefaultWeights);
    });

    it('should fall back to admin stage defaults when customWeights is null', async () => {
      const preferenceWithNullWeights = {
        ...mockPreference,
        useCustomWeights: true,
        customWeights: null,
      };
      mockDb.limit.mockResolvedValueOnce([preferenceWithNullWeights]);
      mockDb.limit.mockResolvedValueOnce([mockStageDefault]);

      const result = await service.getEffectiveWeights(mockUserId, mockStage);

      expect(result).toEqual(mockDefaultWeights);
    });

    it('should fall back to admin stage defaults when no investor preference exists', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.limit.mockResolvedValueOnce([mockStageDefault]);

      const result = await service.getEffectiveWeights(mockUserId, mockStage);

      expect(result).toEqual(mockDefaultWeights);
    });

    it('should throw NotFoundException when neither custom nor admin defaults exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.getEffectiveWeights(mockUserId, mockStage),
      ).rejects.toThrow(
        new NotFoundException(
          `No default weights configured for stage ${mockStage}`,
        ),
      );
    });
  });

  describe('upsert', () => {
    const validDto = {
      useCustomWeights: true,
      customWeights: mockCustomWeights,
    };

    it('should create new preference when none exists', async () => {
      // Mock getByStage to return null (no existing preference)
      jest.spyOn(service, 'getByStage').mockResolvedValueOnce(null as never);
      mockDb.returning.mockResolvedValue([mockPreference]);

      const result = await service.upsert(mockUserId, mockStage, validDto);

      expect(result).toEqual(mockPreference);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        investorId: mockUserId,
        stage: mockStage,
        useCustomWeights: true,
        customWeights: mockCustomWeights,
        customRationale: null,
      });
      expect(mockDb.returning).toHaveBeenCalled();
    });

    it('should update existing preference', async () => {
      const updatedPreference = {
        ...mockPreference,
        customWeights: {
          ...mockCustomWeights,
          team: 25,
          market: 10,
        },
      };
      // Mock getByStage to return existing preference
      jest.spyOn(service, 'getByStage').mockResolvedValueOnce(mockPreference);
      mockDb.returning.mockResolvedValue([updatedPreference]);

      const updateDto = {
        useCustomWeights: true,
        customWeights: updatedPreference.customWeights,
      };

      const result = await service.upsert(mockUserId, mockStage, updateDto);

      expect(result).toEqual(updatedPreference);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({
        useCustomWeights: updateDto.useCustomWeights,
        customWeights: updateDto.customWeights,
        customRationale: null,
        updatedAt: expect.any(Date),
      });
      expect(mockDb.returning).toHaveBeenCalled();
    });

    it('should set useCustomWeights to true with custom weights', async () => {
      // Mock getByStage to return null
      jest.spyOn(service, 'getByStage').mockResolvedValueOnce(null as never);
      mockDb.returning.mockResolvedValue([mockPreference]);

      await service.upsert(mockUserId, mockStage, validDto);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          useCustomWeights: true,
          customWeights: mockCustomWeights,
        }),
      );
    });

    it('should set useCustomWeights to false (revert to defaults)', async () => {
      const revertDto = {
        useCustomWeights: false,
        customWeights: null,
      };
      const revertedPreference = {
        ...mockPreference,
        useCustomWeights: false,
        customWeights: null,
      };
      // Mock getByStage to return existing preference
      jest.spyOn(service, 'getByStage').mockResolvedValueOnce(mockPreference);
      mockDb.returning.mockResolvedValue([revertedPreference]);

      const result = await service.upsert(mockUserId, mockStage, revertDto);

      expect(result.useCustomWeights).toBe(false);
      expect(result.customWeights).toBeNull();
      expect(mockDb.set).toHaveBeenCalledWith({
        useCustomWeights: false,
        customWeights: null,
        customRationale: null,
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('reset', () => {
    it('should delete the preference for a specific stage', async () => {
      // Mock getByStage call inside reset
      jest.spyOn(service, 'getByStage').mockResolvedValueOnce(mockPreference);
      mockDb.where.mockResolvedValue(undefined);

      await service.reset(mockUserId, mockStage);

      expect(service.getByStage).toHaveBeenCalledWith(mockUserId, mockStage);
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should throw NotFoundException when no preference exists', async () => {
      // Mock getByStage to return null
      jest.spyOn(service, 'getByStage').mockResolvedValueOnce(null as never);

      await expect(service.reset(mockUserId, mockStage)).rejects.toThrow(
        new NotFoundException(
          `No scoring preference found for stage ${mockStage}`,
        ),
      );
    });
  });

  describe('resetAll', () => {
    it('should delete all preferences for the user', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await service.resetAll(mockUserId);

      expect(drizzleService.withRLS).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function),
      );
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('DTO validation', () => {
    it('should validate useCustomWeights: true with valid customWeights that sum to 100', () => {
      const validDto = {
        useCustomWeights: true,
        customWeights: mockCustomWeights,
      };

      const result = UpdateScoringPreferencesSchema.safeParse(validDto);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validDto);
      }
    });

    it('should validate useCustomWeights: false with null customWeights', () => {
      const validDto = {
        useCustomWeights: false,
        customWeights: null,
      };

      const result = UpdateScoringPreferencesSchema.safeParse(validDto);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validDto);
      }
    });

    it('should reject useCustomWeights: true without customWeights', () => {
      const invalidDto = {
        useCustomWeights: true,
        customWeights: null,
      };

      const result = UpdateScoringPreferencesSchema.safeParse(invalidDto);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'customWeights required when useCustomWeights is true',
        );
      }
    });

    it('should reject weights that do not sum to 100', () => {
      const invalidWeights = {
        team: 20,
        market: 20,
        product: 20,
        traction: 20,
        businessModel: 20,
        gtm: 0,
        financials: 0,
        competitiveAdvantage: 0,
        legal: 0,
        dealTerms: 0,
        exitPotential: 0,
      }; // Sums to 100 but let's test with 99

      const invalidDto = {
        useCustomWeights: true,
        customWeights: {
          ...invalidWeights,
          team: 19, // Now sums to 99
        },
      };

      const result = UpdateScoringPreferencesSchema.safeParse(invalidDto);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'Weights must sum to 100',
        );
      }
    });

    it('should reject weights with values > 100', () => {
      const invalidDto = {
        useCustomWeights: true,
        customWeights: {
          team: 101,
          market: 0,
          product: 0,
          traction: 0,
          businessModel: 0,
          gtm: 0,
          financials: 0,
          competitiveAdvantage: 0,
          legal: 0,
          dealTerms: 0,
          exitPotential: 0,
        },
      };

      const result = UpdateScoringPreferencesSchema.safeParse(invalidDto);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('team'))).toBe(
          true,
        );
      }
    });

    it('should reject weights with values < 0', () => {
      const invalidDto = {
        useCustomWeights: true,
        customWeights: {
          team: -1,
          market: 101,
          product: 0,
          traction: 0,
          businessModel: 0,
          gtm: 0,
          financials: 0,
          competitiveAdvantage: 0,
          legal: 0,
          dealTerms: 0,
          exitPotential: 0,
        },
      };

      const result = UpdateScoringPreferencesSchema.safeParse(invalidDto);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('team'))).toBe(
          true,
        );
      }
    });

    it('should accept weights with decimal sum adjustment (edge case)', () => {
      const edgeCaseWeights = {
        team: 10,
        market: 10,
        product: 10,
        traction: 10,
        businessModel: 10,
        gtm: 10,
        financials: 10,
        competitiveAdvantage: 10,
        legal: 10,
        dealTerms: 10,
        exitPotential: 10,
      }; // Sums to 110

      const invalidDto = {
        useCustomWeights: true,
        customWeights: edgeCaseWeights,
      };

      const result = UpdateScoringPreferencesSchema.safeParse(invalidDto);

      expect(result.success).toBe(false);
    });
  });
});
