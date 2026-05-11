import { beforeEach, describe, expect, it, jest } from "bun:test";
import { BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

import type { AiConfigService } from "../../services/ai-config.service";
import type { AiModelExecutionService } from "../../services/ai-model-execution.service";
import type { AiPromptService } from "../../services/ai-prompt.service";
import type { AiProviderService } from "../../providers/ai-provider.service";
import {
  MemoClaimRewriteService,
  preservesFactualMarkers,
  type RewriteClaimInput,
} from "../../services/memo-claim-rewrite.service";

const ORIGINAL_TEXT =
  "The team has shipped two enterprise pilots since 2024 with strong NRR signals.";

function baseInput(
  overrides: Partial<RewriteClaimInput> = {},
): RewriteClaimInput {
  return {
    startupId: "11111111-1111-4111-8111-111111111111",
    sectionKey: "team",
    sectionTitle: "Team",
    originalText: ORIGINAL_TEXT,
    instruction: undefined,
    sourceIds: ["deck://", "https://linkedin.com/in/example"],
    ...overrides,
  };
}

function buildService(
  generateText: jest.Mock,
): {
  service: MemoClaimRewriteService;
  generateText: jest.Mock;
  resolveForPrompt: jest.Mock;
} {
  const resolveForPrompt = jest.fn().mockResolvedValue({
    resolvedConfig: { modelName: "gpt-test" },
    generateTextOptions: { model: "stub-model", providerOptions: undefined },
    searchEnforcement: {
      requiresProviderEvidence: false,
      requiresBraveToolCall: false,
    },
    usage: { getBraveToolCallCount: () => 0 },
  });

  const promptService: jest.Mocked<AiPromptService> = {
    resolve: jest.fn().mockResolvedValue({
      key: "memo.claim.rewrite",
      stage: null,
      systemPrompt: "system prompt body",
      userPrompt: "Original: {{originalText}} | Instruction: {{instruction}} | Sources: {{sourcesBlock}} | Section: {{sectionTitle}}",
      source: "code",
      revisionId: null,
    }),
  } as unknown as jest.Mocked<AiPromptService>;

  const providers: jest.Mocked<AiProviderService> = {
    resolveModelForPurpose: jest.fn().mockReturnValue("fallback-model"),
  } as unknown as jest.Mocked<AiProviderService>;

  const aiConfig: jest.Mocked<AiConfigService> = {} as unknown as jest.Mocked<AiConfigService>;

  const modelExecution: jest.Mocked<AiModelExecutionService> = {
    resolveForPrompt,
    generateText,
  } as unknown as jest.Mocked<AiModelExecutionService>;

  const config: jest.Mocked<ConfigService> = {
    get: jest.fn().mockReturnValue(1000),
  } as unknown as jest.Mocked<ConfigService>;

  const service = new MemoClaimRewriteService(
    promptService,
    providers,
    aiConfig,
    modelExecution,
    config,
  );

  return { service, generateText, resolveForPrompt };
}

describe("MemoClaimRewriteService.rewriteClaim", () => {
  let generateText: jest.Mock;

  beforeEach(() => {
    generateText = jest.fn();
  });

  it("returns up to 3 rewrites from a 5-candidate model output", async () => {
    generateText.mockResolvedValueOnce({
      output: {
        rewrites: [
          { text: "The team has shipped two enterprise pilots since 2024 with strong NRR." },
          { text: "Two enterprise pilots shipped since 2024 point to durable NRR." },
          { text: "Since 2024, the team has shipped two enterprise pilots with strong NRR signals." },
          { text: "Strong NRR signals follow two enterprise pilots shipped since 2024." },
          { text: "The team has shipped two enterprise pilots since 2024 and NRR signals are encouraging." },
        ],
      },
    });

    const { service } = buildService(generateText);
    const result = await service.rewriteClaim(baseInput());

    expect(result.rewrites).toHaveLength(3);
    expect(result.candidateCountBeforeFilter).toBe(5);
    expect(result.originalText).toBe(ORIGINAL_TEXT);
    expect(result.usedFallback).toBe(false);
    for (const r of result.rewrites) {
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.diff).toBe("edit");
    }
  });

  it("preserves the structure when the model returns exactly 3 candidates", async () => {
    generateText.mockResolvedValueOnce({
      output: {
        rewrites: [
          { text: "Two enterprise pilots shipped since 2024 point to NRR strength." },
          { text: "Since 2024, two enterprise pilots have shipped with strong NRR." },
          { text: "The team shipped two enterprise pilots since 2024 with strong NRR." },
        ],
      },
    });

    const { service } = buildService(generateText);
    const result = await service.rewriteClaim(baseInput());

    expect(result.rewrites).toHaveLength(3);
    expect(result.candidateCountBeforeFilter).toBe(3);
  });

  it("drops a rewrite that introduces a new percentage not in the original", async () => {
    generateText.mockResolvedValueOnce({
      output: {
        rewrites: [
          { text: "The team has shipped two enterprise pilots since 2024 with strong NRR." },
          { text: "The team has shipped two enterprise pilots since 2024 with 140% NRR." },
        ],
      },
    });

    const { service } = buildService(generateText);
    const result = await service.rewriteClaim(baseInput());

    expect(result.candidateCountBeforeFilter).toBe(2);
    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0]?.text).not.toContain("140%");
  });

  it("drops a rewrite that introduces a new named entity", async () => {
    generateText.mockResolvedValueOnce({
      output: {
        rewrites: [
          { text: "Two enterprise pilots shipped since 2024 with strong NRR signals." },
          { text: "Two enterprise pilots with Microsoft shipped since 2024 with strong NRR signals." },
        ],
      },
    });

    const { service } = buildService(generateText);
    const result = await service.rewriteClaim(baseInput());

    expect(result.rewrites.find((r) => r.text.includes("Microsoft"))).toBeUndefined();
  });

  it("rejects empty originalText with BadRequestException", async () => {
    const { service } = buildService(generateText);
    await expect(
      service.rewriteClaim(baseInput({ originalText: "   " })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns an empty rewrite set with usedFallback=true when the model throws", async () => {
    generateText.mockRejectedValueOnce(new Error("model timed out"));
    const { service } = buildService(generateText);

    const result = await service.rewriteClaim(baseInput());

    expect(result.rewrites).toEqual([]);
    expect(result.candidateCountBeforeFilter).toBe(0);
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to parsing raw text when the model omits structured output", async () => {
    generateText.mockResolvedValueOnce({
      output: undefined,
      experimental_output: undefined,
      text: JSON.stringify({
        rewrites: [
          { text: "Two enterprise pilots since 2024 with strong NRR signals." },
        ],
      }),
    });

    const { service } = buildService(generateText);
    const result = await service.rewriteClaim(baseInput());

    expect(result.rewrites).toHaveLength(1);
  });

  it("deduplicates a rewrite that matches the original verbatim", async () => {
    generateText.mockResolvedValueOnce({
      output: {
        rewrites: [
          { text: ORIGINAL_TEXT },
          { text: "Two enterprise pilots since 2024 point to strong NRR." },
        ],
      },
    });

    const { service } = buildService(generateText);
    const result = await service.rewriteClaim(baseInput());

    expect(result.rewrites.find((r) => r.text === ORIGINAL_TEXT)).toBeUndefined();
    expect(result.rewrites).toHaveLength(1);
  });

  it("propagates the operator instruction into the user prompt", async () => {
    generateText.mockResolvedValueOnce({
      output: {
        rewrites: [
          { text: "Two enterprise pilots since 2024 with strong NRR signals." },
        ],
      },
    });

    const { service } = buildService(generateText);
    await service.rewriteClaim(baseInput({ instruction: "be more cautious" }));

    const call = generateText.mock.calls[0]?.[0];
    expect(call.prompt).toContain("be more cautious");
    expect(call.prompt).toContain(ORIGINAL_TEXT);
  });

  it("returns empty rewrites when every candidate fails the factual-marker guard", async () => {
    generateText.mockResolvedValueOnce({
      output: {
        rewrites: [
          { text: "The team has shipped 12 enterprise pilots since 2024 with strong NRR." },
          { text: "The team has shipped two enterprise pilots since 2025 with strong NRR." },
        ],
      },
    });

    const { service } = buildService(generateText);
    const result = await service.rewriteClaim(baseInput());

    expect(result.candidateCountBeforeFilter).toBe(2);
    expect(result.rewrites).toHaveLength(0);
    expect(result.usedFallback).toBe(false);
  });
});

describe("preservesFactualMarkers", () => {
  it("allows reorderings and synonyms when no new factual marker is added", () => {
    expect(
      preservesFactualMarkers(
        "Path Robotics shipped two pilots in 2024 with strong NRR.",
        "In 2024, Path Robotics shipped two pilots and saw strong NRR.",
      ),
    ).toBe(true);
  });

  it("rejects a candidate that adds a new percentage", () => {
    expect(
      preservesFactualMarkers(
        "Path Robotics shipped two pilots in 2024.",
        "Path Robotics shipped two pilots in 2024 at 140% NRR.",
      ),
    ).toBe(false);
  });

  it("rejects a candidate that adds a new year", () => {
    expect(
      preservesFactualMarkers(
        "Path Robotics shipped two pilots in 2024.",
        "Path Robotics has been shipping pilots since 2019, two of them in 2024.",
      ),
    ).toBe(false);
  });

  it("rejects a candidate that introduces a new proper noun", () => {
    expect(
      preservesFactualMarkers(
        "The team has shipped two pilots.",
        "The team partnered with Stripe to ship two pilots.",
      ),
    ).toBe(false);
  });

  it("allows sentence-leading stopword changes", () => {
    expect(
      preservesFactualMarkers(
        "We shipped two pilots in 2024.",
        "The team shipped two pilots in 2024.",
      ),
    ).toBe(true);
  });
});
