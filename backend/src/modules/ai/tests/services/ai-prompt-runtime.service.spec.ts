import { beforeEach, describe, expect, it, jest } from "bun:test";
import { AiPromptRuntimeService } from "../../services/ai-prompt-runtime.service";
import { AI_PROMPT_KEYS } from "../../services/ai-prompt-catalog";
import { PipelinePhase } from "../../interfaces/pipeline.interface";
import { createEvaluationPipelineInput } from "../fixtures/evaluation-pipeline.fixture";

describe("AiPromptRuntimeService", () => {
  let service: AiPromptRuntimeService;
  let promptService: {
    resolve: ReturnType<typeof jest.fn>;
    renderTemplate: ReturnType<typeof jest.fn>;
  };
  let pipelineState: {
    getPhaseResult: ReturnType<typeof jest.fn>;
  };
  let aiConfig: {
    getModelForPurpose: ReturnType<typeof jest.fn>;
  };
  let pipelineFeedback: {
    getContext: ReturnType<typeof jest.fn>;
  };
  let evaluationAgent: {
    buildContext: ReturnType<typeof jest.fn>;
  };

  beforeEach(() => {
    promptService = {
      resolve: jest.fn(),
      renderTemplate: jest.fn(),
    };

    pipelineState = {
      getPhaseResult: jest.fn(),
    };

    const drizzle = { db: { select: jest.fn() } };
    pipelineFeedback = { getContext: jest.fn() };
    aiConfig = { getModelForPurpose: jest.fn() };
    aiConfig.getModelForPurpose.mockReturnValue("gemini-2.5-flash");
    const scoreComputation = { getWeightsForStage: jest.fn() };
    const synthesisAgent = { buildPromptVariables: jest.fn() };
    evaluationAgent = { buildContext: jest.fn() };

    service = new AiPromptRuntimeService(
      drizzle as never,
      promptService as never,
      pipelineState as never,
      pipelineFeedback as never,
      aiConfig as never,
      scoreComputation as never,
      synthesisAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
      evaluationAgent as never,
    );
  });

  it("builds runtime previews for all research and evaluation prompts", async () => {
    pipelineState.getPhaseResult.mockResolvedValue({
      stage: "seed",
    });
    promptService.resolve.mockImplementation(async ({ key, stage }) => ({
      key,
      stage: stage ?? null,
      systemPrompt: `SYSTEM ${key}`,
      userPrompt: `USER ${key}`,
      source: "code",
      revisionId: null,
    }));
    promptService.renderTemplate.mockImplementation(
      (template: string) => template,
    );

    jest
      .spyOn(service as any, "resolveVariablesForKey")
      .mockImplementation(async (key: string, input: { startupId: string }) => {
        if (key.startsWith("research.")) {
          return {
            stage: "seed",
            startupId: input.startupId,
            variables: {
              contextJson: `<user_provided_data>\n{"agent":"${key}"}\n</user_provided_data>`,
              agentName: key,
              agentKey: key.replace("research.", ""),
            },
          };
        }

        return {
          stage: "seed",
          startupId: input.startupId,
          variables: {
            contextJson: JSON.stringify({ agent: key }),
            contextSections:
              `## Agent Context\n<user_provided_data>\n{"agent":"${key}"}\n</user_provided_data>`,
          },
        };
      });

    const result = await service.previewPipelineContexts({
      startupId: "ed8f8dcb-4145-4af3-92ce-c8d879ec43db",
      stage: "seed",
    });

    const expectedCount = AI_PROMPT_KEYS.filter(
      (key) => key.startsWith("research.") || key.startsWith("evaluation."),
    ).length;
    expect(result.agents).toHaveLength(expectedCount);

    const researchTeam = result.agents.find(
      (item) => item.promptKey === "research.team",
    );
    expect(researchTeam?.phase).toBe(PipelinePhase.RESEARCH);
    expect(researchTeam?.agentKey).toBe("team");
    expect(researchTeam?.parsedContextJson).toEqual({ agent: "research.team" });
    expect(researchTeam?.parsedContextSections).toBeNull();

    const legalEval = result.agents.find(
      (item) => item.promptKey === "evaluation.legal",
    );
    expect(legalEval?.phase).toBe(PipelinePhase.EVALUATION);
    expect(legalEval?.agentKey).toBe("legal");
    expect(legalEval?.parsedContextJson).toEqual({ agent: "evaluation.legal" });
    expect(legalEval?.parsedContextSections).toEqual([
      {
        title: "Agent Context",
        data: { agent: "evaluation.legal" },
      },
    ]);
  });

  it("returns raw text when context payload is not valid JSON", () => {
    const parsedJson = (
      service as unknown as {
        parseContextJsonVariable: (value: string) => unknown;
      }
    ).parseContextJsonVariable(
      "<user_provided_data>\nnot-json\n</user_provided_data>",
    );
    const parsedSections = (
      service as unknown as {
        parseContextSectionsVariable: (value: string) => unknown;
      }
    ).parseContextSectionsVariable(
      "## Data Gap\n<user_provided_data>\nplain text context\n</user_provided_data>",
    );

    expect(parsedJson).toBe("not-json");
    expect(parsedSections).toEqual([
      { title: "Data Gap", data: "plain text context" },
    ]);
  });

  it("includes parsed evaluation context in previewPrompt payload", async () => {
    promptService.resolve.mockResolvedValue({
      key: "evaluation.legal",
      stage: "seed",
      systemPrompt: "SYSTEM {{contextSections}}",
      userPrompt: "USER {{contextSections}}",
      source: "code",
      revisionId: null,
    });
    promptService.renderTemplate.mockImplementation((template: string) => template);

    jest
      .spyOn(service as any, "resolveVariablesForKey")
      .mockResolvedValue({
        stage: "seed",
        startupId: "ed8f8dcb-4145-4af3-92ce-c8d879ec43db",
        variables: {
          contextJson: JSON.stringify({ agent: "evaluation.legal", risk: "medium" }),
          contextSections:
            "## Legal\n<user_provided_data>\n{\"agent\":\"evaluation.legal\",\"risk\":\"medium\"}\n</user_provided_data>",
        },
      });

    const result = await service.previewPrompt("evaluation.legal", {
      startupId: "ed8f8dcb-4145-4af3-92ce-c8d879ec43db",
      stage: "seed",
    });

    expect(result.parsedContextJson).toEqual({
      agent: "evaluation.legal",
      risk: "medium",
    });
    expect(result.parsedContextSections).toEqual([
      {
        title: "Legal",
        data: { agent: "evaluation.legal", risk: "medium" },
      },
    ]);
    expect(result.sectionTitles).toEqual(["Legal"]);
  });

  it("resolveEvaluationVariables prepends Startup Snapshot for evaluation prompts", async () => {
    const pipeline = createEvaluationPipelineInput();
    const startupId = "ed8f8dcb-4145-4af3-92ce-c8d879ec43db";

    pipelineState.getPhaseResult.mockImplementation(
      async (_startupId: string, phase: string) => {
        if (phase === PipelinePhase.EXTRACTION) {
          return pipeline.extraction;
        }
        if (phase === PipelinePhase.SCRAPING) {
          return pipeline.scraping;
        }
        if (phase === PipelinePhase.RESEARCH) {
          return pipeline.research;
        }
        return null;
      },
    );
    pipelineFeedback.getContext.mockResolvedValue({ items: [] });
    evaluationAgent.buildContext.mockReturnValue({
      pricing: { plans: [] },
    });

    const resolved = await (
      service as unknown as {
        resolveEvaluationVariables: (
          key: string,
          input: { startupId: string; stage: "seed" },
        ) => Promise<{
          variables: Record<string, string>;
        }>;
        parseContextSectionsVariable: (
          value: string,
        ) => Array<{ title: string; data: unknown }> | null;
      }
    ).resolveEvaluationVariables("evaluation.businessModel", {
      startupId,
      stage: "seed",
    });

    const parsedSections = (
      service as unknown as {
        parseContextSectionsVariable: (
          value: string,
        ) => Array<{ title: string; data: unknown }> | null;
      }
    ).parseContextSectionsVariable(resolved.variables.contextSections);

    const parsedContextJson = JSON.parse(resolved.variables.contextJson);
    expect(parsedSections?.[0]?.title).toBe("Startup Snapshot");
    expect(parsedSections?.[0]?.data).toEqual(
      expect.objectContaining({
        companyName: "Clipaf",
        industry: "Industrial SaaS",
        stage: "seed",
        location: "San Francisco, CA",
        website: "https://clipaf.com",
      }),
    );
    expect(parsedContextJson.startupSnapshot).toEqual(
      expect.objectContaining({
        companyName: "Clipaf",
        industry: "Industrial SaaS",
      }),
    );
  });

  it("exposes Startup Snapshot baseline fields for every evaluation prompt schema", () => {
    const expectedPaths = [
      "contextJson.startupSnapshot.companyName",
      "contextJson.startupSnapshot.industry",
      "contextJson.startupSnapshot.stage",
      "contextJson.startupSnapshot.location",
      "contextJson.startupSnapshot.website",
      "contextJson.startupSnapshot.founderNames",
      "contextJson.startupSnapshot.adminFeedback",
    ];

    const evaluationKeys = AI_PROMPT_KEYS.filter((key) =>
      key.startsWith("evaluation."),
    );

    for (const key of evaluationKeys) {
      const schema = service.getContextSchema(key);
      const fieldPaths = schema.contextFields.map((field) => field.path);
      expect(fieldPaths).toEqual(expect.arrayContaining(expectedPaths));
    }
  });
});
