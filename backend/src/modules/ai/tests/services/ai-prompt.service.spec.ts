import { describe, expect, it } from "bun:test";
import { AiPromptService } from "../../services/ai-prompt.service";

describe("AiPromptService narrative guardrails", () => {
  const service = new AiPromptService({ db: {} } as never);

  it("injects guardrail into evaluation prompts", () => {
    const input = {
      key: "evaluation.team",
      stage: null,
      systemPrompt: "SYSTEM",
      userPrompt: "USER",
      source: "db" as const,
      revisionId: "rev-1",
    };

    const output = (service as never).injectNarrativeGuardrails(input) as typeof input;

    expect(output.systemPrompt).toContain("Internal Narrative Guardrail");
    expect(output.systemPrompt).toContain("Do NOT mention numeric scores");
  });

  it("does not inject guardrail into non-target prompts", () => {
    const input = {
      key: "clara.intent",
      stage: null,
      systemPrompt: "SYSTEM",
      userPrompt: "USER",
      source: "db" as const,
      revisionId: "rev-1",
    };

    const output = (service as never).injectNarrativeGuardrails(input) as typeof input;

    expect(output.systemPrompt).toBe("SYSTEM");
  });

  it("avoids duplicate guardrail injection", () => {
    const input = {
      key: "synthesis.final",
      stage: null,
      systemPrompt: "SYSTEM\n\n## Internal Narrative Guardrail\nKeep prose qualitative.",
      userPrompt: "USER",
      source: "db" as const,
      revisionId: "rev-1",
    };

    const output = (service as never).injectNarrativeGuardrails(input) as typeof input;

    const occurrences = (output.systemPrompt.match(/Internal Narrative Guardrail/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
