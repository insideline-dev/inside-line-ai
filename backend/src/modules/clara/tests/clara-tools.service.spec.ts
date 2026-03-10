import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ClaraToolsService } from "../clara-tools.service";

describe("ClaraToolsService", () => {
  let service: ClaraToolsService;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
  };
  let matchService: {
    findAll: jest.Mock;
    toggleSaved: jest.Mock;
    updateMatchStatus: jest.Mock;
  };
  let pipelineService: {
    getPipeline: jest.Mock;
  };
  let thesisService: {
    findOne: jest.Mock;
  };
  let noteService: {
    create: jest.Mock;
    update: jest.Mock;
    getAllNotes: jest.Mock;
  };
  let portfolioService: {
    getPortfolio: jest.Mock;
  };
  let claraChannel: Record<string, jest.Mock>;
  let pdfService: {
    generateMemo: jest.Mock;
    generateReport: jest.Mock;
  };
  let analyticsService: {
    getOverview: jest.Mock;
  };
  let startupService: {
    getProgress: jest.Mock;
    adminGetProgress: jest.Mock;
    reanalyze: jest.Mock;
  };

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };

    matchService = {
      findAll: jest.fn().mockResolvedValue({
        data: [],
      }),
      toggleSaved: jest.fn().mockResolvedValue({ startupId: "startup-1", isSaved: true }),
      updateMatchStatus: jest.fn().mockResolvedValue({ id: "match-1", status: "reviewing" }),
    };

    pipelineService = {
      getPipeline: jest.fn().mockResolvedValue({
        stats: { new: 1, reviewing: 0, engaged: 0, closed: 0, passed: 0 },
      }),
    };

    thesisService = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    noteService = {
      create: jest.fn().mockResolvedValue({ id: "note-1" }),
      update: jest.fn().mockResolvedValue({ id: "note-1", content: "Updated note" }),
      getAllNotes: jest.fn().mockResolvedValue([]),
    };

    portfolioService = {
      getPortfolio: jest.fn().mockResolvedValue([]),
    };

    claraChannel = {
      reply: jest.fn(),
      send: jest.fn(),
      getEmailMessage: jest.fn(),
    };

    pdfService = {
      generateMemo: jest.fn(),
      generateReport: jest.fn(),
    };

    analyticsService = {
      getOverview: jest.fn(),
    };

    startupService = {
      getProgress: jest.fn(),
      adminGetProgress: jest.fn(),
      reanalyze: jest.fn().mockResolvedValue({ id: "startup-1", status: "submitted" }),
    };

    service = new ClaraToolsService(
      { db: mockDb } as never,
      matchService as never,
      pipelineService as never,
      thesisService as never,
      noteService as never,
      portfolioService as never,
      claraChannel as never,
      pdfService as never,
      analyticsService as never,
      startupService as never,
    );
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
});
