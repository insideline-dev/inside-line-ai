import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

const generateTextMock = jest.fn();
mock.module("ai", () => ({
  generateText: generateTextMock,
}));

import { ThesisService } from "../thesis.service";
import type { DrizzleService } from "../../../database";
import type { StartupMatchingPipelineService } from "../../ai/services/startup-matching-pipeline.service";
import type { AiProviderService } from "../../ai/providers/ai-provider.service";

const mockUserId = "investor-user-123";

const mockThesis = {
  id: "thesis-id-456",
  userId: mockUserId,
  industries: ["fintech"],
  stages: ["seed"],
  checkSizeMin: 100000,
  checkSizeMax: 500000,
  geographicFocus: ["North America"],
  geographicFocusNodes: ["l1:north_america"],
  mustHaveFeatures: ["AI/ML"],
  dealBreakers: ["crypto"],
  notes: "Test thesis",
  thesisNarrative: "Focus on early stage B2B fintech",
  isActive: true,
  thesisSummary: null,
  thesisSummaryGeneratedAt: null,
  businessModels: null,
  antiPortfolio: null,
  checkSizeRangeLabel: null,
  fundSize: null,
  minStartupScore: null,
  minThesisFitScore: null,
  coInvestmentPreference: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const approvedStartups = [
  { id: "startup-approved-1" },
  { id: "startup-approved-2" },
  { id: "startup-approved-3" },
];

describe("ThesisService - re-matching after thesis update", () => {
  let service: ThesisService;
  let mockDb: ReturnType<typeof createMockDb>;
  let startupMatchingService: jest.Mocked<StartupMatchingPipelineService>;
  let aiProvidersService: jest.Mocked<AiProviderService>;

  const createMockDb = () => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    generateTextMock.mockReset();
    mockDb = createMockDb();

    startupMatchingService = {
      queueStartupMatching: jest.fn().mockResolvedValue({
        startupId: "x",
        analysisJobId: "job-1",
        queueJobId: "q-1",
        status: "queued",
        triggerSource: "thesis_update",
      }),
    } as unknown as jest.Mocked<StartupMatchingPipelineService>;

    const resolvedModel = { provider: "openai" };
    aiProvidersService = {
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
      getOpenAi: jest.fn().mockReturnValue(() => resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    const drizzle = {
      db: mockDb,
      withRLS: jest.fn((userId: string, cb: (db: typeof mockDb) => unknown) => cb(mockDb)),
    } as unknown as DrizzleService;

    service = new ThesisService(drizzle, startupMatchingService, aiProvidersService);
  });

  it("triggers re-matching for approved startups when thesis is updated", async () => {
    generateTextMock.mockResolvedValue({ text: "AI-generated thesis summary" });

    // Create a fresh db mock with proper chaining for this test
    const withRlsDb = {
      select: jest.fn(),
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn(),
      update: jest.fn(),
      set: jest.fn(),
      returning: jest.fn(),
      insert: jest.fn(),
      values: jest.fn(),
      delete: jest.fn(),
    };
    // Chain select().from().where().limit() → returns existing thesis
    withRlsDb.select.mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([mockThesis]) }) }) });
    // Chain update().set().where().returning() → returns updated thesis
    withRlsDb.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ ...mockThesis, notes: "Updated" }]) }) }) });

    // The outer drizzle.db (used for approved startups query, outside withRLS)
    const outerDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(approvedStartups),
        }),
      }),
    };

    const drizzle = {
      db: outerDb,
      withRLS: jest.fn((_userId: string, cb: (db: typeof withRlsDb) => unknown) => cb(withRlsDb)),
    } as unknown as DrizzleService;

    service = new ThesisService(drizzle, startupMatchingService, aiProvidersService);

    await service.upsert(mockUserId, { notes: "Updated" });

    // Give time for the async fire-and-forget rematching to complete
    await new Promise((r) => setTimeout(r, 100));

    expect(startupMatchingService.queueStartupMatching).toHaveBeenCalledTimes(
      approvedStartups.length,
    );
    expect(startupMatchingService.queueStartupMatching).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerSource: "thesis_update",
        requestedBy: mockUserId,
      }),
    );
  });

  it("does NOT trigger re-matching when thesis is newly created", async () => {
    const simpleMockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]), // no existing thesis
          }),
        }),
      }),
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockThesis]),
        }),
      }),
      values: jest.fn(),
      returning: jest.fn().mockResolvedValue([mockThesis]),
      update: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };

    const drizzle = {
      db: simpleMockDb,
      withRLS: jest.fn((_userId: string, cb: (db: typeof simpleMockDb) => unknown) => cb(simpleMockDb)),
    } as unknown as DrizzleService;
    service = new ThesisService(drizzle, startupMatchingService, aiProvidersService);

    generateTextMock.mockResolvedValue({ text: "AI-generated thesis summary" });

    await service.upsert(mockUserId, { notes: "New thesis" });

    await new Promise((r) => setTimeout(r, 50));

    // No re-matching on creation
    expect(startupMatchingService.queueStartupMatching).not.toHaveBeenCalled();
  });
});

describe("ThesisService - AI summary generation", () => {
  let service: ThesisService;
  let aiProvidersService: jest.Mocked<AiProviderService>;

  beforeEach(() => {
    generateTextMock.mockReset();

    const resolvedModel = { provider: "openai" };
    aiProvidersService = {
      resolveModelForPurpose: jest.fn().mockReturnValue(resolvedModel),
      getOpenAi: jest.fn().mockReturnValue(() => resolvedModel),
    } as unknown as jest.Mocked<AiProviderService>;

    const simpleMockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            ...mockThesis,
            thesisSummary: "AI-generated thesis summary",
          }]),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockThesis]),
          }),
        }),
      }),
    };

    const drizzle = {
      db: simpleMockDb,
      withRLS: jest.fn((_userId: string, cb: (db: typeof simpleMockDb) => unknown) => cb(simpleMockDb)),
    } as unknown as DrizzleService;

    service = new ThesisService(drizzle, undefined, aiProvidersService);
  });

  it("uses AI to generate thesis summary", async () => {
    generateTextMock.mockResolvedValue({ text: "AI-generated thesis summary" });

    await service.upsert(mockUserId, {
      industries: ["fintech"],
      stages: ["seed"],
      thesisNarrative: "Focus on early stage B2B",
    });

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Generate a concise, professional investment thesis summary"),
      }),
    );
  });

  it("falls back to rule-based summary when AI fails", async () => {
    generateTextMock.mockRejectedValue(new Error("AI unavailable"));

    const result = await service.upsert(mockUserId, {
      industries: ["fintech"],
      stages: ["seed"],
      thesisNarrative: "Focus on early stage B2B",
    });

    // Should not throw — fallback generates a string
    expect(result).toBeDefined();
  });
});
