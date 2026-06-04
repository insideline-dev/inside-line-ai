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

/**
 * Build a fully-populated LensEvidence item. `LensEvidenceSchema` keys
 * (`sourceType`, `sourceLabel`, `sourceRef`, `url`, `pageNumber`, `quote`) are
 * nullable but NOT optional, so the LLM is expected to emit them — tests must
 * too, or Zod parse fails and the lens falls back.
 */
function evidence(
  over: {
    claim: string;
    source: string;
    confidence?: "low" | "medium" | "high";
    sourceType?:
      | "deck_page"
      | "public_url"
      | "enrichment_call"
      | "research_source"
      | "internal_trace";
    sourceLabel?: string | null;
    sourceRef?: string | null;
    url?: string | null;
    pageNumber?: number | null;
    quote?: string | null;
  },
) {
  return {
    claim: over.claim,
    source: over.source,
    confidence: over.confidence ?? "medium",
    sourceType: over.sourceType ?? "public_url",
    sourceLabel: over.sourceLabel ?? null,
    sourceRef: over.sourceRef ?? null,
    url: over.url ?? null,
    pageNumber: over.pageNumber ?? null,
    quote: over.quote ?? null,
  };
}

async function buildLens(opts: {
  generateText: jest.Mock;
  resolveModel?: jest.Mock;
  // Inject web-search tools into resolveForPrompt to exercise the tool path.
  tools?: Record<string, unknown>;
}) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketLens,
      {
        provide: AiModelExecutionService,
        useValue: {
          generateText: opts.generateText,
          // Market lens is research-capable (webSearchEnabled = true) so
          // base-lens.agent routes through resolveForPrompt for tools.
          // Tests don't need real provider config — return a minimal
          // shape that lets the generateText call through.
          resolveForPrompt: jest.fn().mockResolvedValue({
            resolvedConfig: { provider: "openai", modelName: "gpt-test" },
            generateTextOptions: {
              model: {},
              tools: opts.tools,
              toolChoice: opts.tools ? "auto" : undefined,
              providerOptions: undefined,
            },
            searchEnforcement: {
              requiresProviderEvidence: false,
              requiresBraveToolCall: false,
            },
            usage: { getBraveToolCallCount: () => 0 },
            braveSearchFn: undefined,
          }),
        },
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
          evidence({
            claim: "Public IDC report cites $40B TAM",
            source: "https://idc.com/reports/market-2025",
            confidence: "medium",
          }),
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

  // DS-E9-F2-S1 — LensEvidenceSchema requires a non-empty source at parse
  // time; invalid LLM output fails Zod rather than persisting unlinked claims.
  it("rejects evidence items missing a source at schema parse (DS-E9-F2-S1)", async () => {
    const generateText = jest.fn().mockResolvedValue({
      output: {
        score: 70,
        signal: "advance",
        rationale: "Strong signals.",
        evidence: [
          { claim: "Linked claim", source: "https://example.com/a", confidence: "high" },
          { claim: "Unlinked claim", confidence: "medium" },
        ],
      },
    });

    const lens = await buildLens({ generateText });
    const result = await lens.run(CTX);

    expect(result.usedFallback).toBe(true);
    expect(result.output.evidence).toHaveLength(0);
    expect(result.error).toBeDefined();
  });

  it("preserves evidence array when every item has a source", async () => {
    const generateText = jest.fn().mockResolvedValue({
      output: {
        score: 60,
        signal: "review",
        rationale: "Mixed.",
        evidence: [
          evidence({ claim: "A", source: "https://example.com/1", confidence: "high" }),
          evidence({ claim: "B", source: "deck:p3", confidence: "medium" }),
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
    // Both attempts were exhausted before giving up.
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("retries once and recovers when the first call returns empty output", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValueOnce({ output: undefined })
      .mockResolvedValueOnce({
        output: {
          score: 82,
          signal: "advance",
          rationale: "Recovered on retry.",
          evidence: [
            evidence({ claim: "A", source: "https://example.com/1", confidence: "high" }),
          ],
        },
      });

    const lens = await buildLens({ generateText });
    const result = await lens.run(CTX);

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result.usedFallback).toBe(false);
    expect(result.output.score).toBe(82);
    expect(result.output.signal).toBe("advance");
  });

  it("drops web-search tools on the retry to stay within the phase budget", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValueOnce({ output: undefined })
      .mockResolvedValueOnce({
        output: {
          score: 55,
          signal: "review",
          rationale: "Recovered via fast tool-less path.",
          evidence: [],
        },
      });

    const lens = await buildLens({
      generateText,
      // First attempt is wired with web-search tools.
      tools: { web_search: {}, brave_search: {} },
    });
    const result = await lens.run(CTX);

    expect(generateText).toHaveBeenCalledTimes(2);
    // Attempt 1 carries the web-search tools…
    expect(generateText.mock.calls[0][0].tools).toBeDefined();
    expect(generateText.mock.calls[0][0].toolChoice).toBe("auto");
    // …the retry drops them so it takes the fast `responses.parse` path.
    expect(generateText.mock.calls[1][0].tools).toBeUndefined();
    expect(generateText.mock.calls[1][0].toolChoice).toBeUndefined();
    expect(result.usedFallback).toBe(false);
    expect(result.output.score).toBe(55);
  });

  it("forces low reasoning effort and a bounded abort signal on the web-search call", async () => {
    const generateText = jest.fn().mockResolvedValue({
      output: {
        score: 64,
        signal: "review",
        rationale: "ok",
        evidence: [],
      },
    });

    const lens = await buildLens({
      generateText,
      // resolveProviderOptions would default this to "high".
      tools: { web_search: {} },
    });
    await lens.run(CTX);

    const call = generateText.mock.calls[0][0];
    expect(call.providerOptions?.openai?.reasoningEffort).toBe("low");
    // A hard timeout is wired so the lens can never exceed the phase budget.
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });
});
