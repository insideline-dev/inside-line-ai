import { beforeEach, describe, expect, it, jest } from "bun:test";
import { DrizzleService } from "../../../database";
import { StorageService } from "../../../storage";
import { AssetService } from "../../../storage/asset.service";
import { AgentMailClientService } from "../../integrations/agentmail/agentmail-client.service";
import { DataRoomService } from "../../startup/data-room.service";
import { PipelineService } from "../../ai/services/pipeline.service";
import { NotificationService } from "../../../notification/notification.service";
import { ClaraAiService } from "../clara-ai.service";
import { ClaraSubmissionService } from "../clara-submission.service";
import { StartupStatus } from "../../startup/entities/startup.schema";
import { PipelinePhase } from "../../ai/interfaces/pipeline.interface";
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
  let assetService: jest.Mocked<AssetService>;
  let dataRoomService: jest.Mocked<DataRoomService>;
  let agentMailClient: jest.Mocked<AgentMailClientService>;
  let pipeline: jest.Mocked<PipelineService>;
  let notifications: jest.Mocked<NotificationService>;
  let claraAi: jest.Mocked<ClaraAiService>;

  const mockDbChain = {
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
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
    mockDbChain.delete.mockReturnThis();
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
      rerunFromPhase: jest.fn().mockResolvedValue(undefined),
      cancelPipeline: jest.fn().mockResolvedValue({ removedJobs: 0 }),
      prepareFreshAnalysis: jest.fn().mockResolvedValue(undefined),
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

    assetService = {
      uploadAndTrack: jest.fn().mockResolvedValue({
        id: "asset-1",
        key: "startups/admin-1/documents/deck.pdf",
        url: "https://storage.com/deck.pdf",
      }),
    } as unknown as jest.Mocked<AssetService>;

    dataRoomService = {
      uploadDocument: jest.fn().mockResolvedValue({ id: "doc-1" }),
    } as unknown as jest.Mocked<DataRoomService>;

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
      assetService,
      dataRoomService,
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
    expect(pipeline.startPipeline).toHaveBeenCalledWith("startup-1", "admin-1", {
      skipExtraction: true,
    });
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
      bodyText: "No company here",
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
    expect(pipeline.startPipeline).toHaveBeenCalledWith(
      "startup-1",
      "investor-1",
      {
        skipExtraction: true,
      },
    );
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
      duplicateBlocked: true,
      status: StartupStatus.SUBMITTED,
    });

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(pipeline.startPipeline).not.toHaveBeenCalled();
  });

  it("does not treat fuzzy similar names as duplicates", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "existing-startup",
        name: "Acme 2025",
        status: StartupStatus.SUBMITTED,
      },
    ]);

    const ctx = createMessageContext({
      attachments: [createAttachment()],
    });

    const result = await service.handleSubmission(ctx, "admin-1", "Acme");

    expect(result.isDuplicate).toBe(false);
    expect(result.startupId).toBe("startup-1");
    expect(mockDb.insert).toHaveBeenCalled();
    expect(pipeline.startPipeline).toHaveBeenCalledWith(
      "startup-1",
      "admin-1",
      {
        skipExtraction: true,
      },
    );
  });

  it("matches duplicates when the only difference is a legal suffix", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "existing-startup",
        name: "Acme, Inc.",
        status: StartupStatus.SUBMITTED,
      },
    ]);

    const ctx = createMessageContext({
      attachments: [createAttachment()],
    });

    const result = await service.handleSubmission(ctx, "admin-1", "Acme");

    expect(result).toEqual({
      startupId: "existing-startup",
      startupName: "Acme, Inc.",
      isDuplicate: true,
      duplicateBlocked: true,
      status: StartupStatus.SUBMITTED,
    });

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(pipeline.startPipeline).not.toHaveBeenCalled();
  });

  it("restarts the same startup from enrichment when missing-info reply is complete", async () => {
    mockDb.limit
      .mockResolvedValueOnce([
        {
          id: "existing-startup",
          userId: "admin-1",
          name: "Acme Corp",
          website: "",
          stage: "seed",
          industry: "Unknown",
          location: "Unknown",
          fundingTarget: 0,
          teamSize: 1,
          status: StartupStatus.SUBMITTED,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "existing-startup",
          userId: "admin-1",
          name: "Acme Corp",
          website: "https://acme.com",
          stage: "series_a",
          industry: "Unknown",
          location: "Unknown",
          fundingTarget: 0,
          teamSize: 1,
          status: StartupStatus.SUBMITTED,
        },
      ]);

    const resolution = await service.resolveMissingInfoFromReply(
      "existing-startup",
      "Website: https://acme.com and we are now Series A",
      "admin-1",
    );

    expect(resolution).toEqual({
      startupId: "existing-startup",
      startupName: "Acme Corp",
      updatedFields: ["website", "stage"],
      remainingMissing: [],
      pipelineStarted: true,
    });
    expect(pipeline.rerunFromPhase).toHaveBeenCalledWith(
      "existing-startup",
      PipelinePhase.ENRICHMENT,
    );
    expect(pipeline.startPipeline).not.toHaveBeenCalled();
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
      attachments: [createAttachment()],
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

  it("does not use filename-derived company names when body has no company name", async () => {
    const ctx = createMessageContext({
      bodyText: "Please review our deck.",
      attachments: [
        createAttachment({ filename: "DataFlow-AI-pitch-deck.pdf" }),
      ],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Untitled Startup",
      }),
    );
  });

  it("uses provided extractedCompanyName over other sources", async () => {
    const ctx = createMessageContext({
      bodyText: "Company name: WrongCorp",
      attachments: [createAttachment()],
    });

    await service.handleSubmission(ctx, "admin-1", "Correct Company");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Correct Company",
      }),
    );
  });

  it("ignores non-company signature website on initial submission", async () => {
    const ctx = createMessageContext({
      bodyText:
        "Please review our pitch deck.\n\nBest,\nBrainfast Team\nhttps://brainfast.ai",
      attachments: [createAttachment()],
    });

    await service.handleSubmission(ctx, "admin-1", "Uber");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Uber",
        website: "",
      }),
    );
  });

  it("rejects filename-style extractedCompanyName values on deck submissions", async () => {
    const ctx = createMessageContext({
      bodyText: "Please review.",
      attachments: [createAttachment({ filename: "uber2.pdf" })],
    });

    await service.handleSubmission(ctx, "admin-1", "uber2");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Untitled Startup",
      }),
    );
  });

  it("rejects report-style extractedCompanyName values on deck submissions", async () => {
    const ctx = createMessageContext({
      bodyText: "Please review.",
      attachments: [createAttachment({ filename: "deck.pdf" })],
    });

    await service.handleSubmission(ctx, "admin-1", "2023 Annual Report");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Untitled Startup",
      }),
    );
  });

  it("defaults to Untitled Startup when no name is found", async () => {
    const ctx = createMessageContext({
      bodyText: "Here is some text without a company name.",
      attachments: [createAttachment()],
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
      attachments: [createAttachment()],
    });

    await service.handleSubmission(ctx, "admin-1", "Test & Co., Inc.");

    const call = mockDb.values.mock.calls[0][0];
    expect(call.slug).toMatch(/^test-co-inc-[a-z0-9]{4}$/);
  });

  it("stores all uploaded attachments in startup files metadata", async () => {
    assetService.uploadAndTrack
      .mockResolvedValueOnce({
        id: "asset-deck",
        key: "startups/admin-1/documents/deck.pdf",
        url: "https://storage.com/deck.pdf",
      } as any)
      .mockResolvedValueOnce({
        id: "asset-financials",
        key: "startups/admin-1/documents/financials.pdf",
        url: "https://storage.com/financials.pdf",
      } as any);

    const ctx = createMessageContext({
      attachments: [
        createAttachment({
          filename: "deck.pdf",
          attachmentId: "att-deck",
        }),
        createAttachment({
          filename: "financials.pdf",
          attachmentId: "att-financials",
        }),
      ],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          {
            path: "startups/admin-1/documents/deck.pdf",
            name: "deck.pdf",
            type: "application/pdf",
          },
          {
            path: "startups/admin-1/documents/financials.pdf",
            name: "financials.pdf",
            type: "application/pdf",
          },
        ],
      }),
    );
  });

  it("does not promote financial pdf attachments as pitch deck", async () => {
    storage.uploadGeneratedContent.mockResolvedValueOnce({
      key: "startups/admin-1/documents/financials.pdf",
      url: "https://storage.com/financials.pdf",
    });

    const ctx = createMessageContext({
      attachments: [
        createAttachment({
          filename: "financials.pdf",
          attachmentId: "att-financials",
        }),
      ],
    });

    const result = await service.handleSubmission(ctx, "admin-1");

    expect(result.noPitchDeck).toBe(true);
    expect(mockDb.values).not.toHaveBeenCalled();
  });

  it("does not promote annual/earnings documents as pitch deck", async () => {
    storage.uploadGeneratedContent
      .mockResolvedValueOnce({
        key: "startups/admin-1/documents/annual-report.pdf",
        url: "https://storage.com/annual-report.pdf",
      })
      .mockResolvedValueOnce({
        key: "startups/admin-1/documents/q3-earnings.pdf",
        url: "https://storage.com/q3-earnings.pdf",
      });

    const ctx = createMessageContext({
      bodyText: "Please review the attached docs.",
      attachments: [
        createAttachment({
          filename: "2023 Annual Report.pdf",
          attachmentId: "att-annual",
        }),
        createAttachment({
          filename: "Uber Q3 2025 Earnings Supplemental Data.pdf",
          attachmentId: "att-q3",
        }),
      ],
    });

    const result = await service.handleSubmission(ctx, "admin-1");

    expect(result.noPitchDeck).toBe(true);
    expect(mockDb.values).not.toHaveBeenCalled();
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

  it("blocks submission when no pitch deck is uploaded", async () => {
    const ctx = createMessageContext({
      attachments: [],
    });

    const result = await service.handleSubmission(ctx, "admin-1");

    expect(result.noPitchDeck).toBe(true);
    expect(mockDb.values).not.toHaveBeenCalled();
    expect(pipeline.startPipeline).not.toHaveBeenCalled();
  });

  it("uses contact info from message context", async () => {
    const ctx = createMessageContext({
      fromEmail: "ceo@example.com",
      fromName: "Jane CEO",
      attachments: [createAttachment()],
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
      attachments: [createAttachment()],
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
      attachments: [createAttachment()],
    });

    await service.handleSubmission(ctx, "admin-1");

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        description: longText.slice(0, 5000),
      }),
    );
  });
});
