import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwilioService } from '../twilio.service';
import { TwilioApiClientService } from '../twilio-api-client.service';
import { DrizzleService } from '../../../../database';
import { NotificationService } from '../../../../notification/notification.service';
import { StorageService } from '../../../../storage';
import { WebhookSource } from '../../../integration/entities/integration.schema';

describe('TwilioService', () => {
  let service: TwilioService;
  let twilioClient: jest.Mocked<TwilioApiClientService>;
  let _drizzleService: jest.Mocked<DrizzleService>;
  let _notificationService: jest.Mocked<NotificationService>;
  let storageService: jest.Mocked<StorageService>;
  let configService: jest.Mocked<ConfigService>;

  const createMockDb = () => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockWebhookId = '223e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioService,
        {
          provide: TwilioApiClientService,
          useValue: {
            sendMessage: jest.fn(),
            validateWebhook: jest.fn(),
          },
        },
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
          },
        },
        {
          provide: NotificationService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadGeneratedContent: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                TWILIO_WHATSAPP_NUMBER: '+15551234567',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TwilioService>(TwilioService);
    twilioClient = module.get(TwilioApiClientService);
    _drizzleService = module.get(DrizzleService);
    _notificationService = module.get(NotificationService);
    storageService = module.get(StorageService);
    configService = module.get(ConfigService);
  });

  describe('handleWebhook', () => {
    const mockWebhookPayload = {
      MessageSid: 'SM123456',
      AccountSid: 'AC123456',
      From: 'whatsapp:+15559876543',
      To: 'whatsapp:+15551234567',
      Body: 'Hello from WhatsApp',
      NumMedia: '0',
      Timestamp: '2024-01-01T00:00:00Z',
    };

    it('should reject invalid webhook signature', async () => {
      twilioClient.validateWebhook.mockReturnValue(false);

      await expect(
        service.handleWebhook(mockWebhookPayload, 'invalid_sig', 'https://example.com/webhook'),
      ).rejects.toThrow(UnauthorizedException);

      expect(twilioClient.validateWebhook).toHaveBeenCalledWith(
        'invalid_sig',
        'https://example.com/webhook',
        mockWebhookPayload,
      );
    });

    it('should process valid webhook', async () => {
      twilioClient.validateWebhook.mockReturnValue(true);

      const mockWebhook = {
        id: mockWebhookId,
        source: WebhookSource.TWILIO,
        eventType: 'message.received',
        payload: {
          MessageSid: 'SM123456',
          From: 'whatsapp:+15559876543',
          To: 'whatsapp:+15551234567',
          Body: 'Hello from WhatsApp',
          Timestamp: '2024-01-01T00:00:00Z',
        },
        processed: false,
        errorMessage: null,
        createdAt: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([mockWebhook]);

      const result = await service.handleWebhook(
        mockWebhookPayload,
        'valid_sig',
        'https://example.com/webhook',
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          source: WebhookSource.TWILIO,
          eventType: 'message.received',
          processed: false,
        }),
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({ processed: true });

      expect(result).toEqual({
        success: true,
        webhookId: mockWebhookId,
      });
    });

    it('should download media if attached', async () => {
      twilioClient.validateWebhook.mockReturnValue(true);

      const webhookWithMedia = {
        ...mockWebhookPayload,
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/media/SM123456/ME123',
        MediaContentType0: 'image/jpeg',
      };

      const mockWebhook = {
        id: mockWebhookId,
        source: WebhookSource.TWILIO,
        eventType: 'message.received',
        payload: {},
        processed: false,
        errorMessage: null,
        createdAt: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([mockWebhook]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => 'image/jpeg',
        },
        arrayBuffer: async () => new ArrayBuffer(8),
      });

      storageService.uploadGeneratedContent.mockResolvedValue({
        url: 'https://cdn.example.com/media.jpg',
        key: 'system/whatsapp-media/abc123.jpg',
      } as unknown);

      await service.handleWebhook(webhookWithMedia, 'valid_sig', 'https://example.com/webhook');

      expect(global.fetch).toHaveBeenCalledWith('https://api.twilio.com/media/SM123456/ME123');
      expect(storageService.uploadGeneratedContent).toHaveBeenCalled();
    });

    it('should handle webhook processing error', async () => {
      twilioClient.validateWebhook.mockReturnValue(true);

      mockDb.returning.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.handleWebhook(mockWebhookPayload, 'valid_sig', 'https://example.com/webhook'),
      ).rejects.toThrow('Database error');

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: 'Database error',
        }),
      );
    });
  });

  describe('sendMessage', () => {
    const sendMessageDto = {
      to: '+15559876543',
      body: 'Hello from API',
    };

    it('should send WhatsApp message', async () => {
      const mockMessage = {
        sid: 'SM123456',
        status: 'queued',
      };

      twilioClient.sendMessage.mockResolvedValue(mockMessage as unknown);
      mockDb.returning.mockResolvedValue([{ id: mockWebhookId }]);

      const result = await service.sendMessage(mockUserId, sendMessageDto);

      expect(twilioClient.sendMessage).toHaveBeenCalledWith({
        from: 'whatsapp:+15551234567',
        to: 'whatsapp:+15559876543',
        body: 'Hello from API',
        mediaUrl: undefined,
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          source: WebhookSource.TWILIO,
          eventType: 'message.sent',
          processed: true,
        }),
      );

      expect(result).toEqual({
        messageSid: 'SM123456',
        status: 'queued',
        to: '+15559876543',
        body: 'Hello from API',
      });
    });

    it('should send WhatsApp message with media', async () => {
      const dtoWithMedia = {
        ...sendMessageDto,
        mediaUrl: 'https://example.com/image.jpg',
      };

      const mockMessage = {
        sid: 'SM123457',
        status: 'queued',
      };

      twilioClient.sendMessage.mockResolvedValue(mockMessage as unknown);
      mockDb.returning.mockResolvedValue([{ id: mockWebhookId }]);

      await service.sendMessage(mockUserId, dtoWithMedia);

      expect(twilioClient.sendMessage).toHaveBeenCalledWith({
        from: 'whatsapp:+15551234567',
        to: 'whatsapp:+15559876543',
        body: 'Hello from API',
        mediaUrl: ['https://example.com/image.jpg'],
      });
    });

    it('should throw error if WhatsApp number not configured', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(service.sendMessage(mockUserId, sendMessageDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getMessages', () => {
    it('should return conversations list', async () => {
      const mockWebhooks = [
        {
          id: '1',
          source: WebhookSource.TWILIO,
          eventType: 'message.received',
          payload: {
            MessageSid: 'SM1',
            From: 'whatsapp:+15559876543',
            To: 'whatsapp:+15551234567',
            Body: 'Hello',
            Timestamp: '2024-01-01T00:00:00Z',
          },
          processed: true,
          errorMessage: null,
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: '2',
          source: WebhookSource.TWILIO,
          eventType: 'message.sent',
          payload: {
            MessageSid: 'SM2',
            From: 'whatsapp:+15551234567',
            To: 'whatsapp:+15559876543',
            Body: 'Hi there',
            Timestamp: '2024-01-01T00:01:00Z',
          },
          processed: true,
          errorMessage: null,
          createdAt: new Date('2024-01-01T00:01:00Z'),
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockWebhooks);

      const result = await service.getMessages(mockUserId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].conversationId).toBe('+15551234567:+15559876543');
      expect(result.data[0].messageCount).toBe(2);
      expect(result.meta.total).toBe(1);
    });

    it('should return conversation history when conversationId provided', async () => {
      const mockWebhooks = [
        {
          id: '1',
          source: WebhookSource.TWILIO,
          eventType: 'message.received',
          payload: {
            MessageSid: 'SM1',
            From: 'whatsapp:+15559876543',
            To: 'whatsapp:+15551234567',
            Body: 'Hello',
            Timestamp: '2024-01-01T00:00:00Z',
          },
          processed: true,
          errorMessage: null,
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockWebhooks);

      const result = await service.getMessages(mockUserId, {
        page: 1,
        limit: 20,
        conversationId: '+15551234567:+15559876543',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].body).toBe('Hello');
      expect(result.data[0].direction).toBe('incoming');
    });
  });

  describe('getConversation', () => {
    it('should return paginated conversation messages', async () => {
      const mockWebhooks = [
        {
          id: '1',
          source: WebhookSource.TWILIO,
          eventType: 'message.received',
          payload: {
            MessageSid: 'SM1',
            From: 'whatsapp:+15559876543',
            To: 'whatsapp:+15551234567',
            Body: 'Message 1',
            Timestamp: '2024-01-01T00:00:00Z',
          },
          processed: true,
          errorMessage: null,
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: '2',
          source: WebhookSource.TWILIO,
          eventType: 'message.sent',
          payload: {
            MessageSid: 'SM2',
            From: 'whatsapp:+15551234567',
            To: 'whatsapp:+15559876543',
            Body: 'Message 2',
            Timestamp: '2024-01-01T00:01:00Z',
          },
          processed: true,
          errorMessage: null,
          createdAt: new Date('2024-01-01T00:01:00Z'),
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockWebhooks);

      const result = await service.getConversation(
        mockUserId,
        '+15551234567:+15559876543',
        1,
        50,
      );

      expect(result.data).toHaveLength(2);
      expect(result.data[0].direction).toBe('outgoing');
      expect(result.data[1].direction).toBe('incoming');
      expect(result.meta.total).toBe(2);
    });
  });

  describe('getConfig', () => {
    it('should return Twilio config', async () => {
      const result = await service.getConfig(mockUserId);

      expect(result).toEqual({
        whatsappNumber: '+15551234567',
        configured: true,
      });
    });

    it('should return null if not configured', async () => {
      configService.get.mockReturnValue(undefined);

      const result = await service.getConfig(mockUserId);

      expect(result).toEqual({
        whatsappNumber: null,
        configured: false,
      });
    });
  });

  describe('saveConfig', () => {
    it('should save config (currently no-op)', async () => {
      const config = {
        accountSid: 'AC123456',
        authToken: 'token123',
        whatsappNumber: '+15551234567',
      };

      const result = await service.saveConfig(mockUserId, config);

      expect(result.success).toBe(true);
    });
  });
});
