import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataImportService } from '../data-import.service';
import { DrizzleService } from '../../../database';
import { UserRole } from '../../../auth/entities/auth.schema';
import { StartupStatus } from '../../startup/entities/startup.schema';

describe('DataImportService', () => {
  let service: DataImportService;
  let _drizzleService: jest.Mocked<DrizzleService>;

  const createMockDb = () => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataImportService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
          },
        },
      ],
    }).compile();

    service = module.get<DataImportService>(DataImportService);
    _drizzleService = module.get(DrizzleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('importUsers', () => {
    const validCsv = `email,name,role
john@example.com,John Doe,founder
jane@example.com,Jane Smith,admin`;

    it('should import valid users from CSV', async () => {
      mockDb.limit
        .mockResolvedValueOnce([]) // john doesn't exist
        .mockResolvedValueOnce([]); // jane doesn't exist
      mockDb.values.mockReturnThis();

      const result = await service.importUsers(validCsv);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip users with invalid email', async () => {
      const csvWithInvalidEmail = `email,name
invalid-email,John Doe
valid@example.com,Jane Smith`;

      mockDb.limit.mockResolvedValueOnce([]); // valid user doesn't exist
      mockDb.values.mockReturnThis();

      const result = await service.importUsers(csvWithInvalidEmail);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('Invalid email');
    });

    it('should skip users that already exist', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ id: 'existing' }]) // john exists
        .mockResolvedValueOnce([]); // jane doesn't exist
      mockDb.values.mockReturnThis();

      const result = await service.importUsers(validCsv);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('Email already exists');
    });

    it('should skip users with empty name', async () => {
      const csvWithEmptyName = `email,name
john@example.com,
jane@example.com,Jane`;

      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.values.mockReturnThis();

      const result = await service.importUsers(csvWithEmptyName);

      expect(result.skipped).toBeGreaterThan(0);
    });

    it('should throw if required headers are missing', async () => {
      const csvMissingHeaders = `name,role
John Doe,user`;

      await expect(service.importUsers(csvMissingHeaders)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if CSV is empty', async () => {
      await expect(service.importUsers('')).rejects.toThrow(BadRequestException);
    });

    it('should handle CSV with quoted fields', async () => {
      const csvWithQuotes = `email,name
"john@example.com","John ""Johnny"" Doe"`;

      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.values.mockReturnThis();

      const result = await service.importUsers(csvWithQuotes);

      expect(result.imported).toBe(1);
    });

    it('should validate role if provided', async () => {
      const csvWithInvalidRole = `email,name,role
john@example.com,John Doe,superadmin`;

      // Need to mock db check for existing user
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.importUsers(csvWithInvalidRole);

      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('Invalid role');
    });
  });

  describe('importStartups', () => {
    const validStartupCsv = `user_email,name,tagline,description,website,location,industry,stage,funding_target,team_size
john@example.com,Acme Inc,Best widgets,A long description here,https://acme.com,San Francisco,SaaS,seed,1000000,5`;

    it('should import valid startups from CSV', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'user-id' }]); // user exists
      mockDb.values.mockReturnThis();

      const result = await service.importStartups(validStartupCsv);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('should skip if user email not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // user doesn't exist

      const result = await service.importStartups(validStartupCsv);

      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('User email not found');
    });

    it('should skip invalid stage values', async () => {
      const csvWithInvalidStage = `user_email,name,tagline,description,website,location,industry,stage,funding_target,team_size
john@example.com,Acme Inc,Best widgets,Description,https://acme.com,SF,SaaS,invalid_stage,1000000,5`;

      mockDb.limit.mockResolvedValueOnce([{ id: 'user-id' }]);

      const result = await service.importStartups(csvWithInvalidStage);

      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('Invalid stage');
    });

    it('should skip invalid funding_target', async () => {
      const csvWithInvalidFunding = `user_email,name,tagline,description,website,location,industry,stage,funding_target,team_size
john@example.com,Acme Inc,Best widgets,Description,https://acme.com,SF,SaaS,seed,not_a_number,5`;

      mockDb.limit.mockResolvedValueOnce([{ id: 'user-id' }]);

      const result = await service.importStartups(csvWithInvalidFunding);

      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('Invalid funding_target');
    });

    it('should throw if required headers are missing', async () => {
      const csvMissingHeaders = `user_email,name
john@example.com,Acme`;

      await expect(service.importStartups(csvMissingHeaders)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('exportUsers', () => {
    const mockUsers = [
      {
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        role: UserRole.FOUNDER,
        emailVerified: true,
        createdAt: new Date('2024-01-01'),
      },
    ];

    it('should export users as CSV', async () => {
      mockDb.where.mockResolvedValueOnce(mockUsers);

      const result = await service.exportUsers();

      expect(result).toContain('id,name,email,role');
      expect(result).toContain('john@example.com');
    });

    it('should filter by role when provided', async () => {
      mockDb.where.mockResolvedValueOnce(mockUsers);

      await service.exportUsers({ role: UserRole.FOUNDER });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should escape CSV fields with commas', async () => {
      const usersWithCommas = [
        {
          ...mockUsers[0],
          name: 'Doe, John',
        },
      ];

      mockDb.where.mockResolvedValueOnce(usersWithCommas);

      const result = await service.exportUsers();

      expect(result).toContain('"Doe, John"');
    });
  });

  describe('exportStartups', () => {
    const mockStartups = [
      {
        id: 'startup-1',
        name: 'Acme Inc',
        slug: 'acme-inc',
        tagline: 'Best widgets',
        description: 'A description',
        website: 'https://acme.com',
        location: 'San Francisco',
        industry: 'SaaS',
        stage: 'seed',
        fundingTarget: 1000000,
        teamSize: 5,
        status: StartupStatus.APPROVED,
        createdAt: new Date('2024-01-01'),
      },
    ];

    it('should export startups as CSV', async () => {
      mockDb.where.mockResolvedValueOnce(mockStartups);

      const result = await service.exportStartups();

      expect(result).toContain('id,name,slug');
      expect(result).toContain('acme-inc');
    });

    it('should filter by status when provided', async () => {
      mockDb.where.mockResolvedValueOnce(mockStartups);

      await service.exportStartups({ status: StartupStatus.APPROVED });

      expect(mockDb.where).toHaveBeenCalled();
    });
  });
});
