import { Test, TestingModule } from "@nestjs/testing";
import { ClaraConversationService } from "../clara-conversation.service";
import { DrizzleService } from "../../../database";
import {
  ConversationStatus,
  MessageDirection,
  type AttachmentMeta,
} from "../interfaces/clara.interface";

describe("ClaraConversationService", () => {
  let service: ClaraConversationService;

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
    orderBy: jest.fn().mockReturnThis(),
  });

  let mockDb: ReturnType<typeof createMockDb>;

  const mockConversation = {
    id: "conv-123",
    threadId: "thread-456",
    investorEmail: "investor@example.com",
    investorName: "John Doe",
    investorUserId: "user-789",
    startupId: null,
    status: ConversationStatus.ACTIVE,
    lastIntent: null,
    messageCount: 0,
    context: {},
    lastMessageAt: new Date("2024-01-01T10:00:00Z"),
    createdAt: new Date("2024-01-01T10:00:00Z"),
    updatedAt: new Date("2024-01-01T10:00:00Z"),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaraConversationService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
          },
        },
      ],
    }).compile();

    service = module.get<ClaraConversationService>(ClaraConversationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("findByThreadId", () => {
    it("should return conversation when found", async () => {
      mockDb.limit.mockResolvedValue([mockConversation]);

      const result = await service.findByThreadId("thread-456");

      expect(result).toEqual(mockConversation);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it("should return null when conversation not found", async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.findByThreadId("nonexistent-thread");

      expect(result).toBeNull();
    });
  });

  describe("findOrCreate", () => {
    it("should return existing conversation when found", async () => {
      mockDb.limit.mockResolvedValue([mockConversation]);

      const result = await service.findOrCreate(
        "thread-456",
        "investor@example.com",
        "John Doe",
        "user-789",
      );

      expect(result).toEqual(mockConversation);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("should create new conversation when not found", async () => {
      const newConversation = {
        ...mockConversation,
        id: "conv-new",
        threadId: "thread-new",
      };

      mockDb.limit.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([newConversation]);

      const result = await service.findOrCreate(
        "thread-new",
        "investor@example.com",
        "John Doe",
        "user-789",
      );

      expect(result).toEqual(newConversation);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        threadId: "thread-new",
        investorEmail: "investor@example.com",
        investorName: "John Doe",
        investorUserId: "user-789",
      });
      expect(mockDb.returning).toHaveBeenCalled();
    });

    it("should refresh investor identity on existing conversation when data is missing", async () => {
      const staleConversation = {
        ...mockConversation,
        investorEmail: '"John Doe" <investor@example.com>',
        investorUserId: null,
      };
      const refreshedConversation = {
        ...mockConversation,
        investorEmail: "investor@example.com",
        investorUserId: "user-789",
      };

      mockDb.limit.mockResolvedValueOnce([staleConversation]);
      mockDb.returning.mockResolvedValueOnce([refreshedConversation]);

      const result = await service.findOrCreate(
        "thread-456",
        "investor@example.com",
        "John Doe",
        "user-789",
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          investorEmail: "investor@example.com",
          investorName: "John Doe",
          investorUserId: "user-789",
        }),
      );
      expect(result).toEqual(refreshedConversation);
    });

    it("should handle null investorName and investorUserId", async () => {
      const newConversation = {
        ...mockConversation,
        id: "conv-new",
        investorName: null,
        investorUserId: null,
      };

      mockDb.limit.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([newConversation]);

      await service.findOrCreate(
        "thread-new",
        "investor@example.com",
        null,
        null,
      );

      expect(mockDb.values).toHaveBeenCalledWith({
        threadId: "thread-new",
        investorEmail: "investor@example.com",
        investorName: null,
        investorUserId: null,
      });
    });
  });

  describe("updateStatus", () => {
    it("should update conversation status", async () => {
      await service.updateStatus("conv-123", ConversationStatus.PROCESSING);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({
        status: ConversationStatus.PROCESSING,
        updatedAt: expect.any(Date),
      });
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("should update to completed status", async () => {
      await service.updateStatus("conv-123", ConversationStatus.COMPLETED);

      expect(mockDb.set).toHaveBeenCalledWith({
        status: ConversationStatus.COMPLETED,
        updatedAt: expect.any(Date),
      });
    });
  });

  describe("linkStartup", () => {
    it("should link startup to conversation", async () => {
      await service.linkStartup("conv-123", "startup-456");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({
        startupId: "startup-456",
        updatedAt: expect.any(Date),
      });
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe("updateLastIntent", () => {
    it("should update last intent", async () => {
      await service.updateLastIntent("conv-123", "submission");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({
        lastIntent: "submission",
        updatedAt: expect.any(Date),
      });
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe("updateContext", () => {
    it("should update conversation context", async () => {
      const context = { companyName: "Acme Inc", stage: "seed" };

      await service.updateContext("conv-123", context);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({
        context,
        updatedAt: expect.any(Date),
      });
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("should handle empty context object", async () => {
      await service.updateContext("conv-123", {});

      expect(mockDb.set).toHaveBeenCalledWith({
        context: {},
        updatedAt: expect.any(Date),
      });
    });
  });

  describe("findByStartupId", () => {
    it("should return conversation when found by startup ID", async () => {
      const conversationWithStartup = {
        ...mockConversation,
        startupId: "startup-456",
      };

      mockDb.limit.mockResolvedValue([conversationWithStartup]);

      const result = await service.findByStartupId("startup-456");

      expect(result).toEqual(conversationWithStartup);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it("should return null when conversation not found by startup ID", async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.findByStartupId("nonexistent-startup");

      expect(result).toBeNull();
    });
  });

  describe("logMessage", () => {
    it("should insert message and increment conversation count", async () => {
      const messageParams = {
        conversationId: "conv-123",
        messageId: "msg-789",
        direction: MessageDirection.INBOUND,
        fromEmail: "investor@example.com",
        subject: "Pitch Deck Submission",
        bodyText: "Please review our pitch deck",
        intent: "submission",
        intentConfidence: 0.95,
        attachments: [] as AttachmentMeta[],
        processed: false,
        errorMessage: null,
      };

      await service.logMessage(messageParams);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        conversationId: "conv-123",
        messageId: "msg-789",
        direction: MessageDirection.INBOUND,
        fromEmail: "investor@example.com",
        subject: "Pitch Deck Submission",
        bodyText: "Please review our pitch deck",
        intent: "submission",
        intentConfidence: 0.95,
        attachments: [],
        processed: false,
        errorMessage: null,
      });
      expect(mockDb.update).toHaveBeenCalledTimes(1);
      expect(mockDb.set).toHaveBeenCalledWith({
        messageCount: expect.anything(),
        lastMessageAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it("should handle message without optional fields", async () => {
      const minimalParams = {
        conversationId: "conv-123",
        messageId: "msg-789",
        direction: MessageDirection.OUTBOUND,
        fromEmail: "clara@insideline.ai",
      };

      await service.logMessage(minimalParams);

      expect(mockDb.values).toHaveBeenCalledWith({
        conversationId: "conv-123",
        messageId: "msg-789",
        direction: MessageDirection.OUTBOUND,
        fromEmail: "clara@insideline.ai",
        subject: null,
        bodyText: null,
        intent: null,
        intentConfidence: null,
        attachments: null,
        processed: false,
        errorMessage: null,
      });
    });

    it("should handle message with attachments", async () => {
      const attachments: AttachmentMeta[] = [
        {
          filename: "pitch.pdf",
          contentType: "application/pdf",
          attachmentId: "att-123",
          storagePath: "s3://bucket/pitch.pdf",
          isPitchDeck: true,
          status: "uploaded",
        },
      ];

      const paramsWithAttachments = {
        conversationId: "conv-123",
        messageId: "msg-789",
        direction: MessageDirection.INBOUND,
        fromEmail: "investor@example.com",
        attachments,
      };

      await service.logMessage(paramsWithAttachments);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments,
        }),
      );
    });

    it("should handle message with error", async () => {
      const paramsWithError = {
        conversationId: "conv-123",
        messageId: "msg-789",
        direction: MessageDirection.INBOUND,
        fromEmail: "investor@example.com",
        processed: true,
        errorMessage: "Failed to process attachment",
      };

      await service.logMessage(paramsWithError);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          processed: true,
          errorMessage: "Failed to process attachment",
        }),
      );
    });
  });

  describe("getRecentMessages", () => {
    const mockMessages = [
      {
        direction: MessageDirection.INBOUND,
        bodyText: "First message",
        subject: "Inquiry",
        intent: "question",
        createdAt: new Date("2024-01-01T10:00:00Z"),
      },
      {
        direction: MessageDirection.OUTBOUND,
        bodyText: "Response",
        subject: "Re: Inquiry",
        intent: null,
        createdAt: new Date("2024-01-01T10:05:00Z"),
      },
      {
        direction: MessageDirection.INBOUND,
        bodyText: "Follow up",
        subject: "Re: Inquiry",
        intent: "follow_up",
        createdAt: new Date("2024-01-01T10:10:00Z"),
      },
    ];

    it("should return recent messages in chronological order", async () => {
      mockDb.limit.mockResolvedValue([...mockMessages].reverse());

      const result = await service.getRecentMessages("conv-123");

      expect(result).toEqual(mockMessages);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });

    it("should respect custom limit", async () => {
      mockDb.limit.mockResolvedValue([mockMessages[0]]);

      await service.getRecentMessages("conv-123", 1);

      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it("should return empty array when no messages exist", async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.getRecentMessages("conv-123");

      expect(result).toEqual([]);
    });

    it("should handle messages with null fields", async () => {
      const messagesWithNulls = [
        {
          direction: MessageDirection.INBOUND,
          bodyText: null,
          subject: null,
          intent: null,
          createdAt: new Date("2024-01-01T10:00:00Z"),
        },
      ];

      mockDb.limit.mockResolvedValue([...messagesWithNulls]);

      const result = await service.getRecentMessages("conv-123");

      expect(result).toEqual(messagesWithNulls);
    });
  });
});
