import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentMailController } from '../agentmail.controller';
import { AgentMailService } from '../agentmail.service';
import { AgentMailSignatureGuard } from '../guards';
import type { DbUser } from '../../../../auth/user-auth.service';

describe('AgentMailController', () => {
  let controller: AgentMailController;
  let service: Record<string, jest.Mock>;

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
      getConfig: jest.fn().mockResolvedValue(mockConfig),
      saveConfig: jest.fn().mockResolvedValue(mockConfig),
      createInboxForUser: jest.fn().mockResolvedValue(mockConfig),
      listInboxes: jest.fn().mockResolvedValue({ count: 0, inboxes: [] }),
      getInbox: jest.fn().mockResolvedValue({ inboxId: 'inbox-1' }),
      listUserMessages: jest.fn().mockResolvedValue({ count: 0, messages: [] }),
      getUserMessage: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
      sendUserEmail: jest.fn().mockResolvedValue({ messageId: 'msg-1', threadId: 'thread-1' }),
      replyToUserEmail: jest.fn().mockResolvedValue({ messageId: 'msg-2', threadId: 'thread-1' }),
      downloadUserAttachment: jest.fn().mockResolvedValue({ downloadUrl: 'https://example.com' }),
      listUserSdkThreads: jest.fn().mockResolvedValue({ count: 0, threads: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentMailController],
      providers: [
        { provide: AgentMailService, useValue: service },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
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
  });

  // ============ INBOX TESTS ============

  describe('createInbox', () => {
    it('should create inbox', async () => {
      const result = await controller.createInbox(mockUser, { username: 'test', displayName: 'Test' });
      expect(result).toEqual(mockConfig);
      expect(service.createInboxForUser).toHaveBeenCalledWith('user-1', { username: 'test', displayName: 'Test' });
    });
  });

  describe('listInboxes', () => {
    it('should list inboxes', async () => {
      const result = await controller.listInboxes();
      expect(result).toEqual({ count: 0, inboxes: [] });
    });
  });

  // ============ MESSAGE TESTS ============

  describe('listMessages', () => {
    it('should list messages', async () => {
      const result = await controller.listMessages(mockUser);
      expect(result).toEqual({ count: 0, messages: [] });
      expect(service.listUserMessages).toHaveBeenCalledWith('user-1', expect.any(Object));
    });
  });

  describe('sendEmail', () => {
    it('should send email', async () => {
      const body = { to: ['test@example.com'], subject: 'Hi', text: 'Hello' };
      const result = await controller.sendEmail(mockUser, body);
      expect(result).toEqual({ messageId: 'msg-1', threadId: 'thread-1' });
      expect(service.sendUserEmail).toHaveBeenCalledWith('user-1', body);
    });
  });

  describe('replyToMessage', () => {
    it('should reply to message', async () => {
      const body = { text: 'Thanks!' };
      const result = await controller.replyToMessage(mockUser, 'msg-1', body);
      expect(result).toEqual({ messageId: 'msg-2', threadId: 'thread-1' });
      expect(service.replyToUserEmail).toHaveBeenCalledWith('user-1', 'msg-1', body);
    });
  });

  // ============ THREAD TESTS ============

  describe('getThreads', () => {
    it('should return paginated threads', async () => {
      const query = { page: 1, limit: 20, unread: undefined };
      const result = await controller.getThreads(mockUser, query);
      expect(result.data).toHaveLength(1);
      expect(service.findThreads).toHaveBeenCalledWith('user-1', query);
    });
  });

  describe('getThread', () => {
    it('should return thread by id', async () => {
      const result = await controller.getThread(mockUser, 'thread-1');
      expect(result).toEqual(mockThread);
    });

    it('should throw NotFoundException if thread not found', async () => {
      service.findThread.mockRejectedValueOnce(new NotFoundException());
      await expect(controller.getThread(mockUser, 'thread-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('archiveThread', () => {
    it('should archive thread', async () => {
      const result = await controller.archiveThread(mockUser, 'thread-1');
      expect(result).toEqual(mockThread);
    });
  });

  describe('deleteThread', () => {
    it('should delete thread', async () => {
      const result = await controller.deleteThread(mockUser, 'thread-1');
      expect(result).toBeUndefined();
    });
  });

  // ============ CONFIG TESTS ============

  describe('getConfig', () => {
    it('should return config', async () => {
      const result = await controller.getConfig(mockUser);
      expect(result).toEqual(mockConfig);
    });
  });

  describe('saveConfig', () => {
    it('should save config', async () => {
      const config = {
        inboxId: 'inbox-1',
        inboxEmail: 'test@agentmail.to',
        displayName: 'Test',
        isActive: true,
      };
      const result = await controller.saveConfig(mockUser, config);
      expect(result).toEqual(mockConfig);
      expect(service.saveConfig).toHaveBeenCalledWith('user-1', config);
    });
  });
});
