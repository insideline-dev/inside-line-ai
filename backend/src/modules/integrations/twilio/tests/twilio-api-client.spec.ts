import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TwilioApiClientService } from '../twilio-api-client.service';

describe('TwilioApiClientService', () => {
  let service: TwilioApiClientService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioApiClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                TWILIO_ACCOUNT_SID: 'AC123456789',
                TWILIO_AUTH_TOKEN: 'auth_token_123',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TwilioApiClientService>(TwilioApiClientService);
    configService = module.get(ConfigService);
  });

  describe('initialization', () => {
    it('should initialize Twilio client with credentials', () => {
      expect(service).toBeDefined();
      expect(() => service.getClient()).not.toThrow();
    });

    it('should warn if credentials are missing', async () => {
      configService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TwilioApiClientService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const newService = module.get<TwilioApiClientService>(TwilioApiClientService);
      expect(() => newService.getClient()).toThrow('Twilio client not initialized');
    });
  });

  describe('validateWebhook', () => {
    it('should validate webhook signature', () => {
      const result = service.validateWebhook(
        'signature123',
        'https://example.com/webhook',
        { MessageSid: 'SM123', Body: 'Hello' },
      );

      // Will validate using twilio.validateRequest
      expect(typeof result).toBe('boolean');
    });

    it('should return false if auth token not available', async () => {
      configService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TwilioApiClientService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const newService = module.get<TwilioApiClientService>(TwilioApiClientService);
      const result = newService.validateWebhook(
        'signature123',
        'https://example.com/webhook',
        {},
      );
      expect(result).toBe(false);
    });
  });
});
