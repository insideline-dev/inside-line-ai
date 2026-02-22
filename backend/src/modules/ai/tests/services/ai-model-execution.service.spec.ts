import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { AiPromptKey } from "../../services/ai-prompt-catalog";
import type { StartupStage } from "../../../startup/entities/startup.schema";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import type { AiModelConfigService } from "../../services/ai-model-config.service";
import type { AiProviderService } from "../../providers/ai-provider.service";
import type { BraveSearchService } from "../../services/brave-search.service";

describe("AiModelExecutionService", () => {
  let modelConfig: jest.Mocked<AiModelConfigService>;
  let providers: jest.Mocked<AiProviderService>;
  let braveSearch: jest.Mocked<BraveSearchService>;
  let service: AiModelExecutionService;

  beforeEach(() => {
    modelConfig = {
      resolveConfig: jest.fn(),
    } as unknown as jest.Mocked<AiModelConfigService>;

    providers = {
      resolveModel: jest.fn().mockReturnValue({ id: "model-instance" }),
    } as unknown as jest.Mocked<AiProviderService>;

    braveSearch = {
      isConfigured: jest.fn().mockReturnValue(true),
      search: jest.fn().mockResolvedValue({ query: "q", results: [] }),
    } as unknown as jest.Mocked<BraveSearchService>;

    service = new AiModelExecutionService(modelConfig, providers, braveSearch);
  });

  it("requires provider-native search tools for research prompts", async () => {
    modelConfig.resolveConfig.mockResolvedValueOnce({
      source: "published",
      revisionId: "rev-1",
      stage: null,
      purpose: "research",
      modelName: "gpt-5.2",
      provider: "openai",
      searchMode: "provider_grounded_search",
      supportedSearchModes: [
        "off",
        "provider_grounded_search",
        "brave_tool_search",
        "provider_and_brave_search",
      ],
    } as never);

    const result = await service.resolveForPrompt({
      key: "research.market",
      stage: null,
    });

    expect(providers.resolveModel).toHaveBeenCalledWith("gpt-5.2");
    expect(result.generateTextOptions.tools).toBeDefined();
    expect(result.generateTextOptions.toolChoice).toBe("required");
    expect(result.searchEnforcement.requiresProviderEvidence).toBe(true);
    expect(result.searchEnforcement.requiresBraveToolCall).toBe(false);
  });

  it("attaches Brave tool for brave-only search mode", async () => {
    modelConfig.resolveConfig.mockResolvedValueOnce({
      source: "published",
      revisionId: "rev-b1",
      stage: null,
      purpose: "research",
      modelName: "gpt-5.2",
      provider: "openai",
      searchMode: "brave_tool_search",
      supportedSearchModes: ["off", "brave_tool_search"],
    } as never);

    const result = await service.resolveForPrompt({
      key: "research.news",
      stage: null,
    });

    const tools = (result.generateTextOptions.tools ?? {}) as Record<string, unknown>;
    expect(tools.brave_search).toBeDefined();
    expect(result.searchEnforcement.requiresProviderEvidence).toBe(false);
    expect(result.searchEnforcement.requiresBraveToolCall).toBe(true);
  });

  it("attaches provider and brave tools for combined mode", async () => {
    modelConfig.resolveConfig.mockResolvedValueOnce({
      source: "published",
      revisionId: "rev-b2",
      stage: null,
      purpose: "research",
      modelName: "gpt-5.2",
      provider: "openai",
      searchMode: "provider_and_brave_search",
      supportedSearchModes: [
        "off",
        "provider_grounded_search",
        "brave_tool_search",
        "provider_and_brave_search",
      ],
    } as never);

    const result = await service.resolveForPrompt({
      key: "research.market",
      stage: null,
    });

    const tools = (result.generateTextOptions.tools ?? {}) as Record<string, unknown>;
    expect(tools.web_search).toBeDefined();
    expect(tools.brave_search).toBeDefined();
    expect(result.generateTextOptions.toolChoice).toBe("required");
    expect(result.searchEnforcement.requiresProviderEvidence).toBe(true);
    expect(result.searchEnforcement.requiresBraveToolCall).toBe(true);
  });

  it("never attaches search tools for evaluation prompts", async () => {
    modelConfig.resolveConfig.mockResolvedValueOnce({
      source: "published",
      revisionId: "rev-2",
      stage: null,
      purpose: "evaluation",
      modelName: "gpt-5.2",
      provider: "openai",
      searchMode: "off",
      supportedSearchModes: ["off"],
    } as never);

    const result = await service.resolveForPrompt({
      key: "evaluation.market",
      stage: null,
    });

    expect(result.generateTextOptions.tools).toBeUndefined();
    expect(result.generateTextOptions.toolChoice).toBeUndefined();
    expect(result.searchEnforcement.requiresProviderEvidence).toBe(false);
    expect(result.searchEnforcement.requiresBraveToolCall).toBe(false);
  });

  it("passes key and stage through to config resolution", async () => {
    modelConfig.resolveConfig.mockResolvedValueOnce({
      source: "default",
      revisionId: null,
      stage: "seed",
      purpose: "research",
      modelName: "gemini-3.0-flash-preview",
      provider: "google",
      searchMode: "off",
      supportedSearchModes: [
        "off",
        "provider_grounded_search",
        "brave_tool_search",
        "provider_and_brave_search",
      ],
    } as never);

    const key: AiPromptKey = "research.team";
    const stage: StartupStage = "seed" as StartupStage;
    await service.resolveForPrompt({ key, stage });

    expect(modelConfig.resolveConfig).toHaveBeenCalledWith({ key, stage });
  });

  it("throws when brave-backed search is selected but brave is not configured", async () => {
    braveSearch.isConfigured.mockReturnValueOnce(false);
    modelConfig.resolveConfig.mockResolvedValueOnce({
      source: "published",
      revisionId: "rev-b3",
      stage: null,
      purpose: "research",
      modelName: "gpt-5.2",
      provider: "openai",
      searchMode: "brave_tool_search",
      supportedSearchModes: ["off", "brave_tool_search"],
    } as never);

    await expect(
      service.resolveForPrompt({ key: "research.team", stage: null }),
    ).rejects.toThrow("Brave Search API key is not configured");
  });
});
