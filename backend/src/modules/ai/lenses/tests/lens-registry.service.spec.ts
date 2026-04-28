import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { LensRegistryService } from "../lens-registry.service";
import { MarketLens } from "../market.lens";
import { TeamLens } from "../team.lens";
import { TractionLens } from "../traction.lens";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import type { LensInput, LensOutput } from "../../schemas/lens";

const SAMPLE_INPUT: LensInput = {
  startupId: "11111111-1111-1111-1111-111111111111",
  startupName: "Acme",
  startupDescription: "AI-native deal flow.",
  sector: "fintech",
  stage: "seed",
  contextNotes: "",
};

function buildOutput(score: number): LensOutput {
  return {
    score,
    signal: "advance",
    rationale: "Strong fundamentals.",
    evidence: [
      { claim: "Founders shipped before", confidence: "high" },
    ],
  };
}

async function buildModule(generateText: jest.Mock) {
  const promptResolve = jest.fn().mockResolvedValue({
    key: "lens.market",
    stage: null,
    systemPrompt: "system",
    userPrompt: "user {{startupName}}",
    source: "code",
    revisionId: null,
  });
  const renderTemplate = jest.fn().mockImplementation((tpl: string) => tpl);

  const moduleRef = await Test.createTestingModule({
    providers: [
      LensRegistryService,
      MarketLens,
      TeamLens,
      TractionLens,
      {
        provide: AiModelExecutionService,
        useValue: { generateText },
      },
      {
        provide: AiPromptService,
        useValue: { resolve: promptResolve, renderTemplate },
      },
      {
        provide: AiProviderService,
        useValue: {
          resolveModel: (name: string) => ({ modelId: name }),
        },
      },
      {
        provide: ConfigService,
        useValue: { get: () => "gpt-test" },
      },
    ],
  }).compile();

  return {
    registry: moduleRef.get(LensRegistryService),
    promptResolve,
    renderTemplate,
  };
}

describe("LensRegistryService", () => {
  it("exposes the three S1 lens keys in stable order", async () => {
    const generateText = jest.fn();
    const { registry } = await buildModule(generateText);

    expect(registry.keys()).toEqual(["market", "team", "traction"]);
  });

  it("run('market', ctx) returns schema-valid output and metadata", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValue({ output: buildOutput(82) });
    const { registry } = await buildModule(generateText);

    const result = await registry.run("market", SAMPLE_INPUT);

    expect(result.key).toBe("market");
    expect(result.output.score).toBe(82);
    expect(result.output.signal).toBe("advance");
    expect(result.modelId).toBe("gpt-test");
    expect(result.promptKey).toBe("lens.market");
    expect(result.usedFallback).toBe(false);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("runAll runs every lens and tolerates per-lens failure via fallback", async () => {
    const generateText = jest.fn().mockImplementation(async () => {
      // First call (market) succeeds, second (team) throws, third (traction) succeeds.
      const callIndex = generateText.mock.calls.length;
      if (callIndex === 2) {
        throw new Error("model exploded");
      }
      return { output: buildOutput(70) };
    });
    const { registry } = await buildModule(generateText);

    const all = await registry.runAll(SAMPLE_INPUT);

    expect(Object.keys(all).sort()).toEqual(["market", "team", "traction"]);
    const teamResult = all.team;
    expect(teamResult.usedFallback).toBe(true);
    expect(teamResult.output.signal).toBe("review");
    expect(all.market.usedFallback).toBe(false);
    expect(all.traction.usedFallback).toBe(false);
  });

  it("asTools exposes lens_<key> tools whose execute() routes to run()", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValue({ output: buildOutput(55) });
    const { registry } = await buildModule(generateText);

    const tools = registry.asTools();
    expect(Object.keys(tools).sort()).toEqual([
      "lens_market",
      "lens_team",
      "lens_traction",
    ]);

    const toolDef = tools.lens_market as {
      description: string;
      execute: (args: LensInput, opts: unknown) => Promise<LensOutput>;
    };
    expect(toolDef.description).toContain("market");

    const out = await toolDef.execute(SAMPLE_INPUT, {});
    expect(out.score).toBe(55);
  });

  it("run() throws on unknown lens key", async () => {
    const generateText = jest.fn();
    const { registry } = await buildModule(generateText);
    await expect(registry.run("ghost", SAMPLE_INPUT)).rejects.toThrow(
      /Unknown lens key/,
    );
  });
});
