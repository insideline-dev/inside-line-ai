import { describe, expect, it, jest, mock } from "bun:test";

const generateTextMock = jest.fn();
mock.module("ai", () => ({
  generateText: generateTextMock,
}));

import { buildThesisSummary } from "../thesis-summary.util";
import { ThesisService } from "../thesis.service";
import type { DrizzleService } from "../../../database";
import type { AiProviderService } from "../../ai/providers/ai-provider.service";

type ThesisServicePrivate = ThesisService & {
  generateAiSummaryWithFallback(
    thesis: Record<string, unknown>,
  ): Promise<string>;
};

function createService(
  opts: { aiProviders?: Partial<AiProviderService> } = {},
): ThesisServicePrivate {
  const drizzle = {} as DrizzleService;
  const aiProviders = opts.aiProviders as AiProviderService | undefined;

  return new ThesisService(
    drizzle,
    undefined, // startupMatching
    aiProviders,
  ) as ThesisServicePrivate;
}

describe("buildThesisSummary (util)", () => {
  it("returns meaningful string with full inputs", () => {
    const thesis = {
      thesisNarrative: "We invest in AI-first B2B companies.",
      notes: "Prefer technical founders",
      industries: ["fintech", "healthtech", "AI/ML"],
      stages: ["seed", "series-a"],
      geographicFocus: ["North America", "Europe"],
      checkSizeMin: 100_000,
      checkSizeMax: 1_000_000,
      businessModels: ["SaaS", "marketplace"],
      mustHaveFeatures: ["product-market fit", "revenue"],
      dealBreakers: ["crypto", "gambling"],
      antiPortfolio: "No hardware or crypto projects",
    };

    const result = buildThesisSummary(thesis);

    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("AI-first B2B");
    expect(result).toContain("fintech");
    expect(result).toContain("seed");
    expect(result).toContain("North America");
    expect(result).toContain("100,000");
    expect(result).toContain("SaaS");
    expect(result).toContain("product-market fit");
    expect(result).toContain("crypto");
    expect(result).toContain("Anti-portfolio");
  });

  it("returns meaningful string with minimal inputs", () => {
    const thesis = { stages: ["seed"] };

    const result = buildThesisSummary(thesis);

    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("seed");
  });

  it("returns fallback string with completely empty input", () => {
    const result = buildThesisSummary({});

    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("General investment thesis");
  });

  it("truncates output to 2000 characters max", () => {
    const thesis = {
      thesisNarrative: "A".repeat(2500),
    };

    const result = buildThesisSummary(thesis);

    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it("ignores empty strings and whitespace-only values", () => {
    const thesis = {
      thesisNarrative: "   ",
      notes: "",
      industries: ["", "  "],
      stages: [],
    };

    const result = buildThesisSummary(thesis);

    expect(result).toBe(
      "General investment thesis — no specific criteria provided.",
    );
  });
});

describe("ThesisService — generateAiSummaryWithFallback", () => {
  it("falls back to buildThesisSummary when AI throws", async () => {
    const resolvedModel = { provider: "mock" };

    const service = createService({
      aiProviders: {
        resolveModelForPurpose: jest
          .fn()
          .mockReturnValue(resolvedModel) as AiProviderService["resolveModelForPurpose"],
      },
    });

    generateTextMock.mockRejectedValueOnce(new Error("API rate limit"));

    const thesis = { stages: ["series-a"], industries: ["fintech"] };
    const result = await service["generateAiSummaryWithFallback"](thesis);

    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result).toContain("series-a");
    expect(result).toContain("fintech");
  });

  it("falls back to buildThesisSummary when AI returns empty text", async () => {
    const resolvedModel = { provider: "mock" };

    const service = createService({
      aiProviders: {
        resolveModelForPurpose: jest
          .fn()
          .mockReturnValue(resolvedModel) as AiProviderService["resolveModelForPurpose"],
      },
    });

    generateTextMock.mockResolvedValueOnce({ text: "   " });

    const thesis = { stages: ["pre-seed"] };
    const result = await service["generateAiSummaryWithFallback"](thesis);

    expect(result).toBeTruthy();
    expect(result).toContain("pre-seed");
  });

  it("returns buildThesisSummary fallback when no AI provider is configured", async () => {
    const service = createService(); // no aiProviders

    const result = await service["generateAiSummaryWithFallback"]({});

    expect(result).toBe(
      "General investment thesis — no specific criteria provided.",
    );
  });
});
