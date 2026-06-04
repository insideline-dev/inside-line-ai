import { describe, expect, it, jest } from "bun:test";
import { tool } from "ai";
import { z } from "zod";
import { ConfigService } from "@nestjs/config";
import { OpenAiTextGenerationService } from "../../services/openai-text-generation.service";
import { LensOutputSchema } from "../../schemas/lens";

const VALID_OUTPUT = {
  score: 71,
  signal: "advance" as const,
  rationale: "Market is large and credible.",
  evidence: [],
};

/** A non-search executable tool, forcing `generate()` down the create flow. */
const NOOP_TOOL = {
  noop: tool({
    description: "noop",
    inputSchema: z.object({ q: z.string().nullable() }),
    execute: async () => ({ ok: true }),
  }),
};

function buildService(create: jest.Mock): OpenAiTextGenerationService {
  const config = {
    get: (key: string) => (key === "OPENAI_API_KEY" ? "sk-test" : undefined),
  } as unknown as ConfigService;
  const svc = new OpenAiTextGenerationService(config);
  // Inject a stub OpenAI client so getClient() never builds a real one.
  (svc as unknown as { client: unknown }).client = {
    responses: { create, parse: jest.fn() },
  };
  return svc;
}

describe("OpenAiTextGenerationService — create-flow finalization", () => {
  it("forces a tool-free finalization turn when the model ends incomplete with no text (mode B)", async () => {
    const create = jest
      .fn()
      // Initial turn: reasoning-only, no message, truncated/incomplete.
      .mockResolvedValueOnce({
        id: "r1",
        status: "incomplete",
        output_text: "",
        output: [],
      })
      // Finalization turn: emits the structured JSON.
      .mockResolvedValueOnce({
        id: "r2",
        status: "completed",
        output_text: JSON.stringify(VALID_OUTPUT),
        output: [],
      });

    const svc = buildService(create);
    const result = await svc.generate({
      modelName: "gpt-5.4-mini",
      prompt: "evaluate the market",
      schema: LensOutputSchema,
      tools: NOOP_TOOL,
      temperature: 0.2,
      reasoningEffort: "high",
    });

    expect(create).toHaveBeenCalledTimes(2);
    const finalizeArgs = create.mock.calls[1][0];
    // No hosted tool call was pending → no stub outputs are fabricated.
    expect(finalizeArgs.input).toEqual([]);
    expect(finalizeArgs.tool_choice).toBe("none");
    expect(result.output).toMatchObject({ score: 71, signal: "advance" });
  });

  it("answers a dangling function call with a stub before finalizing (mode A)", async () => {
    const pendingCall = {
      id: "rfc",
      status: "in_progress",
      output_text: "",
      output: [
        {
          type: "function_call",
          call_id: "call_1",
          name: "noop",
          arguments: JSON.stringify({ q: "tam" }),
        },
      ],
    };

    const create = jest
      .fn()
      .mockResolvedValueOnce(pendingCall) // initial turn requests a tool
      .mockResolvedValueOnce(pendingCall) // last in-loop turn still pending at budget exhaustion
      .mockResolvedValueOnce({
        id: "rfin",
        status: "completed",
        output_text: JSON.stringify(VALID_OUTPUT),
        output: [],
      });

    const svc = buildService(create);
    const result = await svc.generate({
      modelName: "gpt-5.4-mini",
      prompt: "evaluate the market",
      schema: LensOutputSchema,
      tools: NOOP_TOOL,
      temperature: 0.2,
      reasoningEffort: "high",
      maxToolRoundtrips: 1,
    });

    expect(create).toHaveBeenCalledTimes(3);
    const finalizeArgs = create.mock.calls[2][0];
    expect(finalizeArgs.tool_choice).toBe("none");
    expect(finalizeArgs.input).toHaveLength(1);
    expect(finalizeArgs.input[0]).toMatchObject({
      type: "function_call_output",
      call_id: "call_1",
    });
    expect(finalizeArgs.input[0].output).toContain("search budget reached");
    expect(result.output).toMatchObject({ score: 71 });
  });
});
