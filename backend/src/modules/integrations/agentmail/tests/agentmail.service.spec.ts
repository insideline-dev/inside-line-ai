import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentMailService } from '../agentmail.service';
import { AttachmentService } from '../attachment.service';
import { AgentMailClientService } from '../agentmail-client.service';
import { InvestorInboxBridgeService } from '../investor-inbox-bridge.service';
import { DrizzleService } from '../../../../database';
import { NotificationService } from '../../../../notification/notification.service';
import { NotificationType } from '../../../../notification/entities';
import { ClaraService } from '../../../clara/clara.service';

describe('AgentMailService', () => {
  let service: AgentMailService;
  let drizzleService: ReturnType<typeof createMockDrizzle>;
  let notificationService: { create: jest.Mock };
  let attachmentService: { downloadMultiple: jest.Mock; downloadFromSdk: jest.Mock };
  let agentMailClient: Record<string, jest.Mock>;
  let claraService: { isClaraInbox: jest.Mock; handleIncomingMessage: jest.Mock };
  let investorInboxBridge: { evaluate: jest.Mock };

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

  const mockConfig = {
    id: 'config-1',
    userId: 'user-1',
    inboxId: 'inbox-1',
    inboxEmail: 'test@agentmail.to',
    displayName: 'Test',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockWebhookPayload = {
    organization_id: 'org-123',
    inbox_id: 'inbox-1',
    thread_id: 'ext-thread-123',
    message_id: 'msg-123',
  };

  const mockWebhookEnvelopePayload = {
    body_included: true,
    event_id: 'evt-123',
    event_type: 'message.received',
    message: {
      inbox_id: 'inbox-1',
      thread_id: 'ext-thread-123',
      message_id: 'msg-envelope-123',
      from: 'founder@startup.com',
      to: ['investor@example.com'],
      subject: 'Pitch from email',
      extracted_text: 'Pitch content',
      created_at: '2026-02-15T18:38:03.283Z',
    },
    thread: {
      inbox_id: 'inbox-1',
      thread_id: 'ext-thread-123',
    },
    type: 'event',
  };

  const mockSdkMessage = {
    inboxId: 'inbox-1',
    threadId: 'ext-thread-123',
    messageId: 'msg-123',
    from: 'founder@startup.com',
    to: ['investor@example.com'],
    subject: 'Investment Opportunity',
    text: 'Hello, I would like to...',
    html: '<p>Hello, I would like to...</p>',
    attachments: [],
    timestamp: new Date('2024-01-15T10:30:00Z'),
    labels: [],
    size: 1024,
    updatedAt: new Date(),
    createdAt: new Date(),
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
      onConflictDoUpdate: jest.fn().mockReturnThis(),
    },
  });

  beforeEach(async () => {
    drizzleService = createMockDrizzle();
    notificationService = { create: jest.fn().mockResolvedValue({}) };
    attachmentService = {
      downloadMultiple: jest.fn().mockResolvedValue(['key-1']),
      downloadFromSdk: jest.fn().mockResolvedValue(['key-1']),
    };
    agentMailClient = {
      getMessage: jest.fn().mockResolvedValue(mockSdkMessage),
      createInbox: jest.fn().mockResolvedValue({ inboxId: 'inbox-1', podId: 'pod-1' }),
      listInboxes: jest.fn().mockResolvedValue({ count: 0, inboxes: [] }),
      getInbox: jest.fn().mockResolvedValue({ inboxId: 'inbox-1' }),
      sendMessage: jest.fn().mockResolvedValue({ messageId: 'msg-1', threadId: 'thread-1' }),
      replyToMessage: jest.fn().mockResolvedValue({ messageId: 'msg-2', threadId: 'thread-1' }),
      listMessages: jest.fn().mockResolvedValue({ count: 0, messages: [] }),
      listThreads: jest.fn().mockResolvedValue({ count: 0, threads: [] }),
      getMessageAttachment: jest.fn().mockResolvedValue({ downloadUrl: 'https://example.com/att' }),
    };
    claraService = {
      isClaraInbox: jest.fn().mockReturnValue(false),
      handleIncomingMessage: jest.fn().mockResolvedValue(undefined),
    };
    investorInboxBridge = {
      evaluate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMailService,
        { provide: DrizzleService, useValue: drizzleService },
        { provide: NotificationService, useValue: notificationService },
        { provide: AttachmentService, useValue: attachmentService },
        { provide: AgentMailClientService, useValue: agentMailClient },
        { provide: ClaraService, useValue: claraService },
        { provide: InvestorInboxBridgeService, useValue: investorInboxBridge },
      ],
    }).compile();

    service = module.get<AgentMailService>(AgentMailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ WEBHOOK HANDLING ============

  describe('handleWebhook', () => {
    it('should process webhook with ID-only payload and fetch full message', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockConfig]); // findUserByInbox
      drizzleService.db.limit.mockResolvedValueOnce([]); // no existing thread

      await service.handleWebhook(mockWebhookPayload);

      expect(drizzleService.db.insert).toHaveBeenCalled();
      expect(agentMailClient.getMessage).toHaveBeenCalledWith('inbox-1', 'msg-123');
      expect(notificationService.create).toHaveBeenCalled();
    });

    it('should update existing thread on webhook', async () => {
      drizzleService.db.limit
        .mockResolvedValueOnce([mockConfig])
        .mockResolvedValueOnce([mockThread]);

      await service.handleWebhook(mockWebhookPayload);

      expect(drizzleService.db.update).toHaveBeenCalled();
      expect(drizzleService.db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          unreadCount: mockThread.unreadCount + 1,
        }),
      );
    });

    it('should process wrapped webhook payload with nested message/thread fields', async () => {
      drizzleService.db.limit
        .mockResolvedValueOnce([mockConfig]) // findUserByInbox
        .mockResolvedValueOnce([]); // no existing thread

      await service.handleWebhook(mockWebhookEnvelopePayload as unknown);

      expect(agentMailClient.getMessage).not.toHaveBeenCalled();
      expect(notificationService.create).toHaveBeenCalled();
    });

    it('should skip if no user found for inbox', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      await service.handleWebhook(mockWebhookPayload);

      expect(agentMailClient.getMessage).not.toHaveBeenCalled();
    });

    it('should create priority notification for urgent emails', async () => {
      const urgentMessage = {
        ...mockSdkMessage,
        subject: 'URGENT: Follow-up required',
      };
      agentMailClient.getMessage.mockResolvedValueOnce(urgentMessage);

      drizzleService.db.limit
        .mockResolvedValueOnce([mockConfig])
        .mockResolvedValueOnce([]);

      await service.handleWebhook(mockWebhookPayload);

      expect(notificationService.create).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        expect.stringContaining('URGENT'),
        NotificationType.WARNING,
        expect.any(String),
      );
    });

    it('should handle webhook processing errors', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([{ id: 'webhook-1' }]);
      drizzleService.db.limit.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.handleWebhook(mockWebhookPayload)).rejects.toThrow();
      expect(drizzleService.db.update).toHaveBeenCalled();
    });

    it('should mark webhook as processed with error when SDK getMessage() fails', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([{ id: 'webhook-1' }]);
      drizzleService.db.limit.mockResolvedValueOnce([mockConfig]);
      agentMailClient.getMessage.mockRejectedValueOnce(new Error('SDK API timeout'));

      await expect(service.handleWebhook(mockWebhookPayload)).rejects.toThrow('SDK getMessage failed');
      expect(drizzleService.db.update).toHaveBeenCalled();
      expect(drizzleService.db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          processed: false,
          errorMessage: expect.stringContaining('SDK getMessage failed'),
        }),
      );
    });

    it('should handle webhook with missing inbox_id gracefully', async () => {
      const invalidPayload = {
        organization_id: 'org-123',
        inbox_id: '',
        thread_id: 'ext-thread-123',
        message_id: 'msg-123',
      };

      drizzleService.db.limit.mockResolvedValueOnce([]);

      await service.handleWebhook(invalidPayload as unknown);

      expect(agentMailClient.getMessage).not.toHaveBeenCalled();
    });

    it('should fail webhook with missing message_id when payload has no message body', async () => {
      const invalidPayload = {
        organization_id: 'org-123',
        inbox_id: 'inbox-1',
        thread_id: 'ext-thread-123',
        message_id: '',
      };

      drizzleService.db.limit.mockResolvedValueOnce([mockConfig]);

      await expect(service.handleWebhook(invalidPayload as unknown)).rejects.toThrow(
        'SDK getMessage failed: missing message_id in webhook payload',
      );
      expect(agentMailClient.getMessage).not.toHaveBeenCalled();
    });
  });

  // ============ INBOX MANAGEMENT ============

  describe('createInboxForUser', () => {
    it('should create inbox and save config', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([mockConfig]);

      const result = await service.createInboxForUser('user-1', {
        username: 'test',
        displayName: 'Test',
      });

      expect(agentMailClient.createInbox).toHaveBeenCalledWith({
        username: 'test',
        displayName: 'Test',
      });
      expect(result).toEqual(mockConfig);
    });
  });

  // ============ EMAIL SEND / REPLY ============

  describe('sendUserEmail', () => {
    it('should send email using SDK', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockConfig]);

      const params = { to: ['test@example.com'], subject: 'Hi', text: 'Hello' };
      await service.sendUserEmail('user-1', params);

      expect(agentMailClient.sendMessage).toHaveBeenCalledWith('inbox-1', params);
    });

    it('should throw if user has no config', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      await expect(
        service.sendUserEmail('user-1', { to: ['test@example.com'] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('replyToUserEmail', () => {
    it('should reply to message using SDK', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockConfig]);

      const params = { text: 'Thanks!' };
      await service.replyToUserEmail('user-1', 'msg-1', params);

      expect(agentMailClient.replyToMessage).toHaveBeenCalledWith('inbox-1', 'msg-1', params);
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
  });

  describe('findThread', () => {
    it('should return thread by id', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockThread]);

      const result = await service.findThread('thread-1', 'user-1');
      expect(result).toEqual(mockThread);
    });

    it('should throw NotFoundException if thread not found', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);

      await expect(service.findThread('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('archiveThread', () => {
    it('should archive thread', async () => {
      const archived = { ...mockThread, unreadCount: 0 };
      drizzleService.db.returning.mockResolvedValueOnce([archived]);

      const result = await service.archiveThread('thread-1', 'user-1');
      expect(result.unreadCount).toBe(0);
    });

    it('should throw NotFoundException if thread not found', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([]);

      await expect(service.archiveThread('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
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
      await expect(service.deleteThread('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ============ CONFIG MANAGEMENT ============

  describe('getConfig', () => {
    it('should return config from database', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([mockConfig]);
      const result = await service.getConfig('user-1');
      expect(result).toEqual(mockConfig);
    });

    it('should return null if no config', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);
      const result = await service.getConfig('user-1');
      expect(result).toBeNull();
    });
  });

  describe('saveConfig', () => {
    it('should upsert config', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([mockConfig]);

      const result = await service.saveConfig('user-1', {
        inboxId: 'inbox-1',
        inboxEmail: 'test@agentmail.to',
        displayName: 'Test',
        isActive: true,
      });

      expect(result).toEqual(mockConfig);
      expect(drizzleService.db.insert).toHaveBeenCalled();
    });
  });
});
