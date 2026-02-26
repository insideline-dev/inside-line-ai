import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import type { ConfigService } from "@nestjs/config";

const createResponseMock = jest.fn();
const retrieveResponseMock = jest.fn();

mock.module("openai", () => ({
  default: class OpenAI {
    responses = {
      create: createResponseMock,
      retrieve: retrieveResponseMock,
    };

    constructor(_options: unknown) {}
  },
}));

import { OpenAiDeepResearchService } from "../../services/openai-deep-research.service";

describe("OpenAiDeepResearchService", () => {
  const buildConfig = (values: Record<string, unknown> = {}): ConfigService =>
    ({
      get: jest.fn((key: string) => {
        if (key in values) {
          return values[key];
        }
        if (key === "OPENAI_API_KEY") {
          return "openai-key";
        }
        if (key === "OPENAI_DEEP_RESEARCH_POLL_INTERVAL_MS") {
          return 1;
        }
        if (key === "AI_RESEARCH_ATTEMPT_TIMEOUT_MS") {
          return 1000;
        }
        return undefined;
      }),
    }) as unknown as ConfigService;

  beforeEach(() => {
    createResponseMock.mockReset();
    retrieveResponseMock.mockReset();
  });

  it("uses responses API with background mode and polls until completion", async () => {
    createResponseMock.mockResolvedValueOnce({
      id: "resp_123",
      status: "in_progress",
      model: "o4-mini-deep-research",
    });
    retrieveResponseMock.mockResolvedValueOnce({
      id: "resp_123",
      status: "completed",
      model: "o4-mini-deep-research",
      output_text: "Deep report",
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            query: "q",
            sources: [{ type: "url", url: "https://example.com/a" }],
          },
        },
      ],
    });

    const config = buildConfig();
    const service = new OpenAiDeepResearchService(config);

    const result = await service.runResearchText({
      agent: "market",
      modelName: "o4-mini-deep-research",
      systemPrompt: "system",
      prompt: "prompt",
      enableWebSearch: true,
      timeoutMs: 1000,
    });

    expect(createResponseMock).toHaveBeenCalledTimes(1);
    expect(createResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "o4-mini-deep-research",
        background: true,
        tools: [{ type: "web_search_preview" }],
      }),
    );
    expect(retrieveResponseMock).toHaveBeenCalledTimes(1);
    expect(retrieveResponseMock).toHaveBeenCalledWith("resp_123");
    expect(result.text).toBe("Deep report");
    expect(result.sources).toEqual([
      expect.objectContaining({
        url: "https://example.com/a",
        type: "search",
        agent: "market",
      }),
    ]);
  });

  it("extracts text from message content when output_text is missing", async () => {
    createResponseMock.mockResolvedValueOnce({
      id: "resp_456",
      status: "queued",
      model: "o4-mini-deep-research",
    });
    retrieveResponseMock.mockResolvedValueOnce({
      id: "resp_456",
      status: "completed",
      model: "o4-mini-deep-research",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Long-form deep research report",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://example.com/b",
                },
              ],
            },
          ],
        },
      ],
    });

    const config = buildConfig();
    const service = new OpenAiDeepResearchService(config);

    const result = await service.runResearchText({
      agent: "team",
      modelName: "o4-mini-deep-research",
      systemPrompt: "system",
      prompt: "prompt",
      enableWebSearch: false,
    });

    expect(retrieveResponseMock).toHaveBeenCalledWith("resp_456");
    expect(result.text).toBe("Long-form deep research report");
    expect(result.sources).toEqual([
      expect.objectContaining({
        url: "https://example.com/b",
        agent: "team",
      }),
    ]);
  });

  it("throws when deep research response ends in non-completed terminal status", async () => {
    createResponseMock.mockResolvedValueOnce({
      id: "resp_failed",
      status: "failed",
      model: "o4-mini-deep-research",
    });
    const service = new OpenAiDeepResearchService(buildConfig());

    await expect(
      service.runResearchText({
        agent: "market",
        modelName: "o4-mini-deep-research",
        systemPrompt: "system",
        prompt: "prompt",
        enableWebSearch: true,
      }),
    ).rejects.toThrow("ended with status failed");

    expect(retrieveResponseMock).not.toHaveBeenCalled();
  });

  it("throws when deep research polling exceeds timeout", async () => {
    createResponseMock.mockResolvedValueOnce({
      id: "resp_timeout",
      status: "in_progress",
      model: "o4-mini-deep-research",
    });
    retrieveResponseMock.mockResolvedValue({
      id: "resp_timeout",
      status: "in_progress",
      model: "o4-mini-deep-research",
    });
    const service = new OpenAiDeepResearchService(buildConfig());

    await expect(
      service.runResearchText({
        agent: "market",
        modelName: "o4-mini-deep-research",
        systemPrompt: "system",
        prompt: "prompt",
        enableWebSearch: true,
        timeoutMs: 5,
      }),
    ).rejects.toThrow("timed out after 5ms");
  });

  it("throws when OPENAI_API_KEY is missing", async () => {
    const config = buildConfig({ OPENAI_API_KEY: undefined });
    const service = new OpenAiDeepResearchService(config);

    await expect(
      service.runResearchText({
        agent: "market",
        modelName: "o4-mini-deep-research",
        systemPrompt: "system",
        prompt: "prompt",
        enableWebSearch: true,
      }),
    ).rejects.toThrow("OPENAI_API_KEY is not configured");
  });
});
