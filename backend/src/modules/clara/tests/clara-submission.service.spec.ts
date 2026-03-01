import { beforeEach, describe, expect, it, jest } from "bun:test";
import { DrizzleService } from "../../../database";
import { StorageService } from "../../../storage";
import { AgentMailClientService } from "../../integrations/agentmail/agentmail-client.service";
import { PipelineService } from "../../ai/services/pipeline.service";
import { NotificationService } from "../../../notification/notification.service";
import { ClaraAiService } from "../clara-ai.service";
import { ClaraSubmissionService } from "../clara-submission.service";
import { StartupStatus } from "../../startup/entities/startup.schema";
import type { MessageContext, AttachmentMeta } from "../interfaces/clara.interface";

const createMessageContext = (
  overrides: Partial<MessageContext> = {},
): MessageContext => ({
  inboxId: "inbox-1",
  messageId: "msg-1",
  fromEmail: "founder@startup.com",
  fromName: "John Founder",
  bodyText: "Our company Acme Corp is seeking investment.",
  attachments: [],
  ...overrides,
});

const createAttachment = (
  overrides: Partial<AttachmentMeta> = {},
): AttachmentMeta => ({
  attachmentId: "att-1",
  filename: "deck.pdf",
  contentType: "application/pdf",
  size: 1024,
  ...overrides,
});

describe("ClaraSubmissionService", () => {
  let service: ClaraSubmissionService;
  let drizzle: jest.Mocked<DrizzleService>;
  let storage: jest.Mocked<StorageService>;
  let agentMailClient: jest.Mocked<AgentMailClientService>;
  let pipeline: jest.Mocked<PipelineService>;
  let notifications: jest.Mocked<NotificationService>;
  let claraAi: jest.Mocked<ClaraAiService>;

  const mockDbChain = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([
      {
        id: "startup-1",
        name: "Acme Corp",
        slug: "acme-corp-xyz1",
        userId: "admin-1",
      },
    ]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  };

  const mockDb = mockDbChain;

  beforeEach(() => {
    // Reset all mock functions
    Object.values(mockDbChain).forEach((mock) => {
      if (typeof mock === "function") {
        mock.mockClear();
      }
    });

    // Reset chainable methods to return this
    mockDbChain.insert.mockReturnThis();
    mockDbChain.values.mockReturnThis();
    mockDbChain.update.mockReturnThis();
    mockDbChain.set.mockReturnThis();
    mockDbChain.where.mockReturnThis();
    mockDbChain.orderBy.mockReturnThis();
    mockDbChain.select.mockReturnThis();
    mockDbChain.from.mockReturnThis();

    // Default return values
    mockDbChain.returning.mockResolvedValue([
      {
        id: "startup-1",
        name: "Acme Corp",
        slug: "acme-corp-xyz1",
        userId: "admin-1",
      },
    ]);
    mockDbChain.limit.mockResolvedValue([]); // No duplicates by default

    drizzle = { db: mockDb } as unknown as jest.Mocked<DrizzleService>;

    storage = {
      uploadGeneratedContent: jest.fn().mockResolvedValue({
        key: "startups/admin-1/documents/deck.pdf",
        url: "https://storage.com/deck.pdf",
      }),
    } as unknown as jest.Mocked<StorageService>;

    agentMailClient = {
      getMessageAttachment: jest.fn().mockResolvedValue({
        downloadUrl: "https://agentmail.com/download/att-1",
      }),
    } as unknown as jest.Mocked<AgentMailClientService>;

    pipeline = {
      startPipeline: jest.fn().mockResolvedValue("run-1"),
      prefillCriticalFieldsFromDeckExtraction: jest.fn().mockResolvedValue({
        extractionSource: "startup-context",
        updatedFields: [],
        missingCriticalFields: [],
      }),
    } as unknown as jest.Mocked<PipelineService>;

    notifications = {
      create: jest.fn().mockResolvedValue({ id: "notif-1" }),
    } as unknown as jest.Mocked<NotificationService>;

    claraAi = {
      extractCompanyFromFilename: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<ClaraAiService>;

    // Mock global fetch for attachment downloads
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(
        Buffer.from("%PDF-1.4 fake pdf content").buffer,
      ),
    } as unknown as Response);

    service = new ClaraSubmissionService(
      drizzle,
      storage,
      agentMailClient,
      pipeline,
      notifications,
      claraAi,
    );
  });

  it("creates startup and triggers pipeline for valid submission", async () => {
    const ctx = createMessageContext({
      bodyText: "No company here",
      attachments: [createAttachment()],
    });

    mockDbChain.returning.mockResolvedValueOnce([
      {
        id: "startup-1",
        name: "Acme Corp",
        slug: "acme-corp-xyz1",
        userId: "admin-1",
      },
    ]);

    const result = await service.handleSubmission(ctx, "admin-1", "Acme Corp");

    expect(result).toEqual({
      startupId: "startup-1",
      startupName: "Acme Corp",
      isDuplicate: false,
      status: StartupStatus.SUBMITTED,
      pipelineStarted: true,
      missingFields: [],
    });

    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(pipeline.startPipeline).toHaveBeenCalledWith("startup-1", "admin-1");
    expect(notifications.create).toHaveBeenCalledWith(
      "admin-1",
      "Clara: New startup submitted",
      "Acme Corp was submitted via email by founder@startup.com",
      "info",
      "/admin/startup/startup-1",
    );
  });

  it("creates investor-owned private startup when investor user is linked", async () => {
    const ctx = createMessageContext({
      investorUserId: "investor-1",
      attachments: [createAttachment()],
    });

    await service.handleSubmission(ctx, "admin-1", "Acme Corp");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "investor-1",
        submittedByRole: "investor",
        isPrivate: true,
      }),
    );
    expect(pipeline.startPipeline).toHaveBeenCalledWith("startup-1", "investor-1");
    expect(notifications.create).toHaveBeenCalledWith(
      "investor-1",
      "Clara: New startup submitted",
      "Acme Corp was submitted via email by founder@startup.com",
      "info",
      "/investor/startup/startup-1",
    );
  });

  it("detects duplicate startup by name", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "existing-startup",
        name: "Acme Corp",
        status: StartupStatus.SUBMITTED,
      },
    ]);

    const ctx = createMessageContext({
      attachments: [createAttachment()],
    });

    const result = await service.handleSubmission(ctx, "admin-1");

    expect(result).toEqual({
      startupId: "existing-startup",
      startupName: "Acme Corp",
      isDuplicate: true,
      isEnriched: true,
      status: StartupStatus.SUBMITTED,
      pipelineStarted: true,
      missingFields: [],
    });

    expect(mockDb.insert).not.toHaveBeenCalled();
    // startPipeline is called because the attachment was enriched (isEnriched: true)
    expect(pipeline.startPipeline).toHaveBeenCalledWith("existing-startup", "admin-1");
  });

  it("falls back when similarity() is unavailable and still detects duplicates", async () => {
    mockDb.limit
      .mockRejectedValueOnce({
        message: "function similarity(text, unknown) does not exist",
        cause: { code: "42883" },
      })
      .mockResolvedValueOnce([
        {
          id: "existing-startup",
          name: "Acme Corp",
          status: StartupStatus.SUBMITTED,
        },
      ]);

    const ctx = createMessageContext({
      attachments: [createAttachment()],
    });

    const result = await service.handleSubmission(ctx, "admin-1", "Acme Corp");

    expect(result).toEqual({
      startupId: "existing-startup",
      startupName: "Acme Corp",
      isDuplicate: true,
      isEnriched: true,
      status: StartupStatus.SUBMITTED,
      pipelineStarted: true,
      missingFields: [],
    });

    expect(mockDb.limit).toHaveBeenCalledTimes(3);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(pipeline.startPipeline).toHaveBeenCalledWith("existing-startup", "admin-1");
  });


  it("marks critical attachment as failed after max retries", async () => {
    const ctx = createMessageContext({
      bodyText: "No company here",
      attachments: [
        createAttachment({
          filename: "pitch-deck.pdf",
          contentType: "application/pdf",
        }),
      ],
    });

    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockRejectedValue(
      new Error("Persistent failure"),
    );

    const result = await service.handleSubmission(ctx, "admin-1");

    // Should still create startup without deck
    expect(result.isDuplicate).toBe(false);
    expect(global.fetch).toHaveBeenCalled(); // Called during MAX_RETRIES
    expect(storage.uploadGeneratedContent).not.toHaveBeenCalled();
  });

  it("skips non-critical attachment on first failure", async () => {
    const ctx = createMessageContext({
      bodyText: "No company here",
      attachments: [
        createAttachment({
          filename: "logo.png",
          contentType: "image/png",
          attachmentId: "att-logo",
        }),
      ],
    });

    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("Image download failed"),
    );

    const result = await service.handleSubmission(ctx, "admin-1");

    expect(result.isDuplicate).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1); // No retry for non-critical
    expect(storage.uploadGeneratedContent).not.toHaveBeenCalled();
  });

  it("validates PDF magic bytes and rejects invalid PDFs", async () => {
    const ctx = createMessageContext({
      bodyText: "No company here",
      attachments: [
        createAttachment({
          filename: "fake.pdf",
          contentType: "application/pdf",
        }),
      ],
    });

    (global.fetch as jest.Mock).mockClear();
    // Mock fetch to return invalid PDF content
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(
        Buffer.from("Not a real PDF file").buffer,
      ),
    });

    const result = await service.handleSubmission(ctx, "admin-1");

    // Should fail all retry attempts and continue without deck
    expect(result.isDuplicate).toBe(false);
    expect(storage.uploadGeneratedContent).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(3); // Retried 3 times
  });

  it("rejects JSON masquerading as PDF", async () => {
    const ctx = createMessageContext({
      bodyText: "No company here",
      attachments: [
        createAttachment({
          filename: "malicious.pdf",
          contentType: "application/pdf",
        }),
      ],
    });

    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(
        Buffer.from('{"fake": "pdf"}').buffer,
      ),
    });

    const result = await service.handleSubmission(ctx, "admin-1");

    expect(result.isDuplicate).toBe(false);
    expect(storage.uploadGeneratedContent).not.toHaveBeenCalled();
  });

  it("extracts company name from body text", async () => {
    const ctx = createMessageContext({
      bodyText: "Our company named: TechCorp Inc. is building AI solutions.",
      attachments: [],
    });

    mockDbChain.returning.mockResolvedValueOnce([
      {
        id: "startup-1",
        name: "TechCorp Inc",
        slug: "techcorp-inc-xyz1",
        userId: "admin-1",
      },
    ]);

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "TechCorp Inc",
      }),
    );
  });

  it("falls back to filename extraction when body has no company name", async () => {
    claraAi.extractCompanyFromFilename.mockReturnValueOnce("DataFlow AI");

    const ctx = createMessageContext({
      bodyText: "Please review our deck.",
      attachments: [
        createAttachment({ filename: "DataFlow-AI-pitch-deck.pdf" }),
      ],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "DataFlow AI",
      }),
    );
  });

  it("uses provided extractedCompanyName over other sources", async () => {
    const ctx = createMessageContext({
      bodyText: "Company name: WrongCorp",
      attachments: [],
    });

    await service.handleSubmission(ctx, "admin-1", "Correct Company");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Correct Company",
      }),
    );
  });

  it("defaults to Untitled Startup when no name is found", async () => {
    const ctx = createMessageContext({
      bodyText: "Here is some text without a company name.",
      attachments: [],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Untitled Startup",
      }),
    );
  });

  it("generates URL-safe slug with random suffix", async () => {
    const ctx = createMessageContext({
      bodyText: "No company here",
      attachments: [],
    });

    await service.handleSubmission(ctx, "admin-1", "Test & Co., Inc.");

    const call = mockDb.values.mock.calls[0][0];
    expect(call.slug).toMatch(/^test-co-inc-[a-z0-9]{4}$/);
  });

  it("stores pitch deck path when upload succeeds", async () => {
    const ctx = createMessageContext({
      attachments: [createAttachment()],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        pitchDeckPath: "startups/admin-1/documents/deck.pdf",
      }),
    );
  });

  it("creates startup without pitch deck when no attachment is uploaded", async () => {
    const ctx = createMessageContext({
      attachments: [],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        pitchDeckPath: undefined,
      }),
    );
  });

  it("uses contact info from message context", async () => {
    const ctx = createMessageContext({
      fromEmail: "ceo@example.com",
      fromName: "Jane CEO",
      attachments: [],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        contactEmail: "ceo@example.com",
        contactName: "Jane CEO",
        tagline: "Submitted via email by ceo@example.com",
      }),
    );
  });

  it("handles missing fromName gracefully", async () => {
    const ctx = createMessageContext({
      fromName: null,
      attachments: [],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        contactEmail: "founder@startup.com",
        contactName: undefined,
      }),
    );
  });

  it("truncates long body text in description field", async () => {
    const longText = "a".repeat(6000);
    const ctx = createMessageContext({
      bodyText: longText,
      attachments: [],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        description: longText.slice(0, 5000),
      }),
    );
  });
});
