import { beforeEach, describe, expect, it, jest } from "bun:test";
import { AiModelConfigService } from "../../services/ai-model-config.service";
import { ModelPurpose } from "../../interfaces/pipeline.interface";

describe("AiModelConfigService defaults", () => {
  let service: AiModelConfigService;

  beforeEach(() => {
    const drizzle = { db: {} };
    const aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("gpt-5.2"),
    };

    service = new AiModelConfigService(drizzle as never, aiConfig as never);
  });

  it("uses gemini + provider search as default for research keys", () => {
    const resolved = (
      service as unknown as {
        buildDefaultResolvedConfig: (
          key: string,
          stage: null,
          purpose: ModelPurpose,
        ) => {
          modelName: string;
          searchMode: string;
        };
      }
    ).buildDefaultResolvedConfig("research.market", null, ModelPurpose.RESEARCH);

    expect(resolved.modelName).toBe("gemini-3-flash-preview");
    expect(resolved.searchMode).toBe("provider_grounded_search");
  });

  it("allows o4-mini-deep-research for research keys with provider grounded search", () => {
    (
      service as unknown as {
        validateModelConfigForKey: (
          key: string,
          config: { modelName: string; searchMode: string },
        ) => void;
      }
    ).validateModelConfigForKey("research.market", {
      modelName: "o4-mini-deep-research",
      searchMode: "provider_grounded_search",
    });
  });

  it("rejects o4-mini-deep-research for non-research keys", () => {
    expect(() =>
      (
        service as unknown as {
          validateModelConfigForKey: (
            key: string,
            config: { modelName: string; searchMode: string },
          ) => void;
        }
      ).validateModelConfigForKey("evaluation.market", {
        modelName: "o4-mini-deep-research",
        searchMode: "off",
      }),
    ).toThrow("only allowed for research prompt keys");
  });

  it("rejects brave search modes for o4-mini-deep-research", () => {
    expect(() =>
      (
        service as unknown as {
          validateModelConfigForKey: (
            key: string,
            config: { modelName: string; searchMode: string },
          ) => void;
        }
      ).validateModelConfigForKey("research.market", {
        modelName: "o4-mini-deep-research",
        searchMode: "brave_tool_search",
      }),
    ).toThrow("does not support Brave");
  });

  it("validates stored draft modelName during publish", async () => {
    const txSelectLimit = jest.fn().mockResolvedValueOnce([
      {
        id: "rev-1",
        definitionId: "def-1",
        status: "draft",
        modelName: "invalid-model-name",
        searchMode: "off",
        stage: null,
      },
    ]);
    const txSelectWhere = jest.fn().mockReturnValue({ limit: txSelectLimit });
    const txSelectFrom = jest.fn().mockReturnValue({ where: txSelectWhere });
    const txSelect = jest.fn().mockReturnValue({ from: txSelectFrom });

    const txUpdateWhere = jest.fn();
    const txUpdateReturning = jest.fn();
    const txUpdateSet = jest
      .fn()
      .mockReturnValueOnce({ where: txUpdateWhere })
      .mockReturnValueOnce({ where: txUpdateWhere, returning: txUpdateReturning });
    const txUpdate = jest.fn().mockReturnValue({ set: txUpdateSet });

    const drizzle = {
      db: {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                { id: "def-1", key: "research.market" },
              ]),
            }),
          }),
        }),
        transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            select: txSelect,
            update: txUpdate,
          }),
        ),
      },
    };
    const aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("gpt-5.2"),
    };

    const publishService = new AiModelConfigService(
      drizzle as never,
      aiConfig as never,
    );

    await expect(
      publishService.publishRevision("research.market", "rev-1", "admin-1"),
    ).rejects.toThrow("Invalid model config");

    expect(txUpdate).not.toHaveBeenCalled();
  });

  it("resolves bulk all_ai_nodes scope to pipeline prompt keys", () => {
    const keys = (
      service as unknown as {
        resolveBulkTargetPromptKeys: (scope: string) => string[];
      }
    ).resolveBulkTargetPromptKeys("all_ai_nodes");

    expect(keys).toContain("extraction.fields");
    expect(keys).toContain("research.market");
    expect(keys).toContain("evaluation.market");
    expect(keys).toContain("synthesis.final");
    expect(keys).toContain("matching.thesis");
  });

  it("resolves bulk research/evaluation scopes to corresponding keys only", () => {
    const researchKeys = (
      service as unknown as {
        resolveBulkTargetPromptKeys: (scope: string) => string[];
      }
    ).resolveBulkTargetPromptKeys("research_agents");
    const evaluationKeys = (
      service as unknown as {
        resolveBulkTargetPromptKeys: (scope: string) => string[];
      }
    ).resolveBulkTargetPromptKeys("evaluation_agents");

    expect(researchKeys.length).toBeGreaterThan(0);
    expect(evaluationKeys.length).toBeGreaterThan(0);
    expect(researchKeys.every((key) => key.startsWith("research."))).toBe(true);
    expect(evaluationKeys.every((key) => key.startsWith("evaluation."))).toBe(
      true,
    );
  });

  it("bulk apply creates and publishes revisions for targeted keys", async () => {
    const txSelectWhere = jest.fn().mockResolvedValue([{ value: 2 }]);
    const txSelectFrom = jest.fn().mockReturnValue({ where: txSelectWhere });
    const txSelect = jest.fn().mockReturnValue({ from: txSelectFrom });

    const txInsertReturning = jest
      .fn()
      .mockResolvedValue([{ id: "rev-created-1" }]);
    const txInsertValues = jest.fn().mockReturnValue({
      returning: txInsertReturning,
    });
    const txInsert = jest.fn().mockReturnValue({ values: txInsertValues });

    const txUpdateReturning = jest
      .fn()
      .mockResolvedValue([{ id: "rev-published-1" }]);
    const txUpdateWhere = jest.fn().mockReturnValue({
      returning: txUpdateReturning,
    });
    const txUpdateSet = jest.fn().mockReturnValue({ where: txUpdateWhere });
    const txUpdate = jest.fn().mockReturnValue({ set: txUpdateSet });

    const drizzle = {
      db: {
        transaction: jest.fn().mockImplementation(
          async (cb: (tx: unknown) => Promise<unknown>) =>
            cb({
              select: txSelect,
              insert: txInsert,
              update: txUpdate,
            }),
        ),
      },
    };
    const aiConfig = {
      getModelForPurpose: jest.fn().mockReturnValue("gpt-5.2"),
    };
    const bulkService = new AiModelConfigService(
      drizzle as never,
      aiConfig as never,
    );

    (
      bulkService as unknown as {
        resolveBulkTargetPromptKeys: (_scope: string) => string[];
      }
    ).resolveBulkTargetPromptKeys = jest.fn(() => ["research.market"]);
    (
      bulkService as unknown as {
        getOrCreateDefinitionWithDb: (
          _db: unknown,
          _key: string,
        ) => Promise<{ id: string }>;
      }
    ).getOrCreateDefinitionWithDb = jest.fn().mockResolvedValue({
      id: "def-research-market",
    });

    const result = await bulkService.bulkApplyAndPublish("admin-1", {
      scope: "research_agents",
      modelName: "gpt-5.2",
    });

    expect(result.scope).toBe("research_agents");
    expect(result.modelName).toBe("gpt-5.2");
    expect(result.provider).toBe("openai");
    expect(result.appliedKeys).toEqual(["research.market"]);
    expect(result.publishedRevisionIds).toEqual(["rev-published-1"]);
    expect(txInsert).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledTimes(2);
  });
});
