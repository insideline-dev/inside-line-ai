import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClaraService } from '../clara.service';
import { DrizzleService } from '../../../database';
import { AgentMailClientService } from '../../integrations/agentmail/agentmail-client.service';
import { ClaraConversationService } from '../clara-conversation.service';
import { ClaraAiService } from '../clara-ai.service';
import { ClaraSubmissionService } from '../clara-submission.service';
import { ClaraToolsService } from '../clara-tools.service';
import { ClaraChannelService } from '../clara-channel.service';
import { PdfService } from '../../startup/pdf.service';
import { ConversationStatus, MessageDirection } from '../interfaces/clara.interface';

describe('ClaraService', () => {
  let service: ClaraService;
  let configService: { get: jest.Mock };
  let drizzleService: ReturnType<typeof createMockDrizzle>;
  let agentMailClient: Record<string, jest.Mock>;
  let claraChannel: Record<string, jest.Mock>;
  let conversationService: Record<string, jest.Mock>;
  let claraAi: {
    isLikelySubmission: jest.Mock;
    runAgentLoop: jest.Mock;
    generateResponse: jest.Mock;
    extractCompanyFromFilename: jest.Mock;
  };
  let submissionService: { handleSubmission: jest.Mock };
  let toolsService: { buildTools: jest.Mock };

  const mockConversation = {
    id: 'conv-1',
    threadId: 'thread-123',
    investorEmail: 'investor@example.com',
    investorName: 'John Doe',
    startupId: null,
    status: ConversationStatus.ACTIVE,
    lastIntent: null,
    createdAt: new Date(),
  };

  const mockMessage = {
    inboxId: 'inbox-1',
    threadId: 'thread-123',
    messageId: 'msg-123',
    from: '"John Doe" <investor@example.com>',
    to: ['clara@agentmail.to'],
    subject: 'Pitch Deck Submission',
    text: 'Please review our startup',
    html: null,
    attachments: [],
    timestamp: new Date(),
    labels: [],
    size: 1024,
    updatedAt: new Date(),
    createdAt: new Date(),
  };

  const mockStartup = {
    id: 'startup-1',
    name: 'TestCo',
    status: 'draft',
    overallScore: 85.5,
  };

  const createMockDrizzle = () => ({
    db: {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    },
  });

  const createConfigService = (claraInboxId: string | null, adminUserId: string | null) => ({
    get: jest.fn((key: string) => {
      if (key === 'CLARA_INBOX_ID') return claraInboxId;
      if (key === 'CLARA_ADMIN_USER_ID') return adminUserId;
      return null;
    }),
  });

  beforeEach(async () => {
    configService = createConfigService('inbox-1', 'admin-user-1');
    drizzleService = createMockDrizzle();
    agentMailClient = {
      getMessage: jest.fn().mockResolvedValue(mockMessage),
      replyToMessage: jest.fn().mockResolvedValue({ messageId: 'reply-1' }),
      sendMessage: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
    };
    claraChannel = {
      getEmailMessage: jest.fn().mockResolvedValue(mockMessage),
      reply: jest.fn().mockResolvedValue({ messageId: 'reply-1' }),
      send: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
    };
    conversationService = {
      findOrCreate: jest.fn().mockResolvedValue(mockConversation),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      logMessage: jest.fn().mockResolvedValue({}),
      updateLastIntent: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue({}),
      linkStartup: jest.fn().mockResolvedValue({}),
      findByStartupId: jest.fn().mockResolvedValue(null),
    };
    claraAi = {
      isLikelySubmission: jest.fn().mockReturnValue(false),
      runAgentLoop: jest.fn().mockResolvedValue('Agent response'),
      generateResponse: jest.fn().mockResolvedValue('Generated response'),
      extractCompanyFromFilename: jest.fn().mockReturnValue(undefined),
    };
    submissionService = {
      handleSubmission: jest.fn().mockResolvedValue({
        startupId: 'startup-1',
        startupName: 'TestCo',
        status: 'draft',
        isDuplicate: false,
      }),
    };
    toolsService = {
      buildTools: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaraService,
        { provide: ConfigService, useValue: configService },
        { provide: DrizzleService, useValue: drizzleService },
        { provide: ClaraChannelService, useValue: claraChannel },
        { provide: ClaraConversationService, useValue: conversationService },
        { provide: ClaraAiService, useValue: claraAi },
        { provide: ClaraSubmissionService, useValue: submissionService },
        { provide: ClaraToolsService, useValue: toolsService },
        { provide: PdfService, useValue: { generatePdf: jest.fn().mockResolvedValue(Buffer.from('')), extractText: jest.fn().mockResolvedValue('') } },
      ],
    }).compile();

    service = module.get<ClaraService>(ClaraService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ isEnabled ============

  describe('isEnabled', () => {
    it('should return true when both env vars are set', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when CLARA_INBOX_ID is not set', async () => {
      configService = createConfigService(null, 'admin-user-1');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ClaraService,
          { provide: ConfigService, useValue: configService },
          { provide: DrizzleService, useValue: drizzleService },
          { provide: ClaraChannelService, useValue: claraChannel },
          { provide: ClaraConversationService, useValue: conversationService },
          { provide: ClaraAiService, useValue: claraAi },
          { provide: ClaraSubmissionService, useValue: submissionService },
          { provide: ClaraToolsService, useValue: toolsService },
        { provide: PdfService, useValue: { generatePdf: jest.fn().mockResolvedValue(Buffer.from('')), extractText: jest.fn().mockResolvedValue('') } },
        ],
      }).compile();

      const testService = module.get<ClaraService>(ClaraService);
      expect(testService.isEnabled()).toBe(false);
    });

    it('should return false when CLARA_ADMIN_USER_ID is not set', async () => {
      configService = createConfigService('inbox-1', null);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ClaraService,
          { provide: ConfigService, useValue: configService },
          { provide: DrizzleService, useValue: drizzleService },
          { provide: ClaraChannelService, useValue: claraChannel },
          { provide: ClaraConversationService, useValue: conversationService },
          { provide: ClaraAiService, useValue: claraAi },
          { provide: ClaraSubmissionService, useValue: submissionService },
          { provide: ClaraToolsService, useValue: toolsService },
        { provide: PdfService, useValue: { generatePdf: jest.fn().mockResolvedValue(Buffer.from('')), extractText: jest.fn().mockResolvedValue('') } },
        ],
      }).compile();

      const testService = module.get<ClaraService>(ClaraService);
      expect(testService.isEnabled()).toBe(false);
    });

    it('should return false when both env vars are not set', async () => {
      configService = createConfigService(null, null);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ClaraService,
          { provide: ConfigService, useValue: configService },
          { provide: DrizzleService, useValue: drizzleService },
          { provide: ClaraChannelService, useValue: claraChannel },
          { provide: ClaraConversationService, useValue: conversationService },
          { provide: ClaraAiService, useValue: claraAi },
          { provide: ClaraSubmissionService, useValue: submissionService },
          { provide: ClaraToolsService, useValue: toolsService },
        { provide: PdfService, useValue: { generatePdf: jest.fn().mockResolvedValue(Buffer.from('')), extractText: jest.fn().mockResolvedValue('') } },
        ],
      }).compile();

      const testService = module.get<ClaraService>(ClaraService);
      expect(testService.isEnabled()).toBe(false);
    });
  });

  // ============ isClaraInbox ============

  describe('isClaraInbox', () => {
    it('should return true when inbox ID matches', () => {
      expect(service.isClaraInbox('inbox-1')).toBe(true);
    });

    it('should return false when inbox ID does not match', () => {
      expect(service.isClaraInbox('inbox-2')).toBe(false);
    });
  });

  // ============ handleIncomingMessage ============

  describe('handleIncomingMessage - submission flow', () => {
    it('should process submission with PDF attachment and new conversation', async () => {
      const messageWithAttachment = {
        ...mockMessage,
        attachments: [
          {
            filename: 'pitch-deck.pdf',
            contentType: 'application/pdf',
            attachmentId: 'att-1',
          },
        ],
      };

      claraChannel.getEmailMessage.mockResolvedValueOnce(messageWithAttachment);
      claraAi.isLikelySubmission.mockReturnValueOnce(true);
      claraAi.extractCompanyFromFilename.mockReturnValueOnce('TestCo');

      drizzleService.db.limit.mockResolvedValueOnce([]); // no investor user

      await service.handleIncomingMessage('inbox-1', 'thread-123', 'msg-123');

      expect(claraChannel.getEmailMessage).toHaveBeenCalledWith('inbox-1', 'msg-123');
      expect(conversationService.findOrCreate).toHaveBeenCalledWith(
        'thread-123',
        'investor@example.com',
        'John Doe',
        null,
      );
      expect(claraAi.isLikelySubmission).toHaveBeenCalled();
      expect(submissionService.handleSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-123',
          fromEmail: 'investor@example.com',
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: 'pitch-deck.pdf',
              isPitchDeck: true,
            }),
          ]),
        }),
        'admin-user-1',
        'TestCo',
      );
      expect(conversationService.linkStartup).toHaveBeenCalledWith('conv-1', 'startup-1');
      expect(conversationService.updateStatus).toHaveBeenCalledWith(
        'conv-1',
        ConversationStatus.PROCESSING,
      );
      expect(claraChannel.reply).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'email', text: expect.any(String) }),
      );
      expect(conversationService.logMessage).toHaveBeenCalledTimes(2); // inbound + outbound
    });

    it('should handle duplicate submission', async () => {
      const messageWithAttachment = {
        ...mockMessage,
        attachments: [
          {
            filename: 'deck.pdf',
            contentType: 'application/pdf',
            attachmentId: 'att-1',
          },
        ],
      };

      claraChannel.getEmailMessage.mockResolvedValueOnce(messageWithAttachment);
      claraAi.isLikelySubmission.mockReturnValueOnce(true);
      submissionService.handleSubmission.mockResolvedValueOnce({
        startupId: 'startup-1',
        startupName: 'TestCo',
        status: 'processing',
        isDuplicate: true,
        isEnriched: false,
      });

      drizzleService.db.limit.mockResolvedValueOnce([]);

      await service.handleIncomingMessage('inbox-1', 'thread-123', 'msg-123');

      expect(claraChannel.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('already have TestCo'),
        }),
      );
    });
  });

  describe('handleIncomingMessage - non-submission flow', () => {
    it('should run agent loop when not a submission', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);
      // isLikelySubmission defaults to false in beforeEach

      await service.handleIncomingMessage('inbox-1', 'thread-123', 'msg-123');

      expect(toolsService.buildTools).toHaveBeenCalled();
      expect(claraAi.runAgentLoop).toHaveBeenCalled();
      expect(claraChannel.reply).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'email', text: 'Agent response' }),
      );
    });
  });

  describe('handleIncomingMessage - not configured', () => {
    it('should skip processing when not configured', async () => {
      configService = createConfigService(null, null);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ClaraService,
          { provide: ConfigService, useValue: configService },
          { provide: DrizzleService, useValue: drizzleService },
          { provide: ClaraChannelService, useValue: claraChannel },
          { provide: ClaraConversationService, useValue: conversationService },
          { provide: ClaraAiService, useValue: claraAi },
          { provide: ClaraSubmissionService, useValue: submissionService },
          { provide: ClaraToolsService, useValue: toolsService },
        { provide: PdfService, useValue: { generatePdf: jest.fn().mockResolvedValue(Buffer.from('')), extractText: jest.fn().mockResolvedValue('') } },
        ],
      }).compile();

      const testService = module.get<ClaraService>(ClaraService);

      await testService.handleIncomingMessage('inbox-1', 'thread-123', 'msg-123');

      expect(claraChannel.getEmailMessage).not.toHaveBeenCalled();
    });
  });

  // ============ notifyPipelineComplete ============

  describe('notifyPipelineComplete', () => {
    it('should send notification email for linked conversation', async () => {
      const conversationWithStartup = {
        ...mockConversation,
        startupId: 'startup-1',
      };

      conversationService.findByStartupId.mockResolvedValueOnce(conversationWithStartup);
      drizzleService.db.limit.mockResolvedValueOnce([mockStartup]);

      await service.notifyPipelineComplete('startup-1', 85.5);

      expect(conversationService.findByStartupId).toHaveBeenCalledWith('startup-1');
      expect(claraChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'email',
          text: expect.stringContaining('overall score of 85.5/100'),
        }),
      );
      expect(conversationService.logMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          direction: MessageDirection.OUTBOUND,
        }),
      );
      expect(conversationService.updateStatus).toHaveBeenCalledWith(
        'conv-1',
        ConversationStatus.COMPLETED,
      );
    });

    it('should send notification without score when not provided', async () => {
      const conversationWithStartup = {
        ...mockConversation,
        startupId: 'startup-1',
      };

      conversationService.findByStartupId.mockResolvedValueOnce(conversationWithStartup);
      drizzleService.db.limit.mockResolvedValueOnce([mockStartup]);

      await service.notifyPipelineComplete('startup-1');

      expect(claraChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.not.stringContaining('overall score'),
        }),
      );
    });

    it('should no-op when no conversation found', async () => {
      conversationService.findByStartupId.mockResolvedValueOnce(null);

      await service.notifyPipelineComplete('startup-1', 85.5);

      expect(drizzleService.db.select).not.toHaveBeenCalled();
      expect(claraChannel.send).not.toHaveBeenCalled();
    });

    it('should no-op when startup record not found', async () => {
      const conversationWithStartup = {
        ...mockConversation,
        startupId: 'startup-1',
      };

      conversationService.findByStartupId.mockResolvedValueOnce(conversationWithStartup);
      drizzleService.db.limit.mockResolvedValueOnce([]);

      await service.notifyPipelineComplete('startup-1', 85.5);

      expect(claraChannel.send).not.toHaveBeenCalled();
    });

    it('should no-op when Clara is not configured', async () => {
      configService = createConfigService(null, 'admin-user-1');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ClaraService,
          { provide: ConfigService, useValue: configService },
          { provide: DrizzleService, useValue: drizzleService },
          { provide: ClaraChannelService, useValue: claraChannel },
          { provide: ClaraConversationService, useValue: conversationService },
          { provide: ClaraAiService, useValue: claraAi },
          { provide: ClaraSubmissionService, useValue: submissionService },
          { provide: ClaraToolsService, useValue: toolsService },
        { provide: PdfService, useValue: { generatePdf: jest.fn().mockResolvedValue(Buffer.from('')), extractText: jest.fn().mockResolvedValue('') } },
        ],
      }).compile();

      const testService = module.get<ClaraService>(ClaraService);

      await testService.notifyPipelineComplete('startup-1', 85.5);

      expect(conversationService.findByStartupId).not.toHaveBeenCalled();
    });
  });

  // ============ parseNameFromEmail ============

  describe('parseNameFromEmail', () => {
    it('should parse name from standard email format', () => {
      const result = service['parseNameFromEmail']('"John Doe" <john@example.com>');
      expect(result).toBe('John Doe');
    });

    it('should parse name from email without quotes', () => {
      const result = service['parseNameFromEmail']('John Doe <john@example.com>');
      expect(result).toBe('John Doe');
    });

    it('should extract name from email local part with dots', () => {
      const result = service['parseNameFromEmail']('john.doe@example.com');
      expect(result).toBe('John Doe');
    });

    it('should extract name from email local part with underscores', () => {
      const result = service['parseNameFromEmail']('john_doe@example.com');
      expect(result).toBe('John Doe');
    });

    it('should extract name from email local part with hyphens', () => {
      const result = service['parseNameFromEmail']('john-doe@example.com');
      expect(result).toBe('John Doe');
    });

    it('should return null for single-part email local', () => {
      const result = service['parseNameFromEmail']('johndoe@example.com');
      expect(result).toBeNull();
    });

    it('should handle complex multi-part names', () => {
      const result = service['parseNameFromEmail']('john.michael.doe@example.com');
      expect(result).toBe('John Michael Doe');
    });
  });
});
