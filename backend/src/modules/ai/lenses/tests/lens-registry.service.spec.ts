import { afterEach, describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";
import {
  LensRegistryService,
  LENSES_REGISTRY_TOKEN,
} from "../lens-registry.service";
import { MarketLens } from "../market.lens";
import { TeamLens } from "../team.lens";
import { TractionLens } from "../traction.lens";
import {
  TeamLensOutputSchema,
  type TeamLensOutput,
} from "../../schemas/lens/team.lens.schema";
import { BaseLensAgent } from "../base-lens.agent";
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

/**
 * Test fixture — a "v2" of the team lens. Declares `version = "2"`. Exercises
 * the registry's ability to register two versions of the same lens key
 * (DS-E2-F1-S2 acceptance).
 */
@Injectable()
class TeamLensV2 extends BaseLensAgent<TeamLensOutput> {
  readonly key = "team" as const;
  readonly version = "2" as const;
  readonly description = "Team Lens v2 — sharper coverage gap detection.";
  readonly promptKey = "lens.team" as const;
  readonly outputSchema = TeamLensOutputSchema;
}

interface BuildModuleOptions {
  envOverrides?: Record<string, string | undefined>;
  promptVersion?: string;
  includeTeamV2?: boolean;
}

async function buildModule(
  generateText: jest.Mock,
  options: BuildModuleOptions = {},
) {
  const promptResolve = jest.fn().mockImplementation(
    async ({ key, version }: { key: string; version?: string | null }) => ({
      key,
      stage: null,
      systemPrompt: "system",
      userPrompt: "user {{startupName}}",
      source: "code" as const,
      revisionId: null,
      version: version ?? options.promptVersion ?? "1",
    }),
  );
  const renderTemplate = jest.fn().mockImplementation((tpl: string) => tpl);

  const lensProviders = options.includeTeamV2
    ? [MarketLens, TeamLens, TractionLens, TeamLensV2]
    : [MarketLens, TeamLens, TractionLens];

  const moduleRef = await Test.createTestingModule({
    providers: [
      LensRegistryService,
      ...lensProviders,
      {
        provide: LENSES_REGISTRY_TOKEN,
        useFactory: (...lenses: BaseLensAgent<LensOutput>[]) => lenses,
        inject: lensProviders,
      },
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
        useValue: {
          get: (key: string, fallback?: unknown) => {
            if (options.envOverrides && key in options.envOverrides) {
              return options.envOverrides[key];
            }
            if (key === "SCREENING_LENS_MODEL") return "gpt-test";
            return fallback;
          },
        },
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
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("baseline (single registered version)", () => {
    it("exposes the three S1 lens keys in stable order", async () => {
      const generateText = jest.fn();
      const { registry } = await buildModule(generateText);

      expect(registry.keys()).toEqual(["market", "team", "traction"]);
    });

    it("versionedKeys() lists every registered (key, version) pair", async () => {
      const generateText = jest.fn();
      const { registry } = await buildModule(generateText);

      expect(registry.versionedKeys()).toEqual([
        "market@1",
        "team@1",
        "traction@1",
      ]);
    });

    it("getActiveVersion defaults to the highest registered version", async () => {
      const generateText = jest.fn();
      const { registry } = await buildModule(generateText);

      expect(registry.getActiveVersion("team")).toBe("1");
      expect(registry.getActiveVersion("market")).toBe("1");
      expect(registry.getActiveVersion("traction")).toBe("1");
    });

    it("run('market', ctx) returns schema-valid output and metadata", async () => {
      const generateText = jest
        .fn()
        .mockResolvedValue({ output: buildOutput(82) });
      const { registry } = await buildModule(generateText);

      const result = await registry.run("market", SAMPLE_INPUT);

      expect(result.key).toBe("market");
      expect(result.lensVersion).toBe("1");
      expect(result.promptVersion).toBe("1");
      expect(result.output.score).toBe(82);
      expect(result.output.signal).toBe("advance");
      expect(result.modelId).toBe("gpt-test");
      expect(result.promptKey).toBe("lens.market");
      expect(result.usedFallback).toBe(false);
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it("runAll runs every lens and tolerates per-lens failure via fallback", async () => {
      const generateText = jest.fn().mockImplementation(async () => {
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
      expect(teamResult.lensVersion).toBe("1");
      expect(teamResult.promptVersion).toBe("1");
      expect(teamResult.output.signal).toBe("review");
      expect(all.market.usedFallback).toBe(false);
      expect(all.traction.usedFallback).toBe(false);
    });

    it("asTools exposes lens_<key> tools whose execute() routes to active version", async () => {
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

  describe("multiple registered versions (DS-E2-F1-S2)", () => {
    it("exposes both team@1 and team@2 versionedKeys when v2 is registered", async () => {
      const generateText = jest.fn();
      const { registry } = await buildModule(generateText, {
        includeTeamV2: true,
      });

      expect(registry.versionedKeys()).toEqual([
        "market@1",
        "team@1",
        "team@2",
        "traction@1",
      ]);
    });

    it("getActiveVersion('team') honors LENS_ACTIVE_VERSION_TEAM env override", async () => {
      const generateText = jest.fn();
      const { registry } = await buildModule(generateText, {
        envOverrides: { LENS_ACTIVE_VERSION_TEAM: "2" },
        includeTeamV2: true,
      });

      expect(registry.getActiveVersion("team")).toBe("2");
      expect(registry.getActiveVersion("market")).toBe("1");
    });

    it("getActiveVersion falls back to highest registered when env override is unknown", async () => {
      const generateText = jest.fn();
      const { registry } = await buildModule(generateText, {
        envOverrides: { LENS_ACTIVE_VERSION_TEAM: "99" },
        includeTeamV2: true,
      });

      // Highest registered is 2 (v1 + v2 fixture). 99 doesn't exist; warns
      // and uses the highest.
      expect(registry.getActiveVersion("team")).toBe("2");
    });

    it("getActiveVersion defaults to highest when env override is missing", async () => {
      const generateText = jest.fn();
      const { registry } = await buildModule(generateText, {
        includeTeamV2: true,
      });

      expect(registry.getActiveVersion("team")).toBe("2");
    });

    it("run('team@2', ctx) targets the explicit version regardless of active flag", async () => {
      const generateText = jest
        .fn()
        .mockResolvedValue({ output: buildOutput(75) });
      const { registry } = await buildModule(generateText, {
        envOverrides: { LENS_ACTIVE_VERSION_TEAM: "1" },
        includeTeamV2: true,
      });

      const result = await registry.run("team@2", SAMPLE_INPUT);

      expect(result.key).toBe("team");
      expect(result.lensVersion).toBe("2");
      expect(result.output.score).toBe(75);
    });

    it("run('team@1', ctx) and run('team@2', ctx) both work side by side", async () => {
      const generateText = jest
        .fn()
        .mockResolvedValue({ output: buildOutput(60) });
      const { registry } = await buildModule(generateText, {
        includeTeamV2: true,
      });

      const v1 = await registry.run("team@1", SAMPLE_INPUT);
      const v2 = await registry.run("team@2", SAMPLE_INPUT);

      expect(v1.lensVersion).toBe("1");
      expect(v2.lensVersion).toBe("2");
    });

    it("runAll(ctx) runs only the active version per lens", async () => {
      const generateText = jest
        .fn()
        .mockResolvedValue({ output: buildOutput(80) });
      const { registry } = await buildModule(generateText, {
        envOverrides: { LENS_ACTIVE_VERSION_TEAM: "2" },
        includeTeamV2: true,
      });

      const all = await registry.runAll(SAMPLE_INPUT);

      // Three logical keys, all on the active version.
      expect(Object.keys(all).sort()).toEqual(["market", "team", "traction"]);
      expect(all.team.lensVersion).toBe("2");
      expect(all.market.lensVersion).toBe("1");
      expect(all.traction.lensVersion).toBe("1");
      // generateText called once per active lens (3 total), not 4.
      expect(generateText).toHaveBeenCalledTimes(3);
    });

    it("asTools().lens_team.execute routes to the active version", async () => {
      const generateText = jest
        .fn()
        .mockResolvedValue({ output: buildOutput(88) });
      const { registry } = await buildModule(generateText, {
        envOverrides: { LENS_ACTIVE_VERSION_TEAM: "2" },
        includeTeamV2: true,
      });

      const tools = registry.asTools();
      // No `@` ever leaks into the tool surface — Vercel SDK regex constraint.
      expect(Object.keys(tools)).not.toContain("lens_team@1");
      expect(Object.keys(tools)).not.toContain("lens_team@2");

      const toolDef = tools.lens_team as {
        description: string;
        execute: (args: LensInput, opts: unknown) => Promise<LensOutput>;
      };
      // Active version's description surfaces (v2 fixture has a distinct one).
      expect(toolDef.description).toContain("v2");

      const out = await toolDef.execute(SAMPLE_INPUT, {});
      expect(out.score).toBe(88);
    });

    it("registering the same (key, version) twice throws", async () => {
      const generateText = jest.fn();
      const { registry } = await buildModule(generateText);
      const duplicate = new (class extends BaseLensAgent<TeamLensOutput> {
        readonly key = "team" as const;
        readonly version = "1" as const;
        readonly description = "duplicate";
        readonly promptKey = "lens.team" as const;
        readonly outputSchema = TeamLensOutputSchema;
      })(
        {} as unknown as AiModelExecutionService,
        {} as unknown as AiPromptService,
        {} as unknown as AiProviderService,
        {} as unknown as ConfigService,
      );

      expect(() => registry.registerLens(duplicate)).toThrow(
        /Duplicate lens registration/,
      );
    });
  });
});
