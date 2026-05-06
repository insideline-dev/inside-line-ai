import { describe, expect, it, jest } from "bun:test";
import { zodResponseFormat } from "openai/helpers/zod";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { MarketLens } from "../market.lens";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { LensOutputSchema } from "../../schemas/lens";
import type { LensInput } from "../../schemas/lens";

const CTX: LensInput = {
  startupId: "11111111-1111-1111-1111-111111111111",
  startupName: "Acme",
  startupDescription: "AI-native deal flow",
  sector: "fintech",
  stage: "seed",
  contextNotes: "",
};

async function buildLens(opts: {
  generateText: jest.Mock;
  resolveModel?: jest.Mock;
}) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketLens,
      {
        provide: AiModelExecutionService,
        useValue: { generateText: opts.generateText },
      },
      {
        provide: AiPromptService,
        useValue: {
          resolve: jest.fn().mockResolvedValue({
            key: "lens.market",
            stage: null,
            systemPrompt: "sys",
            userPrompt: "user {{startupName}}",
            source: "code",
            revisionId: null,
          }),
          renderTemplate: jest
            .fn()
            .mockImplementation((tpl: string) =>
              tpl.replace("{{startupName}}", CTX.startupName),
            ),
        },
      },
      {
        provide: AiProviderService,
        useValue: {
          resolveModel: opts.resolveModel ?? jest.fn().mockReturnValue({}),
        },
      },
      {
        provide: ConfigService,
        useValue: { get: () => "gpt-test" },
      },
    ],
  }).compile();

  return moduleRef.get(MarketLens);
}

describe("MarketLens", () => {
  it("emits a strict structured-output schema for evidence items", () => {
    expect(() => zodResponseFormat(LensOutputSchema, "response")).not.toThrow();
  });

  it("returns valid LensOutput when the model responds correctly", async () => {
    const generateText = jest.fn().mockResolvedValue({
      output: {
        score: 77,
        signal: "advance",
        rationale: "TAM is large with credible expansion.",
        evidence: [
          {
            claim: "Public IDC report cites $40B TAM",
            source: "https://idc.com/reports/market-2025",
            confidence: "medium",
          },
        ],
      },
    });

    const lens = await buildLens({ generateText });
    const result = await lens.run(CTX);

    expect(result.usedFallback).toBe(false);
    expect(result.key).toBe("market");
    expect(result.promptKey).toBe("lens.market");
    expect(result.output.score).toBe(77);
    expect(result.output.evidence[0].confidence).toBe("medium");
    expect(result.output.evidence[0].source).toBe(
      "https://idc.com/reports/market-2025",
    );
    expect(result.modelId).toBe("gpt-test");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  // DS-E9-F2-S1 — unlinked claims must never reach persistence so the
  // evidence graph stays clean.
  it("drops evidence items missing a source (DS-E9-F2-S1)", async () => {
    const generateText = jest.fn().mockResolvedValue({
      output: {
        score: 70,
        signal: "advance",
        rationale: "Strong signals.",
        evidence: [
          { claim: "Linked claim", source: "https://example.com/a", confidence: "high" },
          { claim: "Unlinked claim", confidence: "medium" }, // no source
          { claim: "Empty source", source: "   ", confidence: "low" }, // whitespace
          { claim: "Another linked", source: "https://example.com/b", confidence: "medium" },
        ],
      },
    });

    const lens = await buildLens({ generateText });
    const result = await lens.run(CTX);

    expect(result.usedFallback).toBe(false);
    expect(result.output.evidence).toHaveLength(2);
    expect(result.output.evidence.map((e) => e.source)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("preserves evidence array when every item has a source", async () => {
    const generateText = jest.fn().mockResolvedValue({
      output: {
        score: 60,
        signal: "review",
        rationale: "Mixed.",
        evidence: [
          { claim: "A", source: "https://example.com/1", confidence: "high" },
          { claim: "B", source: "deck:p3", confidence: "medium" },
        ],
      },
    });

    const lens = await buildLens({ generateText });
    const result = await lens.run(CTX);

    expect(result.output.evidence).toHaveLength(2);
  });

  it("falls back deterministically when the model throws", async () => {
    const generateText = jest.fn().mockRejectedValue(new Error("boom"));

    const lens = await buildLens({ generateText });
    const result = await lens.run(CTX);

    expect(result.usedFallback).toBe(true);
    expect(result.error).toContain("boom");
    expect(result.output.signal).toBe("review");
    expect(result.output.score).toBe(0);
  });

  it("falls back when the model returns empty output", async () => {
    const generateText = jest.fn().mockResolvedValue({ output: undefined });

    const lens = await buildLens({ generateText });
    const result = await lens.run(CTX);

    expect(result.usedFallback).toBe(true);
    expect(result.output.signal).toBe("review");
  });
});
