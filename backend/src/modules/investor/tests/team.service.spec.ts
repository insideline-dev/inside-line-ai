import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TeamService } from '../team.service';
import { DrizzleService } from '../../../database';

describe('TeamService', () => {
  let service: TeamService;
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
  const mockThesisId = '123e4567-e89b-12d3-a456-426614174001';
  const mockInviteId = '123e4567-e89b-12d3-a456-426614174002';
  const mockMemberId = '123e4567-e89b-12d3-a456-426614174003';
  const mockAcceptingUserId = '123e4567-e89b-12d3-a456-426614174004';

  const mockThesis = {
    id: mockThesisId,
    userId: mockUserId,
    industries: ['fintech'],
    stages: ['seed'],
    checkSizeMin: 100000,
    checkSizeMax: 1000000,
    geographicFocus: ['North America'],
    mustHaveFeatures: [],
    dealBreakers: [],
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockInvite = {
    id: mockInviteId,
    investorThesisId: mockThesisId,
    invitedByUserId: mockUserId,
    email: 'test@example.com',
    role: 'member' as const,
    inviteCode: 'abc123def456',
    status: 'pending' as const,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    acceptedByUserId: null,
    acceptedAt: null,
    createdAt: new Date(),
  };

  const mockMember = {
    id: mockMemberId,
    investorThesisId: mockThesisId,
    userId: mockAcceptingUserId,
    email: 'member@example.com',
    role: 'member' as const,
    joinedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
            withRLS: jest.fn((userId, callback) => callback(mockDb)),
          },
        },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);
    drizzleService = module.get(DrizzleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTeam', () => {
    it('should return invites and members', async () => {
      // First query for thesis: select().from().where().limit()
      // where() returns mockDb so limit() can be called
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockThesis]);

      // Second query for invites: select().from().where() (no limit)
      mockDb.where.mockResolvedValueOnce([mockInvite]);

      // Third query for members: select().from().where() (no limit)
      mockDb.where.mockResolvedValueOnce([mockMember]);

      const result = await service.getTeam(mockUserId);

      expect(result.invites).toHaveLength(1);
      expect(result.members).toHaveLength(1);
      expect(result.invites[0].email).toBe('test@example.com');
      expect(result.members[0].email).toBe('member@example.com');
    });

    it('should throw NotFoundException when thesis not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.getTeam(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createInvite', () => {
    const createDto = {
      email: 'invite@example.com',
      role: 'member' as const,
    };

    it('should create invite successfully', async () => {
      mockDb.limit.mockResolvedValueOnce([mockThesis]);
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValue([mockInvite]);

      const result = await service.createInvite(mockUserId, createDto);

      expect(result.email).toBe(mockInvite.email);
      expect(result.status).toBe('pending');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw NotFoundException when thesis not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.createInvite(mockUserId, createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when pending invite exists', async () => {
      mockDb.limit.mockResolvedValueOnce([mockThesis]);
      mockDb.limit.mockResolvedValueOnce([mockInvite]);

      await expect(
        service.createInvite(mockUserId, createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelInvite', () => {
    it('should cancel invite successfully', async () => {
      mockDb.limit.mockResolvedValue([mockInvite]);

      await service.cancelInvite(mockUserId, mockInviteId);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({ status: 'cancelled' });
    });

    it('should throw NotFoundException when invite not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.cancelInvite(mockUserId, mockInviteId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not invite creator', async () => {
      const otherUserInvite = { ...mockInvite, invitedByUserId: 'other-user' };
      mockDb.limit.mockResolvedValue([otherUserInvite]);

      await expect(
        service.cancelInvite(mockUserId, mockInviteId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when invite not pending', async () => {
      const acceptedInvite = { ...mockInvite, status: 'accepted' as const };
      mockDb.limit.mockResolvedValue([acceptedInvite]);

      await expect(
        service.cancelInvite(mockUserId, mockInviteId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeMember', () => {
    it('should remove member successfully', async () => {
      mockDb.limit.mockResolvedValueOnce([mockThesis]);
      mockDb.limit.mockResolvedValueOnce([mockMember]);

      await service.removeMember(mockUserId, mockMemberId);

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when thesis not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.removeMember(mockUserId, mockMemberId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when member not found', async () => {
      mockDb.limit.mockResolvedValueOnce([mockThesis]);
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.removeMember(mockUserId, mockMemberId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when member not from this thesis', async () => {
      const otherThesisMember = {
        ...mockMember,
        investorThesisId: 'other-thesis',
      };
      mockDb.limit.mockResolvedValueOnce([mockThesis]);
      mockDb.limit.mockResolvedValueOnce([otherThesisMember]);

      await expect(
        service.removeMember(mockUserId, mockMemberId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when trying to remove yourself', async () => {
      const selfMember = { ...mockMember, userId: mockUserId };
      mockDb.limit.mockResolvedValueOnce([mockThesis]);
      mockDb.limit.mockResolvedValueOnce([selfMember]);

      await expect(
        service.removeMember(mockUserId, mockMemberId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptInvite', () => {
    const validInviteCode = 'abc123def456';

    it('should accept invite successfully', async () => {
      mockDb.limit.mockResolvedValueOnce([mockInvite]);
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValue([mockMember]);

      const result = await service.acceptInvite(
        mockAcceptingUserId,
        validInviteCode,
      );

      expect(result.userId).toBe(mockMember.userId);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when invite not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.acceptInvite(mockAcceptingUserId, 'invalid-code'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when invite not pending', async () => {
      const acceptedInvite = { ...mockInvite, status: 'accepted' as const };
      mockDb.limit.mockResolvedValue([acceptedInvite]);

      await expect(
        service.acceptInvite(mockAcceptingUserId, validInviteCode),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when invite expired', async () => {
      const expiredInvite = {
        ...mockInvite,
        expiresAt: new Date(Date.now() - 1000),
      };
      mockDb.limit.mockResolvedValue([expiredInvite]);

      await expect(
        service.acceptInvite(mockAcceptingUserId, validInviteCode),
      ).rejects.toThrow(BadRequestException);
    });

    it('should mark invite as expired when attempting to accept expired invite', async () => {
      const expiredInvite = {
        ...mockInvite,
        expiresAt: new Date(Date.now() - 1000),
      };
      mockDb.limit.mockResolvedValue([expiredInvite]);

      await expect(
        service.acceptInvite(mockAcceptingUserId, validInviteCode),
      ).rejects.toThrow(BadRequestException);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({ status: 'expired' });
    });

    it('should throw BadRequestException when user already a member', async () => {
      mockDb.limit.mockResolvedValueOnce([mockInvite]);
      mockDb.limit.mockResolvedValueOnce([mockMember]);

      await expect(
        service.acceptInvite(mockAcceptingUserId, validInviteCode),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
