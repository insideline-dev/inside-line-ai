import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentMailClientService } from '../agentmail-client.service';

describe('AgentMailClientService', () => {
  describe('when not configured', () => {
    let service: AgentMailClientService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgentMailClientService,
          {
            provide: ConfigService,
            useValue: { get: () => undefined },
          },
        ],
      }).compile();

      service = module.get<AgentMailClientService>(AgentMailClientService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report as not configured', () => {
      expect(service.isConfigured()).toBe(false);
    });

    it('should throw ServiceUnavailableException on createInbox', async () => {
      await expect(service.createInbox()).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException on sendMessage', async () => {
      await expect(
        service.sendMessage('inbox-1', { to: ['test@example.com'] }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException on listWebhooks', async () => {
      await expect(service.listWebhooks()).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException on listInboxes', async () => {
      await expect(service.listInboxes()).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException on getInbox', async () => {
      await expect(service.getInbox('inbox-1')).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException on getMessage', async () => {
      await expect(service.getMessage('inbox-1', 'msg-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException on replyToMessage', async () => {
      await expect(
        service.replyToMessage('inbox-1', 'msg-1', { text: 'hi' }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException on listMessages', async () => {
      await expect(service.listMessages('inbox-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException on getThread', async () => {
      await expect(service.getThread('thread-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException on listThreads', async () => {
      await expect(service.listThreads('inbox-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException on deleteWebhook', async () => {
      await expect(service.deleteWebhook('wh-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException on createWebhook', async () => {
      await expect(
        service.createWebhook({
          url: 'https://example.com/webhook',
          eventTypes: ['message.received' as never],
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('when configured', () => {
    let service: AgentMailClientService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgentMailClientService,
          {
            provide: ConfigService,
            useValue: { get: () => 'test-api-key' },
          },
        ],
      }).compile();

      service = module.get<AgentMailClientService>(AgentMailClientService);
    });

    it('should report as configured', () => {
      expect(service.isConfigured()).toBe(true);
    });
  });
});
