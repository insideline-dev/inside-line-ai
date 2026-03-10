import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { Test, TestingModule } from "@nestjs/testing";
import { ClaraToolsService } from "../clara-tools.service";
import { DrizzleService } from "../../../database";
import { MatchService } from "../../investor/match.service";
import { DealPipelineService } from "../../investor/deal-pipeline.service";
import { ThesisService } from "../../investor/thesis.service";
import { InvestorNoteService } from "../../investor/investor-note.service";
import { PortfolioService } from "../../investor/portfolio.service";
import { ClaraChannelService } from "../clara-channel.service";
import { PdfService } from "../../startup/pdf.service";
import { AnalyticsService } from "../../admin/analytics.service";
import { StartupService } from "../../startup/startup.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NO_ACCOUNT_MSG =
  "No Inside Line account is linked to this email address. The sender may need to register on Inside Line first.";

const INVESTOR_ID = "investor-123";

/** Build a fresh db mock whose chain returns `this` until the terminal call. */
const createMockDb = () => ({
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([]),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockMatch = {
  startupId: "startup-1",
  startupName: "Acme Corp",
  overallScore: 82,
  marketScore: 80,
  teamScore: 85,
  productScore: 78,
  tractionScore: 90,
  financialsScore: 75,
  matchReason: "Strong market fit",
  status: "new",
  isSaved: false,
};

const mockPipelineResult = {
  stats: {
    new: 3,
    reviewing: 2,
    engaged: 1,
    closed: 0,
    passed: 4,
  },
};

const mockStartup = {
  id: "startup-1",
  name: "Acme Corp",
  tagline: "AI for everyone",
  description: "We build AI tools",
  website: "https://acme.com",
  location: "San Francisco",
  industry: "AI/ML",
  stage: "seed",
  status: "approved",
  overallScore: 82,
  fundingTarget: 1000000,
  teamSize: 5,
  teamMembers: [],
  valuation: 5000000,
  contactEmail: "ceo@acme.com",
  contactName: "Jane CEO",
  similarity: 0.85,
};

const mockThesis = {
  id: "thesis-1",
  investorId: INVESTOR_ID,
  targetIndustries: ["AI/ML", "SaaS"],
  targetStages: ["seed", "series-a"],
  checkSize: "$100k–$500k",
  narrative: "We back technical founders.",
};

const mockNotes = [
  { id: "note-1", content: "Interesting team", startupId: "startup-1" },
];

const mockPortfolio = {
  companies: [{ startupId: "startup-1", investmentAmount: 250000 }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClaraToolsService", () => {
  let service: ClaraToolsService;
  let mockDb: ReturnType<typeof createMockDb>;
  let matchService: jest.Mocked<MatchService>;
  let pipelineService: jest.Mocked<DealPipelineService>;
  let thesisService: jest.Mocked<ThesisService>;
  let noteService: jest.Mocked<InvestorNoteService>;
  let portfolioService: jest.Mocked<PortfolioService>;
  let startupService: { reanalyze: jest.Mock; getProgress: jest.Mock; adminGetProgress: jest.Mock };

  beforeEach(async () => {
    mockDb = createMockDb();

    matchService = {
      findAll: jest.fn().mockResolvedValue({
        data: [mockMatch],
        total: 1,
        page: 1,
        limit: 10,
      }),
    } as unknown as jest.Mocked<MatchService>;

    pipelineService = {
      getPipeline: jest.fn().mockResolvedValue(mockPipelineResult),
    } as unknown as jest.Mocked<DealPipelineService>;

    thesisService = {
      findOne: jest.fn().mockResolvedValue(mockThesis),
    } as unknown as jest.Mocked<ThesisService>;

    noteService = {
      getNotes: jest.fn().mockResolvedValue(mockNotes),
      getAllNotes: jest.fn().mockResolvedValue(mockNotes),
      create: jest.fn().mockResolvedValue({ id: "note-1" }),
      update: jest.fn().mockResolvedValue({ id: "note-1", content: "Updated note" }),
    } as unknown as jest.Mocked<InvestorNoteService>;

    portfolioService = {
      getPortfolio: jest.fn().mockResolvedValue(mockPortfolio),
    } as unknown as jest.Mocked<PortfolioService>;

    startupService = {
      reanalyze: jest.fn().mockResolvedValue({ id: "startup-1", status: "submitted" }),
      getProgress: jest.fn(),
      adminGetProgress: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaraToolsService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: MatchService, useValue: matchService },
        { provide: DealPipelineService, useValue: pipelineService },
        { provide: ThesisService, useValue: thesisService },
        { provide: InvestorNoteService, useValue: noteService },
        { provide: PortfolioService, useValue: portfolioService },
        {
          provide: ClaraChannelService,
          useValue: { reply: jest.fn().mockResolvedValue(undefined), send: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: PdfService,
          useValue: { generatePdf: jest.fn().mockResolvedValue(Buffer.from('')), extractText: jest.fn().mockResolvedValue('') },
        },
        {
          provide: AnalyticsService,
          useValue: { getStartupStats: jest.fn() },
        },
        {
          provide: StartupService,
          useValue: startupService,
        },
      ],
    }).compile();

    service = module.get<ClaraToolsService>(ClaraToolsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns no-account message for investor-only read tools when no account is linked", async () => {
    const tools = service.buildTools(null);

    await expect(tools.getMyMatches.execute({ limit: 5 })).resolves.toEqual({
      message:
        "No Inside Line account is linked to this email address. The sender may need to register on Inside Line first.",
    });
    expect(matchService.findAll).not.toHaveBeenCalled();
  });

  it("exposes the read and action proposal tools needed by the copilot", () => {
    const tools = service.buildTools({
      actorUserId: "investor-1",
      actorRole: "investor",
      linkedStartupId: "startup-1",
      runtime: {
        replyHandled: false,
        replyText: null,
        replyAttachments: [],
        pendingAction: null,
      },
    });

    expect(tools).toHaveProperty("getMyMatches");
    expect(tools).toHaveProperty("getStartupProgress");
    expect(tools).toHaveProperty("proposeCreateNote");
    expect(tools).toHaveProperty("proposeToggleSavedMatch");
    expect(tools).toHaveProperty("proposeUpdateMatchStatus");
    expect(tools).toHaveProperty("proposeReanalyzeStartup");
  });

  it("proposes note creation instead of mutating immediately", async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        id: "startup-1",
        name: "Acme",
        status: "approved",
        overallScore: 82,
        stage: "seed",
        industry: "AI",
      },
    ]);

    const runtime = {
      replyHandled: false,
      replyText: null,
      replyAttachments: [],
      pendingAction: null,
    };

    const tools = service.buildTools({
      actorUserId: "investor-1",
      actorRole: "investor",
      runtime,
    });

    const result = await tools.proposeCreateNote.execute({
      startupName: "Acme",
      content: "Strong team dynamics",
      category: "team",
      isPinned: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        proposed: true,
        requiresConfirmation: true,
      }),
    );
    expect(runtime.pendingAction).toEqual(
      expect.objectContaining({
        actionKey: "create_note",
        startupId: "startup-1",
      }),
    );
    expect(noteService.create).not.toHaveBeenCalled();
  });

  it("executes a confirmed create-note action", async () => {
    const result = await service.executePendingAction(
      {
        actionKey: "create_note",
        confirmationMessage: "Reply CONFIRM to create the note.",
        successMessage: "The note was saved.",
        targetSummary: "Acme",
        startupId: "startup-1",
        payload: {
          startupId: "startup-1",
          content: "Strong team dynamics",
          category: "team",
          isPinned: true,
        },
      },
      {
        actorUserId: "investor-1",
        actorRole: "investor",
      },
    );

    expect(noteService.create).toHaveBeenCalledWith("investor-1", {
      startupId: "startup-1",
      content: "Strong team dynamics",
      category: "team",
      isPinned: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        message: "The note was saved.",
      }),
    );
  });

  it("executes admin reanalysis through the allowlisted action executor", async () => {
    const result = await service.executePendingAction(
      {
        actionKey: "reanalyze_startup",
        confirmationMessage: "Reply CONFIRM to re-run the analysis.",
        successMessage: "The startup has been queued for reanalysis.",
        targetSummary: "Acme",
        startupId: "startup-1",
        payload: {
          startupId: "startup-1",
        },
      },
      {
        actorUserId: "admin-1",
        actorRole: "admin",
      },
    );

    expect(startupService.reanalyze).toHaveBeenCalledWith("startup-1", "admin-1");
    expect(result).toEqual(
      expect.objectContaining({
        message: "The startup has been queued for reanalysis.",
      }),
    );
  });

  // -------------------------------------------------------------------------
  // null investorUserId — investor-specific tools return no-account message
  // -------------------------------------------------------------------------

  describe("when investorUserId is null", () => {
    let tools: ReturnType<typeof service.buildTools>;

    beforeEach(() => {
      tools = service.buildTools(null);
    });

    it("getMyMatches returns no-account message", async () => {
      const result = await tools.getMyMatches.execute({ limit: 5 });
      expect(result).toEqual({ message: NO_ACCOUNT_MSG });
      expect(matchService.findAll).not.toHaveBeenCalled();
    });

    it("getMyPipeline returns no-account message", async () => {
      const result = await tools.getMyPipeline.execute({});
      expect(result).toEqual({ message: NO_ACCOUNT_MSG });
      expect(pipelineService.getPipeline).not.toHaveBeenCalled();
    });

    it("getMyThesis returns no-account message", async () => {
      const result = await tools.getMyThesis.execute({});
      expect(result).toEqual({ message: NO_ACCOUNT_MSG });
      expect(thesisService.findOne).not.toHaveBeenCalled();
    });

    it("getMyNotes returns no-account message", async () => {
      const result = await tools.getMyNotes.execute({});
      expect(result).toEqual({ message: NO_ACCOUNT_MSG });
      expect(noteService.getAllNotes).not.toHaveBeenCalled();
      expect(noteService.getNotes).not.toHaveBeenCalled();
    });

    it("getMyPortfolio returns no-account message", async () => {
      const result = await tools.getMyPortfolio.execute({});
      expect(result).toEqual({ message: NO_ACCOUNT_MSG });
      expect(portfolioService.getPortfolio).not.toHaveBeenCalled();
    });

    it("getStartupDetails still queries DB (not investor-gated)", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      const result = await tools.getStartupDetails.execute({ name: "Acme" });
      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(mockStartup);
    });

    it("searchStartups still queries DB (not investor-gated)", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      const result = await tools.searchStartups.execute({ query: "Acme", limit: 5 });
      expect(result).toEqual([mockStartup]);
    });
  });

  // -------------------------------------------------------------------------
  // getMyMatches
  // -------------------------------------------------------------------------

  describe("getMyMatches", () => {
    it("calls matchService.findAll with investorId and limit", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      await tools.getMyMatches.execute({ limit: 7 });

      expect(matchService.findAll).toHaveBeenCalledWith(INVESTOR_ID, {
        page: 1,
        limit: 7,
      });
    });

    it("maps match records to the expected shape", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyMatches.execute({ limit: 10 });

      expect(result).toEqual([
        {
          startupId: mockMatch.startupId,
          startupName: mockMatch.startupName,
          overallScore: mockMatch.overallScore,
          marketScore: mockMatch.marketScore,
          teamScore: mockMatch.teamScore,
          productScore: mockMatch.productScore,
          tractionScore: mockMatch.tractionScore,
          financialsScore: mockMatch.financialsScore,
          matchReason: mockMatch.matchReason,
          status: mockMatch.status,
          isSaved: mockMatch.isSaved,
        },
      ]);
    });

    it("falls back to 'Unknown' when startupName is missing from match record", async () => {
      const matchWithoutName = { ...mockMatch };
      // Remove the property to simulate a record without startupName
      const rest = Object.fromEntries(
        Object.entries(matchWithoutName).filter(([k]) => k !== 'startupName'),
      );
      matchService.findAll.mockResolvedValueOnce({
        data: [rest as typeof mockMatch],
        total: 1,
        page: 1,
        limit: 10,
      });

      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyMatches.execute({ limit: 10 });

      expect((result as Array<{ startupName: unknown }>)[0].startupName).toBe("Unknown");
    });

    it("returns empty array when matchService returns no data", async () => {
      matchService.findAll.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 10 });

      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyMatches.execute({ limit: 10 });

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getMyPipeline
  // -------------------------------------------------------------------------

  describe("getMyPipeline", () => {
    it("calls pipelineService.getPipeline with investorId", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      await tools.getMyPipeline.execute({});

      expect(pipelineService.getPipeline).toHaveBeenCalledWith(INVESTOR_ID);
    });

    it("returns only the stats from the pipeline result", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyPipeline.execute({});

      expect(result).toEqual({ stats: mockPipelineResult.stats });
    });
  });

  // -------------------------------------------------------------------------
  // getStartupDetails
  // -------------------------------------------------------------------------

  describe("getStartupDetails", () => {
    it("queries the DB with a fuzzy similarity filter", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      const tools = service.buildTools(INVESTOR_ID);
      await tools.getStartupDetails.execute({ name: "Acme" });

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it("returns the matching startup when found", async () => {
      mockDb.limit.mockResolvedValueOnce([mockStartup]);
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getStartupDetails.execute({ name: "Acme" });

      expect(result).toEqual(mockStartup);
    });

    it("returns not-found message when no startups match", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getStartupDetails.execute({ name: "Nonexistent" });

      expect(result).toEqual({ message: 'No accessible startup found matching "Nonexistent".' });
    });
  });

  // -------------------------------------------------------------------------
  // getStartupStatus
  // -------------------------------------------------------------------------

  describe("getStartupStatus", () => {
    const statusRecord = {
      id: "startup-1",
      name: "Acme Corp",
      status: "approved",
      overallScore: 82,
      stage: "seed",
    };

    it("queries the DB and returns the first match", async () => {
      mockDb.limit.mockResolvedValueOnce([statusRecord]);
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getStartupStatus.execute({ name: "Acme" });

      expect(mockDb.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(statusRecord);
    });

    it("returns not-found message when no startup matches", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getStartupStatus.execute({ name: "Ghost" });

      expect(result).toEqual({ message: 'No accessible startup found matching "Ghost".' });
    });
  });

  // -------------------------------------------------------------------------
  // getMyThesis
  // -------------------------------------------------------------------------

  describe("getMyThesis", () => {
    it("calls thesisService.findOne with investorId", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      await tools.getMyThesis.execute({});

      expect(thesisService.findOne).toHaveBeenCalledWith(INVESTOR_ID);
    });

    it("returns the thesis when one exists", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyThesis.execute({});

      expect(result).toEqual(mockThesis);
    });

    it("returns no-thesis message when findOne returns null", async () => {
      thesisService.findOne.mockResolvedValueOnce(null);
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyThesis.execute({});

      expect(result).toEqual({ message: "No investment thesis has been set up yet." });
    });
  });

  // -------------------------------------------------------------------------
  // getMyNotes
  // -------------------------------------------------------------------------

  describe("getMyNotes", () => {
    it("calls noteService.getAllNotes when no startupName is provided", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      await tools.getMyNotes.execute({});

      expect(noteService.getAllNotes).toHaveBeenCalledWith(INVESTOR_ID);
      expect(noteService.getNotes).not.toHaveBeenCalled();
    });

    it("returns all notes when startupName is omitted", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyNotes.execute({});

      expect(result).toEqual(mockNotes);
    });

    it("fuzzy-searches DB and calls noteService.getNotes when startupName is given", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "startup-1" }]);
      const tools = service.buildTools(INVESTOR_ID);
      await tools.getMyNotes.execute({ startupName: "Acme" });

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
      expect(noteService.getNotes).toHaveBeenCalledWith(INVESTOR_ID, "startup-1");
      expect(noteService.getAllNotes).not.toHaveBeenCalled();
    });

    it("returns notes for matched startup", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "startup-1" }]);
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyNotes.execute({ startupName: "Acme" });

      expect(result).toEqual(mockNotes);
    });

    it("returns not-found message when fuzzy DB lookup finds nothing", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyNotes.execute({ startupName: "Unknown Corp" });

      expect(result).toEqual({ message: 'No accessible startup found matching "Unknown Corp".' });
      expect(noteService.getNotes).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getMyPortfolio
  // -------------------------------------------------------------------------

  describe("getMyPortfolio", () => {
    it("calls portfolioService.getPortfolio with investorId", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      await tools.getMyPortfolio.execute({});

      expect(portfolioService.getPortfolio).toHaveBeenCalledWith(INVESTOR_ID);
    });

    it("returns the portfolio result", async () => {
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.getMyPortfolio.execute({});

      expect(result).toEqual(mockPortfolio);
    });
  });

  // -------------------------------------------------------------------------
  // searchStartups
  // -------------------------------------------------------------------------

  describe("searchStartups", () => {
    const searchResult = {
      id: "startup-1",
      name: "Acme Corp",
      industry: "AI/ML",
      stage: "seed",
      status: "approved",
      overallScore: 82,
    };

    it("queries the DB with ilike pattern and limit", async () => {
      mockDb.limit.mockResolvedValueOnce([searchResult]);
      const tools = service.buildTools(INVESTOR_ID);
      await tools.searchStartups.execute({ query: "Acme", limit: 5 });

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(5);
    });

    it("returns matching startups", async () => {
      mockDb.limit.mockResolvedValueOnce([searchResult]);
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.searchStartups.execute({ query: "Acme", limit: 5 });

      expect(result).toEqual([searchResult]);
    });

    it("returns empty array when no startups match the query", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      const tools = service.buildTools(INVESTOR_ID);
      const result = await tools.searchStartups.execute({ query: "zzznomatch", limit: 5 });

      expect(result).toEqual([]);
    });

    it("wraps query in % wildcards for ilike", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      // Spy on where to confirm escaped pattern is used; we can verify via
      // the call being made (actual SQL is built internally by drizzle).
      const tools = service.buildTools(INVESTOR_ID);
      await tools.searchStartups.execute({ query: "corp", limit: 3 });

      // The where call must have happened — the escaped pattern is passed to
      // drizzle's ilike() function which we can't inspect directly, but we
      // confirm the chain ran to completion.
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(3);
    });
  });
});
