import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentMailService } from '../agentmail.service';
import { AttachmentService } from '../attachment.service';
import { DrizzleService } from '../../../../database';
import { NotificationService } from '../../../../notification/notification.service';
import { WebhookSource } from '../../../integration/entities';
import { NotificationType } from '../../../../notification/entities';

describe('AgentMailService', () => {
  let service: AgentMailService;
  let drizzleService: any;
  let notificationService: any;
  let attachmentService: any;

  const mockThread = {
    id: 'thread-1',
    userId: 'user-1',
    threadId: 'ext-thread-123',
    subject: 'Investment Opportunity',
    participants: ['founder@startup.com', 'investor@example.com'],
    lastMessageAt: new Date(),
    unreadCount: 1,
    createdAt: new Date(),
  };

  const mockWebhookPayload = {
    event: 'email.received',
    thread_id: 'ext-thread-123',
    message: {
      id: 'msg-123',
      from: 'founder@startup.com',
      to: ['investor@example.com'],
      subject: 'Investment Opportunity',
      text: 'Hello, I would like to...',
      html: '<p>Hello, I would like to...</p>',
      attachments: [
        {
          filename: 'pitch_deck.pdf',
          url: 'https://agentmail.com/attachments/123',
          size: 2048000,
          content_type: 'application/pdf',
        },
      ],
      timestamp: '2024-01-15T10:30:00Z',
    },
    signature: 'sha256=abc123',
  };

  const createMockDrizzle = () => ({
    db: {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      offset: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    },
  });

  beforeEach(async () => {
    drizzleService = createMockDrizzle();
    notificationService = {
      create: jest.fn().mockResolvedValue({}),
    };
    attachmentService = {
      downloadMultiple: jest.fn().mockResolvedValue(['key-1']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMailService,
        { provide: DrizzleService, useValue: drizzleService },
        { provide: NotificationService, useValue: notificationService },
        { provide: AttachmentService, useValue: attachmentService },
      ],
    }).compile();

    service = module.get<AgentMailService>(AgentMailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ WEBHOOK HANDLING ============

  describe('handleWebhook', () => {
    it('should process webhook and create new thread', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]); // No existing thread
      drizzleService.db.returning.mockResolvedValue([{ id: 'webhook-1' }]);

      await service.handleWebhook(mockWebhookPayload);

      expect(drizzleService.db.insert).toHaveBeenCalled();
      expect(attachmentService.downloadMultiple).toHaveBeenCalled();
      expect(notificationService.create).toHaveBeenCalled();
    });

    it('should update existing thread', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockThread]);
      drizzleService.db.returning.mockResolvedValue([{ id: 'webhook-1' }]);

      await service.handleWebhook(mockWebhookPayload);

      expect(drizzleService.db.update).toHaveBeenCalled();
      expect(drizzleService.db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          unreadCount: mockThread.unreadCount + 1,
        }),
      );
    });

    it('should log webhook event', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);
      drizzleService.db.returning.mockResolvedValue([{ id: 'webhook-1' }]);

      await service.handleWebhook(mockWebhookPayload);

      expect(drizzleService.db.insert).toHaveBeenCalled();
      expect(drizzleService.db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          source: WebhookSource.AGENTMAIL,
          eventType: 'email.received',
        }),
      );
    });

    it('should handle webhook processing errors', async () => {
      drizzleService.db.limit.mockRejectedValueOnce(new Error('DB error'));
      drizzleService.db.returning.mockResolvedValue([{ id: 'webhook-1' }]);

      await expect(service.handleWebhook(mockWebhookPayload)).rejects.toThrow();
      expect(drizzleService.db.update).toHaveBeenCalled();
      expect(drizzleService.db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          processed: false,
          errorMessage: expect.any(String),
        }),
      );
    });

    it('should create priority notification for urgent emails', async () => {
      const urgentPayload = {
        ...mockWebhookPayload,
        message: {
          ...mockWebhookPayload.message,
          subject: 'URGENT: Follow-up required',
        },
      };

      drizzleService.db.limit.mockResolvedValueOnce([]);
      drizzleService.db.returning.mockResolvedValue([{ id: 'webhook-1' }]);

      await service.handleWebhook(urgentPayload);

      expect(notificationService.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.stringContaining('URGENT'),
        NotificationType.WARNING,
        expect.any(String),
      );
    });
  });

  // ============ THREAD MANAGEMENT ============

  describe('findThreads', () => {
    it('should return paginated threads', async () => {
      const mockData = [mockThread, { ...mockThread, id: 'thread-2' }];

      drizzleService.db.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ count: 2 }]),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue(mockData),
        });

      const result = await service.findThreads('user-1', {
        page: 1,
        limit: 20,
        unread: undefined,
      });

      expect(result.data).toEqual(mockData);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('should filter by unread status', async () => {
      drizzleService.db.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ count: 1 }]),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue([mockThread]),
        });

      const result = await service.findThreads('user-1', { page: 1, limit: 20, unread: true });

      expect(result.data).toEqual([mockThread]);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findThread', () => {
    it('should return thread by id', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockThread]);

      const result = await service.findThread('thread-1', 'user-1');

      expect(result).toEqual(mockThread);
    });

    it('should throw NotFoundException if thread not found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      await expect(service.findThread('thread-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should respect RLS (userId filter)', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockThread]);

      await service.findThread('thread-1', 'user-1');

      expect(drizzleService.db.where).toHaveBeenCalled();
    });
  });

  describe('archiveThread', () => {
    it('should archive thread', async () => {
      const archived = { ...mockThread, unreadCount: 0 };
      drizzleService.db.returning.mockResolvedValueOnce([archived]);

      const result = await service.archiveThread('thread-1', 'user-1');

      expect(result.unreadCount).toBe(0);
      expect(drizzleService.db.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException if thread not found', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([]);

      await expect(service.archiveThread('thread-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteThread', () => {
    it('should delete thread', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([{ id: 'thread-1' }]);

      await service.deleteThread('thread-1', 'user-1');

      expect(drizzleService.db.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException if thread not found', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([]);

      await expect(service.deleteThread('thread-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============ CONFIG MANAGEMENT ============

  describe('getConfig', () => {
    it('should return null for now', async () => {
      const result = await service.getConfig('user-1');
      expect(result).toBeNull();
    });
  });

  describe('saveConfig', () => {
    it('should return config as-is for now', async () => {
      const config = {
        inboxId: 'inbox-1',
        apiKey: 'key-123',
        webhookUrl: 'https://example.com/webhook',
      };

      const result = await service.saveConfig('user-1', config);
      expect(result).toEqual(config);
    });
  });
});
