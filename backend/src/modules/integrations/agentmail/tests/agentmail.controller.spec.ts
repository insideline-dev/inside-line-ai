import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentMailController } from '../agentmail.controller';
import { AgentMailService } from '../agentmail.service';
import { AgentMailSignatureGuard } from '../guards';
import type { DbUser } from '../../../../auth/user-auth.service';

describe('AgentMailController', () => {
  let controller: AgentMailController;
  let service: any;

  const mockUser: DbUser = {
    id: 'user-1',
    email: 'investor@example.com',
    role: 'investor',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

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
      attachments: [],
      timestamp: '2024-01-15T10:30:00Z',
    },
    signature: 'sha256=abc123',
  };

  beforeEach(async () => {
    service = {
      handleWebhook: jest.fn().mockResolvedValue(undefined),
      findThreads: jest.fn().mockResolvedValue({
        data: [mockThread],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
      findThread: jest.fn().mockResolvedValue(mockThread),
      archiveThread: jest.fn().mockResolvedValue(mockThread),
      deleteThread: jest.fn().mockResolvedValue(undefined),
      getConfig: jest.fn().mockResolvedValue(null),
      saveConfig: jest.fn().mockResolvedValue({
        inboxId: 'inbox-1',
        apiKey: 'key-123',
        webhookUrl: 'https://example.com/webhook',
      }),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('test-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentMailController],
      providers: [
        { provide: AgentMailService, useValue: service },
        { provide: ConfigService, useValue: mockConfigService },
        AgentMailSignatureGuard,
      ],
    }).compile();

    controller = module.get<AgentMailController>(AgentMailController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============ WEBHOOK TESTS ============

  describe('handleWebhook', () => {
    it('should process valid webhook', async () => {
      const result = await controller.handleWebhook(mockWebhookPayload);

      expect(result).toEqual({ success: true });
      expect(service.handleWebhook).toHaveBeenCalledWith(mockWebhookPayload);
    });

    it('should call service handleWebhook method', async () => {
      await controller.handleWebhook(mockWebhookPayload);

      expect(service.handleWebhook).toHaveBeenCalledTimes(1);
    });
  });

  // ============ THREAD TESTS ============

  describe('getThreads', () => {
    it('should return paginated threads', async () => {
      const query = { page: 1, limit: 20, unread: undefined };
      const result = await controller.getThreads(mockUser, query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(service.findThreads).toHaveBeenCalledWith('user-1', query);
    });

    it('should filter by unread status', async () => {
      const query = { page: 1, limit: 20, unread: true };
      await controller.getThreads(mockUser, query);

      expect(service.findThreads).toHaveBeenCalledWith('user-1', query);
    });

    it('should use default pagination values', async () => {
      const query = { page: 1, limit: 20, unread: undefined };
      await controller.getThreads(mockUser, query);

      expect(service.findThreads).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });
  });

  describe('getThread', () => {
    it('should return thread by id', async () => {
      const result = await controller.getThread(mockUser, 'thread-1');

      expect(result).toEqual(mockThread);
      expect(service.findThread).toHaveBeenCalledWith('thread-1', 'user-1');
    });

    it('should throw NotFoundException if thread not found', async () => {
      service.findThread.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.getThread(mockUser, 'thread-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('archiveThread', () => {
    it('should archive thread', async () => {
      const result = await controller.archiveThread(mockUser, 'thread-1');

      expect(result).toEqual(mockThread);
      expect(service.archiveThread).toHaveBeenCalledWith('thread-1', 'user-1');
    });

    it('should throw NotFoundException if thread not found', async () => {
      service.archiveThread.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.archiveThread(mockUser, 'thread-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteThread', () => {
    it('should delete thread', async () => {
      await controller.deleteThread(mockUser, 'thread-1');

      expect(service.deleteThread).toHaveBeenCalledWith('thread-1', 'user-1');
    });

    it('should throw NotFoundException if thread not found', async () => {
      service.deleteThread.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.deleteThread(mockUser, 'thread-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not return a value', async () => {
      const result = await controller.deleteThread(mockUser, 'thread-1');

      expect(result).toBeUndefined();
    });
  });

  // ============ CONFIG TESTS ============

  describe('getConfig', () => {
    it('should return config', async () => {
      const result = await controller.getConfig(mockUser);

      expect(result).toBeNull();
      expect(service.getConfig).toHaveBeenCalledWith('user-1');
    });
  });

  describe('saveConfig', () => {
    it('should save config', async () => {
      const config = {
        inboxId: 'inbox-1',
        apiKey: 'key-123',
        webhookUrl: 'https://example.com/webhook',
      };

      const result = await controller.saveConfig(mockUser, config);

      expect(result).toEqual(config);
      expect(service.saveConfig).toHaveBeenCalledWith('user-1', config);
    });
  });
});
