import { ConfigService } from '@nestjs/config';
import { ClaraService } from '../clara.service';
import { DrizzleService } from '../../../database';
import { ClaraConversationService } from '../clara-conversation.service';
import { ClaraAiService } from '../clara-ai.service';
import { ClaraSubmissionService } from '../clara-submission.service';
import { ClaraToolsService } from '../clara-tools.service';
import { ClaraChannelService } from '../clara-channel.service';
import { PdfService } from '../../startup/pdf.service';
import { CopilotService } from '../../copilot';
import { ConversationStatus, MessageDirection } from '../interfaces/clara.interface';

describe('ClaraService', () => {
  let service: ClaraService;
  let configService: { get: jest.Mock };
  let drizzleService: ReturnType<typeof createMockDrizzle>;
  let agentMailClient: Record<string, jest.Mock>;
  let conversationService: Record<string, jest.Mock>;
  let claraChannel: Record<string, jest.Mock>;
  let claraAi: {
    isLikelySubmission: jest.Mock;
    runAgentLoop: jest.Mock;
    generateResponse: jest.Mock;
    extractCompanyFromFilename: jest.Mock;
  };
  let submissionService: {
    handleSubmission: jest.Mock;
    getMissingCriticalFieldsForStartup: jest.Mock;
    resolveMissingInfoFromReply: jest.Mock;
    hasMissingCriticalFields: jest.Mock;
  };
  let toolsService: { buildTools: jest.Mock };
  let copilotService: { handleTurn: jest.Mock };
  let pdfService: {
    generateMemo: jest.Mock;
    generateReport: jest.Mock;
  };

  const mockConversation = {
    id: 'conv-1',
    threadId: 'thread-123',
    investorEmail: 'investor@example.com',
    investorName: 'John Doe',
    startupId: null,
    status: ConversationStatus.ACTIVE,
    lastIntent: null,
    context: {},
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

  const createService = (overrides?: {
    configService?: typeof configService;
    drizzleService?: typeof drizzleService;
    claraChannel?: typeof claraChannel;
    conversationService?: typeof conversationService;
    claraAi?: typeof claraAi;
    submissionService?: typeof submissionService;
    toolsService?: typeof toolsService;
    copilotService?: typeof copilotService;
    pdfService?: typeof pdfService;
  }) =>
    new ClaraService(
      (overrides?.configService ?? configService) as unknown as ConfigService,
      (overrides?.drizzleService ?? drizzleService) as unknown as DrizzleService,
      (overrides?.claraChannel ?? claraChannel) as unknown as ClaraChannelService,
      (overrides?.conversationService ?? conversationService) as unknown as ClaraConversationService,
      (overrides?.claraAi ?? claraAi) as unknown as ClaraAiService,
      (overrides?.submissionService ?? submissionService) as unknown as ClaraSubmissionService,
      (overrides?.toolsService ?? toolsService) as unknown as ClaraToolsService,
      (overrides?.copilotService ?? copilotService) as unknown as CopilotService,
      (overrides?.pdfService ?? pdfService) as unknown as PdfService,
    );

  beforeEach(async () => {
    configService = createConfigService('inbox-1', 'admin-user-1');
    drizzleService = createMockDrizzle();
    agentMailClient = {
      getMessage: jest.fn().mockResolvedValue(mockMessage),
      replyToMessage: jest.fn().mockResolvedValue({ messageId: 'reply-1' }),
      sendMessage: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
    };
    conversationService = {
      findOrCreate: jest.fn().mockResolvedValue(mockConversation),
      findLatestAwaitingInfoByInvestorEmail: jest.fn().mockResolvedValue(null),
      findLatestByInvestorEmailWithStartup: jest.fn().mockResolvedValue(null),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      logMessage: jest.fn().mockResolvedValue({}),
      updateLastIntent: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue({}),
      linkStartup: jest.fn().mockResolvedValue({}),
      findByStartupId: jest.fn().mockResolvedValue(null),
      hasMessage: jest.fn().mockResolvedValue(false),
      updateContext: jest.fn().mockResolvedValue({}),
    };
    claraChannel = {
      getEmailMessage: jest
        .fn()
        .mockImplementation((inboxId: string, messageId: string) =>
          agentMailClient.getMessage(inboxId, messageId),
        ),
      reply: jest
        .fn()
        .mockImplementation((params: { email: { inboxId: string; inReplyToMessageId: string }; text?: string; html?: string; attachments?: unknown[] }) =>
          agentMailClient.replyToMessage(params.email.inboxId, params.email.inReplyToMessageId, {
            text: params.text,
            html: params.html,
            attachments: params.attachments,
          }),
        ),
      send: jest
        .fn()
        .mockImplementation((params: { email: { inboxId: string; to: string[]; subject?: string }; text?: string; html?: string; attachments?: unknown[] }) =>
          agentMailClient.sendMessage(params.email.inboxId, {
            to: params.email.to,
            subject: params.email.subject,
            text: params.text,
            html: params.html,
            attachments: params.attachments,
          }),
        ),
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
      getMissingCriticalFieldsForStartup: jest.fn().mockResolvedValue([]),
      resolveMissingInfoFromReply: jest.fn().mockResolvedValue(null),
      hasMissingCriticalFields: jest.fn().mockResolvedValue(false),
    };
    toolsService = {
      buildTools: jest.fn().mockReturnValue({}),
    };
    copilotService = {
      handleTurn: jest.fn().mockResolvedValue({
        replyText: 'Agent response',
        pendingAction: null,
        clearPendingAction: false,
      }),
    };
    pdfService = {
      generateMemo: jest.fn().mockResolvedValue({ url: 'https://example.com/memo.pdf' }),
      generateReport: jest.fn().mockResolvedValue({ url: 'https://example.com/report.pdf' }),
    };

    service = createService();
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

      const testService = createService({ configService });
      expect(testService.isEnabled()).toBe(false);
    });

    it('should return false when CLARA_ADMIN_USER_ID is not set', async () => {
      configService = createConfigService('inbox-1', null);

      const testService = createService({ configService });
      expect(testService.isEnabled()).toBe(false);
    });

    it('should return false when both env vars are not set', async () => {
      configService = createConfigService(null, null);

      const testService = createService({ configService });
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

      agentMailClient.getMessage.mockResolvedValueOnce(messageWithAttachment);
      claraAi.isLikelySubmission.mockReturnValueOnce(true);

      drizzleService.db.limit.mockResolvedValueOnce([]); // no investor user

      await service.handleIncomingMessage('inbox-1', 'thread-123', 'msg-123');

      expect(agentMailClient.getMessage).toHaveBeenCalledWith('inbox-1', 'msg-123');
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
        undefined,
      );
      expect(conversationService.linkStartup).toHaveBeenCalledWith('conv-1', 'startup-1');
      expect(conversationService.updateStatus).toHaveBeenCalledWith(
        'conv-1',
        ConversationStatus.PROCESSING,
      );
      expect(agentMailClient.replyToMessage).toHaveBeenCalledWith(
        'inbox-1',
        'msg-123',
        expect.objectContaining({ text: expect.any(String) }),
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

      agentMailClient.getMessage.mockResolvedValueOnce(messageWithAttachment);
      claraAi.isLikelySubmission.mockReturnValueOnce(true);
      submissionService.handleSubmission.mockResolvedValueOnce({
        startupId: 'startup-1',
        startupName: 'TestCo',
        status: 'processing',
        isDuplicate: true,
        duplicateBlocked: true,
      });

      drizzleService.db.limit.mockResolvedValueOnce([]);

      await service.handleIncomingMessage('inbox-1', 'thread-123', 'msg-123');

      expect(agentMailClient.replyToMessage).toHaveBeenCalledWith(
        'inbox-1',
        'msg-123',
        expect.objectContaining({
          text: expect.stringContaining('delete the existing startup first'),
        }),
      );
      expect(conversationService.linkStartup).not.toHaveBeenCalled();
      expect(conversationService.updateStatus).toHaveBeenCalledWith(
        'conv-1',
        ConversationStatus.ACTIVE,
      );
    });
  });

  describe('handleIncomingMessage - non-submission flow', () => {
    it('should route non-submission email turns through the shared copilot service', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);
      // isLikelySubmission defaults to false in beforeEach

      await service.handleIncomingMessage('inbox-1', 'thread-123', 'msg-123');

      expect(copilotService.handleTurn).toHaveBeenCalled();
      expect(agentMailClient.replyToMessage).toHaveBeenCalledWith(
        'inbox-1',
        'msg-123',
        expect.objectContaining({ text: 'Agent response' }),
      );
    });

    it('should persist pending action state from the copilot service into conversation context', async () => {
      drizzleService.db.limit.mockResolvedValueOnce([]);
      copilotService.handleTurn.mockResolvedValueOnce({
        replyText: 'Reply CONFIRM to save Acme.',
        pendingAction: {
          actionKey: 'toggle_saved_match',
          confirmationMessage: 'Reply CONFIRM to save Acme.',
          successMessage: 'Acme is saved.',
          targetSummary: 'Acme',
          startupId: 'startup-1',
          payload: {
            startupId: 'startup-1',
          },
        },
        clearPendingAction: false,
      });

      await service.handleIncomingMessage('inbox-1', 'thread-123', 'msg-123');

      expect(conversationService.updateContext).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          pendingAction: expect.objectContaining({
            actionKey: 'toggle_saved_match',
            startupId: 'startup-1',
          }),
        }),
      );
    });
  });

  describe('handleIncomingMessage - not configured', () => {
    it('should skip processing when not configured', async () => {
      configService = createConfigService(null, null);

      const testService = createService({ configService });

      await testService.handleIncomingMessage('inbox-1', 'thread-123', 'msg-123');

      expect(agentMailClient.getMessage).not.toHaveBeenCalled();
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
      expect(agentMailClient.sendMessage).toHaveBeenCalledWith(
        'inbox-1',
        expect.objectContaining({
          to: ['investor@example.com'],
          subject: 'Analysis Complete: TestCo',
          text: expect.stringContaining('overall score of 85.5/100'),
        }),
      );
      expect(conversationService.logMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          messageId: expect.stringContaining('pipeline-complete-startup-1-'),
          direction: MessageDirection.OUTBOUND,
        }),
      );
      expect(conversationService.updateStatus).toHaveBeenCalledWith(
        'conv-1',
        ConversationStatus.COMPLETED,
      );
    });

    it('should reply on the existing conversation thread when inbox/message context is available', async () => {
      const conversationWithContext = {
        ...mockConversation,
        startupId: 'startup-1',
        context: {
          lastInboundInboxId: 'inbox-live',
          lastInboundMessageId: 'msg-live',
        },
      };

      conversationService.findByStartupId.mockResolvedValueOnce(conversationWithContext);
      drizzleService.db.limit.mockResolvedValueOnce([mockStartup]);

      await service.notifyPipelineComplete('startup-1', 85.5);

      expect(agentMailClient.replyToMessage).toHaveBeenCalledWith(
        'inbox-live',
        'msg-live',
        expect.objectContaining({
          text: expect.stringContaining('overall score of 85.5/100'),
        }),
      );
      expect(agentMailClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should send notification without score when not provided', async () => {
      const conversationWithStartup = {
        ...mockConversation,
        startupId: 'startup-1',
      };

      conversationService.findByStartupId.mockResolvedValueOnce(conversationWithStartup);
      drizzleService.db.limit.mockResolvedValueOnce([mockStartup]);

      await service.notifyPipelineComplete('startup-1');

      expect(agentMailClient.sendMessage).toHaveBeenCalledWith(
        'inbox-1',
        expect.objectContaining({
          text: expect.not.stringContaining('overall score'),
        }),
      );
    });

    it('should include warning language when pipeline completed with warnings', async () => {
      const conversationWithStartup = {
        ...mockConversation,
        startupId: 'startup-1',
      };

      conversationService.findByStartupId.mockResolvedValueOnce(conversationWithStartup);
      drizzleService.db.limit.mockResolvedValueOnce([mockStartup]);

      await service.notifyPipelineComplete('startup-1', 85.5, {
        pipelineRunId: 'run-123',
        warningMessage: 'Synthesis failed — all scores require manual verification.',
      });

      expect(agentMailClient.sendMessage).toHaveBeenCalledWith(
        'inbox-1',
        expect.objectContaining({
          subject: 'Analysis Complete With Warnings: TestCo',
          text: expect.stringContaining('finished with warnings'),
        }),
      );
      expect(agentMailClient.sendMessage).toHaveBeenCalledWith(
        'inbox-1',
        expect.objectContaining({
          text: expect.stringContaining(
            'Synthesis failed — all scores require manual verification.',
          ),
        }),
      );
      expect(conversationService.logMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'pipeline-complete-startup-1-run-123',
        }),
      );
    });

    it('should no-op when no conversation found', async () => {
      conversationService.findByStartupId.mockResolvedValueOnce(null);

      await service.notifyPipelineComplete('startup-1', 85.5);

      expect(drizzleService.db.select).not.toHaveBeenCalled();
      expect(agentMailClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should no-op when startup record not found', async () => {
      const conversationWithStartup = {
        ...mockConversation,
        startupId: 'startup-1',
      };

      conversationService.findByStartupId.mockResolvedValueOnce(conversationWithStartup);
      drizzleService.db.limit.mockResolvedValueOnce([]);

      await service.notifyPipelineComplete('startup-1', 85.5);

      expect(agentMailClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should no-op when Clara is not configured', async () => {
      configService = createConfigService(null, 'admin-user-1');

      const testService = createService({ configService });

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
