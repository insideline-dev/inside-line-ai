import { Test, TestingModule } from "@nestjs/testing";
import { DrizzleService } from "../../../../database";
import { TaskProcessor } from "../../../../queue/processors/task.processor";
import { NotificationGateway } from "../../../../notification/notification.gateway";
import { AiPromptService } from "../../../ai/services/ai-prompt.service";
import { AiModelExecutionService } from "../../../ai/services/ai-model-execution.service";
import { WebsiteScraperService } from "../../../ai/services/website-scraper.service";
import { MatchService } from "../../match.service";
import { InvestorOnboardingProcessor } from "../investor-onboarding.processor";

describe("InvestorOnboardingProcessor", () => {
  let processor: InvestorOnboardingProcessor;
  const userId = "22222222-2222-2222-2222-222222222222";
  const website = "https://fund.example/";

  const llmDraft = {
    thesisSummary: "We invest in pre-seed B2B SaaS focused on developer productivity in NA/EU.",
    portfolioCompanies: [
      { name: "Foo Inc", description: "Cool dev tool", websiteUrl: "https://foo.example" },
      { name: "Bar Co", description: "AI for ops" },
    ],
  };

  const scraped = {
    url: website,
    title: "Fund",
    description: "We back devtools",
    fullText: "We back developer tools across NA and EU.",
    headings: [],
    subpages: [
      { url: "https://fund.example/portfolio", title: "Portfolio", content: "Foo Inc — cool dev tool. Bar Co — AI for ops." },
      { url: "https://fund.example/about", title: "About", content: "Founded 2019." },
    ],
    links: [],
    teamBios: [],
    customerLogos: [],
    testimonials: [],
    metadata: {
      scrapedAt: new Date().toISOString(),
      pageCount: 3,
      hasAboutPage: true,
      hasTeamPage: false,
      hasPricingPage: false,
      logoUrl: "https://fund.example/favicon.ico",
    },
  };

  let scraperMock: { deepScrape: jest.Mock };
  let modelExecMock: { resolveForPrompt: jest.Mock; generateText: jest.Mock };
  let promptMock: { resolve: jest.Mock; renderTemplate: jest.Mock };
  let notificationsMock: { sendInvestorEvent: jest.Mock };
  let matchMock: { regenerateMatches: jest.Mock };
  let drizzleMock: { withRLS: jest.Mock };
  let taskProcessorMock: { registerHandler: jest.Mock };

  // capture last update payload + select responses
  let dbState: {
    updateSet: jest.Mock;
    updateWhere: jest.Mock;
    selectLimit: jest.Mock;
  };

  beforeEach(async () => {
    scraperMock = { deepScrape: jest.fn().mockResolvedValue(scraped) };
    promptMock = {
      resolve: jest.fn().mockResolvedValue({
        systemPrompt: "sys",
        userPrompt: "Homepage:\n{{websiteText}}",
      }),
      renderTemplate: jest.fn().mockReturnValue("rendered"),
    };
    modelExecMock = {
      resolveForPrompt: jest.fn().mockResolvedValue({
        generateTextOptions: { model: "test-model" },
      }),
      generateText: jest.fn().mockResolvedValue({
        text: JSON.stringify(llmDraft),
        experimental_output: llmDraft,
        output: undefined,
      }),
    };
    notificationsMock = { sendInvestorEvent: jest.fn() };
    matchMock = { regenerateMatches: jest.fn().mockResolvedValue({ queued: 0 }) };
    taskProcessorMock = { registerHandler: jest.fn() };

    const updateSet = jest.fn().mockReturnThis();
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const selectLimit = jest.fn().mockResolvedValue([{ userId, logoUrl: null }]);
    dbState = { updateSet, updateWhere, selectLimit };

    const fakeDb = {
      update: jest.fn().mockReturnValue({
        set: updateSet,
        where: updateWhere,
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: selectLimit,
      }),
    };
    // chain: update().set().where()
    updateSet.mockReturnValue({ where: updateWhere });

    drizzleMock = {
      withRLS: jest.fn(async (_u: string, cb: (db: typeof fakeDb) => Promise<unknown>) => cb(fakeDb)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestorOnboardingProcessor,
        { provide: TaskProcessor, useValue: taskProcessorMock },
        { provide: DrizzleService, useValue: drizzleMock },
        { provide: WebsiteScraperService, useValue: scraperMock },
        { provide: AiModelExecutionService, useValue: modelExecMock },
        { provide: AiPromptService, useValue: promptMock },
        { provide: NotificationGateway, useValue: notificationsMock },
        { provide: MatchService, useValue: matchMock },
      ],
    }).compile();

    processor = module.get(InvestorOnboardingProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("registers a TASK handler on init", () => {
    processor.onModuleInit();
    expect(taskProcessorMock.registerHandler).toHaveBeenCalledTimes(1);
    expect(taskProcessorMock.registerHandler.mock.calls[0][0]).toBe(
      "investor.onboarding.scrape",
    );
  });

  it("scrapes, calls LLM, persists thesis summary + portfolio + favicon, regenerates matches, emits completed", async () => {
    await processor.runScrape({ userId, website });

    expect(scraperMock.deepScrape).toHaveBeenCalledWith(website, {
      manualPaths: [
        "/portfolio",
        "/companies",
        "/investments",
        "/our-companies",
        "/our-portfolio",
      ],
    });

    expect(modelExecMock.generateText).toHaveBeenCalledTimes(1);

    // First update: investor_theses with thesis fields
    const thesisUpdate = dbState.updateSet.mock.calls[0][0];
    expect(thesisUpdate.thesisSummary).toBe(llmDraft.thesisSummary);
    expect(thesisUpdate.portfolioCompanies).toEqual(llmDraft.portfolioCompanies);
    expect(thesisUpdate.thesisSummaryGeneratedAt).toBeInstanceOf(Date);
    expect(thesisUpdate.portfolioGeneratedAt).toBeInstanceOf(Date);

    // Second update: investor_profiles favicon (since logoUrl was null)
    const profileUpdate = dbState.updateSet.mock.calls[1][0];
    expect(profileUpdate.logoUrl).toBe(scraped.metadata.logoUrl);

    expect(matchMock.regenerateMatches).toHaveBeenCalledWith(userId);

    expect(notificationsMock.sendInvestorEvent).toHaveBeenCalledWith(
      userId,
      "investor.onboarding.completed",
      expect.objectContaining({
        userId,
        website,
        portfolioCount: llmDraft.portfolioCompanies.length,
      }),
    );
  });

  it("does not overwrite favicon when investor profile already has one", async () => {
    dbState.selectLimit.mockResolvedValue([
      { userId, logoUrl: "https://existing.example/logo.png" },
    ]);

    await processor.runScrape({ userId, website });

    // Only the thesis update should happen — no second profile update.
    expect(dbState.updateSet).toHaveBeenCalledTimes(1);
  });

  it("emits failed event and rethrows when LLM throws — leaves thesis intact", async () => {
    modelExecMock.generateText.mockRejectedValueOnce(new Error("model exploded"));

    await expect(processor.runScrape({ userId, website })).rejects.toThrow(
      "model exploded",
    );

    expect(dbState.updateSet).not.toHaveBeenCalled();
    expect(matchMock.regenerateMatches).not.toHaveBeenCalled();
    expect(notificationsMock.sendInvestorEvent).toHaveBeenCalledWith(
      userId,
      "investor.onboarding.failed",
      expect.objectContaining({ userId, website, error: "model exploded" }),
    );
  });
});
