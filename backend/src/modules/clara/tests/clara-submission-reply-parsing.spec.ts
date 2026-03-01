import { beforeEach, describe, expect, it, jest } from "bun:test";
import { DrizzleService } from "../../../database";
import { StorageService } from "../../../storage";
import { AgentMailClientService } from "../../integrations/agentmail/agentmail-client.service";
import { PipelineService, PIPELINE_MISSING_FIELDS_ERROR_PREFIX } from "../../ai/services/pipeline.service";
import { NotificationService } from "../../../notification/notification.service";
import { ClaraAiService } from "../clara-ai.service";
import { ClaraSubmissionService } from "../clara-submission.service";
import { StartupStatus, StartupStage } from "../../startup/entities/startup.schema";

// ---------------------------------------------------------------------------
// Snapshot factory
// A "complete" snapshot has a real website and a non-seed stage so that
// getMissingCriticalFields() returns [].
// ---------------------------------------------------------------------------
const makeSnapshot = (overrides: Record<string, unknown> = {}) => ({
  id: "startup-1",
  userId: "user-1",
  name: "Acme Corp",
  website: "https://acme.com",
  stage: StartupStage.SERIES_A,   // non-seed → stage never flagged as placeholder
  industry: "SaaS",
  location: "San Francisco",
  fundingTarget: 1_000_000,
  teamSize: 5,
  status: StartupStatus.SUBMITTED,
  ...overrides,
});

// A snapshot that is missing website (empty string triggers isMissingWebsiteValue)
// and has a placeholder seed stage (seed + missing website + unknown industry = 2+ signals).
const makeMissingBothSnapshot = () =>
  makeSnapshot({
    website: "",
    stage: StartupStage.SEED,
    industry: "Unknown",
    location: "Unknown",
    fundingTarget: 0,
    teamSize: 1,
  });

const makeMissingWebsiteSnapshot = () =>
  makeSnapshot({
    website: "",
    stage: StartupStage.SERIES_A,
  });

const makeMissingStageoSnapshot = () =>
  makeSnapshot({
    website: "https://acme.com",
    stage: StartupStage.SEED,
    industry: "Unknown",
    fundingTarget: 0,
    teamSize: 1,
  });

// ---------------------------------------------------------------------------
// DB chain mock — reusable across tests
// ---------------------------------------------------------------------------
const buildDbChain = () => ({
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockResolvedValue([]),
  orderBy: jest.fn().mockReturnThis(),
});

describe("ClaraSubmissionService.resolveMissingInfoFromReply", () => {
  let service: ClaraSubmissionService;
  let mockDb: ReturnType<typeof buildDbChain>;
  let pipeline: jest.Mocked<PipelineService>;

  beforeEach(() => {
    mockDb = buildDbChain();

    // Re-attach chainable returns after reset
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.insert.mockReturnThis();
    mockDb.values.mockReturnThis();
    mockDb.orderBy.mockReturnThis();

    pipeline = {
      startPipeline: jest.fn().mockResolvedValue("run-1"),
      prefillCriticalFieldsFromDeckExtraction: jest.fn().mockResolvedValue({
        extractionSource: "startup-context",
        updatedFields: [],
        missingCriticalFields: [],
      }),
    } as unknown as jest.Mocked<PipelineService>;

    const drizzle = { db: mockDb } as unknown as jest.Mocked<DrizzleService>;
    const storage = {} as unknown as jest.Mocked<StorageService>;
    const agentMailClient = {} as unknown as jest.Mocked<AgentMailClientService>;
    const notifications = {
      create: jest.fn().mockResolvedValue({ id: "notif-1" }),
    } as unknown as jest.Mocked<NotificationService>;
    const claraAi = {
      extractCompanyFromFilename: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<ClaraAiService>;

    service = new ClaraSubmissionService(
      drizzle,
      storage,
      agentMailClient,
      pipeline,
      notifications,
      claraAi,
    );
  });

  // -------------------------------------------------------------------------
  // 1. Startup not found
  // -------------------------------------------------------------------------
  it("returns null when startup is not found", async () => {
    mockDb.limit.mockResolvedValue([]);

    const result = await service.resolveMissingInfoFromReply(
      "nonexistent-id",
      "Our website is https://acme.com",
    );

    expect(result).toBeNull();
    expect(pipeline.startPipeline).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. No fields missing — complete snapshot
  // -------------------------------------------------------------------------
  it("returns empty updated/remaining arrays when no fields are missing", async () => {
    const snapshot = makeSnapshot();
    // Both loads return the complete snapshot
    mockDb.limit
      .mockResolvedValueOnce([snapshot])
      .mockResolvedValueOnce([snapshot]);

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      "Just checking in.",
    );

    expect(result).toEqual({
      startupId: "startup-1",
      startupName: "Acme Corp",
      updatedFields: [],
      remainingMissing: [],
      pipelineStarted: true,
    });
    // No DB write because nothing changed
    expect(mockDb.update).not.toHaveBeenCalled();
    // remainingMissing === [] triggers startPipeline
    expect(pipeline.startPipeline).toHaveBeenCalledWith("startup-1", "user-1");
  });

  // -------------------------------------------------------------------------
  // 3. Website missing — reply contains valid URL
  // -------------------------------------------------------------------------
  it("extracts website from reply, updates DB, and reports updatedFields: ['website']", async () => {
    const initialSnapshot = makeMissingWebsiteSnapshot();
    const updatedSnapshot = makeSnapshot({ website: "https://acme.com" });

    mockDb.limit
      .mockResolvedValueOnce([initialSnapshot])  // first load (before update)
      .mockResolvedValueOnce([updatedSnapshot]);  // second load (after update)

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      "Check out our website at https://acme.com — we are series A.",
    );

    expect(result).not.toBeNull();
    expect(result!.updatedFields).toContain("website");
    expect(result!.remainingMissing).toEqual([]);

    // DB update was called
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ website: "https://acme.com/" }),
    );
  });

  // -------------------------------------------------------------------------
  // 4. Stage missing — reply contains stage text
  // -------------------------------------------------------------------------
  it("extracts stage from reply, updates DB, and reports updatedFields: ['stage']", async () => {
    const initialSnapshot = makeMissingStageoSnapshot();
    const updatedSnapshot = makeSnapshot({
      website: "https://acme.com",
      stage: StartupStage.PRE_SEED,
    });

    mockDb.limit
      .mockResolvedValueOnce([initialSnapshot])
      .mockResolvedValueOnce([updatedSnapshot]);

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      "We are raising a pre-seed round and looking for $500k.",
    );

    expect(result).not.toBeNull();
    expect(result!.updatedFields).toContain("stage");
    expect(result!.remainingMissing).toEqual([]);

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ stage: StartupStage.PRE_SEED }),
    );
  });

  // -------------------------------------------------------------------------
  // 5. Both missing — reply has both URL and stage
  // -------------------------------------------------------------------------
  it("updates both fields when both are missing and reply supplies both", async () => {
    const initialSnapshot = makeMissingBothSnapshot();
    const fullyUpdated = makeSnapshot({
      website: "https://techco.io",
      stage: StartupStage.SERIES_A,
    });

    mockDb.limit
      .mockResolvedValueOnce([initialSnapshot])
      .mockResolvedValueOnce([fullyUpdated]);

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      "Our site is https://techco.io and we are raising a Series A.",
    );

    expect(result).not.toBeNull();
    expect(result!.updatedFields).toContain("website");
    expect(result!.updatedFields).toContain("stage");
    expect(result!.remainingMissing).toEqual([]);
    expect(result!.pipelineStarted).toBe(true);

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(pipeline.startPipeline).toHaveBeenCalledWith("startup-1", "user-1");
  });

  // -------------------------------------------------------------------------
  // 6. Both missing — reply has only website, stage still missing after refresh
  // -------------------------------------------------------------------------
  it("does not start pipeline when stage is still missing after update", async () => {
    const initialSnapshot = makeMissingBothSnapshot();
    // After update, website is filled but stage is still a placeholder seed
    const partiallyUpdated = makeSnapshot({
      website: "https://acme.com",
      stage: StartupStage.SEED,
      industry: "Unknown",
      fundingTarget: 0,
      teamSize: 1,
    });

    mockDb.limit
      .mockResolvedValueOnce([initialSnapshot])
      .mockResolvedValueOnce([partiallyUpdated]);

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      "Our website is https://acme.com — no stage mentioned.",
    );

    expect(result).not.toBeNull();
    expect(result!.updatedFields).toContain("website");
    expect(result!.remainingMissing).toContain("stage");
    expect(result!.pipelineStarted).toBe(false);

    expect(pipeline.startPipeline).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Reply contains only signature/social URLs — website NOT extracted
  // -------------------------------------------------------------------------
  it("ignores social/signature URLs and reports no updatedFields", async () => {
    const initialSnapshot = makeMissingWebsiteSnapshot();
    // Refresh returns the same snapshot — website is still missing
    mockDb.limit
      .mockResolvedValueOnce([initialSnapshot])
      .mockResolvedValueOnce([initialSnapshot]);

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      "Follow us on https://linkedin.com/company/acme and https://twitter.com/acme",
    );

    expect(result).not.toBeNull();
    expect(result!.updatedFields).toEqual([]);
    expect(result!.remainingMissing).toContain("website");
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(pipeline.startPipeline).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. Pipeline start returns false (e.g. missing fields error from pipeline)
  // -------------------------------------------------------------------------
  it("reports pipelineStarted: false when pipeline throws missing fields error", async () => {
    const snapshot = makeSnapshot();

    mockDb.limit
      .mockResolvedValueOnce([snapshot])
      .mockResolvedValueOnce([snapshot])
      // Third call is inside startPipelineIfReady's fallback load
      .mockResolvedValueOnce([snapshot]);

    pipeline.startPipeline.mockRejectedValueOnce(
      new Error(`${PIPELINE_MISSING_FIELDS_ERROR_PREFIX} [website]`),
    );

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      "Just a message with no useful info.",
    );

    expect(result).not.toBeNull();
    expect(result!.pipelineStarted).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 9. Uses fallbackUserId when provided (startup userId is not used for pipeline)
  // -------------------------------------------------------------------------
  it("passes fallbackUserId to pipeline when provided", async () => {
    const snapshot = makeSnapshot({ userId: "user-1" });
    mockDb.limit
      .mockResolvedValueOnce([snapshot])
      .mockResolvedValueOnce([snapshot]);

    await service.resolveMissingInfoFromReply(
      "startup-1",
      "Just a check-in.",
      "override-user-id",
    );

    expect(pipeline.startPipeline).toHaveBeenCalledWith(
      "startup-1",
      "override-user-id",
    );
  });

  // -------------------------------------------------------------------------
  // 10. Null messageText — no extraction attempted, no DB write
  // -------------------------------------------------------------------------
  it("handles null messageText without crashing and returns empty updatedFields", async () => {
    const initialSnapshot = makeMissingWebsiteSnapshot();
    mockDb.limit
      .mockResolvedValueOnce([initialSnapshot])
      .mockResolvedValueOnce([initialSnapshot]);

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      null,
    );

    expect(result).not.toBeNull();
    expect(result!.updatedFields).toEqual([]);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 11. Returns null when refreshed snapshot is missing after update
  // -------------------------------------------------------------------------
  it("returns null when refreshed snapshot cannot be loaded after update", async () => {
    const initialSnapshot = makeMissingWebsiteSnapshot();

    mockDb.limit
      .mockResolvedValueOnce([initialSnapshot])  // first load succeeds
      .mockResolvedValueOnce([]);                // refresh returns nothing

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      "Our site is https://acme.com",
    );

    expect(result).toBeNull();
    expect(pipeline.startPipeline).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 12. startupName in resolution comes from refreshed snapshot, not initial
  // -------------------------------------------------------------------------
  it("uses the refreshed snapshot name in the resolution result", async () => {
    const initial = makeSnapshot({ name: "Old Name" });
    const refreshed = makeSnapshot({ name: "New Name" });

    mockDb.limit
      .mockResolvedValueOnce([initial])
      .mockResolvedValueOnce([refreshed]);

    const result = await service.resolveMissingInfoFromReply(
      "startup-1",
      "No URLs here.",
    );

    expect(result).not.toBeNull();
    expect(result!.startupName).toBe("New Name");
  });
});
