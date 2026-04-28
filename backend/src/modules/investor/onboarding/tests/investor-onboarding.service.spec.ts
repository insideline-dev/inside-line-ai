import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { DrizzleService } from "../../../../database";
import { QueueService } from "../../../../queue/queue.service";
import { QUEUE_NAMES } from "../../../../queue/queue.config";
import { InvestorOnboardingService } from "../investor-onboarding.service";
import { INVESTOR_ONBOARDING_SCRAPE_JOB } from "../investor-onboarding.constants";

describe("InvestorOnboardingService", () => {
  let service: InvestorOnboardingService;
  const mockUserId = "11111111-1111-1111-1111-111111111111";

  const createMockDb = () => {
    const select = jest.fn();
    const insert = jest.fn();
    const update = jest.fn();

    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
    };
    select.mockReturnValue(selectChain);

    const insertChain = {
      values: jest.fn().mockResolvedValue(undefined),
    };
    insert.mockReturnValue(insertChain);

    const updateChain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    };
    update.mockReturnValue(updateChain);

    return { select, selectChain, insert, insertChain, update, updateChain };
  };

  let mockDb: ReturnType<typeof createMockDb>;
  let queueAdd: jest.Mock;

  beforeEach(async () => {
    mockDb = createMockDb();
    queueAdd = jest.fn().mockResolvedValue({ id: "job-1" });

    const queueServiceMock = {
      getQueue: jest.fn().mockReturnValue({ add: queueAdd }),
    };

    const drizzleMock = {
      withRLS: jest.fn(async (_userId: string, cb: (db: typeof mockDb) => Promise<unknown>) => cb(mockDb)),
    };

    // First .limit() call: thesis lookup. Second: profile lookup.
    mockDb.selectChain.limit
      .mockResolvedValueOnce([]) // thesis missing
      .mockResolvedValueOnce([]); // profile missing

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestorOnboardingService,
        { provide: DrizzleService, useValue: drizzleMock },
        { provide: QueueService, useValue: queueServiceMock },
      ],
    }).compile();

    service = module.get(InvestorOnboardingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("submitWebsite", () => {
    it("normalizes URL without scheme to https://", async () => {
      const result = await service.submitWebsite(mockUserId, {
        website: "sequoiacap.com",
      });

      expect(result.website).toBe("https://sequoiacap.com/");
      expect(result.status).toBe("queued");
    });

    it("accepts URL with explicit https:// scheme", async () => {
      const result = await service.submitWebsite(mockUserId, {
        website: "https://example.fund/",
      });

      expect(result.website).toBe("https://example.fund/");
    });

    it("rejects garbage that cannot be parsed as a URL", async () => {
      await expect(
        service.submitWebsite(mockUserId, { website: "not a url with spaces" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects hostnames without a TLD", async () => {
      await expect(
        service.submitWebsite(mockUserId, { website: "localhost" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("inserts a thesis row and enqueues a TASK job when none exists", async () => {
      await service.submitWebsite(mockUserId, { website: "example.com" });

      expect(mockDb.insertChain.values).toHaveBeenCalledTimes(1);
      const insertedRow = mockDb.insertChain.values.mock.calls[0][0];
      expect(insertedRow.userId).toBe(mockUserId);
      expect(insertedRow.website).toBe("https://example.com/");
      expect(insertedRow.websiteScrapedAt).toBeInstanceOf(Date);

      expect(queueAdd).toHaveBeenCalledTimes(1);
      const [jobName, jobData, jobOpts] = queueAdd.mock.calls[0];
      expect(jobName).toBe(INVESTOR_ONBOARDING_SCRAPE_JOB);
      expect(jobData.userId).toBe(mockUserId);
      expect(jobData.payload.website).toBe("https://example.com/");
      expect(jobOpts.attempts).toBe(2);
    });

    it("updates the existing thesis row on resubmit (idempotent)", async () => {
      // Override default first-call: thesis already exists.
      mockDb.selectChain.limit
        .mockReset()
        .mockResolvedValueOnce([
          { userId: mockUserId, website: "https://old.example.com/" },
        ])
        .mockResolvedValueOnce([{ userId: mockUserId, website: null, logoUrl: null }]);

      await service.submitWebsite(mockUserId, { website: "example.com" });

      expect(mockDb.insertChain.values).not.toHaveBeenCalled();
      expect(mockDb.updateChain.set).toHaveBeenCalled();
    });

    it("uses the configured TASK queue name", async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          InvestorOnboardingService,
          {
            provide: DrizzleService,
            useValue: {
              withRLS: jest.fn(async (_u: string, cb: (db: typeof mockDb) => Promise<unknown>) => cb(mockDb)),
            },
          },
          {
            provide: QueueService,
            useValue: { getQueue: jest.fn().mockReturnValue({ add: queueAdd }) },
          },
        ],
      }).compile();

      const queueService = moduleRef.get<QueueService>(QueueService);
      const localService = moduleRef.get(InvestorOnboardingService);

      mockDb.selectChain.limit
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await localService.submitWebsite(mockUserId, { website: "example.com" });
      expect(queueService.getQueue).toHaveBeenCalledWith(QUEUE_NAMES.TASK);
    });
  });
});
